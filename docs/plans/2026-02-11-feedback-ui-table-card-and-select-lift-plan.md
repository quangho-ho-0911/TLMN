# Plan Resolve Feedback UI Bài Đánh + Hiệu Ứng Chọn Bài

## 1. Root cause analysis (đã xác định)
1. Hiệu ứng “lá bài nhô lên khi chọn” đang bị CSS animation đè.
2. Tại `client/src/index.css:473`, `.playCard` có `animation: cardIn ... forwards;`.
3. Tại `client/src/index.css:631`, keyframe `cardIn` cũng set `transform`.
4. Tại `client/src/index.css:492`, `.playCard.sel` set `transform: translateY(-14px)`.
5. Do animation giữ trạng thái `forwards`, `transform` từ animation có độ ưu tiên cao hơn style thường, nên `transform` của `.playCard.sel` không hiện ra.
6. Yếu tố phụ cần lưu ý: `selected` bị clear khi nhận `hand:private` ở `client/src/App.tsx:134`, `client/src/App.tsx:175`, `client/src/App.tsx:192`, `client/src/App.tsx:330` (đúng logic game, không phải nguyên nhân chính của bug “không nhô”).

## 2. Kế hoạch xử lý feedback #1 (UI lá bài trên bàn giống lá cầm tay)
1. Chuẩn hóa UI “mặt lá bài” thành 1 pattern dùng chung cho `playCard`, `tableCard`, `seatCard`, `flyCard`.
2. Sửa `client/src/App.tsx`:
   - Thay render `tableCard` và `seatCard` từ text (`rank+suit`) sang markup card đầy đủ (giống `playCard`/`flyCard`: `.pcTop`, `.pcRank`, `.pcSuit`, `.pcId`).
   - Giữ nguyên logic dữ liệu `parseId/rankLabel/suitSymbol`, chỉ đổi phần trình bày.
3. Sửa `client/src/index.css`:
   - Thêm style cho biến thể lá bài trên bàn (`.tableCard`, `.seatCard`) để cùng visual language với bài trên tay nhưng kích thước nhỏ hơn.
   - Đảm bảo responsive cho mobile (`@media max-width: 640px`) không vỡ layout bàn.

## 3. Kế hoạch xử lý feedback #2 (hiệu ứng nhô lên khi chọn)
1. Sửa xung đột animation/transform trong `client/src/index.css`.
2. Cách làm ưu tiên:
   - Bỏ `transform` khỏi `@keyframes cardIn`, chỉ animate `opacity`.
   - Hoặc tách animation vào wrapper khác để `transform` của `.playCard.sel` không bị animation override.
3. Giữ `:hover` và `.sel` cùng hoạt động ổn định.
4. Không đổi logic chọn bài trong `client/src/App.tsx` nếu không cần thiết.

## 4. Verify checklist
1. Vào phòng, nhận bài, click chọn 1 lá: lá đó phải nhô lên rõ ràng.
2. Chọn nhiều lá: tất cả lá đã chọn đều nhô lên đồng thời.
3. Hover lá chưa chọn vẫn có phản hồi nhẹ, không xung đột với trạng thái chọn.
4. Sau khi đánh bài, “Bộ bài trên bàn” hiển thị dạng lá bài đầy đủ, không còn chỉ text.
5. Ở mỗi seat player, bài đã đánh gần nhất hiển thị đúng dạng lá.
6. Test mobile viewport (`<=640px`): card trên bàn không tràn khung, không chồng lỗi.

## 5. Scope commit đề xuất
1. `feat(client): render played cards with full card UI on table and seats`
2. `fix(client): resolve selected-card lift effect by removing transform animation conflict`
