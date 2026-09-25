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
