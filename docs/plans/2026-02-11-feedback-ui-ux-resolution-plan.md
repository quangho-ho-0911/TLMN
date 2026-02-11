## Plan resolve feedback UI/UX

### 1. Mục tiêu
- Cải thiện trải nghiệm chọn/đánh bài trực quan hơn.
- Tối ưu layout màn chơi để tận dụng không gian màn hình.
- Loại bỏ phần UI dư thừa sau khi có hiệu ứng mới.

### 2. Phạm vi thay đổi theo feedback

#### Feedback 1: Hiệu ứng chọn bài (card move lên)
- Thêm state `selected` cho từng lá bài trong tay người chơi.
- Khi chọn bài:
  - Lá bài được nâng lên một khoảng cố định (vd: `translateY(-12px)`).
  - Tăng `z-index` nhẹ để tránh bị đè.
  - Thêm transition mượt (`150-250ms`, ease-out).
- Khi bỏ chọn:
  - Lá bài trở về vị trí cũ với cùng transition.
- Hỗ trợ multi-select ổn định (không giật layout).

#### Feedback 2: Hiệu ứng đánh bài xuất hiện trên bàn
- Tạo khu vực “Bàn đánh bài hiện tại” (center table area).
- Khi nhấn “Đánh bài”:
  - Animate các lá đã chọn rời tay bài -> xuất hiện ở khu vực bàn.
  - Cập nhật state bàn chơi bằng bộ bài vừa đánh.
- Đồng bộ logic:
  - Remove lá đã đánh khỏi tay bài người chơi.
  - Persist “lượt vừa đánh” ngay trên bàn, không render trong block “Bài vừa đánh”.
- Xử lý edge case:
  - Đánh thất bại (invalid turn) thì rollback animation/state.
  - Turn đổi người vẫn giữ bộ bài hiện tại trên bàn theo luật game.

#### Feedback 3: Sắp xếp lại layout + bỏ “Bài vừa đánh”
- Refactor layout màn chơi:
  - “Tay bài của bàn” mở rộng tràn ngang tối đa theo viewport.
  - “Tay bài của bạn” nằm phía dưới rõ ràng, ưu tiên thao tác.
  - “Lobby” chuyển xuống dưới “Tay bài của bạn”.
- Xóa hoàn toàn section “Bài vừa đánh” khỏi UI và logic liên quan.
- Rà soát responsive:
  - Desktop: ưu tiên bàn ở trung tâm, tay bài ở đáy.
  - Mobile/tablet: stack hợp lý, không che nút thao tác.

### 3. Kế hoạch triển khai kỹ thuật

1. Audit component/state hiện tại:
   - Xác định component tay bài, bàn chơi, lobby, recent-play.
2. Cập nhật model state:
   - `selectedCardIds`, `tableCards`, lifecycle khi đánh bài.
3. Implement animation chọn bài:
   - class/state-driven, không ảnh hưởng hitbox click.
4. Implement animation đánh bài lên bàn:
   - animation từ hand -> table (CSS transform/FLIP hoặc motion lib).
5. Refactor layout theo thứ tự mới:
   - table full width, hand user dưới, lobby cuối.
6. Remove “Bài vừa đánh”:
   - xóa component + cleanup state/selector API.
7. Test functional + responsive + animation smoothness.
8. Polish UI/UX:
   - timing animation, spacing, z-index, accessibility focus states.

### 4. Acceptance criteria

- Chọn bài: lá được chọn nhô lên rõ ràng, mượt, không vỡ layout.
- Đánh bài: lá xuất hiện trên bàn với animation hợp lý, không còn phụ thuộc “Bài vừa đánh”.
- Layout mới:
  - “Tay bài của bàn” tràn hợp lý theo màn hình.
  - “Lobby” nằm dưới “Tay bài của bạn”.
  - Section “Bài vừa đánh” không còn xuất hiện.
- Không regression logic lượt chơi/valid move.
- Responsive hoạt động tốt trên desktop + mobile.

### 5. Ưu tiên thực hiện (suggested order)

1. State + logic đánh bài lên bàn  
2. Hiệu ứng chọn bài  
3. Refactor layout  
4. Cleanup “Bài vừa đánh” + test regression
