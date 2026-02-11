# TLMN Next Steps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hoàn thiện game Tiến Lên Miền Nam LAN cho dùng nội bộ với luật rõ ràng, gameplay ổn định, UX rõ ràng, và test e2e chống regression.

**Architecture:** Giữ server authoritative (Express + Socket.IO) và client React hiện tại. Tách rõ `rules`, `engine`, `scoring`, `runtime timer`, sau đó bổ sung integration test socket để khóa gameplay behavior. Tất cả thay đổi bám spec đã chốt `S1 L1 P1 W1`.

**Tech Stack:** Node.js, TypeScript, Socket.IO, React + Vite, Vitest.

## Implementation Rules

- Luôn theo TDD cho logic mới: RED -> GREEN -> REFACTOR.
- Mỗi task commit riêng.
- Không thêm feature ngoài plan (YAGNI).
- Mọi thay đổi luật phải cập nhật `docs/rules.md`.
- Phạm vi plan này chỉ tập trung **luật + gameplay ổn định**, không làm anti-cheat/security hardening.

### Task 1: Chuẩn hóa luật thành tài liệu nguồn sự thật

**Files:**
- Create: `docs/rules.md`
- Modify: `docs/plans/2026-02-11-tlmn-lan-design.md`

**Step 1: Viết tài liệu luật chính thức**
- Tạo `docs/rules.md` gồm:
  - Setup bàn, thứ tự rank/suit
  - Luật `S1 L1 P1 W1`
  - Timer turn behavior
  - Reconnect behavior + timeout policy 60s
  - Policy host disconnect/failover
  - Policy tie-break khi nhiều người cùng ăn trắng
  - Công thức phạt/điểm hiện tại
  - Các luật mơ hồ phải chốt dứt điểm:
    - Tứ quý chặt đôi thông theo điều kiện nào
    - Đôi thông chặt đôi thông cần cùng độ dài hay không
    - Thối đôi 2 và stacking penalty

**Step 2: Đồng bộ mô tả design cũ**
- Cập nhật `docs/plans/2026-02-11-tlmn-lan-design.md` để trỏ sang `docs/rules.md`.

**Step 3: Verify**
- Đọc lại 2 file, check không mâu thuẫn.

**Step 4: Commit**
```bash
git add docs/rules.md docs/plans/2026-02-11-tlmn-lan-design.md
git commit -m "docs: add canonical game rules and sync design doc"
```

### Task 2: Reconnect timeout 60s và xử lý người chơi rớt mạng

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/game/engine.ts`
- Modify: `server/test/engine.test.ts`

**Step 1: Write failing tests**
- Thêm test cho case:
  - Player disconnect, reconnect trong 60s -> giữ slot và hand.
  - Disconnect quá 60s -> reconnect fail với code rõ ràng.
  - Nếu tới lượt player bị timeout reconnect -> auto action theo timer.
  - Host disconnect trong lobby/playing -> behavior đúng policy đã chốt.

**Step 2: Run test to verify RED**
```bash
npm -w server run test -- server/test/engine.test.ts
```
Expected: FAIL vì chưa có reconnect TTL logic.

**Step 3: Implement minimal code**
- Thêm `disconnectAt`/`reconnectDeadline` trong model player runtime.
- Khi `disconnect`: set deadline = now + 60_000.
- Khi `player:reconnect`: reject nếu quá deadline.
- Khi reject do quá hạn: xử lý đúng policy gameplay đã chốt trong `docs/rules.md`.

**Step 4: Verify GREEN**
```bash
npm -w server run test -- server/test/engine.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add server/src/index.ts server/src/game/engine.ts server/test/engine.test.ts
git commit -m "feat: add reconnect timeout and expiry handling"
```

### Task 3: Nút "Chơi ván mới" giữ nguyên room

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/game/engine.ts`
- Modify: `client/src/App.tsx`
- Test: `server/test/engine.test.ts`

**Step 1: Write failing tests**
- Thêm test:
  - Sau `phase=ended`, host gọi `game:new-round` -> deal lại, reset winner/result/lastPlay, giữ room players.

**Step 2: RED verification**
```bash
npm -w server run test -- server/test/engine.test.ts
```
Expected: FAIL do chưa có event/new round.

**Step 3: Implement minimal code**
- Server event mới `game:new-round`.
- Chỉ host được gọi.
- Player readiness policy:
  - Option khuyến nghị: auto set all ready=true cho rematch nhanh.
- Reuse `startGame()` với deck mới shuffle.

**Step 4: Client wiring**
- Thêm nút "Chơi ván mới" khi `room.phase === 'ended'` và `isHost`.

