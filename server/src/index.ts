import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GameError,
  applyPass,
  applyPlay,
  chooseDeckByPairWhiteTarget,
  createRoom,
  createStandardDeck,
  joinRoom,
  readyPlayer,
  startGame,
  type Room
} from './game/engine.js';

type Session = { roomId: string; playerId: string };
const TURN_MS = Number(process.env.TURN_MS ?? 20000);
const REMATCH_MS = Number(process.env.REMATCH_MS ?? 5000);
const turnTimers = new Map<string, NodeJS.Timeout>();
const rematchTimers = new Map<string, NodeJS.Timeout>();

function makeRoomId(): string {
  // 6 chars, avoids confusing chars.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

function makeToken(): string {
  return crypto.randomBytes(18).toString('hex');
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
}

function roomPublic(room: Room) {
  const winner = room.winnerId ? room.players.find((p) => p.playerId === room.winnerId) : null;
  return {
    roomId: room.roomId,
    phase: room.phase,
    currentPlayerId: room.currentPlayerId,
    winnerId: room.winnerId,
    winnerName: winner?.name ?? null,
    turnEndsAt: room.turnEndsAt,
    rematchStartsAt: room.rematchStartsAt,
    turnMs: TURN_MS,
    rematchMs: REMATCH_MS,
    lastPlay: room.lastPlay
      ? {
          playerId: room.lastPlay.playerId,
          cardIds: room.lastPlay.cardIds,
          combo: room.lastPlay.combo
        }
      : null,
    tablePlays: room.tablePlays,
    result: room.result,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      ready: p.ready,
      connected: p.connected ?? false,
      cardsRemaining: p.hand.length
    }))
  };
}

const app = express();

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const clientDist = path.join(repoRoot, 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true }
});

const rooms = new Map<string, Room>();
const socketToSession = new Map<string, Session>();

function broadcastRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room:state', { room: roomPublic(room) });
}

function clearTurnTimer(roomId: string) {
  const t = turnTimers.get(roomId);
  if (t) clearTimeout(t);
  turnTimers.delete(roomId);
}

function clearRematchTimer(roomId: string) {
  const t = rematchTimers.get(roomId);
  if (t) clearTimeout(t);
  rematchTimers.delete(roomId);
}

function suitWeight(suit: 'S' | 'C' | 'D' | 'H'): number {
  switch (suit) {
    case 'H':
      return 4;
    case 'D':
      return 3;
    case 'C':
      return 2;
    case 'S':
      return 1;
  }
}

function emitGameEnd(room: Room) {
  if (!room.winnerId) return;
  const winner = room.players.find((p) => p.playerId === room.winnerId);
  io.to(room.roomId).emit('game:end', {
    winnerId: room.winnerId,
    winnerName: winner?.name ?? room.winnerId,
    result: room.result
  });
}

function startRound(room: Room) {
  clearTurnTimer(room.roomId);
  clearRematchTimer(room.roomId);

  room.rematchStartsAt = null;
  const deck = chooseDeckByPairWhiteTarget({
    targetRate: Number(process.env.PAIR_WHITE_RATE ?? 0.01),
    createDeck: createStandardDeck,
    shuffle: shuffleInPlace
  });
  startGame(room, { deck });

  broadcastRoom(room.roomId);
  for (const p of room.players) sendPrivateHand(room, p.playerId);

  if (room.phase === 'ended') {
    handleRoundEnded(room);
    return;
  }
  scheduleTurn(room.roomId);
}

function scheduleRematch(roomId: string) {
  clearRematchTimer(roomId);
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'ended') return;

  room.rematchStartsAt = Date.now() + REMATCH_MS;
  broadcastRoom(roomId);

  const timer = setTimeout(() => {
    const live = rooms.get(roomId);
    if (!live || live.phase !== 'ended') return;
    startRound(live);
  }, REMATCH_MS);

  rematchTimers.set(roomId, timer);
}

function handleRoundEnded(room: Room) {
  clearTurnTimer(room.roomId);
  clearRematchTimer(room.roomId);

  for (const p of room.players) p.ready = false;
  emitGameEnd(room);
  scheduleRematch(room.roomId);
}

