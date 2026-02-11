import { describe, expect, test } from 'vitest';

import {
  canBeat,
  canChop,
  checkWhiteWin,
  isPairWhiteWin,
  parseCombo,
  type Card,
  type Combo
} from '../src/rules/index.js';

function c(code: string, idx = 0): Card {
  const m = /^([3-9]|10|J|Q|K|A|2)([SCDH])$/.exec(code);
  if (!m) throw new Error(`bad card code: ${code}`);
  const [, r, s] = m;
  const rank =
    r === 'J'
      ? 11
      : r === 'Q'
        ? 12
        : r === 'K'
          ? 13
          : r === 'A'
            ? 14
            : r === '2'
              ? 15
              : Number(r);
  return { id: `${code}:${idx}`, rank, suit: s as Card['suit'] };
}

describe('parseCombo', () => {
  test('parses single', () => {
    expect(parseCombo([c('3S')])).toEqual({ type: 'single', rank: 3, suit: 'S' });
  });

  test('parses pair', () => {
    expect(parseCombo([c('5H'), c('5S')])).toEqual({ type: 'pair', rank: 5 });
  });

  test('parses straight (S1)', () => {
    expect(parseCombo([c('6H'), c('7D'), c('8S')])).toEqual({
      type: 'straight',
      highRank: 8,
      length: 3
    });
  });

  test('rejects straight containing 2', () => {
    expect(parseCombo([c('QH'), c('KS'), c('AD'), c('2C')])).toBeNull();
  });

  test('parses 3 consecutive pairs', () => {
    expect(parseCombo([c('3H'), c('3D'), c('4C'), c('4S'), c('5H'), c('5D')])).toEqual({
      type: 'consecutive_pairs',
      pairs: 3,
      highRank: 5
    });
  });
});

describe('canBeat', () => {
  test('single compares suit when ranks equal', () => {
    const last = parseCombo([c('3S')]) as Combo;
    const play = parseCombo([c('3H')]) as Combo;
    expect(canBeat(play, last)).toBe(true);
  });

  test('pair compares rank', () => {
    const last = parseCombo([c('5H'), c('5S')]) as Combo;
    const play = parseCombo([c('6H'), c('6S')]) as Combo;
    expect(canBeat(play, last)).toBe(true);
  });

  test('straight compares highest rank only (S1), length must match', () => {
    const last = parseCombo([c('3H'), c('4S'), c('5D')]) as Combo;
    const play = parseCombo([c('6H'), c('7D'), c('8S')]) as Combo;
    expect(canBeat(play, last)).toBe(true);

    const playLen4 = parseCombo([c('6H'), c('7D'), c('8S'), c('9C')]) as Combo;
    expect(canBeat(playLen4, last)).toBe(false);
  });

  test('cannot beat with different combo type', () => {
    const last = parseCombo([c('3H')]) as Combo;
    const play = parseCombo([c('4H'), c('4S')]) as Combo;
    expect(canBeat(play, last)).toBe(false);
  });
});

describe('canChop (P1)', () => {
  test('3 consecutive pairs chops single 2', () => {
    const last = parseCombo([c('2S')]) as Combo;
    const play = parseCombo([c('3H'), c('3D'), c('4C'), c('4S'), c('5H'), c('5D')]) as Combo;
    expect(canChop(play, last)).toBe(true);
  });

  test('four of a kind chops single 2', () => {
    const last = parseCombo([c('2S')]) as Combo;
    const play = parseCombo([c('9H'), c('9D'), c('9C'), c('9S')]) as Combo;
    expect(canChop(play, last)).toBe(true);
  });

  test('4 consecutive pairs chops pair of 2', () => {
    const last = parseCombo([c('2H'), c('2S')]) as Combo;
    const play = parseCombo([
      c('3H'),
      c('3D'),
      c('4C'),
      c('4S'),
      c('5H'),
      c('5D'),
      c('6C'),
      c('6S')
    ]) as Combo;
    expect(canChop(play, last)).toBe(true);
  });

  test('four of a kind chops consecutive pairs', () => {
    const last = parseCombo([c('3H'), c('3D'), c('4C'), c('4S'), c('5H'), c('5D')]) as Combo;
    const play = parseCombo([c('9H'), c('9D'), c('9C'), c('9S')]) as Combo;
    expect(canChop(play, last)).toBe(true);
  });

  test('3 consecutive pairs does not chop pair of 2', () => {
    const last = parseCombo([c('2H'), c('2S')]) as Combo;
    const play = parseCombo([c('3H'), c('3D'), c('4C'), c('4S'), c('5H'), c('5D')]) as Combo;
    expect(canChop(play, last)).toBe(false);
  });
});

