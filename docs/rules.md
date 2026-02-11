# TLMN Rules (Current)

## Round Flow

- 4 players, 52 cards, 13 cards each.
- First move must include `3S`.
- Turn timeout default: `20s` (`TURN_MS`).
- When round ends:
- countdown rematch starts at `5s` (`REMATCH_MS`)
- if all players `Ready` before timeout, host can bấm `Bắt đầu ván mới`
- otherwise round auto-restarts when countdown hits 0

## Combos

- single, pair, triple, four_kind
- straight (>=3, không chứa 2)
- consecutive_pairs (>=3 đôi, không chứa 2)

## Chop

- Single 2 bị chặt bởi: four_kind hoặc 3+ consecutive pairs
- Pair 2 bị chặt bởi: 4+ consecutive pairs
- four_kind có thể chặt consecutive_pairs (chain chop)

## White Win

White-win patterns:
- straight từ 3 đến A
- 5 consecutive pairs
- 6 pairs
- 4 triples
- 4 cây 2

Pair-white subgroup (được điều tiết xác suất):
- 5 consecutive pairs
- 6 pairs
- 4 triples

Server deal logic ép xác suất pair-white khoảng 1% theo kỳ vọng dài hạn.

## Scoring v2

- Base: thua theo số lá còn lại.
- Cóng: thua nguyên 13 lá bị cộng phạt thêm.
- Thối 2: phạt riêng cho 1 cây 2 / đôi 2 / tứ quý 2.
- Chặt: ghi nhận giao dịch điểm trực tiếp giữa người bị chặt và người chặt.
- Tới trắng: thêm bonus/punish theo loại tới trắng (pair-white có multiplier).
- Score luôn cân bằng tổng = 0 trong mỗi ván.

## UI

- Có nút `Tự xếp bài` (local client only).
- Có nút `Bắt đầu ván mới` cho host khi đủ ready.
- Có center table: tất cả người chơi thấy bài vừa đánh của từng người theo thời gian thực.
