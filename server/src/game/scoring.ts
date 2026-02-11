import type { Combo, Card } from '../rules/index.js';

export const SCORE_CONST = {
  BASE_PER_CARD: 1,
  CONG_MULTIPLIER: 2,
  THOI_2_SINGLE: 5,
  THOI_2_PAIR: 12,
  THOI_2_FOUR: 24,
  CHOP_SINGLE_2_BY_FOUR_KIND: 8,
  CHOP_SINGLE_2_BY_3_PAIRS: 8,
  CHOP_PAIR_2_BY_4_PAIRS: 16,
  CHOP_CHAIN: 8,
  WHITE_WIN_BONUS: 24,
  WHITE_WIN_PAIR_MULTIPLIER: 1.5
} as const;

export type WhiteWinKind = 'pair_white' | 'other' | null;

export type ChopEventKind = 'single_2_by_four_kind' | 'single_2_by_3_pairs' | 'pair_2_by_4_pairs' | 'chain';

export type ChopEvent = {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  kind: ChopEventKind;
};

export type ScoreInputPlayer = {
  playerId: string;
  hand: Card[];
};

export type ScoreInput = {
  winnerId: string;
  players: ScoreInputPlayer[];
  chopEvents?: ChopEvent[];
  whiteWinKind?: WhiteWinKind;
};

export type PlayerBreakdown = {
  base: number;
  thoi2: number;
  chopReceived: number;
  chopPaid: number;
  cong: number;
  whiteWin: number;
  whiteLose: number;
  total: number;
};

export type ScoreResult = {
  totals: Record<string, number>;
  breakdown: Record<string, PlayerBreakdown>;
};

function countTwo(hand: Card[]): number {
  return hand.filter((c) => c.rank === 15).length;
}

function addTransfer(
  totals: Record<string, number>,
  from: string,
  to: string,
  amount: number,
  breakdown: Record<string, PlayerBreakdown>,
  kind: 'base' | 'thoi2' | 'cong' | 'chop' | 'white'
): void {
  if (amount <= 0) return;
  totals[from] -= amount;
  totals[to] += amount;

  switch (kind) {
    case 'base':
      breakdown[from]!.base += amount;
      break;
    case 'thoi2':
      breakdown[from]!.thoi2 += amount;
      break;
    case 'cong':
      breakdown[from]!.cong += amount;
      break;
    case 'chop':
      breakdown[from]!.chopPaid += amount;
      breakdown[to]!.chopReceived += amount;
      break;
    case 'white':
      breakdown[from]!.whiteLose += amount;
      breakdown[to]!.whiteWin += amount;
      break;
  }
}

export function getChopMeta(play: Combo, last: Combo): { kind: ChopEventKind; amount: number } | null {
  if (last.type === 'single' && last.rank === 15) {
    if (play.type === 'four_kind') {
      return { kind: 'single_2_by_four_kind', amount: SCORE_CONST.CHOP_SINGLE_2_BY_FOUR_KIND };
    }
    if (play.type === 'consecutive_pairs' && play.pairs >= 3) {
      return { kind: 'single_2_by_3_pairs', amount: SCORE_CONST.CHOP_SINGLE_2_BY_3_PAIRS };
    }
  }

  if (last.type === 'pair' && last.rank === 15) {
    if (play.type === 'consecutive_pairs' && play.pairs >= 4) {
      return { kind: 'pair_2_by_4_pairs', amount: SCORE_CONST.CHOP_PAIR_2_BY_4_PAIRS };
    }
  }

  if (last.type === 'consecutive_pairs' && play.type === 'four_kind') {
    return { kind: 'chain', amount: SCORE_CONST.CHOP_CHAIN };
  }

  return null;
}

export function scoreEndedGame(input: ScoreInput): ScoreResult {
  const totals: Record<string, number> = {};
  const breakdown: Record<string, PlayerBreakdown> = {};

  for (const p of input.players) {
    totals[p.playerId] = 0;
    breakdown[p.playerId] = {
      base: 0,
      thoi2: 0,
      chopReceived: 0,
      chopPaid: 0,
      cong: 0,
      whiteWin: 0,
      whiteLose: 0,
      total: 0
    };
  }

  const winnerId = input.winnerId;
  for (const p of input.players) {
    if (p.playerId === winnerId) continue;

    const baseLoss = p.hand.length * SCORE_CONST.BASE_PER_CARD;
    addTransfer(totals, p.playerId, winnerId, baseLoss, breakdown, 'base');

    if (p.hand.length === 13) {
      const congLoss = 13 * SCORE_CONST.BASE_PER_CARD * (SCORE_CONST.CONG_MULTIPLIER - 1);
      addTransfer(totals, p.playerId, winnerId, congLoss, breakdown, 'cong');
    }

    const twoCount = countTwo(p.hand);
    if (twoCount === 1) {
      addTransfer(totals, p.playerId, winnerId, SCORE_CONST.THOI_2_SINGLE, breakdown, 'thoi2');
    } else if (twoCount === 2) {
      addTransfer(totals, p.playerId, winnerId, SCORE_CONST.THOI_2_PAIR, breakdown, 'thoi2');
    } else if (twoCount >= 4) {
      addTransfer(totals, p.playerId, winnerId, SCORE_CONST.THOI_2_FOUR, breakdown, 'thoi2');
    }
  }

  for (const ev of input.chopEvents ?? []) {
    if (!(ev.fromPlayerId in totals) || !(ev.toPlayerId in totals)) {
      // no-op if player id mismatch, kept defensive for runtime safety
      continue;
    }
    addTransfer(totals, ev.fromPlayerId, ev.toPlayerId, ev.amount, breakdown, 'chop');
  }

  if (input.whiteWinKind) {
    const multiplier = input.whiteWinKind === 'pair_white' ? SCORE_CONST.WHITE_WIN_PAIR_MULTIPLIER : 1;
    const amount = Math.round(SCORE_CONST.WHITE_WIN_BONUS * multiplier);
    for (const p of input.players) {
      if (p.playerId === winnerId) continue;
      addTransfer(totals, p.playerId, winnerId, amount, breakdown, 'white');
    }
  }

  for (const p of input.players) {
    breakdown[p.playerId]!.total = totals[p.playerId] ?? 0;
  }

  return { totals, breakdown };
}
