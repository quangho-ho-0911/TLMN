export type Suit = 'S' | 'C' | 'D' | 'H';

export type Card = {
  id: string;
  rank: number; // 3..15 (J=11 Q=12 K=13 A=14 2=15)
  suit: Suit; // S=Spades (Bich), C=Clubs (Tep), D=Diamonds (Ro), H=Hearts (Co)
};

export type Combo =
  | { type: 'single'; rank: number; suit: Suit }
  | { type: 'pair'; rank: number }
  | { type: 'triple'; rank: number }
  | { type: 'four_kind'; rank: number }
  | { type: 'straight'; highRank: number; length: number }
  | { type: 'consecutive_pairs'; highRank: number; pairs: number };

type RankCounts = Map<number, number>;

function suitWeight(suit: Suit): number {
  // Co > Ro > Tep > Bich
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

function sortByRankThenSuit(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return suitWeight(a.suit) - suitWeight(b.suit);
  });
}

function allSameRank(cards: Card[]): boolean {
  const r0 = cards[0]?.rank;
  return r0 !== undefined && cards.every((c) => c.rank === r0);
}

function isStraightRanks(ranksAsc: number[]): boolean {
  if (ranksAsc.length < 3) return false;
  if (ranksAsc.includes(15)) return false; // no 2 in straights
  // unique
  for (let i = 1; i < ranksAsc.length; i++) {
    if (ranksAsc[i] === ranksAsc[i - 1]) return false;
  }
  for (let i = 1; i < ranksAsc.length; i++) {
    if (ranksAsc[i] !== ranksAsc[i - 1] + 1) return false;
  }
  return true;
}

export function parseCombo(cards: Card[]): Combo | null {
  if (cards.length === 0) return null;

  const sorted = sortByRankThenSuit(cards);
  const ranksAsc = sorted.map((c) => c.rank);

  if (sorted.length === 1) {
    return { type: 'single', rank: sorted[0].rank, suit: sorted[0].suit };
  }

  if (sorted.length === 2) {
    if (!allSameRank(sorted)) return null;
    return { type: 'pair', rank: sorted[0].rank };
  }

  if (sorted.length === 3) {
    if (allSameRank(sorted)) return { type: 'triple', rank: sorted[0].rank };
    if (isStraightRanks(ranksAsc)) {
      return { type: 'straight', highRank: ranksAsc[ranksAsc.length - 1], length: ranksAsc.length };
    }
    return null;
  }

  if (sorted.length === 4) {
    if (allSameRank(sorted)) return { type: 'four_kind', rank: sorted[0].rank };
    if (isStraightRanks(ranksAsc)) {
      return { type: 'straight', highRank: ranksAsc[ranksAsc.length - 1], length: ranksAsc.length };
    }
    return null;
  }

  if (isStraightRanks(ranksAsc)) {
    return { type: 'straight', highRank: ranksAsc[ranksAsc.length - 1], length: ranksAsc.length };
  }

  if (sorted.length % 2 === 0 && sorted.length >= 6) {
    // consecutive pairs: all ranks appear exactly twice and ranks are consecutive (no 2)
    if (ranksAsc.includes(15)) return null;

    const pairRanks: number[] = [];
    for (let i = 0; i < ranksAsc.length; i += 2) {
      if (ranksAsc[i] !== ranksAsc[i + 1]) return null;
      pairRanks.push(ranksAsc[i]);
    }
    // pair ranks are already sorted because cards are sorted
    for (let i = 1; i < pairRanks.length; i++) {
      if (pairRanks[i] !== pairRanks[i - 1] + 1) return null;
    }
    const pairs = pairRanks.length;
    if (pairs < 3) return null;
    return { type: 'consecutive_pairs', pairs, highRank: pairRanks[pairRanks.length - 1] };
  }

  return null;
}

export function canBeat(play: Combo, last: Combo): boolean {
  if (play.type !== last.type) return false;

  switch (play.type) {
    case 'single': {
      if (last.type !== 'single') return false;
      if (play.rank !== last.rank) return play.rank > last.rank;
      return suitWeight(play.suit) > suitWeight(last.suit);
    }
    case 'pair':
    case 'triple':
    case 'four_kind':
      return play.rank > (last as typeof play).rank;
    case 'straight':
      if (last.type !== 'straight') return false;
      if (play.length !== last.length) return false;
      return play.highRank > last.highRank;
    case 'consecutive_pairs':
      if (last.type !== 'consecutive_pairs') return false;
      if (play.pairs !== last.pairs) return false;
      return play.highRank > last.highRank;
  }
}

export function canChop(play: Combo, last: Combo): boolean {
  // P1 chops
  if (last.type === 'single' && last.rank === 15) {
    if (play.type === 'four_kind') return true;
    if (play.type === 'consecutive_pairs' && play.pairs >= 3) return true;
    return false;
  }

  if (last.type === 'pair' && last.rank === 15) {
    if (play.type === 'consecutive_pairs' && play.pairs >= 4) return true;
    return false;
  }

  if (last.type === 'consecutive_pairs') {
    if (play.type === 'four_kind') return true;
  }

  return false;
}

function countRanks(hand: Card[]): RankCounts {
  const counts = new Map<number, number>();
  for (const card of hand) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

function hasStraight3ToA(counts: RankCounts): boolean {
  for (let r = 3; r <= 14; r++) {
    if ((counts.get(r) ?? 0) < 1) return false;
  }
  return true;
}

export function isPairWhiteWin(hand: Card[]): boolean {
  const counts = countRanks(hand);

  // 5 consecutive pairs
  for (let start = 3; start <= 10; start++) {
    let ok = true;
    for (let r = start; r < start + 5; r++) {
      if ((counts.get(r) ?? 0) < 2) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }

  // 4 triples
  let triples = 0;
  for (const [, n] of counts) if (n >= 3) triples++;
  if (triples >= 4) return true;

  // 6 pairs
  let pairs = 0;
  for (const [, n] of counts) if (n >= 2) pairs++;
  if (pairs >= 6) return true;

  return false;
}

export function checkWhiteWin(hand: Card[]): boolean {
  const counts = countRanks(hand);

  // four 2s
  if ((counts.get(15) ?? 0) >= 4) return true;

  // straight 3..A present
  if (hasStraight3ToA(counts)) return true;

  if (isPairWhiteWin(hand)) return true;

  return false;
}