describe('checkWhiteWin (W1)', () => {
  test('detects straight 3 to A', () => {
    const hand: Card[] = [
      c('3S'),
      c('4S'),
      c('5S'),
      c('6S'),
      c('7S'),
      c('8S'),
      c('9S'),
      c('10S'),
      c('JS'),
      c('QS'),
      c('KS'),
      c('AS'),
      c('2S')
    ];
    expect(checkWhiteWin(hand)).toBe(true);
  });

  test('detects 5 consecutive pairs', () => {
    const hand: Card[] = [
      c('3H'),
      c('3D'),
      c('4H'),
      c('4D'),
      c('5H'),
      c('5D'),
      c('6H'),
      c('6D'),
      c('7H'),
      c('7D'),
      c('9S'),
      c('JS'),
      c('2S')
    ];
    expect(checkWhiteWin(hand)).toBe(true);
  });

  test('detects 4 triples', () => {
    const hand: Card[] = [
      c('3H'),
      c('3D'),
      c('3S'),
      c('4H'),
      c('4D'),
      c('4S'),
      c('5H'),
      c('5D'),
      c('5S'),
      c('6H'),
      c('6D'),
      c('6S'),
      c('2S')
    ];
    expect(checkWhiteWin(hand)).toBe(true);
  });

  test('detects 6 pairs', () => {
    const hand: Card[] = [
      c('3H'),
      c('3D'),
      c('4H'),
      c('4D'),
      c('5H'),
      c('5D'),
      c('6H'),
      c('6D'),
      c('7H'),
      c('7D'),
      c('8H'),
      c('8D'),
      c('2S')
    ];
    expect(checkWhiteWin(hand)).toBe(true);
  });

  test('detects four 2s', () => {
    const hand: Card[] = [
      c('2H'),
      c('2D'),
      c('2C'),
      c('2S'),
      c('3H'),
      c('4H'),
      c('5H'),
      c('6H'),
      c('7H'),
      c('8H'),
      c('9H'),
      c('10H'),
      c('AH')
    ];
    expect(checkWhiteWin(hand)).toBe(true);
  });

  test('returns false for normal hand', () => {
    const hand: Card[] = [
      c('3H'),
      c('4D'),
      c('6S'),
      c('7C'),
      c('9H'),
      c('10D'),
      c('JS'),
      c('QC'),
      c('KH'),
      c('AD'),
      c('2S'),
      c('5C'),
      c('5D')
    ];
    expect(checkWhiteWin(hand)).toBe(false);
  });
});

describe('isPairWhiteWin', () => {
  test('true for 6 pairs', () => {
    const hand: Card[] = [
      c('3H'),
      c('3D'),
      c('4H'),
      c('4D'),
      c('5H'),
      c('5D'),
      c('6H'),
      c('6D'),
      c('7H'),
      c('7D'),
      c('8H'),
      c('8D'),
      c('2S')
    ];
    expect(isPairWhiteWin(hand)).toBe(true);
  });

  test('false for non-pair-white hand', () => {
    const hand: Card[] = [
      c('3H'),
      c('4D'),
      c('6S'),
      c('7C'),
      c('9H'),
      c('10D'),
      c('JS'),
      c('QC'),
      c('KH'),
      c('AD'),
      c('2S'),
      c('5C'),
      c('5D')
    ];
    expect(isPairWhiteWin(hand)).toBe(false);
  });
});
