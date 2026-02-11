# TLMN LAN Web Game - Design (Spec v1)

Date: 2026-02-11

## Goal

Build a web-based "Tien Len Mien Nam" game playable over a local network (LAN). One coworker runs the server on a machine in the LAN; everyone joins via browser at `http://<host-ip>:3000`.

## Architecture

- Monorepo via `npm workspaces`: `client/` (Vite + React) and `server/` (Node.js + TypeScript + Express + Socket.IO).
- Server is authoritative:
  - Holds room state and game state in memory.
  - Validates every action (play/pass/start).
  - Broadcasts public state; sends private hand to each player.
- Production run:
  - Build `client` to `client/dist`.
  - `server` serves `client/dist` and hosts Socket.IO on same origin to avoid CORS issues.

## Networking (Socket.IO events)

Client -> server:
- `room:create({ name })`
- `room:join({ roomId, name })`
- `player:ready({ ready })`
- `game:start()` (host only)
- `turn:play({ cardIds })`
- `turn:pass()`
- `player:reconnect({ roomId, playerId, reconnectToken })`

Server -> client:
- `room:state({ room })` (public room state)
- `game:state({ game })` (public game state)
- `hand:private({ cards })` (private hand)
- `error({ code, message })`
- `game:end({ winnerId, finishingOrder, countsRemaining })`

## Spec v1 Rules (S1 L1 P1 W1)

### Setup

- 4 players, 52-card deck, each gets 13 cards.
- Turn order is clockwise.
- Rank order: `3 4 5 6 7 8 9 10 J Q K A 2` (2 is highest).
- Suit order (for singles only): `Hearts (Co) > Diamonds (Ro) > Clubs (Tep) > Spades (Bich)`.

### First hand

- The player holding `3♠` goes first.
- The first play of the first hand must include `3♠`.

### Valid combos

- `single`
- `pair`
- `triple`
- `straight` (length >= 3, consecutive ranks, cannot include rank 2)
- `four_kind`
- `consecutive_pairs` (>= 3 consecutive pairs, cannot include rank 2)

### Normal beating rules

- Must be same combo type and same length to beat (straights/pair-runs must match length).
- Singles compare by (rank, suit).
- Pair/triple/four-kind compare by rank.
- Straight compares by highest rank only (S1), suit ignored.
- Consecutive pairs compare by highest pair rank, length must match.

### Passing and trick reset

- Player may `pass`.
- When 3 players pass after a valid play, the trick resets and the last valid player leads the next trick.

### Chops (P1)

- A single `2` can be chopped by:
  - any `four_kind`, or
  - `consecutive_pairs` with length >= 3 pairs.
- A pair of `2` can be chopped by:
  - `consecutive_pairs` with length >= 4 pairs.
- A `four_kind` can chop a `consecutive_pairs` (example: chop 3 consecutive pairs).

### White wins (W1)

Checked right after dealing. If a player has any of these patterns, the hand ends immediately:
- Straight from 3 to A
- 5 consecutive pairs
- 4 triples (four distinct ranks with 3-of-a-kind)
- 6 pairs
- Four of a kind of 2s

## Testing Strategy

- TDD for rules engine (`server/src/rules`):
  - `parseCombo`, `canBeat`, `canChop`, `checkWhiteWin`.
- Add scenario tests for turn loop (later): fixed-deck/seed games with a scripted sequence of actions.

