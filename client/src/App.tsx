import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Socket } from 'socket.io-client';

import { createSocket } from './lib/socket';
import { sortHand } from './lib/sort-hand';
import type { Card, RoomPublic, Suit } from './lib/types';

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'S':
      return '♠';
    case 'C':
      return '♣';
    case 'D':
      return '♦';
    case 'H':
      return '♥';
  }
}

function rankLabel(rank: number): string {
  if (rank <= 10) return String(rank);
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return '2';
}

function parseId(id: string): { rank: number; suit: Suit } {
  const suit = id.slice(-1) as Suit;
  const r = id.slice(0, -1);
  const rank =
    r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : r === 'A' ? 14 : r === '2' ? 15 : Number(r);
  return { rank, suit };
}

type FlyingCard = {
  key: string;
  id: string;
  rank: number;
  suit: Suit;
  red: boolean;
  fromLeft: number;
  fromTop: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
};

function App() {
  const socketRef = useRef<Socket | null>(null);
  const handCardRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const tableDropRef = useRef<HTMLDivElement | null>(null);
  const flyCleanupTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState(() => localStorage.getItem('tlmn:name') ?? '');
  const [roomIdInput, setRoomIdInput] = useState('');

  const [session, setSession] = useState<null | { roomId: string; playerId: string; reconnectToken: string }>(() => {
    const raw = localStorage.getItem('tlmn:session');
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as any;
      if (v?.roomId && v?.playerId && v?.reconnectToken) return v;
      return null;
    } catch {
      return null;
    }
  });

  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([]);
  const [isFlyActive, setIsFlyActive] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const me = useMemo(() => {
    if (!room || !session) return null;
    return room.players.find((p) => p.playerId === session.playerId) ?? null;
  }, [room, session]);

  const isHost = useMemo(() => {
    if (!room || !session) return false;
    return room.players[0]?.playerId === session.playerId;
  }, [room, session]);

  const allReady = useMemo(() => {
    if (!room) return false;
    return room.players.length > 0 && room.players.every((p) => p.ready);
  }, [room]);

  const turnLeftSec = useMemo(() => {
    if (!room?.turnEndsAt) return null;
    return Math.max(0, Math.ceil((room.turnEndsAt - nowMs) / 1000));
  }, [room?.turnEndsAt, nowMs]);

  const rematchLeftSec = useMemo(() => {
    if (!room?.rematchStartsAt) return null;
    return Math.max(0, Math.ceil((room.rematchStartsAt - nowMs) / 1000));
  }, [room?.rematchStartsAt, nowMs]);

  const tablePlayByPlayer = useMemo(() => {
    const byPlayer = new Map<string, RoomPublic['tablePlays'][number]>();
    for (const play of room?.tablePlays ?? []) {
      const prev = byPlayer.get(play.playerId);
      if (!prev || play.playedAt > prev.playedAt) byPlayer.set(play.playerId, play);
    }
    return byPlayer;
  }, [room?.tablePlays]);

  useEffect(() => {
    localStorage.setItem('tlmn:name', name);
  }, [name]);

  useEffect(() => {
    const s = createSocket();
    socketRef.current = s;

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('room:state', ({ room: next }: { room: RoomPublic }) => {
      setRoom(next);
    });

    s.on('hand:private', ({ cards }: { cards: Card[] }) => {
      setHand(sortHand(cards, 'rank_asc'));
      setSelected(new Set());
    });

    s.on('game:end', ({ winnerId, winnerName }: { winnerId: string; winnerName?: string }) => {
      const shown = winnerName ?? winnerId;
      setErrorMsg(winnerId ? `Ván kết thúc. Winner: ${shown}` : 'Ván kết thúc.');
    });

    s.connect();
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      if (flyCleanupTimerRef.current !== null) window.clearTimeout(flyCleanupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    if (!connected) return;
    if (!session) return;

    s.emit(
      'player:reconnect',
      { roomId: session.roomId, playerId: session.playerId, reconnectToken: session.reconnectToken },
      (resp: any) => {
        if (resp?.error) {
          localStorage.removeItem('tlmn:session');
          setSession(null);
          setRoom(null);
          setHand([]);
          setSelected(new Set());
          setErrorMsg(`Reconnect failed: ${resp.error.code}`);
        }
      }
    );
  }, [connected, session]);

  function saveSession(next: { roomId: string; playerId: string; reconnectToken: string }) {
    localStorage.setItem('tlmn:session', JSON.stringify(next));
    setSession(next);
  }

  function clearSessionState() {
    localStorage.removeItem('tlmn:session');
    setSession(null);
    setRoom(null);
    setHand([]);
    setSelected(new Set());
    setFlyingCards([]);
    setIsFlyActive(false);
    setErrorMsg(null);
  }

  function toggleSelect(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function onAutoSort() {
    setHand((prev) => sortHand(prev, 'group_combo'));
  }

  function buildFlyCards(cardIds: string[]): FlyingCard[] {
    const targetRect = tableDropRef.current?.getBoundingClientRect();
    if (!targetRect) return [];

    return cardIds
      .map((id, index) => {
        const node = handCardRefs.current.get(id);
        const fromRect = node?.getBoundingClientRect();
        if (!fromRect) return null;

        const { rank, suit } = parseId(id);
        const red = suit === 'H' || suit === 'D';
        const spreadOffset = (index - (cardIds.length - 1) / 2) * 26;
        const toLeft = targetRect.left + targetRect.width / 2 - fromRect.width / 2 + spreadOffset;
        const toTop = targetRect.top + targetRect.height / 2 - fromRect.height / 2;
        return {
          key: `${id}-${Date.now()}-${index}`,
          id,
          rank,
          suit,
          red,
          fromLeft: fromRect.left,
          fromTop: fromRect.top,
          width: fromRect.width,
          height: fromRect.height,
          dx: toLeft - fromRect.left,
          dy: toTop - fromRect.top
        } satisfies FlyingCard;
      })
      .filter((card): card is FlyingCard => Boolean(card));
  }

  function startFlyToTable(cardIds: string[]) {
    if (flyCleanupTimerRef.current !== null) window.clearTimeout(flyCleanupTimerRef.current);

    const cards = buildFlyCards(cardIds);
    if (!cards.length) return;

    setFlyingCards(cards);
    setIsFlyActive(false);
    window.requestAnimationFrame(() => setIsFlyActive(true));
    flyCleanupTimerRef.current = window.setTimeout(() => {
      setIsFlyActive(false);
      setFlyingCards([]);
      flyCleanupTimerRef.current = null;
    }, 380);
  }

  function emitWithAck<T>(event: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const s = socketRef.current;
      if (!s) return reject(new Error('No socket'));
      s.emit(event, payload, (resp: any) => {
        if (resp?.error) return reject(Object.assign(new Error(resp.error.message ?? 'Error'), { code: resp.error.code }));
        resolve(resp as T);
      });
    });
  }

  async function onCreate() {
    setErrorMsg(null);
    try {
      const resp = await emitWithAck<{ roomId: string; playerId: string; reconnectToken: string }>('room:create', {
        name: name.trim() || 'Player'
      });
      saveSession(resp);
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onJoin() {
    setErrorMsg(null);
    try {
      const roomId = roomIdInput.trim().toUpperCase();
      const resp = await emitWithAck<{ roomId: string; playerId: string; reconnectToken: string }>('room:join', {
        roomId,
        name: name.trim() || 'Player'
      });
      saveSession(resp);
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onToggleReady() {
    setErrorMsg(null);
    try {
      await emitWithAck('player:ready', { ready: !(me?.ready ?? false) });
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onStart() {
    setErrorMsg(null);
    try {
      await emitWithAck('game:start', {});
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onNewRound() {
    setErrorMsg(null);
    try {
      await emitWithAck('game:new-round', {});
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onPlay() {
    setErrorMsg(null);
    const cardIds = Array.from(selected);
    if (!cardIds.length) return;
    try {
      await emitWithAck('turn:play', { cardIds });
      startFlyToTable(cardIds);
      setSelected(new Set());
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onPass() {
    setErrorMsg(null);
    try {
      await emitWithAck('turn:pass', {});
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function onLeaveRoom() {
    setErrorMsg(null);
    try {
      await emitWithAck('room:leave', {});
      clearSessionState();
    } catch (e: any) {
      setErrorMsg(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark" />
          <div className="brandText">
            <div className="brandTitle">Tien Len Mien Nam</div>
            <div className="brandSub">LAN table</div>
          </div>
        </div>
        <div className="pillRow">
          <div className={`pill ${connected ? 'ok' : 'warn'}`}>{connected ? 'socket: online' : 'socket: offline'}</div>
          {session?.roomId ? <div className="pill">room: {session.roomId}</div> : null}
          {session ? (
            <button className="btn ghost leaveBtn" onClick={onLeaveRoom} type="button">
              Thoát bàn
            </button>
          ) : null}
        </div>
      </header>

      <main className="shell">
        {!session ? (
          <section className="panel">
            <h1 className="h1">Vào bàn</h1>
            <p className="lead">Một người host server trong LAN. Mọi người join bằng mã phòng.</p>

            <div className="grid2">
              <label className="field">
                <div className="label">Tên hiển thị</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Minh"
                  autoComplete="nickname"
                />
              </label>
              <label className="field">
                <div className="label">Mã phòng (join)</div>
                <input
                  className="input"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                  placeholder="VD: 7K2M9Q"
                  autoCapitalize="characters"
                />
              </label>
            </div>

            <div className="actions">
              <button className="btn primary" onClick={onCreate} disabled={!connected}>
                Tạo phòng
              </button>
              <button className="btn ghost" onClick={onJoin} disabled={!connected || roomIdInput.trim().length < 4}>
                Join
              </button>
            </div>

            {errorMsg ? <div className="toast err">{errorMsg}</div> : null}
          </section>
        ) : (
          <section className="board">
            <div className="panel table">
              <div className="panelHead">
                <h2 className="h2">Tay bài của bàn</h2>
                <div className="meta">{room?.lastPlay ? `Lượt gần nhất: ${room.lastPlay.playerId}` : 'Chưa có lượt đánh'}</div>
              </div>

              <div className="centerTable">
                {(room?.players ?? []).slice(0, 4).map((p, idx) => {
                  const seatClass = idx === 0 ? 'top' : idx === 1 ? 'right' : idx === 2 ? 'bottom' : 'left';
                  const play = tablePlayByPlayer.get(p.playerId);
                  return (
                    <div key={p.playerId} className={`seat ${seatClass}`}>
                      <div className="seatName">{p.name}</div>
                      <div className="seatCards">
                        {play?.cardIds?.length ? (
                          play.cardIds.map((id) => {
                            const { rank, suit } = parseId(id);
                            const red = suit === 'H' || suit === 'D';
                            return (
                              <span key={`${p.playerId}-${id}`} className={`seatCard ${red ? 'red' : ''}`}>
                                {rankLabel(rank)}
                                {suitSymbol(suit)}
                              </span>
                            );
                          })
                        ) : (
                          <span className="seatEmpty">...</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="tableDropTarget" ref={tableDropRef}>
                  {room?.lastPlay?.cardIds?.length ? (
                    <>
                      <div className="trickLabel">Bộ bài trên bàn</div>
                      <div className="tableTrickCards">
                        {room.lastPlay.cardIds.map((id) => {
                          const { rank, suit } = parseId(id);
                          const red = suit === 'H' || suit === 'D';
                          return (
                            <span key={`table-${id}`} className={`tableCard ${red ? 'red' : ''}`}>
                              {rankLabel(rank)}
                              {suitSymbol(suit)}
                            </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <span className="seatEmpty">Bàn đang trống</span>
                  )}
                </div>
              </div>
            </div>

            <div className="panel handPanel">
              <div className="panelHead">
                  <h2 className="h2">Tay bài của bạn</h2>
                  <div className="meta">
                    {room?.phase === 'playing'
                      ? room.currentPlayerId === session.playerId
                        ? `Tới lượt bạn${turnLeftSec !== null ? ` • ${turnLeftSec}s` : ''}`
                        : 'Chờ lượt'
                      : room?.phase === 'ended'
                        ? `Kết thúc${room.winnerName ? ` • Winner: ${room.winnerName}` : ''}${
                            rematchLeftSec !== null ? ` • ván mới sau ${rematchLeftSec}s` : ''
                          }`
                        : '—'}
                  </div>
              </div>

                <div className="hand">
                  {hand.map((card, i) => {
                    const red = card.suit === 'H' || card.suit === 'D';
                    const isSel = selected.has(card.id);
                    return (
                      <button
                        key={card.id}
                        className={`playCard ${red ? 'red' : ''} ${isSel ? 'sel' : ''}`}
                        style={{ '--i': i } as CSSProperties}
                        ref={(node) => {
                          handCardRefs.current.set(card.id, node);
                        }}
                        onClick={() => toggleSelect(card.id)}
                        type="button"
                      >
                        <div className="pcTop">
                          <span className="pcRank">{rankLabel(card.rank)}</span>
                          <span className="pcSuit">{suitSymbol(card.suit)}</span>
                        </div>
                        <div className="pcId">{card.id}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="actions sticky">
                  <button className="btn" onClick={onAutoSort} disabled={hand.length === 0}>
                    Tự xếp bài
                  </button>
                  <button
                    className="btn primary"
                    onClick={onPlay}
                    disabled={
                      !connected ||
                      !room ||
                      room.phase !== 'playing' ||
                      room.currentPlayerId !== session.playerId ||
                      selected.size === 0
                    }
                  >
                    Đánh ({selected.size})
                  </button>
                  <button
                    className="btn ghost"
                    onClick={onPass}
                    disabled={!connected || !room || room.phase !== 'playing' || room.currentPlayerId !== session.playerId}
                  >
                    Bỏ lượt
                  </button>
                </div>
            </div>

            <div className="panel lobbyPanel">
              <div className="panelHead">
                <h2 className="h2">Lobby</h2>
                <div className="meta">{room?.phase ?? '...'}</div>
              </div>

              <div className="players">
                {(room?.players ?? []).map((p) => {
                  const isMe = p.playerId === session.playerId;
                  const isTurn = room?.currentPlayerId === p.playerId && room?.phase === 'playing';
                  return (
                    <div key={p.playerId} className={`player ${isMe ? 'me' : ''} ${isTurn ? 'turn' : ''}`}>
                      <div className="playerMain">
                        <div className="playerName">{p.name}</div>
                        <div className="playerMeta">
                          {p.connected ? 'online' : 'offline'} • {p.cardsRemaining} lá
                        </div>
                      </div>
                      <div className="tags">
                        {isMe ? <span className="tag">you</span> : null}
                        {p.ready ? <span className="tag ok">ready</span> : <span className="tag warn">wait</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="actions">
                <button
                  className="btn"
                  onClick={onToggleReady}
                  disabled={!connected || !room || room.phase === 'playing'}
                >
                  {me?.ready ? 'Unready' : 'Ready'}
                </button>
                <button
                  className="btn primary"
                  onClick={onStart}
                  disabled={!connected || !room || room.phase !== 'lobby' || !isHost}
                >
                  Start
                </button>
                {room?.phase === 'ended' && isHost ? (
                  <button className="btn primary" onClick={onNewRound} disabled={!connected || !allReady}>
                    Bắt đầu ván mới
                  </button>
                ) : null}
              </div>

              {errorMsg ? <div className="toast err">{errorMsg}</div> : null}
            </div>
          </section>
        )}

        {room?.phase === 'ended' && room.result ? (
          <section className="panel">
            <div className="panelHead">
              <h2 className="h2">Kết quả ván</h2>
              <div className="meta">{room.winnerName ? `Winner: ${room.winnerName}` : 'Ended'}</div>
            </div>
            <div className="scoreRows">
              {room.players.map((p) => {
                const b = room.result!.breakdown[p.playerId];
                const total = room.result!.totals[p.playerId] ?? 0;
                const sign = total > 0 ? '+' : '';
                return (
                  <div key={p.playerId} className="scoreRow">
                    <div className="scoreHead">
                      <strong>{p.name}</strong>
                      <span className={total >= 0 ? 'scorePlus' : 'scoreMinus'}>
                        {sign}
                        {total}
                      </span>
                    </div>
                    <div className="scoreBreak">
                      base {b?.base ?? 0} • thối2 {b?.thoi2 ?? 0} • chặt +{b?.chopReceived ?? 0} / -
                      {b?.chopPaid ?? 0}
                      {' • '}cóng {b?.cong ?? 0} • tới trắng +{b?.whiteWin ?? 0} / -{b?.whiteLose ?? 0}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>

      {flyingCards.length ? (
        <div className="flyLayer" aria-hidden="true">
          {flyingCards.map((card, i) => {
            const style = {
              '--from-left': `${card.fromLeft}px`,
              '--from-top': `${card.fromTop}px`,
              '--w': `${card.width}px`,
              '--h': `${card.height}px`,
              '--dx': `${card.dx}px`,
              '--dy': `${card.dy}px`,
              '--delay': `${i * 24}ms`
            } as CSSProperties;
            return (
              <div key={card.key} className={`flyCard ${card.red ? 'red' : ''} ${isFlyActive ? 'active' : ''}`} style={style}>
                <div className="pcTop">
                  <span className="pcRank">{rankLabel(card.rank)}</span>
                  <span className="pcSuit">{suitSymbol(card.suit)}</span>
                </div>
                <div className="pcId">{card.id}</div>
              </div>
            );
          })}
        </div>
      ) : null}

      <footer className="foot">
        <div className="footNote">
          Luật v1: S1 (sảnh so lá cao), L1 (nước đầu có 3♠), P1 (chặt tứ quý/đôi thông), W1 (ăn trắng).
        </div>
      </footer>
    </div>
  );
}

export default App;
