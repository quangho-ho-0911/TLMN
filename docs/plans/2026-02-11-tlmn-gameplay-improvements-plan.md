# TLMN Gameplay Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Nâng cấp gameplay Tiến Lên với 5 thay đổi: kiểm soát tỷ lệ tới trắng cặp về 1%, tự xếp bài, rematch mượt, chấm điểm đầy đủ, và hiển thị bài đánh ở giữa bàn cho tất cả người chơi.

**Architecture:** Giữ mô hình server-authoritative hiện tại (Socket.IO + engine/rules/scoring). Bổ sung một lớp `round runtime` để quản lý rematch countdown và event log lượt đánh; mở rộng `scoring` sang model giao dịch điểm theo sự kiện (win/loss/chop/thối/cóng/tới trắng). Client chỉ render state server + thêm tương tác tự xếp bài và bàn giữa có animation.

**Tech Stack:** Node.js, TypeScript, Socket.IO, React + Vite, Vitest.

## Rule Lock (trước khi code)

- TDD cho toàn bộ logic mới ở `server/test/*.test.ts`.
- Dùng biến cấu hình cho điểm/phạt để dễ chỉnh luật.
- Không hardcode điểm trong UI.
- Mọi rule scoring phải nằm trong tài liệu nguồn sự thật trước khi implement.

### Task 1: Chốt đặc tả gameplay + scoring đầy đủ

**Files:**
- Create: `docs/rules-scoring-v2.md`
- Modify: `docs/plans/2026-02-11-tlmn-gameplay-improvements-plan.md`

**Step 1: Viết bảng rule chi tiết**

Bao gồm đầy đủ case tính điểm/phạt:
- Thắng thường: người thắng ăn tổng điểm thua của 3 người còn lại.
- Thua thường: trừ theo số lá còn lại (base).
- Thua cóng: nhân hệ số phạt (ví dụ `x2` base) nếu còn nguyên 13 lá.
- Thối 2 cuối ván:
- 1 cây 2: phạt `THOI_2_SINGLE`.
- đôi 2: phạt `THOI_2_PAIR`.
- tứ quý 2: phạt `THOI_2_FOUR`.
- Chặt heo trong ván:
- Người chặt nhận `CHOP_2_REWARD` từ người bị chặt.
- Người bị chặt trả `CHOP_2_PENALTY`.
- Chặt chồng (chặt cái chặt): giao dịch điểm theo từng lần chặt.
- Chặt bằng tứ quý / 3 đôi thông / 4 đôi thông: hệ số riêng.
- Tới trắng:
- Thắng ngay, cộng `WHITE_WIN_BONUS`.
- 3 người còn lại bị trừ theo `WHITE_WIN_LOSS`.
- Tới trắng dạng cặp (5 đôi thông, 6 đôi, 4 sám) ghi rõ multipliers.
- Thưởng đặc biệt cuối ván (nếu dùng): hết 13 lá trong 1 lượt, về nhất bằng chặt.

**Step 2: Verify tài liệu**

Run: `rg -n "THOI|CHOP|CONG|WHITE|BASE" docs/rules-scoring-v2.md`
Expected: có đầy đủ nhóm quy tắc và hằng số điểm.

**Step 3: Commit**

```bash
git add docs/rules-scoring-v2.md docs/plans/2026-02-11-tlmn-gameplay-improvements-plan.md
git commit -m "docs: define tlmn scoring v2 and gameplay rules"
```

### Task 2: Giảm xác suất tới trắng dạng cặp xuống đúng 1%

**Files:**
- Modify: `server/src/game/engine.ts`
- Modify: `server/src/rules/index.ts`
- Test: `server/test/engine.test.ts`
- Test: `server/test/rules.test.ts`

**Step 1: Write failing tests**

- Thêm test predicate nhận diện "tới trắng dạng cặp": `isPairWhiteWin(hand)`.
- Thêm test Monte Carlo nhỏ (seeded) cho deal 10,000 ván: tỷ lệ pair-white nằm trong khoảng `0.8% -> 1.2%`.

**Step 2: RED verification**

Run: `npm -w server run test -- server/test/rules.test.ts server/test/engine.test.ts`
Expected: FAIL vì chưa có `isPairWhiteWin` và deal controller.

**Step 3: Implement minimal**

- Thêm rule:

