import { describe, expect, test } from 'vitest';

import {
  GameError,
  applyPass,
  applyPlay,
  chooseDeckByPairWhiteTarget,
  createRoom,
  createStandardDeck,
  hasPairWhiteWinInDeck,
  joinRoom,
  readyPlayer,
  startGame
} from '../src/game/engine.js';
import { checkWhiteWin, type Card } from '../src/rules/index.js';

function shuffleWithSeed<T>(arr: T[], seed: number) {
  // Deterministic shuffle for tests.
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

function makeRng(seed: number): () => number {
  let x = (seed | 0) + 1;
  return () => {
    x = (x * 48271) % 0x7fffffff;
    return x / 0x7fffffff;
  };
}

function shuffleWithRng<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
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

function deckHasAnyWhiteWin(deck: Card[]): boolean {
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) hands[i % 4]!.push(deck[i]!);
  return hands.some((h) => checkWhiteWin(h));
}

function makeDeckNoWhiteWin(placements: Array<[cardId: string, index: number]>): Card[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const deck = createStandardDeck();
    shuffleWithSeed(deck, attempt + 42);
    for (const [cardId, index] of placements) moveCard(deck, cardId, index);
    if (!deckHasAnyWhiteWin(deck)) return deck;
  }
  throw new Error('could not generate a non-white-win deck for this test');
}

describe('engine', () => {
  test('chooseDeckByPairWhiteTarget enforces target branch decision', () => {
    const rng = makeRng(42);
    const deck = chooseDeckByPairWhiteTarget({
      targetRate: 1,
      maxAttempts: 2000,
      createDeck: createStandardDeck,
      shuffle: (cards) => shuffleWithRng(cards, rng),
      random: () => 0 // always want pair-white
    });
    expect(hasPairWhiteWinInDeck(deck)).toBe(true);
  });

  test('pair-white occurrence is near 1 percent in 10000 rounds', () => {
    const decisionRng = makeRng(777);
    let shuffleSeed = 1000;
    let pairWhiteRounds = 0;
    const rounds = 10000;

    for (let i = 0; i < rounds; i++) {
      const shuffleRng = makeRng(shuffleSeed++);
      const deck = chooseDeckByPairWhiteTarget({
        targetRate: 0.01,
        maxAttempts: 2500,
        createDeck: createStandardDeck,
        shuffle: (cards) => shuffleWithRng(cards, shuffleRng),
        random: decisionRng
      });
      if (hasPairWhiteWinInDeck(deck)) pairWhiteRounds++;
    }

    const rate = pairWhiteRounds / rounds;
    expect(rate).toBeGreaterThanOrEqual(0.008);
    expect(rate).toBeLessThanOrEqual(0.012);
  });

  test('startGame deals 13 cards each and selects 3S holder to start (L1)', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    // Force 3S into p2's hand (round-robin deal: index % 4 === 1 => p2).
    const deck = makeDeckNoWhiteWin([['3S', 1]]);

    startGame(room, { deck });

    expect(room.phase).toBe('playing');
    expect(room.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 13]);
    expect(room.currentPlayerId).toBe('p2');
    expect(room.firstMove).toBe(true);
  });

  test('first move must include 3S (L1)', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    // Ensure p2 has at least one other card we can play (and keep 3S in p2's hand).
    const deck = makeDeckNoWhiteWin([
      ['4S', 5],
      ['3S', 1]
    ]);
    startGame(room, { deck });

    expect(() => applyPlay(room, 'p2', ['4S'])).toThrowError(GameError);
    try {
      applyPlay(room, 'p2', ['4S']);
    } catch (e) {
      const ge = e as GameError;
      expect(ge.code).toBe('FIRST_MOVE_MUST_INCLUDE_3S');
    }

    applyPlay(room, 'p2', ['3S']);
    expect(room.firstMove).toBe(false);
    expect(room.currentPlayerId).toBe('p3');
  });

  test('three passes resets trick and returns lead to last player who played', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    const deck = makeDeckNoWhiteWin([['3S', 1]]);
    startGame(room, { deck });

    applyPlay(room, 'p2', ['3S']);
    expect(room.tablePlays.length).toBe(1);
    applyPass(room, 'p3');
    applyPass(room, 'p4');
    applyPass(room, 'p1');

    expect(room.lastPlay).toBeNull();
    expect(room.tablePlays.length).toBe(0);
    expect(room.currentPlayerId).toBe('p2');
  });

  test('play must beat last play unless it is a valid chop', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    const deck = makeDeckNoWhiteWin([
      ['4S', 2], // p3
      ['3H', 3], // p4
      ['3S', 1] // p2
    ]);
    startGame(room, { deck });

    applyPlay(room, 'p2', ['3S']); // last = 3S
    applyPlay(room, 'p3', ['4S']); // last = 4S

    expect(() => applyPlay(room, 'p4', ['3H'])).toThrowError(GameError);
    try {
      applyPlay(room, 'p4', ['3H']);
    } catch (e) {
      const ge = e as GameError;
      expect(ge.code).toBe('CANNOT_BEAT');
    }
  });

  test('chop: 3 consecutive pairs can chop a single 2 (P1)', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    const deck = makeDeckNoWhiteWin([
      ['2S', 2], // p3 has a single 2 to play
      // p4 has 3 consecutive pairs: 3-4-5
      ['3D', 3],
      ['3C', 7],
      ['4D', 11],
      ['4C', 15],
      ['5D', 19],
      ['5C', 23],
      ['3S', 1] // p2 starts
    ]);

    startGame(room, { deck });

    applyPlay(room, 'p2', ['3S']);
    applyPlay(room, 'p3', ['2S']);

    // chop is allowed across combo types
    applyPlay(room, 'p4', ['3D', '3C', '4D', '4C', '5D', '5C']);
  });

  test('startGame ends immediately on white win (W1)', () => {
    const room = createRoom('room1', { playerId: 'p1', name: 'A' });
    joinRoom(room, { playerId: 'p2', name: 'B' });
    joinRoom(room, { playerId: 'p3', name: 'C' });
    joinRoom(room, { playerId: 'p4', name: 'D' });

    readyPlayer(room, 'p1', true);
    readyPlayer(room, 'p2', true);
    readyPlayer(room, 'p3', true);
    readyPlayer(room, 'p4', true);

    const deck = createStandardDeck();
    shuffleWithSeed(deck, 123);
    // Put all four 2s into p1's hand (indices 0..12)
    moveCard(deck, '2S', 0);
    moveCard(deck, '2C', 4);
    moveCard(deck, '2D', 8);
    moveCard(deck, '2H', 12);

    startGame(room, { deck });

    expect(room.phase).toBe('ended');
    expect(room.winnerId).toBe('p1');
  });
});
