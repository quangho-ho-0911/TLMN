import type { Card } from './types';

export type SortMode = 'rank_asc' | 'rank_desc' | 'group_combo';

function suitWeight(suit: Card['suit']): number {
  switch (suit) {
    case 'S':
      return 1;
    case 'C':
      return 2;
    case 'D':
      return 3;
    case 'H':
      return 4;
  }
}

export function sortHand(cards: Card[], mode: SortMode): Card[] {
  const next = [...cards];

  if (mode === 'rank_asc') {
    return next.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return suitWeight(a.suit) - suitWeight(b.suit);
    });
  }

  if (mode === 'rank_desc') {
    return next.sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank;
      return suitWeight(b.suit) - suitWeight(a.suit);
    });
  }

  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);

  return next.sort((a, b) => {
    const ca = counts.get(a.rank) ?? 0;
    const cb = counts.get(b.rank) ?? 0;
    if (ca !== cb) return cb - ca;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return suitWeight(a.suit) - suitWeight(b.suit);
  });
}
