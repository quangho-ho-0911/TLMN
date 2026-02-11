import { describe, expect, test } from 'vitest';

import type { Card } from '../src/rules/index.js';
import { SCORE_CONST, getChopMeta, scoreEndedGame } from '../src/game/scoring.js';

function c(rank: number, suit: Card['suit'], id: string): Card {
  return { id, rank, suit };
}

describe('scoreEndedGame', () => {
  test('base score is remaining cards and winner gets opposite sum', () => {
    const result = scoreEndedGame({
      winnerId: 'p1',
      players: [
        { playerId: 'p1', hand: [] },
        { playerId: 'p2', hand: [c(3, 'S', 'a'), c(4, 'S', 'b')] },
        { playerId: 'p3', hand: [c(5, 'S', 'c')] },
        { playerId: 'p4', hand: [c(6, 'S', 'd'), c(7, 'S', 'e'), c(8, 'S', 'f')] }
      ]
    });

    expect(result.breakdown.p2.base).toBe(2);
    expect(result.breakdown.p3.base).toBe(1);
    expect(result.breakdown.p4.base).toBe(3);
    expect(result.totals.p2).toBe(-2);
    expect(result.totals.p3).toBe(-1);
    expect(result.totals.p4).toBe(-3);
    expect(result.totals.p1).toBe(6);
  });

  test('applies thoi 2 and cong penalties', () => {
    const result = scoreEndedGame({
      winnerId: 'p1',
      players: [
        { playerId: 'p1', hand: [] },
        {
          playerId: 'p2',
          hand: [
            c(15, 'S', '2S'),
            c(7, 'S', '7S'),
            c(7, 'C', '7C'),
            c(7, 'D', '7D'),
            c(7, 'H', '7H'),
            c(3, 'S', '3S'),
            c(3, 'C', '3C'),
            c(4, 'S', '4S'),
            c(4, 'C', '4C'),
            c(5, 'S', '5S'),
            c(5, 'C', '5C'),
            c(9, 'S', '9S'),
            c(10, 'S', '10S')
          ]
        },
        { playerId: 'p3', hand: [c(6, 'S', '6S')] },
        { playerId: 'p4', hand: [c(8, 'S', '8S')] }
      ]
    });

    expect(result.breakdown.p2.base).toBe(13);
    expect(result.breakdown.p2.thoi2).toBe(SCORE_CONST.THOI_2_SINGLE);
    expect(result.breakdown.p2.cong).toBe(13 * SCORE_CONST.BASE_PER_CARD * (SCORE_CONST.CONG_MULTIPLIER - 1));
    expect(result.totals.p2).toBe(-31);
    expect(result.totals.p1).toBe(33);
  });

  test('applies chop and white-win transfers', () => {
    const result = scoreEndedGame({
      winnerId: 'p1',
      whiteWinKind: 'pair_white',
      chopEvents: [{ fromPlayerId: 'p2', toPlayerId: 'p3', amount: 8, kind: 'single_2_by_3_pairs' }],
      players: [
        { playerId: 'p1', hand: [] },
        { playerId: 'p2', hand: [c(3, 'S', 'a')] },
        { playerId: 'p3', hand: [c(4, 'S', 'b')] },
        { playerId: 'p4', hand: [c(5, 'S', 'c')] }
      ]
    });

    expect(result.breakdown.p2.chopPaid).toBe(8);
    expect(result.breakdown.p3.chopReceived).toBe(8);
    expect(result.breakdown.p1.whiteWin).toBe(108);
    expect(result.breakdown.p2.whiteLose).toBe(36);
    expect(result.breakdown.p3.whiteLose).toBe(36);
    expect(result.breakdown.p4.whiteLose).toBe(36);

    const total = Object.values(result.totals).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});

describe('getChopMeta', () => {
  test('returns chop amount for single 2 chopped by four kind', () => {
    const meta = getChopMeta({ type: 'four_kind', rank: 9 }, { type: 'single', rank: 15, suit: 'S' });
    expect(meta?.amount).toBe(SCORE_CONST.CHOP_SINGLE_2_BY_FOUR_KIND);
  });
});
