# English 1200 — Web học tiếng Anh 4 kỹ năng (giao tiếp & công nghệ)

Web tĩnh 100% (HTML/CSS/JS thuần, **không cần cài thêm thư viện**, không cần build), chạy offline, deploy miễn phí, an toàn khi public (không chứa key hay bí mật gì — Gemini key mỗi người tự nhập, chỉ lưu trên trình duyệt của họ).

## Tính năng
- 📚 **1200 câu Anh–Việt** (14 chủ đề, A1–B2): giao tiếp hàng ngày + công nghệ. Thêm câu mới chỉ cần chèn 1 dòng `D("...","...", "A2");` vào `data/`
- ⏰ **SRS lặp lại ngắt quãng (SM-2)**: tự giãn lịch ôn theo trí nhớ (1 → 6 → 15 → 40... ngày), câu sai ôn lại sau ~1 giờ
- 🃏 **Flashcard** 2 chiều, lọc câu đến hạn ôn, đọc to, phím tắt
- ✍️ **Luyện dịch** + chấm tự động + **Gemini AI**
- 🎧 **Nghe–gõ (dictation)**: nghe 3 lần → gõ lại từng chữ, tô đúng/sai từng từ
- 🎤 **Luyện nói**: shadowing + chấm phát âm theo từng từ (Chrome/Edge), trình duyệt khác thu âm nghe lại
- 🔘 **Trắc nghiệm**, 🔍 **danh sách**, 📊 **thống kê**, XP/streak/mục tiêu ngày, sao lưu JSON

## 4 kỹ năng qua app
| Nghe | Nói | Đọc | Viết |
|---|---|---|---|
| Nghe–gõ, nút 🔊 | Luyện nói, shadowing | Flashcard, Danh sách | Luyện dịch, Nghe–gõ |

## Tính năng
- 📚 **1000 câu Anh–Việt**: 600 câu giao tiếp hàng ngày (chào hỏi, sinh hoạt, ăn uống, du lịch, mua sắm, văn phòng) + 400 câu ngành công nghệ (lập trình, họp & email, phỏng vấn, AI & dữ liệu), gắn trình độ A1–B2
- 🃏 **Flashcard** 2 chiều, trộn bài, lọc câu chưa thuộc/yêu thích, đọc to (Text-to-Speech), phím tắt Space/←/→
- ✍️ **Luyện dịch** Việt↔Anh, chấm điểm tự động offline + nút **chấm bằng Gemini AI** (nhận xét, gợi ý cách nói tự nhiên hơn)
- 🔘 **Trắc nghiệm** 4 lựa chọn, tự động qua câu
- 🔍 **Danh sách 1000 câu**: tìm kiếm, lọc chủ đề/trình độ/trạng thái, đánh dấu đã thuộc/yêu thích
- 📊 **Tiến độ**: XP, streak ngày học, mục tiêu mỗi ngày, biểu đồ theo chủ đề, xuất/nhập sao lưu JSON (lưu trên trình duyệt — localStorage)
- 🌙 Sáng/tối, responsive cho điện thoại

## Chạy web động (frontend + backend)

Đã cài sẵn Node portable trong `.tools` (không cần quyền admin).

```powershell
# chạy local (cổng 3000)
.tools/node/node.exe server/src/index.js
# kiểm thử backend
.tools/node/node.exe server/smoke.js
```
Mở http://localhost:3000 → đăng ký tài khoản → tiến độ tự đồng bộ lên server.
Muốn Gemini chấm qua server (key giấu kín): tạo `server/.env` từ `server/.env.example`, điền `GEMINI_KEY`, khởi động lại.

## Deploy public miễn phí
- **Render**: New → Blueprint → trỏ repo (đã có `render.yaml` + `Dockerfile`) → thêm `GEMINI_KEY` trong Environment.
- **Railway/Fly.io**: dùng `Dockerfile` có sẵn, đặt biến `GEMINI_KEY`, mount volume `/data` để giữ SQLite.

> Mỗi lần sửa frontend: tăng `?v=N` trong `<script src="app.js?v=N">` ở `public/index.html`
> để trình duyệt user tải bản mới (server đã gửi `Cache-Control: no-cache` để tự revalidate).

## Bảo mật đã làm
Mật khẩu mã hóa scrypt · session token ngẫu nhiên lưu hash, cookie httpOnly ·
**key Gemini riêng từng user, mã hóa AES-256-GCM** (chỉ giải mã trong RAM lúc gọi Google,
không bao giờ trả key về trình duyệt — chỉ hiện `••••wxyz`) · key được kiểm tra thật với
Google trước khi lưu · AI yêu cầu đăng nhập + 30 lượt/giờ · validate mọi input.

Tạo `server/.env` từ `server/.env.example` và đặt `MASTER_SECRET` (64 ký tự hex) + `GEMINI_KEY`
(key chung dự phòng — có thể để trống, user nào cũng phải thêm key riêng mới chấm được).

## Chạy thử
Mở trực tiếp `index.html` bằng trình duyệt (nhấp đúp là chạy).

## Deploy miễn phí (chọn 1)
**GitHub Pages:** tạo repo → đẩy toàn bộ file → Settings → Pages → Deploy from branch → chọn `main` / root.
**Netlify:** kéo-thả thư mục này vào app.netlify.com/drop (xong trong 10 giây).
**Vercel:** `vercel` trong thư mục này (đã có `vercel.json`).

## Thêm Gemini API (tùy chọn, miễn phí)
1. Vào aistudio.google.com → Get API Key → tạo key.
2. Mở web → ⚙️ Cài đặt → dán key → Kiểm tra kết nối → Xong.
3. Key chỉ lưu trên trình duyệt của bạn, không gửi đi đâu ngoài Google.
Không có key web vẫn chấm điểm bằng thuật toán so khớp chuỗi.
