# Hệ Thống Quản Lý Bán Hàng Và Kho

Dự án phát triển phần mềm quản lý bán hàng và kho theo mô hình Agile/Scrum.

---

## 📌 Các tính năng trong Sprint (Module Xác thực & Quản lý Tài khoản - SCRUM-6)

### 1. [SCRUM-57] Đặt lại mật khẩu khi quên thông qua Email
- **User Story:** *Là người dùng hệ thống, tôi muốn đặt lại mật khẩu khi quên thông qua email, để tự động lấy lại quyền truy cập khi đang đi thị trường mà không được gọi về văn phòng.*
- **Tiêu chí nghiệm thu (Acceptance Criteria):**
  1. Nhập email nhận liên kết thiết lập lại có hiệu lực **30 phút**.
  2. Liên kết được sử dụng **chỉ một lần duy nhất** (Single-use token).
  3. **Email không tồn tại vẫn hiển thị cùng một thông báo** (Chống tấn công dò quét tài khoản - User Enumeration).
  4. Quy chuẩn mật khẩu bảo mật (tối thiểu 8 ký tự, gồm cả chữ và số, mã hóa an toàn bằng `bcrypt`).
- **Giao diện trực quan:** Tích hợp màn hình Quên mật khẩu, Đặt lại mật khẩu và Hộp thư email giả lập (Demo Inbox) ngay trên web.

### 2. [SCRUM-58] Đổi mật khẩu (Change Password)
- Đổi mật khẩu hiện tại sang mật khẩu mới.
- Kiểm tra mật khẩu cũ, độ dài >= 8 ký tự, có chữ, có số, không trùng mật khẩu cũ.

---

## 🚀 Cài đặt & Chạy ứng dụng

### 1. Cài đặt thư viện phụ thuộc
```bash
pip install -r requirements.txt
```

### 2. Khởi động Backend Server
```bash
python -m uvicorn src.backend.main:app --reload --port 8000
```

### 3. Truy cập các đường dẫn
- **Giao diện Quên mật khẩu:** [http://localhost:8000/forgot-password](http://localhost:8000/forgot-password)
- **Tài liệu API Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Trang chủ API:** [http://localhost:8000/](http://localhost:8000/)

---

## 🧪 Chạy Kiểm Thử Tự Động (Unit Tests)

Kiểm tra toàn bộ 11 kịch bản kiểm thử cho User Story SCRUM-57:
```bash
python -m pytest tests/test_forgot_password.py -v
```

Tất cả các test case bao gồm:
- ✅ Kiểm tra email không tồn tại vẫn hiển thị cùng thông báo (Bảo mật Anti-Enumeration).
- ✅ Kiểm tra gửi email tạo liên kết token hiệu lực 30 phút.
- ✅ Kiểm tra liên kết trong hạn 30 phút là hợp lệ.
- ✅ Kiểm tra liên kết quá hạn 30 phút bị từ chối báo lỗi hết hạn.
- ✅ Kiểm tra liên kết chỉ được sử dụng đúng 1 lần (dùng lại lần 2 bị từ chối).
- ✅ Kiểm tra quy chuẩn mật khẩu mới: độ dài, chữ cái, chữ số, trùng mật khẩu cũ, khớp mật khẩu xác nhận.
- ✅ Kiểm tra giao diện HTML load thành công.

---

## 📄 Tài liệu đặc tả Scrum
- Xem chi tiết tại: [`docs/USER_STORIES.md`](docs/USER_STORIES.md)