function scheduleTurn(roomId: string) {
  clearTurnTimer(roomId);
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.phase !== 'playing' || !room.currentPlayerId) {
    room.turnEndsAt = null;
    return;
  }

  room.turnEndsAt = Date.now() + TURN_MS;
  broadcastRoom(roomId);

  const timer = setTimeout(() => {
    const live = rooms.get(roomId);
    if (!live || live.phase !== 'playing' || !live.currentPlayerId) return;
    const currentId = live.currentPlayerId;
    const player = live.players.find((p) => p.playerId === currentId);
    if (!player) return;

    try {
      if (live.lastPlay) {
        applyPass(live, currentId);
      } else {
        // Can't pass on lead: auto play smallest single.
        const sorted = [...player.hand].sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return suitWeight(a.suit) - suitWeight(b.suit);
        });
        if (sorted.length > 0) applyPlay(live, currentId, [sorted[0]!.id]);
      }
      broadcastRoom(roomId);
      sendPrivateHand(live, currentId);
      if (live.phase !== 'playing') {
        clearTurnTimer(roomId);
        emitGameEnd(live);
      } else {
        scheduleTurn(roomId);
      }
    } catch {
      scheduleTurn(roomId);
    }
  }, TURN_MS);

  turnTimers.set(roomId, timer);
}

function sendPrivateHand(room: Room, playerId: string) {
  const player = room.players.find((p) => p.playerId === playerId);
  if (!player?.socketId) return;
  io.to(player.socketId).emit('hand:private', { cards: player.hand });
}

function clearRoom(roomId: string) {
  clearTurnTimer(roomId);
  clearRematchTimer(roomId);
  rooms.delete(roomId);
}