```ts
export function isPairWhiteWin(hand: Card[]): boolean {
  // true nếu 5 đôi thông, 6 đôi, hoặc 4 sám
}
```

- Thêm thuật toán chia bài có điều kiện để pair-white = 1%:

```ts
function dealDeckWithPairWhiteRate(target = 0.01): Card[] {
  const wantPairWhite = Math.random() < target;
  for (let i = 0; i < 2000; i++) {
    const deck = createStandardDeck();
    shuffleInPlace(deck);
    const hasPairWhite = dealHands(deck).some(isPairWhiteWin);
    if (wantPairWhite === hasPairWhite) return deck;
  }
  throw new GameError('DEAL_RATE_UNREACHABLE', 'cannot satisfy target pair-white rate');
}
```

- Dùng hàm này thay cho deal random hiện tại tại luồng start ván mới.

**Step 4: GREEN verification**

Run: `npm -w server run test -- server/test/rules.test.ts server/test/engine.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add server/src/game/engine.ts server/src/rules/index.ts server/test/engine.test.ts server/test/rules.test.ts
git commit -m "feat: enforce 1 percent pair-white occurrence"
```

### Task 3: Thêm tính năng Tự xếp bài

**Files:**
- Create: `client/src/lib/sort-hand.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`

**Step 1: Add sort utility + tests**

- Tạo comparator theo thứ tự rank tăng, suit ưu tiên (`S<C<D<H`) + grouping combo-friendly.

```ts
export type SortMode = 'rank_asc' | 'rank_desc' | 'group_combo';
export function sortHand(cards: Card[], mode: SortMode): Card[] {
  // return new sorted array
}
```

- Nếu thêm test client khó chạy hiện tại, test nhanh qua snapshot logic trong `server/test` không dùng DOM.

**Step 2: UI wiring**

- Thêm nút `Tự xếp bài` (và dropdown mode nếu cần).
- Khi bấm: reorder local hand view, không đổi state server.

**Step 3: Verify**

Run: `npm -w client run build`
Expected: PASS.

**Step 4: Commit**

```bash
git add client/src/lib/sort-hand.ts client/src/App.tsx client/src/index.css
git commit -m "feat(client): add auto hand sorting"
```

### Task 4: Rematch flow - nút bắt đầu ván mới + auto start sau 5 giây

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/game/engine.ts`
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/App.tsx`
- Test: `server/test/engine.test.ts`

**Step 1: Write failing tests**

- Khi `phase=ended`:
- nếu all players `ready=true` -> auto start ngay.
- nếu chưa all ready -> bắt đầu countdown 5s và auto start khi hết thời gian.
- nếu có người unready trong countdown -> reset countdown.

**Step 2: RED verification**

Run: `npm -w server run test -- server/test/engine.test.ts`
Expected: FAIL do chưa có rematch runtime.

**Step 3: Implement minimal**

- Thêm room fields:

```ts
rematch: {
  canStart: boolean;
  startsAt: number | null;
}
```

- Thêm event `game:new-round` (nút thủ công).
- Server scheduler:
- `allReady` ở `ended` => call `startGame` ngay.
- không all ready => set timeout 5000ms, khi timeout check lại và start.

**Step 4: Client wiring**

- Hiển thị nút `Bắt đầu ván mới` ở phase ended.
- Hiển thị countdown `Ván mới sau: Ns`.

**Step 5: GREEN verification**

Run: `npm -w server run test -- server/test/engine.test.ts && npm -w client run build`
Expected: PASS.

**Step 6: Commit**

```bash
git add server/src/index.ts server/src/game/engine.ts client/src/lib/types.ts client/src/App.tsx server/test/engine.test.ts
git commit -m "feat: add rematch button and 5-second auto restart"
```

### Task 5: Nâng cấp hệ thống tính điểm đầy đủ (win/loss/chặt/thối/cóng/tới trắng)

