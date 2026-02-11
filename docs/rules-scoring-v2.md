# TLMN Rules + Scoring v2 (Canonical)

Date: 2026-02-11
Scope: Online LAN room, 4 players, server-authoritative.

## 1. Core Gameplay

- 4 players, 52 cards, each 13 cards.
- Rank order: `3 4 5 6 7 8 9 10 J Q K A 2`.
- Suit order for single compare only: `S < C < D < H`.
- First turn must include `3S`.
- Valid combos:
- single
- pair
- triple
- straight (>=3 cards, no rank 2)
- four_kind
- consecutive_pairs (>=3 pairs, no rank 2)

## 2. Chop Rules

- Single `2` can be chopped by:
- any `four_kind`
- `consecutive_pairs` with >=3 pairs
- Pair `2` can be chopped by:
- `consecutive_pairs` with >=4 pairs
- `four_kind` can chop `consecutive_pairs` (existing P1 compatibility).
- Chop chaining is allowed (A chops B, C chops A, ...), and each chop creates a score transfer event.

## 3. White-Win Definitions

General white-win triggers (existing W1):
- straight from 3 to A
- 5 consecutive pairs
- 4 triples
- 6 pairs
- four 2s

Pair-white subgroup (used for controlled spawn-rate target):
- 5 consecutive pairs
- 6 pairs
- 4 triples

## 4. Pair-White Spawn Target

- Target probability: exactly 1% per round in expectation.
- Runtime tolerance in test simulation (10,000 rounds): 0.8% to 1.2%.
- Implementation behavior:
- Server samples a boolean `wantPairWhite` with probability 1%.
- Server reshuffles until deal outcome matches the sampled target (`hasPairWhite == wantPairWhite`).
- Max retries must be bounded; if exceeded, fail loudly with server error code.

## 5. Scoring Model (Event Ledger)

All score changes are represented by transfer events `from -> to` so total score of all players is always 0.

## 5.1 Constants (default)

- `BASE_PER_CARD = 1`
- `CONG_MULTIPLIER = 2` (thua cóng: 13 lá nguyên)
- `THOI_2_SINGLE = 5`
- `THOI_2_PAIR = 12`
- `THOI_2_FOUR = 24`
- `CHOP_SINGLE_2_BY_FOUR_KIND = 8`
- `CHOP_SINGLE_2_BY_3_PAIRS = 8`
- `CHOP_PAIR_2_BY_4_PAIRS = 16`
- `CHOP_CHAIN_BONUS = 0` (optional, default off)
- `WHITE_WIN_BONUS = 24`
- `WHITE_WIN_PAIR_MULTIPLIER = 1.5`

## 5.2 End-Round Events

For each loser L and winner W:
- Base loss: `cardsRemaining(L) * BASE_PER_CARD`.
- Cong loss: if `cardsRemaining(L) == 13`, add `13 * BASE_PER_CARD * (CONG_MULTIPLIER - 1)`.
- Thoi 2 loss (remaining 2s in hand of L at round end):
- if count(2) == 1 => `THOI_2_SINGLE`
- if count(2) == 2 => `THOI_2_PAIR`
- if count(2) >= 4 => `THOI_2_FOUR`

All above are transferred `L -> W`.

## 5.3 In-Round Chop Events

On valid chop:
- Single 2 chopped by four_kind or 3 consecutive pairs:
- transfer `victim -> chopper` by corresponding chop constant.
- Pair 2 chopped by 4 consecutive pairs:
- transfer `victim -> chopper` by corresponding chop constant.
- If chain chop occurs, each chop creates its own event with immediate payer/payee.

## 5.4 White-Win End-Round Events

If player W white-wins:
- For each loser L:
- base white loss = `WHITE_WIN_BONUS`
- if white-win is in pair-white subgroup, multiply by `WHITE_WIN_PAIR_MULTIPLIER`
- transfer `L -> W` by computed amount.

## 5.5 Required Score Breakdown in API/UI

Per player breakdown must include:
- `base`
- `thoi2`
- `chopReceived`
- `chopPaid`
- `cong`
- `whiteWin`
- `whiteLose`
- `total`

## 6. Rematch Rules

After round ends:
- If all players ready: round starts immediately.
- Otherwise start a 5-second countdown.
- If countdown expires and room still valid: auto-start next round.
- Any unready action during countdown cancels and recomputes eligibility.

## 7. Client UX Requirements

- Add `Tự xếp bài` action (local display only).
- Add `Bắt đầu ván mới` button on ended state.
- Show countdown to auto-rematch.
- Center table must show each player's latest played cards for current trick; visible to all players in real time.

## 8. Non-Negotiable Invariants

- Server is source of truth for game state and score state.
- Score totals across all players must sum to zero.
- Client cannot mutate authoritative score/game state.
- Every scoring decision must be traceable to explicit event entries.
