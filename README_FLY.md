# Deploy lên Fly.io (thay Railway) — vẫn giữ /admin/

## 0) Chuẩn bị
- Cài Fly CLI: `flyctl` (Windows/Mac/Linux) theo hướng dẫn Fly.
- Đảm bảo bạn **không commit** file `.env` (trong repo nên cho vào `.gitignore`).

## 1) Sửa code quan trọng
- `server.js` đã được chỉnh để có mặc định `PORT=8080` (Fly thường dùng 8080).
- Route admin vẫn giữ nguyên: `GET /admin/` sẽ load `public/admin/index.html`.

## 2) Khởi tạo app trên Fly
Trong thư mục `chatiip-backend`:

```bash
flyctl auth login
flyctl launch --no-deploy
```

- Khi hỏi tên app, bạn đổi `chatiip-backend` thành tên **unique** (ví dụ `chatiip-api`).
- Chọn region gần VN: `sin` (Singapore).

## 3) Set secrets (thay cho .env)
```bash
flyctl secrets set \
  MONGO_URI='YOUR_MONGO_URI' \
  JWT_SECRET='YOUR_JWT_SECRET' \
  ADMIN_DEFAULT_EMAIL='YOUR_ADMIN_EMAIL' \
  ADMIN_DEFAULT_PASSWORD='YOUR_ADMIN_PASSWORD' \
  BASE_URL='https://chatiip.com'
```

> Fly Docs: `fly secrets set NAME=VALUE ...`

## 4) Deploy
```bash
flyctl deploy
```

## 4.1) Giảm chi phí (quan trọng)
Trong `fly.toml` đã được tối ưu để:
- `min_machines_running = 0` (scale-to-zero khi idle)
- VM nhỏ: `shared-cpu-1x` + `256mb`

Bạn có thể kiểm tra cấu hình hiện tại bằng:
```bash
flyctl status
flyctl scale show
```

Nếu bạn gặp lỗi thiếu RAM khi xử lý PDF/DOCX (OOM / restart), tăng RAM lên 512mb:
```bash
flyctl scale vm shared-cpu-1x --memory 512
```

## 5) Domain và /admin/
### Cách đơn giản (backend có domain riêng)
- Trỏ `admin.chatiip.com` về Fly app.
- Bạn vẫn vào được admin tại: `https://admin.chatiip.com/` hoặc `https://admin.chatiip.com/admin/` (vì server có cả 2 cách).

### Nếu bạn **bắt buộc** muốn `https://chatiip.com/admin/`
- Domain `chatiip.com` phải đi tới backend (hoặc dùng reverse-proxy/rewrites để route `/admin/*` sang backend).
- Nếu bạn đang host frontend ở nơi khác (Vercel/Netlify/Cloudflare Pages), hãy cấu hình rewrite/proxy:
  - `/admin/*` -> Fly backend
  - `/api/*` -> Fly backend

## 6) Lưu ý về upload file
App đang lưu file vào `public/uploads/...`.
- Trên Fly, filesystem **không bền vững** giữa lần deploy/restart.
- Nếu cần giữ file upload lâu dài: dùng **Fly Volume** hoặc chuyển qua S3/R2.

### Upload tài liệu (khuyến nghị)
Để giảm RAM và ổn định hơn, backend hỗ trợ **multipart/form-data** với field `file`.
- Route vẫn là `POST /api/docs` (admin)
- Các field metadata gửi như bình thường trong form-data

Backend vẫn giữ tương thích ngược với cách cũ (gửi `fileBase64` trong JSON), nhưng cách đó sẽ tốn RAM hơn.
