# Hệ Thống Quản Lý Bán Hàng Và Kho

Dự án phần mềm quản lý bán hàng và kho hàng cho doanh nghiệp phân phối.

---

## Sprint 1: Module Quản Lý Tài Khoản & Phân Quyền (SCRUM-6 / SCRUM-62)

### Mục tiêu Sprint

Phát triển tính năng quản lý tài khoản người dùng cho Quản trị hệ thống:

- **Xem danh sách & Tra cứu:** Bảng dữ liệu có phân trang mặc định 20
  dòng/trang, hỗ trợ tìm kiếm theo Họ tên, Tên tài khoản, Số điện thoại;
  lọc theo Vai trò và Trạng thái.
- **Tạo mới tài khoản & Cấp mật khẩu tạm:** Tạo tài khoản cho nhân viên
  kinh doanh mới nhận địa bàn, cơ chế chống trùng lặp (Username, Email,
  Số điện thoại) với thông báo cụ thể, tự động sinh mật khẩu tạm ngẫu nhiên
  an toàn và gửi email kích hoạt.
- **Chỉnh sửa tài khoản:** Cập nhật thông tin người dùng, cố định trường
  Username để đảm bảo an toàn định danh.
- **Tích hợp Đổi mật khẩu:** Hỗ trợ nhân viên đổi mật khẩu ngay sau khi
  nhận mật khẩu tạm từ email, bảo vệ bằng BCrypt và chặn tài khoản bị khóa.

---

## Kiến Trúc & Công Nghệ

- **Backend:** Python 3, FastAPI, Pydantic V2, SQLAlchemy 2.0.
- **Database:** MySQL 8.0 (InnoDB) và SQLite dự phòng kiểm thử.
- **Security:** Mã hóa mật khẩu an toàn với BCrypt, sinh mật khẩu ngẫu nhiên
  độ phức tạp cao (`secrets`).
- **Frontend:** React 18 (hoạt động offline độc lập không phụ thuộc CDN),
  Single Page Application, responsive 360px, phân trang mặc định 20 dòng.
- **Testing:** Pytest, HTTPX TestClient (21 test cases bao phủ toàn diện).

---

## Cấu Trúc Thư Mục

```text
He_thong_ban_hang_va_kho/
├── database/
│   └── schema.sql          # DDL Schema bảng roles, users (MySQL 8.0)
├── docs/
│   └── USER_STORIES.md     # Tài liệu User Story, Acceptance Criteria
├── src/
│   ├── backend/
│   │   ├── config.py           # Cấu hình hệ thống, MySQL/SQLite, roles
│   │   ├── database.py         # Kết nối DB, session và seed data
│   │   ├── models.py           # SQLAlchemy ORM Models (User, Role)
│   │   ├── schemas.py          # Pydantic Schemas validation
│   │   ├── security.py         # Tiện ích sinh mật khẩu tạm & hash bcrypt
│   │   ├── email_service.py    # Dịch vụ gửi email kích hoạt tài khoản
│   │   ├── users_service.py    # Nghiệp vụ xử lý tài khoản, phân trang
│   │   ├── users.py            # RESTful API Endpoints cho User Management
│   │   ├── change_password.py  # API đổi mật khẩu (tích hợp mật khẩu tạm)
│   │   └── main.py             # Entrypoint khởi chạy ứng dụng FastAPI
│   └── frontend/
│       ├── index.html          # Giao diện quản lý tài khoản người dùng
│       ├── styles.css          # CSS thiết kế giao diện hiện đại, responsive
│       ├── app.jsx             # Mã nguồn React 18 component
│       ├── app.react.js        # Bản build độc lập cho trình duyệt
│       └── vendor/             # Thư viện React 18 offline
├── tests/
│   └── test_users.py       # Bộ kiểm thử tự động toàn diện (21 tests)
├── requirements.txt        # Danh sách thư viện phụ thuộc
└── README.md
```

---

## Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt môi trường & thư viện

```bash
python -m pip install -r requirements.txt
```

### 2. Khởi chạy máy chủ Web & API

```bash
python -m uvicorn src.backend.main:app --reload --port 8000
```

### 3. Truy cập ứng dụng

- **Giao diện Web Quản trị:** [http://localhost:8000/](http://localhost:8000/)
- **Tài liệu API Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Tài liệu API Redoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Hướng Dẫn Chạy Kiểm Thử (Tests)

Chạy toàn bộ 21 test cases:

```bash
python -m pytest tests/test_users.py -v
```

Kết quả mong đợi: `21 passed in 3.xx s`.
