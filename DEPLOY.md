# DEPLOY lên internet miễn phí (Render + Supabase)

## 0. Chuẩn bị (làm 1 lần)
- Repo GitHub đã push: `Somehow3009/English1200`
- Supabase project (Tokyo): lấy **Connection string URI pooled (6543)** ở
  Project Settings → Database. Dạng:
  `postgresql://postgres.<ref>:PASS@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
- `MASTER_SECRET`: copy y nguyên từ `server/.env` trên máy dev
  (đổi chuỗi này là key Gemini user đã lưu thành vô dụng).

## 1. Deploy backend + frontend (Render)
1. Vào dashboard.render.com → **New → Blueprint** → Connect repo `English1200` → Apply
   (file `render.yaml` + `Dockerfile` trong repo tự cấu hình hết).
2. Điền Environment Variables:
   - `DATABASE_URL` = chuỗi pooled ở trên (bắt buộc)
   - `MASTER_SECRET` = copy từ máy dev (bắt buộc, giữ tuyệt mật)
   - `GEMINI_KEY` = key chung dự phòng (tùy chọn, để trống cũng được)
   - `COOKIE_SECURE` = `1` (đã có sẵn)
3. Deploy → đợi build xong → mở URL dạng `https://english1200.onrender.com`.

## 2. Kiểm tra sau deploy
- Mở `https://<app>/api/health` → phải ra `{"ok":true}` (nghĩa là nối Supabase OK).
- Đăng ký 1 tài khoản → Cài đặt → dán key Gemini cá nhân → Lưu (phải báo hợp lệ).
- Luyện dịch 1 câu → chấm AI → có nhận xét là xong.

## 3. Lưu ý gói free
- Render free **ngủ sau ~15 phút không ai vào**, lần vào đầu mất ~50 giây đánh thức.
  Muốn luôn thức: dùng UptimeRobot (free) ping `/api/health` mỗi 5 phút.
- Supabase free **pause project sau 1 tuần không hoạt động** → vào dashboard bấm
  Restore là chạy lại (dữ liệu giữ nguyên).
- Mỗi lần sửa frontend: tăng `?v=N` trong `<script src="app.js?v=N">` ở `public/index.html`
  để user không dính bản cache cũ (commit + push, Render tự deploy lại).
- Không bao giờ commit `server/.env` — mọi secret chỉ nhập trên dashboard Render.
