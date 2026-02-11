import { canBeat, canChop, checkWhiteWin, isPairWhiteWin, parseCombo, type Card, type Combo } from '../rules/index.js';
import { getChopMeta, scoreEndedGame, type ChopEvent, type ScoreResult, type WhiteWinKind } from './scoring.js';

export type Phase = 'lobby' | 'playing' | 'ended';

export type Player = {
  playerId: string;
  name: string;
  ready: boolean;
  hand: Card[];
  socketId?: string;
  reconnectToken?: string;
  connected?: boolean;
};

export type LastPlay = {
  playerId: string;
  cardIds: string[];
  combo: Combo;
};

export type TablePlay = {
  playerId: string;
  cardIds: string[];
  playedAt: number;
  trickNo: number;
};

export type Room = {
  roomId: string;
  phase: Phase;
  players: Player[];
  currentPlayerId: string | null;
  lastPlay: LastPlay | null;
  tablePlays: TablePlay[];
  trickNo: number;
  passed: Set<string>;
  firstMove: boolean;
  winnerId: string | null;
  turnEndsAt: number | null;
  rematchStartsAt: number | null;
  whiteWinKind: WhiteWinKind;
  chopEvents: ChopEvent[];
  result: ScoreResult | null;
};

export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function createRoom(roomId: string, host: { playerId: string; name: string }): Room {
  return {
    roomId,
    phase: 'lobby',
    players: [{ playerId: host.playerId, name: host.name, ready: false, hand: [] }],
    currentPlayerId: null,
    lastPlay: null,
    tablePlays: [],
    trickNo: 1,
    passed: new Set(),
    firstMove: false,
    winnerId: null,
    turnEndsAt: null,
    rematchStartsAt: null,
    whiteWinKind: null,
    chopEvents: [],
    result: null
  };
}

export function joinRoom(room: Room, player: { playerId: string; name: string }): void {
  room.players.push({ playerId: player.playerId, name: player.name, ready: false, hand: [] });
}

export function readyPlayer(room: Room, playerId: string, ready: boolean): void {
  const p = room.players.find((x) => x.playerId === playerId);
  if (p) p.ready = ready;
}

export function createStandardDeck(): Card[] {
  const suits: Card['suit'][] = ['S', 'C', 'D', 'H'];
  const ranks: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  const cards: Card[] = [];
  for (const r of ranks) {
    for (const s of suits) {
      const rankCode =
        r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r === 14 ? 'A' : r === 15 ? '2' : String(r);
      cards.push({ id: `${rankCode}${s}`, rank: r, suit: s });
    }
  }
  return cards;
}

export function dealHandsRoundRobin(deck: Card[], playerCount = 4): Card[][] {
  if (playerCount <= 0) throw new GameError('BAD_PLAYER_COUNT', 'playerCount must be > 0');
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < deck.length; i++) {
    hands[i % playerCount]!.push(deck[i]!);
  }
  return hands;
}

export function hasPairWhiteWinInDeck(deck: Card[], playerCount = 4): boolean {
  return dealHandsRoundRobin(deck, playerCount).some((hand) => isPairWhiteWin(hand));
}

export function chooseDeckByPairWhiteTarget(opts: {
  targetRate?: number;
  maxAttempts?: number;
  createDeck: () => Card[];
  shuffle: (deck: Card[]) => void;
  random?: () => number;
  playerCount?: number;
}): Card[] {
  const targetRate = opts.targetRate ?? 0.01;
  const maxAttempts = opts.maxAttempts ?? 2000;
  const random = opts.random ?? Math.random;
  const playerCount = opts.playerCount ?? 4;
  const wantPairWhite = random() < targetRate;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const deck = opts.createDeck();
    opts.shuffle(deck);
    const hasPairWhite = hasPairWhiteWinInDeck(deck, playerCount);
    if (hasPairWhite === wantPairWhite) return deck;
  }

  throw new GameError('DEAL_RATE_UNREACHABLE', 'cannot satisfy target pair-white rate');
}

function nextPlayerId(room: Room, playerId: string): string {
  const idx = room.players.findIndex((p) => p.playerId === playerId);
  if (idx < 0) return room.players[0]?.playerId ?? playerId;
  return room.players[(idx + 1) % room.players.length]!.playerId;
}