**Step 5: Verify GREEN**
```bash
npm -w server run test -- server/test/engine.test.ts
npm run build
```
Expected: PASS + build thành công.

**Step 6: Commit**
```bash
git add server/src/index.ts server/src/game/engine.ts server/test/engine.test.ts client/src/App.tsx
git commit -m "feat: support host-triggered new round rematch"
```

### Task 4: UX - nhận diện combo đã chọn

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`
- Optional helper: `client/src/lib/combos.ts`

**Step 1: Add failing unit tests (nếu tách helper)**
- Nếu tạo `client/src/lib/combos.ts`, thêm test parser combo cho selected cards.

**Step 2: Implement**
- Hiển thị chip combo hiện tại: `single/pair/triple/straight/consecutive_pairs/four_kind/invalid`.
- Đổi màu rõ khi combo invalid.

**Step 3: Verify**
```bash
npm run build
```
Expected: build PASS.

**Step 4: Commit**
```bash
git add client/src/App.tsx client/src/index.css client/src/lib/combos.ts
git commit -m "feat(ui): show selected combo classification"
```

### Task 5: UX - gợi ý nước đi hợp lệ

**Files:**
- Create: `client/src/lib/suggestions.ts`
- Modify: `client/src/App.tsx`
- Optional: `client/src/lib/types.ts`

**Step 1: Write failing tests**
- Test `suggestions` theo `hand` + `lastPlay`:
  - Có trả về ít nhất một option hợp lệ.
  - Không trả về combo invalid.
  - Ưu tiên nước nhỏ nhất hợp lệ.

**Step 2: RED verification**
```bash
npm -w client run build
```
Expected: fail nếu file chưa tồn tại/import lỗi.

**Step 3: Implement minimal**
- Gợi ý 1-3 nước.
- Nút "Gợi ý" -> auto-select cards tương ứng.

**Step 4: Verify**
```bash
npm run build
```

**Step 5: Commit**
```bash
git add client/src/lib/suggestions.ts client/src/App.tsx client/src/lib/types.ts
git commit -m "feat(ui): add legal play suggestions"
```

### Task 6: UX - lịch sử lượt gần nhất

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/game/engine.ts`
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/App.tsx`

**Step 1: Write failing tests**
- Server test: sau mỗi action `play/pass/timeout`, history append đúng thứ tự.

**Step 2: Implement**
- Thêm `room.history` (giới hạn 20 entries).
- Entry gồm: timestamp, playerName, action, cards(optional), source(`manual|timeout`).
- Broadcast cùng `room:state`.

**Step 3: Verify**
```bash
npm run test
npm run build
```

**Step 4: Commit**
```bash
git add server/src/index.ts server/src/game/engine.ts client/src/lib/types.ts client/src/App.tsx
git commit -m "feat: add recent turn event log"
```

### Task 7: Script `npm run lan` in local IP + URL join

**Files:**
- Create: `scripts/lan-run.mjs`
- Modify: `package.json`
- Modify: `README.md` (tạo nếu chưa có)

**Step 1: Implement script**
- Detect IPv4 nội bộ (ưu tiên `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
- In:
  - Local URL: `http://localhost:3000`
  - LAN URL: `http://<local-ip>:3000`
- Spawn `npm -w server run start`.

**Step 2: Add npm script**
- Root `package.json` thêm `"lan": "node scripts/lan-run.mjs"`.

**Step 3: Verify**
```bash
npm run lan
```
Expected: in URL đúng và server start.

**Step 4: Commit**
```bash
git add scripts/lan-run.mjs package.json README.md
git commit -m "chore: add LAN startup script with host URLs"
```

### Task 8: README one-page cho host/người chơi

**Files:**
- Create/Modify: `README.md`

**Step 1: Viết guide ngắn**
- Host setup (`npm install`, `npm run lan`).
- Player join bằng URL LAN.
- Troubleshooting:
  - Firewall macOS
  - Cùng subnet Wi-Fi
  - Port 3000 conflict.

**Step 2: Verify**
- Chạy đúng theo README trên máy sạch (hoặc shell mới).

**Step 3: Commit**
```bash
git add README.md
git commit -m "docs: add host and player quickstart guide"
```

### Task 9: Integration test qua socket (end-to-end behavior)

**Files:**
- Create: `server/test/integration/socket-flow.test.ts`
- Optional helpers: `server/test/integration/helpers/*.ts`
- Modify: `server/package.json` (nếu cần script test:integration)

**Step 1: Write failing integration test**
- Scenario:
  - create room -> 3 joins -> all ready -> start
  - play/pass flow
  - timeout auto-action
  - end game -> result emitted
  - host new round