function removePlayerFromRoom(room: Room, playerId: string) {
  const idx = room.players.findIndex((p) => p.playerId === playerId);
  if (idx < 0) return;

  room.players.splice(idx, 1);
  room.passed.delete(playerId);
  room.tablePlays = room.tablePlays.filter((x) => x.playerId !== playerId);

  if (room.lastPlay?.playerId === playerId) {
    room.lastPlay = null;
    room.tablePlays = [];
    room.trickNo += 1;
    room.passed.clear();
  }

  if (room.winnerId === playerId) {
    room.winnerId = null;
    room.result = null;
  }

  if (room.currentPlayerId === playerId) {
    room.currentPlayerId = room.players[0]?.playerId ?? null;
  }

  if (room.players.length === 0) {
    clearRoom(room.roomId);
    return;
  }

  if (room.phase !== 'lobby' && room.players.length < 2) {
    room.phase = 'lobby';
    room.currentPlayerId = null;
    room.lastPlay = null;
    room.tablePlays = [];
    room.trickNo = 1;
    room.passed.clear();
    room.firstMove = false;
    room.winnerId = null;
    room.turnEndsAt = null;
    room.rematchStartsAt = null;
    room.whiteWinKind = null;
    room.chopEvents = [];
    room.result = null;
    for (const p of room.players) {
      p.hand = [];
      p.ready = false;
    }
    clearTurnTimer(room.roomId);
    clearRematchTimer(room.roomId);
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }: { name: string }, cb?: Function) => {
    const roomId = makeRoomId();
    const playerId = crypto.randomUUID();
    const reconnectToken = makeToken();

    const room = createRoom(roomId, { playerId, name: String(name ?? 'Player') });
    room.players[0]!.socketId = socket.id;
    room.players[0]!.connected = true;
    room.players[0]!.reconnectToken = reconnectToken;

    rooms.set(roomId, room);
    socketToSession.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    broadcastRoom(roomId);
    cb?.({ roomId, playerId, reconnectToken });
  });

  socket.on('room:join', ({ roomId, name }: { roomId: string; name: string }, cb?: Function) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });
    if (room.phase !== 'lobby') return cb?.({ error: { code: 'ROOM_ALREADY_STARTED', message: 'Game already started' } });
    if (room.players.length >= 4) return cb?.({ error: { code: 'ROOM_FULL', message: 'Room is full' } });

    const playerId = crypto.randomUUID();
    const reconnectToken = makeToken();
    joinRoom(room, { playerId, name: String(name ?? 'Player') });
    const p = room.players.find((x) => x.playerId === playerId)!;
    p.socketId = socket.id;
    p.connected = true;
    p.reconnectToken = reconnectToken;

    socketToSession.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    broadcastRoom(roomId);
    cb?.({ roomId, playerId, reconnectToken });
  });

  socket.on(
    'player:reconnect',
    (
      { roomId, playerId, reconnectToken }: { roomId: string; playerId: string; reconnectToken: string },
      cb?: Function
    ) => {
      const room = rooms.get(roomId);
      if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });

      const p = room.players.find((x) => x.playerId === playerId);
      if (!p) return cb?.({ error: { code: 'PLAYER_NOT_FOUND', message: 'Player not found' } });
      if (p.reconnectToken !== reconnectToken)
        return cb?.({ error: { code: 'BAD_TOKEN', message: 'Bad reconnect token' } });

      p.socketId = socket.id;
      p.connected = true;

      socketToSession.set(socket.id, { roomId, playerId });
      socket.join(roomId);

      broadcastRoom(roomId);
      sendPrivateHand(room, playerId);
      cb?.({ ok: true });
    }
  );

  socket.on('player:ready', ({ ready }: { ready: boolean }) => {
    const s = socketToSession.get(socket.id);
    if (!s) return;
    const room = rooms.get(s.roomId);
    if (!room) return;
    readyPlayer(room, s.playerId, Boolean(ready));
    if (room.phase === 'ended') {
      if (room.players.every((p) => p.ready)) {
        startRound(room);
        return;
      }
      scheduleRematch(room.roomId);
      return;
    }
    broadcastRoom(s.roomId);
  });

  socket.on('game:start', (_: unknown, cb?: Function) => {
    const s = socketToSession.get(socket.id);
    if (!s) return cb?.({ error: { code: 'NO_SESSION', message: 'No session' } });
    const room = rooms.get(s.roomId);
    if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });
    if (room.players[0]?.playerId !== s.playerId)
      return cb?.({ error: { code: 'NOT_HOST', message: 'Only host can start' } });
    if (room.players.length !== 4) return cb?.({ error: { code: 'NEED_4_PLAYERS', message: 'Need 4 players' } });
    if (!room.players.every((p) => p.ready)) return cb?.({ error: { code: 'NOT_ALL_READY', message: 'Not all ready' } });

    startRound(room);
    cb?.({ ok: true });
  });

  socket.on('game:new-round', (_: unknown, cb?: Function) => {
    const s = socketToSession.get(socket.id);
    if (!s) return cb?.({ error: { code: 'NO_SESSION', message: 'No session' } });
    const room = rooms.get(s.roomId);
    if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });
    if (room.players[0]?.playerId !== s.playerId)
      return cb?.({ error: { code: 'NOT_HOST', message: 'Only host can start new round' } });
    if (room.phase !== 'ended') return cb?.({ error: { code: 'NOT_ENDED', message: 'Round not ended' } });
    if (!room.players.every((p) => p.ready)) return cb?.({ error: { code: 'NOT_ALL_READY', message: 'Not all ready' } });

    startRound(room);
    cb?.({ ok: true });
  });

  socket.on('turn:play', ({ cardIds }: { cardIds: string[] }, cb?: Function) => {
    const s = socketToSession.get(socket.id);
    if (!s) return cb?.({ error: { code: 'NO_SESSION', message: 'No session' } });
    const room = rooms.get(s.roomId);
    if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });

    try {
      applyPlay(room, s.playerId, Array.isArray(cardIds) ? cardIds.map(String) : []);
      broadcastRoom(room.roomId);
      sendPrivateHand(room, s.playerId);
      if (room.phase === 'ended') {
        handleRoundEnded(room);
      } else {
        scheduleTurn(room.roomId);
      }
      cb?.({ ok: true });
    } catch (e) {
      if (e instanceof GameError) return cb?.({ error: { code: e.code, message: e.message } });
      cb?.({ error: { code: 'UNKNOWN', message: 'Unknown error' } });
    }
  });

  socket.on('turn:pass', (_: unknown, cb?: Function) => {
    const s = socketToSession.get(socket.id);
    if (!s) return cb?.({ error: { code: 'NO_SESSION', message: 'No session' } });
    const room = rooms.get(s.roomId);
    if (!room) return cb?.({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });

    try {
      applyPass(room, s.playerId);
      broadcastRoom(room.roomId);
      if (room.phase === 'ended') {
        handleRoundEnded(room);
      } else {
        scheduleTurn(room.roomId);
      }
      cb?.({ ok: true });
    } catch (e) {
      if (e instanceof GameError) return cb?.({ error: { code: e.code, message: e.message } });
      cb?.({ error: { code: 'UNKNOWN', message: 'Unknown error' } });
    }
  });

  socket.on('room:leave', (_: unknown, cb?: Function) => {
    const s = socketToSession.get(socket.id);
    if (!s) return cb?.({ ok: true });

    socketToSession.delete(socket.id);
    socket.leave(s.roomId);

    const room = rooms.get(s.roomId);
    if (!room) return cb?.({ ok: true });

    removePlayerFromRoom(room, s.playerId);

    const liveRoom = rooms.get(s.roomId);
    if (!liveRoom) return cb?.({ ok: true });

    if (liveRoom.phase === 'playing' && liveRoom.currentPlayerId) {
      scheduleTurn(liveRoom.roomId);
    }
    broadcastRoom(liveRoom.roomId);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const s = socketToSession.get(socket.id);
    if (!s) return;
    socketToSession.delete(socket.id);

    const room = rooms.get(s.roomId);
    if (!room) return;
    const p = room.players.find((x) => x.playerId === s.playerId);
    if (p) {
      p.connected = false;
      if (p.socketId === socket.id) p.socketId = undefined;
    }
    broadcastRoom(s.roomId);
  });
});

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`TLMN server listening on http://0.0.0.0:${PORT}`);
});