export function startGame(room: Room, opts: { deck: Card[] }): void {
  if (room.players.length !== 4) throw new GameError('BAD_PLAYER_COUNT', 'need exactly 4 players');

  const deck = [...opts.deck];
  if (deck.length !== 52) throw new GameError('BAD_DECK', 'deck must have 52 cards');

  for (const p of room.players) p.hand = [];

  for (let i = 0; i < 52; i++) {
    // Deal round-robin to avoid deterministic chunking artifacts.
    room.players[i % room.players.length]!.hand.push(deck[i]!);
  }

  const holder = room.players.find((p) => p.hand.some((c) => c.id === '3S'));
  if (!holder) throw new GameError('MISSING_3S', 'deck must contain 3S');

  room.phase = 'playing';
  room.currentPlayerId = holder.playerId;
  room.lastPlay = null;
  room.tablePlays = [];
  room.trickNo = 1;
  room.passed = new Set();
  room.firstMove = true;
  room.winnerId = null;
  room.turnEndsAt = null;
  room.rematchStartsAt = null;
  room.whiteWinKind = null;
  room.chopEvents = [];
  room.result = null;

  for (const p of room.players) {
    if (checkWhiteWin(p.hand)) {
      room.phase = 'ended';
      room.winnerId = p.playerId;
      room.currentPlayerId = p.playerId;
      room.firstMove = false;
      room.whiteWinKind = isPairWhiteWin(p.hand) ? 'pair_white' : 'other';
      room.result = scoreEndedGame({
        winnerId: p.playerId,
        players: room.players.map((x) => ({ playerId: x.playerId, hand: x.hand })),
        chopEvents: room.chopEvents,
        whiteWinKind: room.whiteWinKind
      });
      return;
    }
  }
}

export function applyPlay(room: Room, playerId: string, cardIds: string[]): void {
  if (room.phase !== 'playing') throw new GameError('NOT_PLAYING', 'game not started');
  if (room.currentPlayerId !== playerId) throw new GameError('NOT_YOUR_TURN', 'not your turn');

  const player = room.players.find((p) => p.playerId === playerId);
  if (!player) throw new GameError('UNKNOWN_PLAYER', 'unknown player');

  const selected: Card[] = [];
  for (const id of cardIds) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) throw new GameError('CARD_NOT_IN_HAND', 'card not in hand');
    selected.push(card);
  }

  if (room.firstMove && !cardIds.includes('3S')) {
    throw new GameError('FIRST_MOVE_MUST_INCLUDE_3S', 'first move must include 3S');
  }

  const combo = parseCombo(selected);
  if (!combo) throw new GameError('INVALID_COMBO', 'invalid combo');

  if (room.lastPlay) {
    const lastCombo = room.lastPlay.combo;
    const beat = canBeat(combo, lastCombo);
    const chop = canChop(combo, lastCombo);
    if (!beat && !chop) {
      throw new GameError('CANNOT_BEAT', 'play does not beat last play');
    }
    if (chop && !beat && room.lastPlay.playerId !== playerId) {
      const chopMeta = getChopMeta(combo, lastCombo);
      if (chopMeta) {
        room.chopEvents.push({
          fromPlayerId: room.lastPlay.playerId,
          toPlayerId: playerId,
          amount: chopMeta.amount,
          kind: chopMeta.kind
        });
      }
    }
  }

  room.lastPlay = { playerId, cardIds: [...cardIds], combo };
  room.tablePlays = room.tablePlays.filter((x) => x.playerId !== playerId || x.trickNo !== room.trickNo);
  room.tablePlays.push({ playerId, cardIds: [...cardIds], playedAt: Date.now(), trickNo: room.trickNo });
  room.passed.clear();

  // Remove cards
  const toRemove = new Set(cardIds);
  player.hand = player.hand.filter((c) => !toRemove.has(c.id));

  if (player.hand.length === 0) {
    room.phase = 'ended';
    room.winnerId = playerId;
    room.currentPlayerId = playerId;
    room.firstMove = false;
    room.turnEndsAt = null;
    room.rematchStartsAt = null;
    room.result = scoreEndedGame({
      winnerId: playerId,
      players: room.players.map((x) => ({ playerId: x.playerId, hand: x.hand })),
      chopEvents: room.chopEvents,
      whiteWinKind: room.whiteWinKind
    });
    return;
  }

  room.firstMove = false;
  room.currentPlayerId = nextPlayerId(room, playerId);
}

export function applyPass(room: Room, playerId: string): void {
  if (room.phase !== 'playing') throw new GameError('NOT_PLAYING', 'game not started');
  if (room.currentPlayerId !== playerId) throw new GameError('NOT_YOUR_TURN', 'not your turn');
  if (!room.lastPlay) throw new GameError('CANNOT_PASS_ON_LEAD', 'cannot pass on lead');

  room.passed.add(playerId);
  room.currentPlayerId = nextPlayerId(room, playerId);

  if (room.passed.size >= room.players.length - 1) {
    const lead = room.lastPlay.playerId;
    room.lastPlay = null;
    room.tablePlays = [];
    room.trickNo += 1;
    room.passed.clear();
    room.currentPlayerId = lead;
  }
}