**Step 2: RED verification**
```bash
npm -w server run test -- server/test/integration/socket-flow.test.ts
```

**Step 3: Implement minimal infra for test**
- Start server on ephemeral port in test.
- Connect clients bằng `socket.io-client`.
- Wrap ack events thành Promise helper.

**Step 4: Verify GREEN**
```bash
npm -w server run test -- server/test/integration/socket-flow.test.ts
```

**Step 5: Commit**
```bash
git add server/test/integration server/package.json
git commit -m "test: add socket integration flow tests"
```

### Task 10: Mandatory Gameplay Test Matrix (bắt buộc pass trước playtest)

**Files:**
- Create: `server/test/gameplay-mandatory.test.ts`
- Modify: `server/test/engine.test.ts`
- Modify: `server/test/rules.test.ts`
- Modify: `server/test/scoring.test.ts`
- Modify: `server/test/integration/socket-flow.test.ts`

**Mục tiêu:** Chèn đầy đủ 7 case quan trọng vào test bắt buộc trước khi cho team chơi thật.

**Case 1 - Reconnect timeout 60s**
- Unit/integration test:
  - reconnect < 60s: PASS
  - reconnect > 60s: FAIL đúng code

**Case 2 - Host disconnect/failover policy**
- Test:
  - host rớt ở lobby
  - host rớt khi đang chơi
  - new round/start vẫn không bị kẹt theo policy

**Case 3 - Nhiều người ăn trắng cùng lúc**
- Test deterministic deck để tạo >=2 white-win hands.
- Assert winner đúng tie-break policy đã chốt.

**Case 4 - Luật chặt mơ hồ đã chốt**
- Test explicit cho:
  - tứ quý chặt đôi thông theo điều kiện đã chốt
  - đôi thông chặt đôi thông theo điều kiện đã chốt

**Case 5 - Race sát timeout**
- Integration test:
  - gửi `turn:play` ngay sát `turnEndsAt`
  - đảm bảo chỉ 1 action thắng (manual hoặc timeout), không double action.

**Case 6 - Chuỗi pass/reset nhiều vòng**
- Engine test:
  - nhiều trick liên tiếp, pass/reset lặp
  - assert `lastPlay`, `currentPlayerId`, `passed` luôn nhất quán.

**Case 7 - Scoring edge cases**
- Scoring test:
  - thối đôi 2
  - nhiều đôi thông trong 1 hand
  - stacking penalty theo policy rules.

**Step 1: RED**
```bash
npm -w server run test -- server/test/gameplay-mandatory.test.ts
```
Expected: FAIL (chưa đủ coverage/logic).

**Step 2: GREEN**
- Bổ sung logic/test cho từng case đến khi pass.

**Step 3: Verify full**
```bash
npm run test
npm run build
```

**Step 4: Commit**
```bash
git add server/test server/src docs/rules.md
git commit -m "test: add mandatory gameplay edge-case matrix"
```

### Task 11: Playtest cycle và bugfix cuối

**Files:**
- Modify: bugfix files tùy issue
- Create: `docs/playtest/2026-02-xx-session-notes.md`

**Step 1: Run internal playtest**
- 4 người, 20+ ván.
- Ghi issue theo severity: P0/P1/P2.

**Step 2: Fix theo ưu tiên**
- P0/P1 xử lý ngay.
- P2 đưa backlog.

**Step 3: Regression verify**
```bash
npm run test
npm run build
```

**Step 4: Commit**
```bash
git add .
git commit -m "fix: playtest stabilization pass"
```

## Global Verification Checklist

- `npm run test` pass hoàn toàn.
- `npm run build` pass.
- `npm run lan` in đúng URL LAN.
- Reconnect timeout hoạt động đúng.
- Host disconnect/failover hoạt động đúng policy.
- Tie-break nhiều ăn trắng được định nghĩa và có test pass.
- Luật chặt mơ hồ đã chốt trong `docs/rules.md` + test pass.
- Race sát timeout không tạo double action.
- Chuỗi pass/reset nhiều vòng giữ state đúng.
- Scoring edge cases (thối đôi 2, nhiều đôi thông, stacking) pass.
- New round không mất room.
- UI có combo label + suggestions + event log + scoreboard cuối ván.
- Integration tests socket pass.

## Rollout Checklist (LAN nội bộ)

1. Host chạy `npm run lan`.
2. 4 player join và chơi smoke test 2 ván.
3. Confirm timer, reconnect, scoring hiển thị đúng.
4. Nếu ổn định, freeze rules trong `docs/rules.md` và tag phiên bản.
