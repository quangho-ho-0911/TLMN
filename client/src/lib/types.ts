export type Suit = 'S' | 'C' | 'D' | 'H';

export type Card = {
  id: string; // e.g. "3S"
  rank: number; // 3..15 (A=14, 2=15)
  suit: Suit;
};

export type PlayerPublic = {
  playerId: string;
  name: string;
  ready: boolean;
  connected: boolean;
  cardsRemaining: number;
};

export type RoomPublic = {
  roomId: string;
  phase: 'lobby' | 'playing' | 'ended';
  currentPlayerId: string | null;
  winnerId: string | null;
  winnerName: string | null;
  turnEndsAt: number | null;
  turnMs: number;
  rematchStartsAt: number | null;
  rematchMs: number;
  lastPlay: null | {
    playerId: string;
    cardIds: string[];
    combo: unknown;
  };
  tablePlays: Array<{
    playerId: string;
    cardIds: string[];
    playedAt: number;
    trickNo: number;
  }>;
  result: null | {
    totals: Record<string, number>;
    breakdown: Record<
      string,
      {
        base: number;
        thoi2: number;
        chopReceived: number;
        chopPaid: number;
        cong: number;
        whiteWin: number;
        whiteLose: number;
        total: number;
      }
    >;
  };
  players: PlayerPublic[];
};
