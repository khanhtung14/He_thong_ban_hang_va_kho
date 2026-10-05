# HỆ THỐNG QUẢN LÝ BÁN HÀNG VÀ KHO (OMS)

> Nền tảng web quản lý bán sỉ và điều phối kho vận tập trung, kết nối thời gian thực giữa Kinh doanh, Kho hàng, Kế toán và Mạng lưới Đại lý.

---

## 1. Tổng Quan Dự Án

- **Tên dự án:** Hệ thống Quản lý Bán hàng & Kho (Order Management System - OMS)
- **Chu kỳ triển khai MVP:** 8 tuần (8 Sprints × 1 tuần)
- **Quy mô Backlog:** 9 Epics, 76 User Stories, 350 Story Points
- **Đội ngũ phát triển:** 5 kỹ sư Fullstack
- **Sprint hiện tại:** **Sprint 1 — Tài khoản, phân quyền và quản trị người dùng (42 Points / 10 User Stories)**

---

## 2. Tài Liệu Nghiệp Vụ & Yêu Cầu Người Dùng

Tài liệu đặc tả User Story hoàn chỉnh chuẩn Production đã được đóng gói và kiểm duyệt:

👉 **[Đặc tả Yêu cầu Người dùng Sprint 1 (docs/USER_STORIES.md)](docs/USER_STORIES.md)**

### Nội Dung Tài Liệu Đặc Tả Bao Gồm:
1. **Thông tin tài liệu & Ma trận nguồn đầu vào** (Jira SCRUM-5 / SCRUM-6 & Excel Backlog 5 sheets).
2. **Tổng quan Sprint 1 & Sprint Goal**: Mục tiêu 7 vai trò đăng nhập an toàn, bảo vệ dữ liệu giá vốn.
3. **Mô hình 7 Vai trò nghiệp vụ (User Roles)**: Đại lý, Nhân viên kinh doanh, Quản lý kinh doanh, Thủ kho, Quản lý kho, Kế toán, Quản trị hệ thống.
4. **Phân rã Yêu cầu Nghiệp vụ (BR) & Yêu cầu Chức năng (FR)**.
5. **Chi tiết 10 User Stories Sprint 1 (US-01 đến US-10)** kèm kịch bản BDD (Given - When - Then), Business Rules, Data Requirements, Edge Cases, Error Handling, NFR, Sub-tasks.
6. **Ma trận Xung đột Yêu cầu (Requirement Conflicts)**: Chuẩn hóa mức ưu tiên, trạng thái và mã định danh giữa Jira và Excel.
7. **Ma trận Truy vết Toàn diện (Traceability Matrix)**: 100% từ Nguồn gốc -> BR -> FR -> Epic -> Feature -> User Story -> AC -> Sub-task.
8. **Nhật ký Giả định (Assumptions), Câu hỏi mở (Open Questions), Ma trận Rủi ro (Risks)** và **Báo cáo Thẩm định Chất lượng (INVEST & DoD)**.

---

## 3. Cấu Trúc Thư Mục Dự Án

```text
He_thong_ban_hang_va_kho/
├── docs/                                          # Tài liệu đặc tả kỹ thuật và nghiệp vụ
│   ├── USER_STORIES.md                           # Tài liệu User Stories chi tiết của dự án
│   └── .gitkeep
├── database/                                      # Lược đồ cơ sở dữ liệu và migrations (PostgreSQL)
├── src/                                           # Mã nguồn ứng dụng (Frontend & Backend)
├── tests/                                         # Kịch bản kiểm thử tự động (Unit, Integration, E2E)
├── HỆ THỐNG BÁN HÀNG & KHO_ TTCS_T926_K13C4 (1).xlsx # Sổ tay yêu cầu nghiệp vụ gốc
└── README.md                                      # Tài liệu giới thiệu tổng quan dự án
```

---

## 4. Định Hướng Công Nghệ (Tech Stack)

- **Frontend:** React + TypeScript (Responsive từ màn hình 360px cho nhân viên thị trường).
- **Backend:** Spring Boot (Java) hoặc NestJS (TypeScript).
- **Cơ sở dữ liệu:** PostgreSQL (Hỗ trợ giao dịch mạnh mẽ cho sổ tồn và công nợ).
- **Bảo mật & Xác thực:** JWT (Access Token 15 phút + Refresh Token 7 ngày), băm mật khẩu `bcrypt`.

## Chạy backend FastAPI

Tại thư mục gốc dự án, cài thư viện và khởi động server:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn src.backend.main:app --reload
```

Hoặc chạy trực tiếp file `src/backend/main.py`. API mặc định ở `http://127.0.0.1:8000`;
trang tài liệu ở `http://127.0.0.1:8000/docs`. Server hiện chưa tự kết nối MySQL khi khởi động.
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

### 3. [SCRUM-60] Menu Điều Hướng Đúng Theo Quyền & Tối Ưu Mobile 360px
- **User Story:** *Là người dùng của hệ thống, tôi muốn thấy menu điều hướng đúng theo quyền của mình, để không bị rối bởi những chức năng mình không được dùng.*
- **Tiêu chí nghiệm thu (Acceptance Criteria):**
  1. **Mục menu không thuộc quyền thì không hiển thị:** Vai trò "Warehouse" (Nhân viên kho) chỉ thấy "Soạn hàng", "Nhập kho", "Sổ tồn kho", "Chuyển kho"; ẩn hoàn toàn "Tạo đơn hàng", "Duyệt đơn", "Bảng giá", "Sổ công nợ", "Quản trị người dùng".
  2. **Hiển thị thông tin người dùng và phạm vi:** Góc trên header hiển thị rõ Họ và tên, Vai trò và Kho/Địa bàn đang làm việc (ví dụ: "Trần Văn Kho", "Nhân viên kho", "Kho Tổng Hà Nội").
  3. **Tối ưu màn hình 360px di động:** Thanh menu dạng ngăn kéo Drawer / Hamburger mượt mà, nút bấm tối thiểu 44x44px thao tác một tay dễ dàng, không bị thanh cuộn ngang (horizontal scrollbar).
- **Giao diện & API:** Truy cập [http://localhost:8000/navigation](http://localhost:8000/navigation) hoặc API `GET /api/v1/navigation/menu`.

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