**Files:**
- Modify: `server/src/game/scoring.ts`
- Modify: `server/src/game/engine.ts`
- Modify: `server/src/index.ts`
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/App.tsx`
- Test: `server/test/scoring.test.ts`
- Create: `server/test/scoring.integration.test.ts`

**Step 1: Write failing tests trước**

Thêm test cho từng case:
- thắng thường + tổng điểm cân bằng 0.
- thua cóng.
- thối 2 lẻ/đôi/tứ quý.
- chặt heo thành công (1 lần, nhiều lần, chặt chồng).
- tới trắng (mọi loại đã chốt ở docs).
- winner do tới trắng + breakdown đúng.

**Step 2: RED verification**

Run: `npm -w server run test -- server/test/scoring.test.ts server/test/scoring.integration.test.ts`
Expected: FAIL.

**Step 3: Implement minimal scoring model**

- Đổi từ penalty tĩnh sang ledger event-based:

```ts
type ScoreEvent =
  | { type: 'BASE_LOSS'; from: string; to: string; amount: number }
  | { type: 'THOI_2'; from: string; to: string; amount: number; count: number }
  | { type: 'CHOP_2'; from: string; to: string; amount: number; byCombo: 'four_kind'|'3_pairs'|'4_pairs' }
  | { type: 'CONG'; from: string; to: string; amount: number }
  | { type: 'WHITE_WIN'; from: string; to: string; amount: number; kind: string };
```

- Tính `totals` bằng cách fold events.
- Giữ `breakdown` để UI hiển thị được từng loại phạt/thưởng.

**Step 4: UI cập nhật bảng kết quả**

- Thêm group hiển thị: `base`, `thối`, `chặt`, `cóng`, `tới trắng`, `tổng`.

**Step 5: GREEN verification**

Run: `npm -w server run test -- server/test/scoring.test.ts server/test/scoring.integration.test.ts && npm -w client run build`
Expected: PASS.

**Step 6: Commit**

```bash
git add server/src/game/scoring.ts server/src/game/engine.ts server/src/index.ts client/src/lib/types.ts client/src/App.tsx server/test/scoring.test.ts server/test/scoring.integration.test.ts
git commit -m "feat: implement full scoring system with chop and white-win cases"
```

### Task 6: Bàn giữa - mọi người đều thấy bài vừa đánh của từng người

**Files:**
- Modify: `server/src/game/engine.ts`
- Modify: `server/src/index.ts`
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`
- Test: `server/test/engine.test.ts`

**Step 1: Write failing tests**

- Sau mỗi `applyPlay`, `room.tablePlays` append đúng `{ playerId, cardIds, playedAt }`.
- Khi reset trick hoặc bắt đầu ván mới, table state được clear đúng rule.

**Step 2: RED verification**

Run: `npm -w server run test -- server/test/engine.test.ts`
Expected: FAIL.

**Step 3: Implement minimal**

- Thêm state:

```ts
type TablePlay = { playerId: string; cardIds: string[]; playedAt: number; trickNo: number };
room.tablePlays: TablePlay[];
```

- Broadcast cùng `room:state`.

**Step 4: Client render bàn giữa**

- Tạo `centerTable` trong panel `.table`.
- Map theo `playerId` -> seat (top/right/bottom/left).
- Khi có play mới: animate từ tay người chơi về giữa (CSS keyframes).
- Mỗi lượt chỉ giữ combo mới nhất của từng người trong trick hiện tại để bàn không rối.

**Step 5: Verify**

Run: `npm -w server run test -- server/test/engine.test.ts && npm -w client run build`
Expected: PASS.

**Step 6: Commit**

```bash
git add server/src/game/engine.ts server/src/index.ts client/src/lib/types.ts client/src/App.tsx client/src/index.css server/test/engine.test.ts
git commit -m "feat: render shared center-table plays for every turn"
```

### Task 7: Regression pass + docs sync

**Files:**
- Modify: `docs/rules.md`
- Modify: `README.md`

**Step 1: Sync docs**

- Cập nhật `docs/rules.md` với flow rematch, auto-sort, center table, scoring v2.
- Cập nhật `README.md` hướng dẫn người chơi cho nút mới.

**Step 2: Full verification**

Run: `npm test && npm run build`
Expected: PASS toàn bộ.

**Step 3: Commit**

```bash
git add docs/rules.md README.md
git commit -m "docs: update gameplay and scoring v2 instructions"
```

## Acceptance Checklist

- Tỷ lệ tới trắng dạng cặp đo trên test mô phỏng nằm quanh 1%.
- Có nút `Tự xếp bài` và không ảnh hưởng dữ liệu server.
- Có nút `Bắt đầu ván mới`; auto-start sau 5 giây hoạt động đúng.
- Scoreboard hiển thị đầy đủ win/loss/chặt/thối/cóng/tới trắng.
- Bài vừa đánh hiển thị ở giữa bàn cho tất cả người chơi theo thời gian thực.
