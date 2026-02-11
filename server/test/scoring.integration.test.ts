import { describe, expect, test } from 'vitest';

import { applyPlay, createRoom, joinRoom, readyPlayer, startGame } from '../src/game/engine.js';
import { type Card } from '../src/rules/index.js';

function shuffleWithSeed<T>(arr: T[], seed: number) {
  let x = (seed | 0) + 1;
  const next = () => {
    x = (x * 48271) % 0x7fffffff;
    return x;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
}

function moveCard(deck: { id: string }[], cardId: string, toIndex: number) {
  const fromIndex = deck.findIndex((c) => c.id === cardId);
  if (fromIndex < 0) throw new Error(`missing card: ${cardId}`);
  const tmp = deck[toIndex];
  deck[toIndex] = deck[fromIndex]!;
  deck[fromIndex] = tmp!;
}

function setupRoom() {
  const room = createRoom('r1', { playerId: 'p1', name: 'A' });
  joinRoom(room, { playerId: 'p2', name: 'B' });
  joinRoom(room, { playerId: 'p3', name: 'C' });
  joinRoom(room, { playerId: 'p4', name: 'D' });
  readyPlayer(room, 'p1', true);
  readyPlayer(room, 'p2', true);
  readyPlayer(room, 'p3', true);
  readyPlayer(room, 'p4', true);
  return room;
}

describe('scoring integration with engine chops', () => {
  test('captures chop event during applyPlay', () => {
    const room = setupRoom();
    const deck: Card[] = [];
    // Start from a shuffled standard deck by reusing engine API indirectly through known IDs.
    // We only need deterministic placements for this scenario.
    const baseRanks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const suits: Card['suit'][] = ['S', 'C', 'D', 'H'];
    for (const r of baseRanks) {
      for (const s of suits) {
        const rank =
          r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : r === 'A' ? 14 : r === '2' ? 15 : Number(r);
        deck.push({ id: `${r}${s}`, rank, suit: s });
      }
    }
    shuffleWithSeed(deck, 128);

    moveCard(deck, '3S', 1); // p2 starts
    moveCard(deck, '2S', 2); // p3 has single 2
    moveCard(deck, '3D', 3);
    moveCard(deck, '3C', 7);
    moveCard(deck, '4D', 11);
    moveCard(deck, '4C', 15);
    moveCard(deck, '5D', 19);
    moveCard(deck, '5C', 23);

    startGame(room, { deck });
    applyPlay(room, 'p2', ['3S']);
    applyPlay(room, 'p3', ['2S']);
    applyPlay(room, 'p4', ['3D', '3C', '4D', '4C', '5D', '5C']);

    expect(room.chopEvents.length).toBe(1);
    expect(room.chopEvents[0]?.fromPlayerId).toBe('p3');
    expect(room.chopEvents[0]?.toPlayerId).toBe('p4');
  });
});
