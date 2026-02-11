# TLMN LAN

Game Tiến Lên Miền Nam chạy LAN với server authoritative (Node + Socket.IO) và client React.

## Run

```bash
npm install
npm run dev
```

- Server: `http://localhost:3000` (Socket + API)
- Client dev: theo URL Vite in terminal

Build production:

```bash
npm run build
npm start
```

## Gameplay Highlights

- Deal có kiểm soát: xác suất pair-white ~1%.
- Auto-sort bài: nút `Tự xếp bài`.
- Rematch flow:
- sau khi kết thúc ván có countdown 5 giây
- host có nút `Bắt đầu ván mới` khi mọi người đã `Ready`
- Scoring v2 đầy đủ: base, cóng, thối 2, chặt, tới trắng.
- Center table hiển thị bài vừa đánh của từng người cho mọi client.

## Test

```bash
npm test
```

## Env

- `TURN_MS` (default `20000`)
- `REMATCH_MS` (default `5000`)
- `PAIR_WHITE_RATE` (default `0.01`)
