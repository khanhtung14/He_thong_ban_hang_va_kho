# User Stories — Tài Liệu Đặc Tả Yêu Cầu Người Dùng

## 1. Document Information

| Thuộc tính | Chi tiết |
| --- | --- |
| **Dự án** | Hệ thống Quản lý Bán hàng & Kho (Order Management System - OMS) |
| **Giai đoạn** | Phát triển MVP / Pilot (Chu kỳ 8 tuần) |
| **Sprint mục tiêu** | **Sprint 1: Tài khoản & phân quyền** |
| **Epic chính** | **EP-01 / SCRUM-6: Tài khoản, Phân quyền & Quản trị người dùng** |
| **Phiên bản tài liệu** | 1.0.0 (Production-ready) |
| **Ngày lập** | 2026-09-24 |
| **Vai trò biên soạn** | Senior Business Analyst, Product Owner, QA Lead, Tech Product Analyst |
| **Đối tượng tiếp nhận** | Product Owner, Developers, QA/QC Engineers, Tech Lead, Project Manager |
| **Mức độ bảo mật** | Nội bộ dự án (Confidential) |
| **Trạng thái phê duyệt** | Sẵn sàng triển khai (Ready for Sprint Backlog Execution) |

---

## 2. Source Documents

Tài liệu này được trích xuất, đối chiếu chéo (cross-check), chuẩn hóa và mô hình hóa từ các nguồn tài liệu căn cứ sau:

| Mã Nguồn | Nguồn Tài Liệu | Định Dạng | Mô Tả & Chi Tiết Vị Trí Trích Xuất | Mức Độ Tin Cậy |
| --- | --- | --- | --- | --- |
| **SRC-001** | Jira Cloud Board Issue `SCRUM-5` (Parent `SCRUM-6`) | Ảnh chụp màn hình (Sprint Screenshot) | - **Issue Key:** SCRUM-5<br>- **Summary:** Là người dùng của hệ thống, tôi muốn đăng nhập bằng tài khoản và mật khẩu, để truy cập được phần việc của mình mà dữ liệu giá vốn không lọt ra ngoài.<br>- **Description:** 3 ACs cơ bản (Đăng nhập đúng điều hướng theo vai trò; Sai thông tin báo chung; Khoá 15p sau 5 lần sai).<br>- **Details:** Status: In Progress; Priority: Medium; Assignee: Phùng Xuân Trường; Sprint: Sprint 1: Tài khoản & phân quyền; Parent: SCRUM-6 Tài khoản, Phân quyền... | **High** (Dữ liệu điều hành thực tế) |
| **SRC-002** | Sổ tay yêu cầu nghiệp vụ: `HỆ THỐNG BÁN HÀNG & KHO_ TTCS_T926_K13C4 (1).xlsx` | Excel Workbook (5 Sheets) | - **Sheet 1 (Product Overview):** Tầm nhìn, bài toán nghiệp vụ, in/out-scope, NFR, kiến trúc công nghệ.<br>- **Sheet 2 (User Roles):** 7 vai trò người dùng và ma trận phân quyền chi tiết (RBAC).<br>- **Sheet 3 (Epics):** 9 nhóm chức năng, điểm phân bổ (350 pt).<br>- **Sheet 4 (Product Backlog):** 76 User Stories (Sprint 1 gồm 10 stories S1-01 đến S1-10).<br>- **Sheet 5 (Sprint Plan):** Kế hoạch 8 Sprint, DoR, DoD và Bảng phân tích rủi ro. | **High** (Nguồn gốc chuẩn nghiệp vụ) |
| **SRC-003** | Cấu trúc Repository Dự án | Repository Filesystem | Cấu trúc thư mục định hình: `database/`, `src/`, `tests/`, `docs/`, `README.md`. | **Medium** (Khung dự án khởi tạo) |

---

## 3. Sprint Overview

| Thông số Sprint | Giá trị quy định | Diễn giải chi tiết |
| --- | --- | --- |
| **Mã Sprint** | Sprint 01 | Sprint đầu tiên của dự án OMS |
| **Chủ đề chính** | **Tài khoản, phân quyền và quản trị người dùng** | Xây dựng nền móng xác thực, kiểm soát truy cập và bảo mật |
| **Thời lượng** | 1 tuần (40 giờ làm việc/kỹ sư) | Nhịp chạy ngắn đòi hỏi chuẩn bị kỹ lưỡng |
| **Năng lực đội ngũ** | 5 kỹ sư Fullstack (Toàn thời gian) | 1 point ≈ 4 giờ công hữu ích (~170 giờ hữu ích sau trừ họp/review) |
| **Chỉ tiêu Velocity** | **42 Story Points** | 100% cam kết hoàn thành trong Sprint 1 |
| **Tổng số User Stories** | **10 Stories** (S1-01 đến S1-10) | 9 Must-have, 1 Should-have |
| **Môi trường triển khai** | Staging CI/CD tự động | Deploy sau khi build và test pass |

---

## 4. Sprint Goal

> **Sprint Goal:**  
> *"Quản trị viên tạo được tài khoản cho toàn bộ nhân sự kinh doanh, kho và kế toán; mỗi vai trò đăng nhập vào chỉ nhìn thấy đúng phần menu thuộc quyền của mình."*

**Kết quả demo nghiệm thu cuối Sprint 1 (Sprint Demo Deliverable):**  
Bảy vai trò nghiệp vụ (Customer, Sales Rep, Sales Manager, Warehouse, WH Manager, Accountant, Admin) đăng nhập thành công vào hệ thống, phiên làm việc được duy trì và thu hồi an toàn; mỗi vai trò chỉ truy cập được đúng menu và dữ liệu thuộc phạm vi thẩm quyền; tuyệt đối không để lộ dữ liệu giá vốn và biên lợi nhuận ra ngoài vai trò Quản lý kinh doanh.

---

## 5. Scope

### 5.1 In Scope (Trong phạm vi Sprint 1)

- Xác thực người dùng bằng Tên đăng nhập/Email và Mật khẩu (bảo vệ chống Brute-force, khoá tạm 15 phút sau 5 lần sai).
- Quản lý phiên làm việc bằng cơ chế JWT (Access Token + Refresh Token), gia hạn phiên tự động và thu hồi token tức thì phía máy chủ khi đăng xuất hoặc đổi mật khẩu.
- Khôi phục mật khẩu thông qua Email gửi liên kết OTP/Token bảo mật có thời hạn 30 phút, dùng 1 lần, chống thu thập tài khoản (User Enumeration).
- Đổi mật khẩu chủ động khi người dùng đang đăng nhập với ràng buộc độ phức tạp (tối thiểu 8 ký tự gồm chữ và số).
- Cơ chế kiểm soát quyền truy cập dựa trên vai trò (RBAC) thực thi kiểm tra nghiêm ngặt tại tầng Server (Server-side validation) theo nguyên tắc "Mặc định từ chối" (Default Deny).
- Bảo vệ tuyệt đối thông tin giá vốn và biên lợi nhuận: Chỉ duy nhất vai trò Quản lý kinh doanh (`Sales Manager`) và Quản trị hệ thống (`Admin`) được phép xem.
- Hệ thống menu điều hướng hiển thị động (Dynamic Navigation Menu) phản chiếu chính xác quyền của người dùng; giao diện đáp ứng (responsive) tối ưu trên màn hình di động khổ hẹp 360px cho nhân viên thị trường.
- Màn hình xử lý lỗi giao diện chuẩn hóa (401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Server Error) kèm nút điều hướng quay lại luồng làm việc.
- Module Quản trị tài khoản cho Quản trị viên: Tạo mới, cập nhật hồ sơ công tác, tìm kiếm đa tiêu chí, phân trang danh sách (20 dòng/trang).
- Gán vai trò đa nhiệm cho người dùng; liên kết bắt buộc nhân viên kho với Kho cụ thể, nhân viên kinh doanh với Địa bàn cụ thể; chặn Quản trị viên tự thu hồi quyền quản trị của chính mình.
- Khoá và mở khoá tài khoản có bắt buộc ghi nhận lý do; tự động thu hồi phiên làm việc tức thì và hiển thị cảnh báo yêu cầu bàn giao đại lý phụ trách khi khoá tài khoản kinh doanh.

### 5.2 Out of Scope (Ngoài phạm vi Sprint 1)

- Nhập danh sách tài khoản hàng loạt từ tệp Excel (thuộc Sprint 2 - `S2-01`).
- Quản lý hồ sơ cá nhân nâng cao và tải ảnh đại diện Avatar (thuộc Sprint 2 - `S2-02`, `S2-03`).
- Ghi nhận nhật ký kiểm toán biến động tồn kho và công nợ (thuộc Sprint 2 - `S2-04`).
- Các nghiệp vụ Bán hàng, Danh mục sản phẩm, Kho hàng, Giao nhận, Công nợ, Hóa đơn (thuộc các Sprint 2 đến 8).
- Tích hợp Đăng nhập một lần (SSO), Đăng nhập mạng xã hội (Google, Facebook, Zalo).
- Xác thực đa yếu tố (2FA / MFA qua SMS / Google Authenticator) — ghi nhận cho bản phát hành tương lai.

---

## 6. Actors

Hệ thống được thiết kế phục vụ **07 vai trò nghiệp vụ (User Roles)** chuẩn hóa:

| STT | Tên Vai Trò | Mã Vai Trò | Định Danh Trong Doanh Nghiệp | Mục Tiêu & Trách Nhiệm Chính | Thẩm Quyền Truy Cập Giá Vốn | Phạm Vi Dữ Liệu |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Đại lý** | `Customer` | Khách hàng mua sỉ, chủ cửa hàng tạp hóa / đại lý bán lẻ | Tự tạo đơn hàng trên cổng, tra cứu tiến độ giao nhận và số dư công nợ của chính mình | **Không được xem** (–) | Dữ liệu của chính đại lý mình |
| 2 | **Nhân viên kinh doanh** | `Sales Rep` | Nhân viên đi thị trường, chăm sóc khách hàng theo tuyến | Tạo đơn tại điểm bán, kiểm tra tồn khả dụng, theo dõi công nợ khách mình phụ trách, thu tiền theo tuyến | **Không được xem** (–) | Đại lý và đơn hàng trong địa bàn phụ trách |
| 3 | **Quản lý kinh doanh** | `Sales Manager` | Giám đốc / Trưởng phòng kinh doanh | Duyệt đơn vượt hạn mức / bán dưới sàn, phân bổ địa bàn, phân tích doanh số và biên lợi nhuận | **Toàn quyền xem & sửa** (F) | Toàn bộ dữ liệu kinh doanh toàn công ty |
| 4 | **Nhân viên kho** | `Warehouse` | Thủ kho, nhân viên giao nhận, phụ kho | Tiếp nhận phiếu soạn hàng theo lô, thực hiện nhập/xuất kho thực tế, ghi nhận kiểm kê | **Không được xem** (–) | Kho hàng được phân công phụ trách |
| 5 | **Quản lý kho** | `WH Manager` | Trưởng bộ phận kho vận, điều phối logistics | Phê duyệt chuyển kho, chốt kiểm kê, duyệt điều chỉnh tồn kho do hao hụt/hỏng hóc | **Không được xem** (–) | Toàn bộ các kho thuộc hệ thống |
| 6 | **Kế toán công nợ** | `Accountant` | Kế toán viên theo dõi thanh toán và thu hồi nợ | Phát hành hoá đơn bán lẻ/nội bộ, ghi nhận thanh toán, đối trừ công nợ, chốt sổ tuổi nợ | **Không được xem** (–) | Dữ liệu hóa đơn, thanh toán, công nợ toàn hệ thống |
| 7 | **Quản trị hệ thống** | `Admin` | Quản trị viên kỹ thuật / Vận hành ứng dụng | Quản lý người dùng, phân quyền, cấu hình danh mục tham số hệ thống, giám sát an ninh | **Toàn quyền hệ thống** (F) | Toàn hệ thống (System-wide) |

---

## 7. Business Requirements

### BR-01 — Bảo mật Phân tách Dữ liệu Nhạy Cảm & Toàn vẹn Thông tin

- **Mô tả:** Hệ thống phải bảo vệ nghiêm ngặt các thông tin cơ mật thương mại, đặc biệt là giá vốn hàng bán (COGS) và biên lợi nhuận gộp. Dữ liệu này chỉ được phép tiếp cận bởi cấp Quản lý kinh doanh và Quản trị viên. Nhân viên kinh doanh, thủ kho, đại lý và kế toán công nợ tuyệt đối không được nhìn thấy giá vốn dưới bất kỳ hình thức nào (cả trên giao diện và API payload).
- **Mục tiêu kinh doanh:** Tránh lộ chiến lược giá, ngăn ngừa tình trạng nhân viên kinh doanh thỏa thuận giá ngoài quy chế, giữ vững lợi thế đàm phán thương mại.
- **Nguồn:** SRC-001 (Jira SCRUM-5), SRC-002 (Sheet 1 Row 71, Sheet 2 Row 14, Sheet 4 Row 11).
- **Mức độ tin cậy:** High.

### BR-02 — Đảm bảo Tính Liên tục và Ổn định của Phiên Giao dịch Ngoài Thị trường

- **Mô tả:** Nhân viên kinh doanh hoạt động ngoài thị trường tại các cửa hàng tạp hóa vùng sâu thường xuyên gặp tình trạng mạng 3G/4G chập chờn. Hệ thống phải duy trì phiên làm việc liên tục một cách an toàn mà không bắt người dùng đăng nhập lại làm mất dữ liệu đơn hàng đang nhập dở, đồng thời phải hỗ trợ cơ chế đăng xuất triệt để từ máy chủ khi cần thu hồi phiên.
- **Mục tiêu kinh doanh:** Nâng cao năng suất bán hàng, giảm tỷ lệ bỏ dở thao tác tạo đơn, cải thiện trải nghiệm người dùng hiện trường.
- **Nguồn:** SRC-002 (Sheet 1 Row 16, Sheet 4 Row 8).
- **Mức độ tin cậy:** High.

### BR-03 — Thực Thi Kiểm Soát Phân Quyền Theo Phạm Vi Địa Bàn và Kho Hàng (Data Scoping)

- **Mô tả:** Quyền truy cập không chỉ dừng lại ở nhóm chức năng (Role-Based Access Control) mà phải gắn chặt với phạm vi vật lý (Data Scoping): Thủ kho chỉ được thấy và thao tác trên kho mình phụ trách; Nhân viên kinh doanh chỉ thấy khách hàng và đơn hàng trong địa bàn được phân bổ.
- **Mục tiêu kinh doanh:** Tránh thao tác nhầm lẫn giữa các kho, bảo mật danh sách khách hàng giữa các nhân viên thị trường, xác định rõ trách nhiệm cá nhân đối với tài sản tồn kho và công nợ.
- **Nguồn:** SRC-002 (Sheet 2 Row 14, Sheet 4 Row 15, Sheet 5 Row 6).
- **Mức độ tin cậy:** High.

### BR-04 — Quản Lý Vòng Đời Tài Khoản Tập Trung và Phòng Ngừa Rủi Ro Nghỉ Việc

- **Mô tả:** Quản trị viên phải quản lý tập trung toàn bộ tài khoản nhân sự. Khi nhân sự kinh doanh hoặc kho nghỉ việc, việc khoá tài khoản phải kích hoạt ngay lập tức cơ chế vô hiệu hóa phiên làm việc trên mọi thiết bị và đưa ra cảnh báo bàn giao danh sách đại lý phụ trách để tránh gián đoạn dịch vụ khách hàng.
- **Mục tiêu kinh doanh:** Ngăn ngừa hành vi truy cập trái phép sau khi nghỉ việc, chống thất thoát đơn hàng và tiền thu công nợ từ đại lý.
- **Nguồn:** SRC-002 (Sheet 4 Row 16).
- **Mức độ tin cậy:** High.

### BR-05 — Giảm Chi Phí Vận Hành Qua Cơ Chế Tự Phục Vụ An Toàn (Self-Service)

- **Mô tả:** Cho phép người dùng tự lấy lại mật khẩu qua email xác thực và chủ động đổi mật khẩu định kỳ mà không cần phụ thuộc vào IT Helpdesk hay gọi điện về văn phòng trong giờ làm việc.
- **Mục tiêu kinh doanh:** Giảm tải công việc hỗ trợ kỹ thuật cho ban quản trị, giúp nhân viên thị trường chủ động khắc phục sự cố tức thì.
- **Nguồn:** SRC-002 (Sheet 4 Row 9, Row 10).
- **Mức độ tin cậy:** High.

---

## 8. Functional Requirements

| Mã FR | Tên Yêu Cầu Chức Năng | Mô Tả Tóm Tắt | Yêu Cầu Nghiệp Vụ Liên Quan | Nguồn Trích Xuất |
| --- | --- | --- | --- | --- |
| **FR-01** | Xác thực đăng nhập & Khoá chống Brute-force | Xác thực thông tin tài khoản/mật khẩu, điều hướng đúng trang chủ theo vai trò, khoá tạm 15 phút sau 5 lần thất bại liên tiếp. | BR-01, BR-02 | SRC-001, SRC-002 (S1-01) |
| **FR-02** | Quản lý phiên JWT & Thu hồi phiên máy chủ | Cấp phát cặp Access/Refresh Token, tự động làm mới phiên khi còn hoạt động, hủy bỏ phiên tức thì khi đăng xuất. | BR-02 | SRC-002 (S1-02, S1-10) |
| **FR-03** | Khôi phục mật khẩu qua Email an toàn | Tiếp nhận yêu cầu, gửi email chứa liên kết token 30 phút dùng 1 lần, hiển thị thông báo đồng nhất để chống dò quét email. | BR-05 | SRC-002 (S1-03) |
| **FR-04** | Đổi mật khẩu tài khoản người dùng | Kiểm tra mật khẩu hiện tại, thẩm định độ phức tạp mật khẩu mới (>= 8 ký tự, có chữ và số), vô hiệu hóa toàn bộ phiên khác. | BR-01, BR-05 | SRC-002 (S1-04) |
| **FR-05** | Phân quyền RBAC & Bộ lọc giá vốn phía Server | Phân quyền 7 vai trò, chặn quyền ở tầng máy chủ (Default Deny), kiểm duyệt loại bỏ giá vốn/biên lợi nhuận khỏi API response. | BR-01, BR-03 | SRC-002 (S1-05, Sheet 2) |
| **FR-06** | Menu điều hướng động & Hỗ trợ hiển thị 360px | Kết xuất menu theo quyền thực tế, hiển thị thông tin người dùng/kho/địa bàn, tối ưu layout mobile 360px. | BR-02, BR-03 | SRC-002 (S1-06) |
| **FR-07** | Xử lý lỗi giao diện thân thiện (Error Handling UI) | Hiển thị giao diện báo lỗi chuẩn 401, 403, 404, 500 kèm nút bấm gợi ý hành động khắc phục, không văng lỗi kỹ thuật. | BR-02 | SRC-002 (S1-07) |
| **FR-08** | Quản trị tài khoản người dùng (User Administration) | Tạo mới tài khoản gửi email mật khẩu tạm, kiểm tra trùng lặp, tìm kiếm đa năng, lọc theo vai trò/trạng thái, phân trang. | BR-04 | SRC-002 (S1-08) |
| **FR-09** | Gán vai trò đa nhiệm & Phân bổ kho/địa bàn | Hỗ trợ 1 người nhiều vai trò, bắt buộc gán kho cho nhân viên kho, bảo vệ chống tự hạ quyền của Quản trị viên. | BR-03, BR-04 | SRC-002 (S1-09) |
| **FR-10** | Khoá / Mở khoá tài khoản & Cảnh báo bàn giao | Đổi trạng thái tài khoản sang Khoá, bắt buộc nhập lý do, thu hồi token ngay lập tức, kích hoạt cảnh báo bàn giao đại lý. | BR-04 | SRC-002 (S1-10) |

---

## 9. Epic Breakdown: EP-01 / SCRUM-6

- **Mã Epic:** `EP-01` (Excel) / `SCRUM-6` (Jira)
- **Tên Epic:** **Tài khoản, Phân quyền & Quản trị người dùng (User Identity, RBAC & Profile Management)**
- **Mục tiêu Epic:** Thiết lập hạ tầng định danh, kiểm soát quyền truy cập RBAC, bảo vệ bí mật dữ liệu giá vốn và số hóa công tác quản trị nhân sự cho toàn bộ nền tảng OMS.
- **Giá trị kinh doanh:** Tạo lập ranh giới an toàn cho hệ thống dữ liệu kinh doanh và vận hành kho, đảm bảo 100% người dùng thao tác đúng phận sự, chống gian lận và rò rỉ giá bán/giá vốn.
- **Tổng điểm Epic:** 55 Story Points (trong đó 42 Story Points thuộc Sprint 1; 13 Story Points thuộc Sprint 2).

---

### FEAT-01: Xác Thực Người Dùng & Bảo Mật Phiên Làm Việc (Authentication & Session Security)

---

#### US-01 — [SCRUM-5 / S1-01] Đăng Nhập Hệ Thống & Bảo Vệ Giá Vốn

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-01  
**Jira Reference:** `SCRUM-5` (Status: In Progress, Assignee: Phùng Xuân Trường, Priority: Medium)  
**Excel Reference:** Sheet `4. Product Backlog`, Row 7 (`S1-01`, 5 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-01, BR-02, FR-01  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **đăng nhập bằng tài khoản và mật khẩu**,  
> để **truy cập được phần việc của mình mà dữ liệu giá vốn không lọt ra ngoài**.

##### Business Context

Khi triển khai OMS cho đơn vị phân phối sỉ, hệ thống có nhiều nhóm đối tượng cùng truy cập (Đại lý, Nhân viên bán hàng, Thủ kho, Kế toán). Nếu không có cơ chế xác thực chặt chẽ, dữ liệu giá mua đầu vào (giá vốn) và biên lợi nhuận rất dễ bị nhân viên tiếp cận, dẫn đến nguy cơ tiết lộ cho đối thủ hoặc đại lý ép giá. Ngoài ra, việc bảo vệ hệ thống khỏi tấn công dò mật khẩu (brute-force) là bắt buộc.

##### Business Value

- Xác thực chính xác danh tính người dùng trước khi cho phép tương tác dữ liệu.
- Phân luồng điều hướng ngay từ cửa ngõ đến màn hình làm việc tương ứng với nghiệp vụ của từng vai trò.
- Bảo vệ an toàn bí mật giá vốn và danh sách giá sàn của doanh nghiệp.

##### Preconditions

1. Người dùng đã được Quản trị viên cấp tài khoản trên hệ thống và ở trạng thái Hoạt động (`ACTIVE`).
2. Thiết bị của người dùng có kết nối mạng internet và truy cập được vào URL cổng đăng nhập OMS.
3. Tài khoản người dùng không đang trong trạng thái bị khoá tạm do đăng nhập sai hoặc bị quản trị viên khoá.

##### Main Flow

1. Người dùng truy cập trang Đăng nhập hệ thống (`/login`).
2. Hệ thống hiển thị biểu mẫu đăng nhập gồm: Ô nhập Tên đăng nhập/Email, Ô nhập Mật khẩu, Nút "Đăng nhập", Liên kết "Quên mật khẩu?".
3. Người dùng nhập Tên đăng nhập (hoặc Email) và Mật khẩu chính xác, sau đó nhấn nút "Đăng nhập".
4. Hệ thống kiểm tra tài khoản, xác thực mật khẩu qua thuật toán băm bcrypt, xác nhận tài khoản đang hoạt động.
5. Hệ thống thiết lập lại bộ đếm số lần đăng nhập sai về 0 (nếu trước đó có lần sai).
6. Hệ thống tạo cặp mã thông báo JWT (Access Token & Refresh Token) chứa thông tin định danh và vai trò.
7. Hệ thống chuyển hướng người dùng đến trang chủ mặc định tương ứng với vai trò của họ:
   - `Customer` (Đại lý) -> Cổng đặt hàng (`/portal/orders`)
   - `Sales Rep` (Kinh doanh) -> Màn hình tạo/quản lý đơn hàng (`/sales/orders`)
   - `Sales Manager` (QL Kinh doanh) -> Bàn làm việc duyệt đơn & Dashboard (`/manager/dashboard`)
   - `Warehouse` (Nhân viên kho) -> Danh sách phiếu soạn hàng (`/warehouse/picking`)
   - `WH Manager` (Quản lý kho) -> Dashboard quản lý kho & tồn kho (`/warehouse/dashboard`)
   - `Accountant` (Kế toán) -> Sổ công nợ & Hoá đơn (`/accounting/debt-book`)
   - `Admin` (Quản trị viên) -> Màn hình Quản trị người dùng (`/admin/users`)

##### Alternative Flows

- **ALT-01: Sai thông tin đăng nhập (Tài khoản hoặc mật khẩu không đúng)**  
  1. Tại bước 3, người dùng nhập sai tên đăng nhập hoặc mật khẩu.  
  2. Hệ thống tăng bộ đếm số lần thử thất bại của tài khoản/IP đó thêm 1.  
  3. Hệ thống trả về thông báo lỗi chung: *"Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại."* (Tuyệt đối không thông báo "Tài khoản không tồn tại" nhằm ngăn ngừa tấn công thu thập tài khoản).  
  4. Người dùng tiếp tục ở lại trang đăng nhập để thử lại.
- **ALT-02: Đăng nhập sai vượt quá ngưỡng quy định (Brute-force lockout)**  
  1. Người dùng nhập sai thông tin liên tiếp đến lần thứ 5.  
  2. Hệ thống tự động ghi nhận thời điểm khoá tạm thời và thiết lập trạng thái khoá 15 phút.  
  3. Hệ thống trả về thông báo: *"Tài khoản đã bị tạm khoá 15 phút do nhập sai thông tin 5 lần liên tiếp. Vui lòng thử lại sau hoặc sử dụng chức năng Quên mật khẩu."*  
  4. Mọi yêu cầu đăng nhập tiếp theo của tài khoản này trong vòng 15 phút sẽ bị từ chối ngay lập tức mà không cần kiểm tra mật khẩu.

##### Business Rules

| ID Quy Tắc | Nội Dung Quy Tắc | Căn Cứ Nguồn |
| --- | --- | --- |
| **BRULE-001** | **Thông báo lỗi đồng nhất (Generic Auth Error):** Thông báo lỗi khi đăng nhập thất bại phải hoàn toàn giống nhau bất kể tài khoản có tồn tại trong cơ sở dữ liệu hay không. | SRC-001, SRC-002 (S1-01) |
| **BRULE-002** | **Ngưỡng khoá tạm (Lockout Policy):** Nhập sai mật khẩu liên tiếp 5 lần sẽ kích hoạt cơ chế khoá tạm tài khoản chính xác 15 phút tính từ lần thất bại thứ 5. Hết 15 phút tài khoản tự động mở lại. | SRC-001, SRC-002 (S1-01) |
| **BRULE-003** | **Bảo mật giá vốn phía Máy chủ (Cost Privacy Enforcement):** Phiên đăng nhập chỉ cấp quyền truy xuất các trường dữ liệu giá vốn (`cogs`, `cost_price`, `profit_margin`) nếu vai trò của tài khoản là `Sales Manager` hoặc `Admin`. Các vai trò khác bị loại bỏ trường này ngay từ tầng Backend DTO. | SRC-001, SRC-002 (Sheet 1 Row 71, Sheet 2 Row 14) |
| **BRULE-004** | **Bảo vệ mật khẩu:** Mật khẩu trong cơ sở dữ liệu bắt buộc phải được mã hoá một chiều bằng thuật toán `bcrypt` với cost factor tối thiểu 10. | SRC-002 (Sheet 1 Row 71) |

##### Data Requirements

| Tên Trường (Field) | Bắt Buộc | Kiểu Dữ Liệu | Ràng Buộc / Quy Cách | Nguồn |
| --- | --- | --- | --- | --- |
| `username_or_email` | Có | Chuỗi (String) | Tối đa 100 ký tự, không chứa khoảng trắng | SRC-001, SRC-002 |
| `password` | Có | Chuỗi (String) | Nhập dạng ẩn ký tự (`type="password"`), độ dài từ 1 - 128 ký tự | SRC-001, SRC-002 |
| `remember_me` | Không | Boolean | Tùy chọn lưu phiên làm việc (Mặc định `false`) | Inferred UX |

##### Validation Rules

| ID | Trường | Quy Tắc Thẩm Định | Thông Báo Lỗi Kỳ Vọng | Nguồn |
| --- | --- | --- | --- | --- |
| **VAL-001** | `username_or_email` | Không được để trống | *"Vui lòng nhập tên đăng nhập hoặc email."* | SRC-002 |
| **VAL-002** | `password` | Không được để trống | *"Vui lòng nhập mật khẩu."* | SRC-002 |
| **VAL-003** | Xác thực | Khớp cặp `username` + `hash(password)` | *"Tên đăng nhập hoặc mật khẩu không chính xác."* | SRC-001, SRC-002 |
| **VAL-004** | Trạng thái tài khoản | Phải ở trạng thái `ACTIVE` | *"Tài khoản của bạn đã bị vô hiệu hoá. Vui lòng liên hệ Quản trị viên."* | SRC-002 (S1-10) |

##### UI/UX Requirements

- Màn hình đăng nhập trang nhã, tập trung vào form chính giữa màn hình (hoặc chia 2 cột với hình ảnh thương hiệu phân phối).
- Hỗ trợ phím `Enter` để thực hiện gửi form ngay khi đang ở ô mật khẩu.
- Có biểu tượng ẩn/hiện mật khẩu (eye toggle icon).
- Có thông báo dạng Alert Banner nổi bật màu đỏ khi đăng nhập thất bại hoặc tài khoản bị khoá tạm.
- Nút "Đăng nhập" có trạng thái Loading Spinner và bị vô hiệu hoá (disabled) trong lúc đang gửi yêu cầu xác thực để chống người dùng nhấn đúp liên tục.

##### Integration Requirements

- **Hạ tầng xác thực:** REST API Endpoint `POST /api/v1/auth/login`.
- **Đầu vào:** JSON payload `{ "username": "...", "password": "..." }`.
- **Đầu ra thành công (200 OK):** JSON chứa `accessToken`, `refreshToken`, `expiresIn`, thông tin tóm tắt `user` (id, fullName, role, assignedWarehouseId, assignedTerritoryId).
- **Đầu ra thất bại:** `401 Unauthorized` (Sai tài khoản/mật khẩu), `423 Locked` (Bị tạm khoá kèm thời gian còn lại tính bằng giây).

##### Acceptance Criteria (BDD)

###### AC-001: Đăng nhập thành công và điều hướng đúng vai trò

```gherkin
Given tài khoản người dùng "sales_rep_01" có vai trò "Sales Rep" đang ở trạng thái "ACTIVE"
And mật khẩu hợp lệ là "MatKhau@123"
When người dùng truy cập trang "/login" và nhập đúng tài khoản và mật khẩu
And người dùng nhấn nút "Đăng nhập"
Then hệ thống xác thực thành công và trả về mã phản hồi HTTP 200 kèm Access Token
And hệ thống đặt lại số lần đăng nhập sai về 0
And người dùng được chuyển hướng đến trang chủ kinh doanh "/sales/orders"
And giao diện chỉ hiển thị menu dành cho vai trò "Sales Rep"
And tuyệt đối không hiển thị các trường dữ liệu giá vốn và biên lợi nhuận
```

###### AC-002: Đăng nhập sai hiển thị thông báo chung bảo mật

```gherkin
Given người dùng đang ở trang đăng nhập "/login"
When người dùng nhập một tài khoản không tồn tại trong hệ thống hoặc nhập sai mật khẩu
And người dùng nhấn nút "Đăng nhập"
Then hệ thống trả về mã phản hồi HTTP 401 Unauthorized
And giao diện hiển thị thông báo chung: "Tên đăng nhập hoặc mật khẩu không chính xác."
And hệ thống không đưa ra bất kỳ gợi ý nào tiết lộ tài khoản có tồn tại hay không
```

###### AC-003: Khoá tạm 15 phút sau 5 lần đăng nhập sai liên tiếp

```gherkin
Given tài khoản người dùng "wh_staff_01" đã đăng nhập sai 4 lần liên tiếp trước đó
When người dùng thực hiện lần đăng nhập sai thứ 5
Then hệ thống cập nhật trạng thái khoá tạm cho tài khoản "wh_staff_01" trong thời gian 15 phút
And hệ thống trả về mã phản hồi HTTP 423 Locked
And giao diện hiển thị thông báo: "Tài khoản đã bị tạm khoá 15 phút do nhập sai thông tin 5 lần liên tiếp. Vui lòng thử lại sau hoặc sử dụng chức năng Quên mật khẩu."
When người dùng cố gắng đăng nhập lại trong khoảng thời gian 15 phút này (dù nhập đúng mật khẩu)
Then hệ thống từ chối đăng nhập và thông báo thời gian còn lại cần chờ
```

###### AC-004: Tự động mở khoá sau khi hết thời gian 15 phút

```gherkin
Given tài khoản "wh_staff_01" đang bị khoá tạm
When thời gian trôi qua đủ 15 phút kể từ thời điểm khoá
And người dùng nhập chính xác tài khoản và mật khẩu hợp lệ
Then hệ thống cho phép đăng nhập thành công
And đưa người dùng vào trang chủ tương ứng với vai trò của họ
And số lần đăng nhập sai được đặt lại về 0
```

##### Edge Cases

- **EC-001 (Khoảng trắng thừa):** Người dùng vô tình dán tên đăng nhập hoặc email có khoảng trắng ở đầu hoặc cuối.  
  *Xử lý:* Tầng Frontend và Backend tự động `trim()` khoảng trắng trước khi kiểm tra.
- **EC-002 (Tài khoản bị Quản trị viên vô hiệu hoá):** Người dùng nhập đúng mật khẩu nhưng tài khoản có cờ `status = 'LOCKED'` hoặc `isActive = false`.  
  *Xử lý:* Hệ thống từ chối xác thực và trả thông báo: *"Tài khoản đã bị khoá. Vui lòng liên hệ Quản trị viên."*
- **EC-003 (Đăng nhập đồng thời khi đang bị tạm khoá):** Nhiều tab trình duyệt gửi request cùng lúc khi tài khoản đạt ngưỡng 5 lần sai.  
  *Xử lý:* Áp dụng Distributed Lock hoặc Transaction Lock tại cơ sở dữ liệu trên bảng ghi nhận nỗ lực đăng nhập (login attempts).

##### Error Handling

| Tình Huống Ngoại Lệ | Mã Lỗi HTTP | Phản Hồi Cho Người Dùng | Nguồn |
| --- | --- | --- | --- |
| Thiếu username hoặc password | `400 Bad Request` | *"Vui lòng nhập đầy đủ thông tin đăng nhập."* | SRC-002 |
| Sai thông tin xác thực | `401 Unauthorized` | *"Tên đăng nhập hoặc mật khẩu không chính xác."* | SRC-001, SRC-002 |
| Tài khoản bị khoá tạm 15 phút | `423 Locked` | *"Tài khoản đã bị tạm khoá 15 phút do nhập sai 5 lần. Vui lòng thử lại sau."* | SRC-001, SRC-002 |
| Tài khoản bị quản trị viên khoá vĩnh viễn | `403 Forbidden` | *"Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ Quản trị viên."* | SRC-002 (S1-10) |
| Lỗi kết nối máy chủ xác thực | `500 Internal Error` | *"Hệ thống đang bận. Vui lòng thử lại sau ít phút."* | Standard |

##### Non-Functional Requirements

| ID | Tiêu Chí | Yêu Cầu Kỹ Thuật | Nguồn |
| --- | --- | --- | --- |
| **NFR-001** | **Hiệu năng (Performance)** | Thời gian xử lý API đăng nhập (kể cả thời gian tính toán bcrypt) phải < 500ms ở tải bình thường. | SRC-002 (Sheet 1 Row 62) |
| **NFR-002** | **Bảo mật (Security)** | Mật khẩu băm bằng thuật toán `bcrypt` với cost factor tối thiểu 10; Rate limiting tối đa 10 requests/phút trên cùng một IP đối với endpoint `/api/v1/auth/login`. | SRC-002 (Sheet 1 Row 66) |
| **NFR-003** | **Responsive** | Màn hình đăng nhập hiển thị hoàn hảo và không bị vỡ layout trên thiết bị có độ rộng từ 360px trở lên. | SRC-002 (Sheet 1 Row 67) |

##### Sub-tasks

###### Analysis & Architecture

- [ ] ST-001: Thiết kế cấu trúc bảng `users`, `roles`, `user_roles`, `login_attempts` trong cơ sở dữ liệu PostgreSQL.
- [ ] ST-002: Thống nhất cơ chế tạo JWT Access Token (hạn 15 phút) và Refresh Token (hạn 7 ngày).

###### Backend

- [ ] ST-003: Xây dựng Endpoint `POST /api/v1/auth/login` với Spring Security / NestJS Passport.
- [ ] ST-004: Cài đặt logic đếm số lần đăng nhập sai, khoá tạm 15 phút sau 5 lần thất bại và tự động mở khoá.
- [ ] ST-005: Cài đặt bộ lọc DTO loại bỏ toàn bộ dữ liệu `cost_price`, `cogs`, `margin` nếu vai trò không phải `Sales Manager` hoặc `Admin`.

###### Frontend

- [ ] ST-006: Xây dựng màn hình Đăng nhập (React + TypeScript) hỗ trợ Responsive từ 360px.
- [ ] ST-007: Xử lý lưu trữ Token an toàn (HttpOnly Cookie hoặc Memory Storage kết hợp Interceptor).
- [ ] ST-008: Cài đặt bộ điều hướng (Route Guard) chuyển hướng người dùng đến đúng trang chủ của từng vai trò sau khi đăng nhập thành công.

###### Testing & QA

- [ ] ST-009: Viết Unit Test cho tầng Service kiểm tra logic xác thực mật khẩu bcrypt và bộ đếm lockout (Coverage >= 60%).
- [ ] ST-010: Viết Integration Test kiểm thử tự động quy trình đăng nhập cho ít nhất 3 vai trò: `Customer`, `Sales Rep`, `Sales Manager`.
- [ ] ST-011: Kiểm thử an ninh: Kiểm tra không rò rỉ trường giá vốn qua Network Tab trình duyệt cho vai trò `Sales Rep`.

##### Dependencies

- Phụ thuộc: Khởi tạo kiến trúc cơ sở dữ liệu PostgreSQL (`database/`).
- Là tiền đề cho: `S1-02` (Duy trì phiên), `S1-05` (Phân quyền RBAC), `S1-06` (Menu điều hướng).

##### Priority

- **MoSCoW (Excel):** **Must**
- **Jira Priority:** **Medium** *(Ghi nhận điểm xung đột CONFLICT-001)*

##### Story Point

- **5 Story Points** (Excel Backlog)

##### Definition of Done

- [ ] Toàn bộ 4 tiêu chí chấp nhận (AC-001 đến AC-004) được kiểm thử đạt 100%.
- [ ] Mã nguồn đã được review và merge vào nhánh chính thông qua Pull Request.
- [ ] Unit test tầng Service đạt độ phủ (line coverage) >= 60%.
- [ ] Đường ống CI hoàn thành kiểm tra: Build xanh, Lint không lỗi, Test pass.
- [ ] Triển khai thành công trên môi trường Staging.
- [ ] Ràng buộc không lộ giá vốn được kiểm chứng nghiêm ngặt tại tầng Server.
- [ ] Giao diện hoạt động trơn tru trên màn hình di động 360px.
- [ ] Không còn lỗi (defect) tồn đọng ở mức Major, Critical hoặc Blocker.
- [ ] Product Owner nghiệm thu và ký duyệt trên Staging.

---

#### US-02 — [S1-02] Duy Trì Phiên Đăng Nhập & Đăng Xuất An Toàn

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-01  
**Excel Reference:** Sheet `4. Product Backlog`, Row 8 (`S1-02`, 3 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-02, FR-02  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **duy trì phiên đăng nhập và đăng xuất an toàn**,  
> để **không mất đơn đang gõ dở khi mạng ở cửa hàng chập chờn**.

##### Business Context

Nhân viên kinh doanh thường xuyên di chuyển giữa các cửa hàng đại lý ở vùng sóng yếu, kết nối mạng ngắt quãng liên tục. Nếu phiên đăng nhập bị hết hạn đột ngột hoặc ngắt kết nối bắt đăng nhập lại, toàn bộ dữ liệu đơn hàng 10 - 20 dòng đang gõ dở sẽ biến mất, gây bức xúc lớn và chậm trễ tiến độ giao hàng. Đồng thời, khi người dùng chủ động đăng xuất, hệ thống phải hủy bỏ hoàn toàn phiên trên máy chủ để tránh bị kẻ khác lợi dụng thiết bị.

##### Business Value

- Duy trì trạng thái làm việc liên tục, gia hạn phiên thông minh dựa trên hành vi thao tác (Sliding expiration).
- Bảo vệ an toàn dữ liệu khi người dùng kết thúc ca làm việc hoặc rời khỏi máy tính công cộng.

##### Preconditions

1. Người dùng đã đăng nhập thành công vào hệ thống.
2. Trình duyệt đang nắm giữ Access Token và Refresh Token hợp lệ.

##### Main Flow

1. Người dùng đang thao tác trên hệ thống (ví dụ: đang gõ đơn hàng).
2. Khi Access Token gần hết hạn (còn dưới 2 phút), hệ thống frontend tự động gửi Refresh Token về máy chủ (`POST /api/v1/auth/refresh`) trong chế độ nền (background).
3. Máy chủ xác thực Refresh Token hợp lệ và cấp một cặp Token mới.
4. Trình duyệt tiếp nhận Token mới và tiếp tục thực hiện các thao tác mà người dùng không hề bị gián đoạn hay nhận thấy độ trễ.
5. Khi người dùng hoàn thành công việc và nhấn nút "Đăng xuất" tại thanh điều hướng:
6. Hệ thống gửi yêu cầu `POST /api/v1/auth/logout`.
7. Máy chủ đưa Access Token và Refresh Token hiện tại vào danh sách thu hồi (Token Blacklist / Invalidation Table).
8. Trình duyệt xóa toàn bộ thông tin phiên lưu trữ cục bộ và chuyển hướng người dùng về trang Đăng nhập kèm thông báo: *"Bạn đã đăng xuất thành công."*

##### Alternative Flows

- **ALT-01: Phiên làm việc hết hạn do không hoạt động (Session Expiration)**  
  1. Người dùng không có bất kỳ thao tác nào trên hệ thống vượt quá thời hạn cho phép của Refresh Token (ví dụ: sau 7 ngày hoặc theo cấu hình).  
  2. Khi người dùng quay lại và kích hoạt một hành động:  
  3. Yêu cầu làm mới phiên thất bại do Refresh Token đã hết hạn.  
  4. Hệ thống hiển thị hộp thoại thông báo: *"Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại để tiếp tục."*  
  5. Hệ thống lưu lại URL của trang hiện tại và điều hướng về `/login?redirect=...` để sau khi đăng nhập lại người dùng có thể quay lại đúng tác vụ dang dở.

##### Business Rules

- **BRULE-005 (Thu hồi phiên triệt để phía Server):** Thao tác đăng xuất bắt buộc phải vô hiệu hóa mã Refresh Token trong cơ sở dữ liệu/Redis; máy chủ từ chối mọi yêu cầu tiếp theo sử dụng Token này kể cả khi Token chưa hết hạn thời gian (JWT timestamp).
- **BRULE-006 (Gia hạn tự động theo hoạt động):** Phiên làm việc chỉ được tự động gia hạn khi người dùng có phát sinh tương tác (API request). Không tự động làm mới nếu ứng dụng bị treo tab không hoạt động.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Phiên được gia hạn tự động khi còn hoạt động
  Given người dùng đang thao tác trên hệ thống và Access Token sắp hết hạn trong vòng 2 phút
  When người dùng thực hiện một hành động gửi yêu cầu lên máy chủ
  Then hệ thống tự động làm mới phiên làm việc ở chế độ nền
  And cấp Access Token mới mà không làm gián đoạn màn hình thao tác của người dùng

Scenario: Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server
  Given người dùng đang đăng nhập hợp lệ
  When người dùng nhấn nút "Đăng xuất"
  Then hệ thống gửi yêu cầu thu hồi phiên về máy chủ
  And máy chủ vô hiệu hóa ngay lập tức cặp Token hiện tại
  And người dùng được chuyển hướng về trang "/login"
  When kẻ gian sử dụng lại Token cũ đã đăng xuất để gọi API
  Then máy chủ từ chối và trả về mã lỗi 401 Unauthorized

Scenario: Phiên hết hạn đưa về trang đăng nhập kèm thông báo rõ ràng
  Given người dùng không hoạt động vượt quá thời hạn của Refresh Token
  When người dùng gửi một yêu cầu mới lên máy chủ
  Then hệ thống chuyển hướng người dùng về màn hình đăng nhập
  And hiển thị thông báo rõ ràng: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại."
  And lưu lại đường dẫn trang hiện tại để quay lại sau khi đăng nhập
```

##### Sub-tasks

- [ ] ST-012: Xây dựng cơ chế lưu trữ Blacklist Token trên Redis hoặc PostgreSQL để thu hồi phiên.
- [ ] ST-013: Viết HTTP Client Interceptor phía React tự động bắt mã lỗi 401 để gọi API Refresh Token trong chế độ hàng đợi (request queueing).
- [ ] ST-014: Cài đặt Endpoint `POST /api/v1/auth/refresh` và `POST /api/v1/auth/logout`.
- [ ] ST-015: Viết Unit Test và E2E Test cho luồng gia hạn và đăng xuất phiên.

##### Priority & Points

- Priority: **Must** | Story Point: **3 Points**

---

#### US-03 — [S1-03] Đặt Lại Mật Khẩu Khi Quên Thông Qua Email

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-01  
**Excel Reference:** Sheet `4. Product Backlog`, Row 9 (`S1-03`, 5 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-05, FR-03  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **đặt lại mật khẩu khi quên thông qua email**,  
> để **tự lấy lại quyền truy cập khi đang đi thị trường mà không gọi được về văn phòng**.

##### Business Context

Nhân viên kinh doanh hoặc chủ đại lý thường quên mật khẩu sau những đợt nghỉ phép hoặc khi đổi điện thoại. Khi đang đứng tại cửa hàng đại lý vào sáng sớm hoặc ngoài giờ hành chính, họ không thể gọi điện cho bộ phận IT văn phòng để cấp lại mật khẩu. Chức năng đặt lại qua email giúp họ tự chủ 100% việc khôi phục tài khoản.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Nhập email nhận được liên kết đặt lại có hiệu lực 30 phút
  Given người dùng đang ở trang đăng nhập và nhấn vào liên kết "Quên mật khẩu?"
  When người dùng nhập địa chỉ email đã đăng ký "sales01@company.com" và nhấn "Gửi yêu cầu"
  Then hệ thống tạo một mã Token bảo mật duy nhất liên kết với tài khoản này
  And gửi email chứa đường dẫn đặt lại mật khẩu với thời hạn sử dụng chính xác 30 phút
  And màn hình hiển thị thông báo: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hòm thư của bạn."

Scenario: Liên kết đặt lại mật khẩu chỉ dùng được một lần duy nhất
  Given người dùng nhận được liên kết đặt lại mật khẩu trong email
  When người dùng truy cập liên kết và hoàn tất việc đổi mật khẩu mới thành công
  And người dùng hoặc kẻ gian bấm lại vào liên kết đó lần thứ hai
  Then hệ thống từ chối và hiển thị thông báo lỗi: "Liên kết đặt lại mật khẩu đã được sử dụng hoặc đã hết hiệu lực."

Scenario: Email không tồn tại vẫn hiển thị cùng một thông báo bảo mật
  Given người dùng đang ở màn hình Quên mật khẩu
  When người dùng nhập một email không có trong hệ thống "nonexistent@gmail.com"
  And nhấn "Gửi yêu cầu"
  Then hệ thống KHÔNG gửi email
  And màn hình vẫn hiển thị cùng một thông báo: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hòm thư của bạn."
  And không tiết lộ email có tồn tại trong cơ sở dữ liệu hay không
```

##### Business Rules

- **BRULE-007 (Token dùng 1 lần & Hạn 30 phút):** Mã Token đặt lại mật khẩu được sinh ngẫu nhiên bằng bộ tạo chuỗi bảo mật an toàn (CSPRNG), lưu dạng băm trong cơ sở dữ liệu và chỉ có thời hạn tối đa 30 phút. Sau khi đổi mật khẩu thành công, token bị huỷ ngay lập tức.
- **BRULE-008 (Chống thu thập tài khoản qua Quên mật khẩu):** Màn hình yêu cầu quên mật khẩu không bao giờ phản hồi email có tồn tại hay không.

##### Sub-tasks

- [ ] ST-016: Tạo bảng `password_reset_tokens` (id, user_id, token_hash, expires_at, used_at).
- [ ] ST-017: Thiết kế mẫu email thông báo đặt lại mật khẩu (HTML Template chuẩn thương hiệu).
- [ ] ST-018: Xây dựng Endpoint `POST /api/v1/auth/forgot-password` và `POST /api/v1/auth/reset-password`.
- [ ] ST-019: Xây dựng màn hình nhập email và màn hình tạo mật khẩu mới trên Frontend.

##### Priority & Points

- Priority: **Must** | Story Point: **5 Points**

---

#### US-04 — [S1-04] Đổi Mật Khẩu Chủ Động Khi Đang Đăng Nhập

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-01  
**Excel Reference:** Sheet `4. Product Backlog`, Row 10 (`S1-04`, 2 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-01, BR-05, FR-04  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **đổi mật khẩu khi đang đăng nhập**,  
> để **chủ động bảo vệ tài khoản sau khi được cấp mật khẩu tạm**.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Bắt buộc nhập mật khẩu hiện tại
  Given người dùng đã đăng nhập và đang ở trang cài đặt tài khoản
  When người dùng để trống hoặc nhập sai mật khẩu hiện tại và nhập mật khẩu mới
  And nhấn "Lưu thay đổi"
  Then hệ thống từ chối cập nhật và báo lỗi: "Mật khẩu hiện tại không chính xác."

Scenario: Kiểm tra độ phức tạp của mật khẩu mới
  Given người dùng nhập đúng mật khẩu hiện tại
  When người dùng nhập mật khẩu mới ngắn hơn 8 ký tự hoặc chỉ có chữ không có số (ví dụ: "abcdefgh")
  Then hệ thống báo lỗi: "Mật khẩu mới phải có tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số."

Scenario: Đổi mật khẩu thành công và thu hồi các phiên đăng nhập khác
  Given người dùng đang đăng nhập trên máy tính và đồng thời trên điện thoại
  When người dùng đổi mật khẩu mới thành công trên máy tính
  Then hệ thống cập nhật mật khẩu mới băm bcrypt vào cơ sở dữ liệu
  And thu hồi ngay lập tức phiên đăng nhập trên điện thoại và mọi thiết bị khác
  And hiển thị thông báo thành công: "Đổi mật khẩu thành công. Các phiên đăng nhập trên thiết bị khác đã được đăng xuất."
```

##### Sub-tasks

- [ ] ST-020: Xây dựng Endpoint `POST /api/v1/auth/change-password`.
- [ ] ST-021: Cài đặt logic thu hồi toàn bộ Refresh Token của người dùng ngoại trừ phiên hiện tại.
- [ ] ST-022: Xây dựng modal / form đổi mật khẩu trên giao diện người dùng.

##### Priority & Points

- Priority: **Must** | Story Point: **2 Points**

---

### FEAT-02: Kiểm Soát Phân Quyền (RBAC) & Giao Diện Động (Access Control & Navigation)

---

#### US-05 — [S1-05] Phân Quyền Theo Vai Trò (RBAC) & Kiểm Quyền Tầng Server

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-02  
**Excel Reference:** Sheet `4. Product Backlog`, Row 11 (`S1-05`, 8 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-01, BR-03, FR-05  

##### User Story
>
> Với vai trò là **Quản trị hệ thống (Admin)**,  
> tôi muốn **phân quyền theo vai trò cho toàn hệ thống**,  
> để **đảm bảo nhân viên kinh doanh không sửa được tồn kho và thủ kho không xem được giá vốn**.

##### Business Context

Một hệ thống bán hàng và kho chỉ có thể vận hành an toàn khi quyền hạn được phân định rõ ràng giữa các bộ phận. Nếu nhân viên kinh doanh có thể tự sửa số lượng tồn kho, họ có thể "ảo hóa" hàng để chốt đơn khống. Nếu thủ kho nhìn thấy giá vốn hàng mua, thông tin này có thể bị rò rỉ ra ngoài thị trường. Việc kiểm soát quyền không được làm sơ sài ở giao diện (ẩn nút bấm) mà bắt buộc phải kiểm soát triệt để ở tầng Server API.

##### Business Value

- Thiết lập ranh giới trách nhiệm và an toàn thông tin giữa 7 bộ phận nghiệp vụ.
- Ngăn ngừa gian lận thương mại và can thiệp số liệu trái thẩm quyền.

##### Business Rules

- **BRULE-009 (Mặc định từ chối - Default Deny):** Mọi API endpoint yêu cầu xác thực đều mặc định từ chối truy cập nếu vai trò của người dùng không được cấu hình quyền rõ ràng trong Ma trận phân quyền.
- **BRULE-010 (Bảo mật trường giá vốn nghiêm ngặt):** Hai trường `cost_price` (giá vốn sản phẩm) và `gross_margin` (biên lợi nhuận gộp) tuyệt đối bị chặn ở tầng máy chủ đối với các vai trò `Customer`, `Sales Rep`, `Warehouse`, `WH Manager`, `Accountant`. Chỉ có `Sales Manager` và `Admin` mới nhận được giá trị thực của các trường này.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Khai báo và áp dụng quyền cho bảy vai trò nghiệp vụ chuẩn
  Given hệ thống đã khởi tạo 7 vai trò: Customer, Sales Rep, Sales Manager, Warehouse, WH Manager, Accountant, Admin
  When kiểm tra ma trận phân quyền hệ thống
  Then mỗi vai trò được gán đúng các quyền tương ứng với Ma trận phân quyền tại Sheet 2 của tài liệu đặc tả

Scenario: Kiểm tra quyền nghiêm ngặt ở tầng server theo nguyên tắc Default Deny
  Given người dùng có vai trò "Sales Rep"
  When người dùng cố gắng gửi request trực tiếp (qua Postman/Curl) đến API điều chỉnh tồn kho "POST /api/v1/inventory/adjust"
  Then máy chủ chặn yêu cầu và trả về mã lỗi HTTP 403 Forbidden
  And không có bất kỳ thay đổi nào được thực thi trong cơ sở dữ liệu

Scenario: Bảo vệ dữ liệu giá vốn và biên lợi nhuận ở tầng Server
  Given hệ thống có sản phẩm SKU-001 với giá bán là 500.000 VND và giá vốn là 350.000 VND
  When tài khoản "Sales Rep" gọi API chi tiết sản phẩm "GET /api/v1/products/SKU-001"
  Then payload trả về có giá bán là 500.000 VND
  And trường "costPrice" hoàn toàn không xuất hiện (hoặc mang giá trị null)
  When tài khoản "Sales Manager" gọi cùng API trên
  Then payload trả về hiển thị đầy đủ "costPrice": 350000 và "margin": 30.0%

Scenario: Có kiểm thử tự động phân quyền cho ít nhất 3 vai trò
  Given bộ kiểm thử tự động của hệ thống
  When chạy kiểm thử phân quyền tầng Service / Controller
  Then có đầy đủ các ca kiểm thử tự động xác nhận quyền cho ít nhất 3 vai trò: "Sales Rep", "Warehouse", "Sales Manager"
  And toàn bộ các ca kiểm thử đều vượt qua (Pass)
```

##### Sub-tasks

- [ ] ST-023: Thiết kế cấu trúc RBAC với Spring Security / NestJS Guards (Phân tách Permissions và Roles).
- [ ] ST-024: Viết Custom Serializer / JSON Filter để tự động ẩn trường nhạy cảm `cost_price` và `margin` dựa trên Security Context của phiên làm việc.
- [ ] ST-025: Viết 15 Integration Tests kiểm thử ma trận phân quyền cho các vai trò `Customer`, `Sales Rep`, `Warehouse`, `Sales Manager`.

##### Priority & Points

- Priority: **Must** | Story Point: **8 Points**

---

#### US-06 — [S1-06] Menu Điều Hướng Đúng Theo Quyền & Tối Ưu Mobile 360px

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-02  
**Excel Reference:** Sheet `4. Product Backlog`, Row 12 (`S1-06`, 5 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-02, BR-03, FR-06  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **thấy menu điều hướng đúng theo quyền của mình**,  
> để **không bị rối bởi những chức năng mình không được dùng**.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Mục menu không thuộc quyền thì không hiển thị
  Given người dùng đăng nhập với vai trò "Warehouse" (Nhân viên kho)
  When người dùng nhìn vào thanh điều hướng menu của ứng dụng
  Then thanh menu chỉ hiển thị các mục: "Soạn hàng", "Nhập kho", "Sổ tồn kho", "Chuyển kho"
  And hoàn toàn không hiển thị các mục: "Tạo đơn hàng", "Duyệt đơn", "Bảng giá", "Sổ công nợ", "Quản trị người dùng"

Scenario: Hiển thị đầy đủ thông tin người dùng, vai trò và phạm vi kho/địa bàn
  Given người dùng "Trần Văn Kho" giữ vai trò "Nhân viên kho" phụ trách "Kho Tổng Hà Nội"
  When đăng nhập vào hệ thống
  Then góc trên thanh điều hướng hiển thị:
    - Họ và tên: "Trần Văn Kho"
    - Vai trò: "Nhân viên kho"
    - Phạm vi: "Kho Tổng Hà Nội"

Scenario: Hoạt động thuận tiện và không vỡ layout trên màn hình 360px
  Given người dùng truy cập hệ thống trên thiết bị di động có chiều rộng màn hình 360px
  When người dùng mở menu điều hướng
  Then menu hiển thị dạng ngăn kéo (Drawer / Hamburger Menu) mượt mà
  And các nút bấm có kích thước cảm ứng tối thiểu 44x44px, dễ dàng thao tác bằng một tay
  And không xuất hiện thanh cuộn ngang (horizontal scrollbar) gây lỗi hiển thị
```

##### Sub-tasks

- [ ] ST-026: Xây dựng cấu hình Menu Registry ánh xạ quyền truy cập với danh mục menu.
- [ ] ST-027: Phát triển Header Component hiển thị thông tin người dùng, vai trò và badge kho/địa bàn.
- [ ] ST-028: Xây dựng Responsive Sidebar / Drawer tối ưu cho màn hình 360px đến 1920px.

##### Priority & Points

- Priority: **Must** | Story Point: **5 Points**

---

#### US-07 — [S1-07] Thông Báo Lỗi Rõ Ràng & Hành Động Khắc Phục (Graceful Error Handling UI)

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-02  
**Excel Reference:** Sheet `4. Product Backlog`, Row 13 (`S1-07`, 1 Point, Should, Status: In Progress)  
**Requirement References:** BR-02, FR-07  

##### User Story
>
> Với vai trò là **người dùng của hệ thống (User)**,  
> tôi muốn **nhận thông báo rõ ràng khi truy cập nhầm chỗ hoặc không đủ quyền**,  
> để **biết mình nên làm gì tiếp thay vì gặp một trang trắng**.

##### Business Context

Trong một hệ thống OMS phân quyền đa vai trò (7 vai trò từ Đại lý, Nhân viên kinh doanh, Thủ kho đến Admin), người dùng thường xuyên mở lại bookmark cũ, gõ nhầm đường dẫn hoặc bấm vào các tính năng vượt quá thẩm quyền của mình. Nếu hệ thống để văng lỗi kỹ thuật (như màn hình trắng xoá, lỗi crash component, hoặc trang mặc định của web server `Cannot GET /...`), người dùng sẽ lầm tưởng hệ thống bị sập, hoang mang, liên tục bấm F5 hoặc gọi IT Helpdesk làm tắc nghẽn hỗ trợ kỹ thuật và gián đoạn công việc bán hàng/kho vận.

##### Business Value

- **Trải nghiệm người dùng liền mạch (Graceful Degradation):** Giữ người dùng luôn ở trong luồng làm việc an toàn, biết chính xác lý do gặp sự cố và có sẵn đường dẫn thoát (Call-to-Action) để tiếp tục công việc.
- **Bảo mật hệ thống (Information Security):** Che giấu hoàn toàn các thông tin kỹ thuật nhạy cảm (Stack trace, Database schema, phiên bản server) khỏi kẻ gian khi quét lỗ hổng hoặc truy cập trái phép.
- **Tính chuyên nghiệp & Đồng nhất thương hiệu:** Đảm bảo toàn bộ ứng dụng thể hiện chuẩn mực cao cấp của phần mềm doanh nghiệp, không tạo cảm giác chắp vá.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Người dùng truy cập vào một URL không tồn tại (Lỗi 404 Not Found)
  Given người dùng đã đăng nhập với vai trò bất kỳ
  When người dùng truy cập một đường dẫn không có trong định tuyến (ví dụ: "/sales/order-unknown" hoặc bấm link lỗi thời)
  Then hệ thống không hiển thị màn hình trắng hay lỗi code máy chủ
  And hiển thị trang thông báo lỗi 404 Not Found với nội dung:
    | Trường hiển thị | Nội dung kỳ vọng |
    | Mã lỗi          | "404" |
    | Tiêu đề         | "Trang không tồn tại hoặc đã bị di dời" |
    | Thông điệp phụ  | "Đường dẫn bạn vừa truy cập không hợp lệ. Vui lòng kiểm tra lại URL hoặc quay về trang làm việc chính." |
  And hiển thị nút bấm hành động chính (Primary CTA): "Quay về Trang chủ"
  And hiển thị nút bấm hành động phụ (Secondary CTA): "Quay lại trang trước"
  When người dùng nhấn "Quay về Trang chủ"
  Then hệ thống điều hướng người dùng về đúng trang chủ mặc định theo vai trò của họ

Scenario: Người dùng truy cập vào trang không đủ quyền (Lỗi 403 Forbidden)
  Given người dùng đã đăng nhập với vai trò "Sales Rep" (Nhân viên kinh doanh)
  When người dùng cố tình nhập URL trang quản trị "/admin/users" hoặc trang duyệt giá vốn "/manager/cogs-report"
  Then hệ thống Router Guard chặn ngay lập tức việc kết xuất nội dung trang đích
  And hiển thị trang thông báo lỗi 403 Forbidden với nội dung:
    | Trường hiển thị | Nội dung kỳ vọng |
    | Mã lỗi          | "403" |
    | Tiêu đề         | "Truy cập bị từ chối / Không đủ thẩm quyền" |
    | Thông điệp phụ  | "Bạn không có quyền truy cập vào chức năng này. Nếu đây là sự nhầm lẫn, vui lòng liên hệ Quản trị viên để được cấp quyền." |
  And tuyệt đối không để lộ bất kỳ dữ liệu nhạy cảm hay cấu trúc nội dung nào của trang bị cấm
  And hiển thị nút bấm hành động nổi bật: "Về bàn làm việc của tôi"
  When người dùng nhấn nút "Về bàn làm việc của tôi"
  Then hệ thống chuyển hướng ngay lập tức về trang "/sales/orders"

Scenario: Giao diện trang lỗi kế thừa Layout chung & Call-to-Action trực quan (UI/UX)
  Given người dùng đã xác thực phiên làm việc và gặp lỗi 403 hoặc 404
  When trang lỗi được kết xuất trên trình duyệt
  Then toàn bộ khung giao diện chuẩn của ứng dụng (App Layout) vẫn được duy trì:
    - Thanh điều hướng trên cùng (Header): Hiển thị đầy đủ Họ tên, Vai trò, Nút Đăng xuất
    - Thanh menu bên (Sidebar): Giữ nguyên danh sách các chức năng mà người dùng CÓ QUYỀN thao tác
  And khu vực nội dung chính (Main Content Area) hiển thị khối minh họa (Illustration vector) và nút CTA
  When người dùng nhấn nút "Quay lại trang trước" (Back action)
  Then nếu lịch sử duyệt web (browser history) hợp lệ, trình duyệt quay lại trang thao tác trước đó
  And nếu không có lịch sử trước đó (mở tab mới), hệ thống tự động fallback đưa về trang chủ mặc định theo vai trò
```

##### Non-Functional Requirements & UI/UX Notes

1. **Tính nhất quán giao diện (Design System Consistency):**
   - Sử dụng bảng màu chuẩn của dự án: Màu cảnh báo thân thiện (Accent warning/info), tránh dùng màu đỏ rực mang cảm giác hệ thống bị sập nghiêm trọng.
   - Iconography / Illustration: Sử dụng hình minh họa vector SVG tối giản, tải nhanh, đồng bộ style với toàn bộ hệ thống OMS.
2. **Khả năng tương thích đáp ứng (Responsive 360px):**
   - Hoạt động mượt mà từ màn hình di động nhỏ nhất **360px** (chuẩn màn hình smartphone của nhân viên kinh doanh đi tuyến thị trường) đến màn hình desktop lớn 1920px.
   - Nút bấm CTA trên mobile phải có kích thước tối thiểu **44x44px**, nằm trong tầm với của ngón tay cái, không gây vỡ khung hay xuất hiện thanh cuộn ngang (horizontal scrollbar).
3. **Hiệu năng & Khả năng tiếp cận (Accessibility - A11y):**
   - Thời gian render trang lỗi: Tức thì (< 100ms phía Client).
   - Không bị hiện tượng nhảy giao diện (Cumulative Layout Shift - CLS = 0).
   - Tuân thủ tiêu chuẩn tương phản màu sắc WCAG 2.1 Level AA; có thể điều hướng nút CTA bằng phím Tab và kích hoạt bằng Enter.

##### Technical Notes (Dành cho Developers)

- **Frontend (Client-side Routing & Error Handling):**
  - **Catch-all Route (404):** Khai báo wildcard route ở cuối file cấu hình router (`path: "*"`). Bọc bên trong `AppLayout` nếu đã đăng nhập; nếu là khách vãng lai (Guest), bọc trong `AuthLayout` kèm nút "Đăng nhập".
  - **Route Guards / Auth Guard (403):** Khi router guard kiểm tra token & permissions: nếu route yêu cầu quyền mà user trong JWT/Auth Context không đáp ứng -> chuyển hướng sang route `/403` hoặc render component `<ForbiddenError />`.
  - **Dynamic Home Navigation:** Nút CTA "Về trang chủ" phải đọc từ hàm `getDefaultRouteByRole(user.role)` đã xây dựng ở US-01 để đưa user về đúng trang nghiệp vụ thay vì hardcode về `/`.
  - **React Error Boundary:** Cài đặt `<ErrorBoundary>` cấp layout để bẫy các lỗi JavaScript unhandled runtime crash (500 client-side), hiển thị fallback UI thân thiện thay vì màn hình trắng xóa.
- **Backend (API Response & Security):**
  - Các API trả về chuẩn RESTful HTTP Status Code: `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.
  - Định dạng JSON lỗi chuẩn hóa (Uniform Error Response): `{ "statusCode": 403, "error": "Forbidden", "message": "...", "timestamp": "...", "path": "..." }`.
  - Tuyệt đối không bật debug mode trên Staging/Production để tránh rò rỉ stack trace và database schema.

##### Sub-tasks

- [ ] ST-029: Thiết kế và xây dựng UI Component `ErrorPageLayout`, `NotFoundPage (404)` và `ForbiddenPage (403)` đồng bộ Design System, kế thừa App Layout và responsive 360px.
- [ ] ST-030: Cấu hình Router Wildcard Catch-all (`*`), cài đặt React Error Boundary toàn cục và tích hợp nút CTA điều hướng theo vai trò người dùng.
- [ ] ST-030-BE: Chuẩn hóa Global Exception Handler phía Backend, đảm bảo mọi lỗi chặn quyền API đều trả về HTTP 403 kèm cấu trúc JSON chuẩn hóa, không lộ stack trace.
- [ ] ST-030-QA: Xây dựng kịch bản và thực thi kiểm thử 404, 403 (RBAC cross-role check), kiểm tra phản hồi các nút CTA và test hiển thị trên mobile 360px.

##### Priority & Points

- Priority: **Should** | Story Point: **1 Point**

---

### FEAT-03: Quản Trị Tài Khoản, Phân Công Phạm Vi & Kiểm Soát Trạng Thái (User Administration & Scoping)

---

#### US-08 — [S1-08] Quản Trị Tài Khoản Người Dùng (Tạo Mới, Tìm Kiếm, Lọc)

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-03  
**Excel Reference:** Sheet `4. Product Backlog`, Row 14 (`S1-08`, 8 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-04, FR-08  

##### User Story
>
> Với vai trò là **Quản trị hệ thống (Admin)**,  
> tôi muốn **tạo, sửa và tìm kiếm tài khoản người dùng**,  
> để **cấp quyền cho nhân viên kinh doanh mới ngay ngày đầu họ nhận địa bàn**.

##### Business Context

Khi tuyển dụng nhân viên kinh doanh hoặc thủ kho mới, Quản trị viên cần nhanh chóng khởi tạo tài khoản, gửi thông tin đăng nhập tự động qua email để nhân viên kịp thời đi thị trường hoặc nhận kho mà không phải trao đổi mật khẩu qua các kênh không an toàn như Zalo hay giấy viết tay. Đồng thời, danh sách tài khoản lên tới hàng trăm người dùng cần có công cụ tìm kiếm và phân trang tối ưu.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Tạo tài khoản gửi email kích hoạt kèm mật khẩu tạm
  Given Quản trị viên đang ở màn hình Quản trị người dùng "/admin/users"
  When Quản trị viên nhập thông tin nhân viên mới gồm: Tên đăng nhập "nguyenvana", Họ và tên "Nguyễn Văn A", Email "a.nguyen@company.com", Số điện thoại "0912345678", chọn vai trò "Sales Rep"
  And nhấn "Tạo tài khoản"
  Then hệ thống tạo tài khoản ở trạng thái "ACTIVE"
  And tự động sinh một mật khẩu tạm ngẫu nhiên mạnh
  And gửi email kích hoạt tới hòm thư "a.nguyen@company.com" chứa tên đăng nhập và mật khẩu tạm kèm yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên

Scenario: Từ chối tạo tài khoản nếu bị trùng lặp
  Given hệ thống đã tồn tại tài khoản có tên đăng nhập "nguyenvana" hoặc email "a.nguyen@company.com"
  When Quản trị viên cố gắng tạo một tài khoản mới trùng tên đăng nhập hoặc email này
  Then hệ thống từ chối lưu và hiển thị thông báo lỗi cụ thể: "Tên đăng nhập hoặc Email đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."

Scenario: Tìm kiếm và bộ lọc người dùng đa tiêu chí
  Given danh sách người dùng có 150 nhân sự
  When Quản trị viên nhập từ khoá "0912" vào ô tìm kiếm hoặc chọn lọc vai trò "Warehouse" và trạng thái "ACTIVE"
  Then hệ thống lọc và hiển thị chính xác các tài khoản có số điện thoại chứa "0912" hoặc thuộc vai trò kho đang hoạt động trong vòng dưới 500ms

Scenario: Danh sách phân trang chuẩn 20 dòng mặc định
  Given hệ thống có hơn 20 tài khoản người dùng
  When Quản trị viên mở trang danh sách
  Then bảng hiển thị mặc định chính xác 20 dòng trên mỗi trang
  And có thanh điều hướng phân trang (Trang trước, Trang sau, Số trang cụ thể, Tổng số tài khoản)
```

##### Sub-tasks

- [ ] ST-031: Xây dựng các API RESTful: `GET /api/v1/admin/users`, `POST /api/v1/admin/users`, `PUT /api/v1/admin/users/{id}`.
- [ ] ST-032: Cài đặt dịch vụ sinh mật khẩu tạm ngẫu nhiên và gửi email qua SMTP Service.
- [ ] ST-033: Xây dựng màn hình danh sách người dùng với bảng dữ liệu phân trang, thanh tìm kiếm debounce và bộ lọc dropdown.
- [ ] ST-034: Xây dựng modal form tạo mới và chỉnh sửa thông tin người dùng có validate form đầy đủ.

##### Priority & Points

- Priority: **Must** | Story Point: **8 Points**

---

#### US-09 — [S1-09] Gán Vai Trò & Gắn Người Dùng Với Kho Hoặc Địa Bàn

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-03  
**Excel Reference:** Sheet `4. Product Backlog`, Row 15 (`S1-09`, 3 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-03, BR-04, FR-09  

##### User Story
>
> Với vai trò là **Quản trị hệ thống (Admin)**,  
> tôi muốn **gán vai trò và gắn người dùng với kho hoặc địa bàn**,  
> để **thủ kho chỉ thao tác được trên kho mình phụ trách**.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Một người dùng có thể giữ nhiều vai trò cùng lúc
  Given Quản trị viên đang cấu hình tài khoản cho nhân viên "Hoàng Quản Lý"
  When Quản trị viên tích chọn cả 2 vai trò: "Sales Manager" và "WH Manager"
  And nhấn "Lưu quyền"
  Then hệ thống cập nhật thành công
  And khi người dùng này đăng nhập, họ sở hữu đầy đủ quyền hạn của cả 2 vai trò nói trên

Scenario: Người dùng thuộc vai trò kho bắt buộc phải gắn với ít nhất một kho cụ thể
  Given Quản trị viên gán vai trò "Warehouse" (Nhân viên kho) cho tài khoản "lethukho"
  When Quản trị viên bỏ trống trường chọn kho phụ trách và nhấn "Lưu"
  Then hệ thống từ chối lưu và hiển thị thông báo lỗi bắt buộc: "Nhân viên kho bắt buộc phải được gắn với ít nhất một kho cụ thể."

Scenario: Không thể tự thu hồi vai trò quản trị của chính mình
  Given Quản trị viên "admin_root" đang đăng nhập vào hệ thống
  When "admin_root" tự chỉnh sửa tài khoản của chính mình và bỏ tích vai trò "Admin"
  And nhấn "Lưu"
  Then hệ thống chặn thao tác và hiển thị cảnh báo: "Bạn không thể tự thu hồi vai trò Quản trị hệ thống của chính mình."
```

##### Business Rules

- **BRULE-011 (Ràng buộc kho bắt buộc):** Người dùng có vai trò `Warehouse` bắt buộc phải có ít nhất 1 bản ghi trong bảng `user_warehouses`.
- **BRULE-012 (Chống tự khoá quyền Quản trị):** Hệ thống ngăn chặn việc tài khoản Admin tự gỡ bỏ role Admin của chính mình nhằm bảo đảm luôn có ít nhất một Quản trị viên hoạt động để vận hành hệ thống.

##### Sub-tasks

- [ ] ST-035: Thiết kế bảng quan hệ `user_warehouses` và `user_territories`.
- [ ] ST-036: Viết validation logic tầng service kiểm tra điều kiện bắt buộc chọn kho khi role là Warehouse.
- [ ] ST-037: Cập nhật giao diện gán vai trò có component chọn Kho phụ trách và Địa bàn phụ trách linh hoạt.

##### Priority & Points

- Priority: **Must** | Story Point: **3 Points**

---

#### US-10 — [S1-10] Khoá / Mở Khoá Tài Khoản Kèm Cảnh Báo Bàn Giao

**Epic:** EP-01 / SCRUM-6  
**Feature:** FEAT-03  
**Excel Reference:** Sheet `4. Product Backlog`, Row 16 (`S1-10`, 2 Points, Must, Status: Chưa bắt đầu)  
**Requirement References:** BR-04, FR-10  

##### User Story
>
> Với vai trò là **Quản trị hệ thống (Admin)**,  
> tôi muốn **khoá và mở khoá tài khoản**,  
> để **chặn ngay quyền tạo đơn khi một nhân viên nghỉ việc**.

##### Acceptance Criteria (BDD)

```gherkin
Scenario: Tài khoản bị khoá không đăng nhập được và bị thu hồi phiên đang mở ngay lập tức
  Given nhân viên kinh doanh "Trần Bán Hàng" có tài khoản đang đăng nhập và mở phiên làm việc
  When Quản trị viên đổi trạng thái tài khoản của "Trần Bán Hàng" sang "LOCKED"
  Then hệ thống lập tức thu hồi toàn bộ Access Token và Refresh Token của tài khoản này trên máy chủ
  And nếu nhân viên gửi bất kỳ yêu cầu nào tiếp theo, ứng dụng lập tức đẩy về trang đăng nhập
  When nhân viên này cố gắng đăng nhập lại
  Then hệ thống từ chối và thông báo: "Tài khoản của bạn đã bị khoá. Vui lòng liên hệ Quản trị viên."

Scenario: Bắt buộc nhập lý do khoá tài khoản
  Given Quản trị viên chọn thao tác "Khoá tài khoản"
  When Quản trị viên không nhập lý do khoá vào ô ghi chú và nhấn "Xác nhận khoá"
  Then hệ thống từ chối thực hiện và báo lỗi: "Vui lòng nhập lý do khoá tài khoản."

Scenario: Cảnh báo bàn giao danh sách đại lý phụ trách khi khoá nhân viên kinh doanh
  Given nhân viên kinh doanh "Trần Bán Hàng" đang phụ trách 25 đại lý tại khu vực Hà Nội
  When Quản trị viên thực hiện khoá tài khoản này
  Then sau khi khoá thành công, hệ thống hiển thị hộp thoại cảnh báo: "CẢNH BÁO BÀN GIAO: Nhân viên này đang phụ trách 25 đại lý. Vui lòng phân công người phụ trách mới để không làm gián đoạn tiếp nhận đơn hàng!"
  And cung cấp nút liên kết nhanh chuyển đến màn hình "Bàn giao địa bàn"
```

##### Business Rules

- **BRULE-013 (Thu hồi phiên tức thời khi khoá tài khoản):** Sự kiện khoá tài khoản phải kích hoạt phát tán sự kiện (event emission) thu hồi toàn bộ token của tài khoản đó trong cơ sở dữ liệu và cache.
- **BRULE-014 (Kiểm toán lý do khoá):** Lý do khoá tài khoản bắt buộc phải được lưu trữ vĩnh viễn trong bảng lịch sử thay đổi trạng thái kèm thời gian và ID của Quản trị viên thực hiện.

##### Sub-tasks

- [ ] ST-038: Xây dựng API `PATCH /api/v1/admin/users/{id}/status` nhận `{ status: "LOCKED", reason: "..." }`.
- [ ] ST-039: Cài đặt cơ chế kiểm tra trạng thái tài khoản trong Security Filter / Interceptor ở mỗi request.
- [ ] ST-040: Phát triển Modal xác nhận khoá tài khoản có trường nhập lý do bắt buộc và Modal cảnh báo bàn giao đại lý.

##### Priority & Points

- Priority: **Must** | Story Point: **2 Points**

---

## 10. Requirement Conflicts

Dưới đây là ma trận ghi nhận và xử lý các điểm sai khác và xung đột thông tin giữa các nguồn tài liệu (Jira vs Excel):

| Mã Xung Đột | Chủ Đề / Khía Cạnh | Nguồn A (Jira SCRUM-5 / SCRUM-6) | Nguồn B (Excel Backlog S1-01 / EP-01) | Bản Chất Xung Đột & Phân Tích Tác Động | Phương Án Chuẩn Hóa & Đề Xuất PO |
| --- | --- | --- | --- | --- | --- |
| **CONFLICT-001** | **Mức độ ưu tiên (Priority)** | `Priority: Medium` | `Ưu tiên: Must` (MoSCoW) | **Xung đột định giá tầm quan trọng:**<br>- Excel xếp `Must` vì Đăng nhập là cửa ngõ bắt buộc để vận hành toàn bộ hệ thống.<br>- Jira gắn `Medium` do cấu hình mặc định của Issue type Story. Nếu dev nhìn Jira có thể chủ quan hạ độ ưu tiên. | **Quyết định:** Chuẩn hóa mức độ ưu tiên nghiệp vụ là **Must** (Bắt buộc). Đề xuất cập nhật lại trường Priority trên Jira từ `Medium` lên `High` hoặc giữ mapping `Must = High`. |
| **CONFLICT-002** | **Trạng thái thực thi (Status)** | `In Progress` | `Chưa bắt đầu` | **Lệch pha cập nhật tiến độ:**<br>Excel là bản kế hoạch tĩnh lập trước sprint, Jira là công cụ theo dõi realtime của đội dev (đã có người nhận việc). | **Quyết định:** Trạng thái thực tế trên tiến độ chạy sprint là **In Progress** (Theo Jira). Cập nhật trạng thái này vào báo cáo tiến độ. |
| **CONFLICT-003** | **Phân công thực hiện (Assignee)** | `PHUNG XUAN TRUONG` | Để trống (Unassigned) | Excel không gán đích danh lập trình viên; Jira đã phân công cụ thể cho nhân sự Phùng Xuân Trường. | **Quyết định:** Ghi nhận nhân sự thực hiện chính là **Phùng Xuân Trường** (Theo Jira). |
| **CONFLICT-004** | **Quy ước mã định danh (ID Scheme)** | `SCRUM-5` (Parent `SCRUM-6`) | `S1-01` (Epic `EP-01`) | Hai hệ thống mã song song: Jira dùng tự tăng theo Project Key; Excel dùng quy ước Sprint-Story (`S1-xx`) và Epic (`EP-xx`). | **Quyết định:** Duy trì **cả hai mã định danh** trong tài liệu và ma trận truy vết để phục vụ tra cứu hai chiều giữa Jira và Backlog. |

---

## 11. Traceability Matrix (Ma Trận Truy Vết Yêu Cầu)

Bảng ma trận truy vết đảm bảo 100% yêu cầu từ nguồn gốc đến User Story, Tiêu chí chấp nhận và Nhiệm vụ kỹ thuật:

| Nguồn Đầu Vào | Yêu Cầu Nghiệp Vụ | Yêu Cầu Chức Năng | Epic | Feature | Mã Story (Jira / Excel) | Tiêu Chí Chấp Nhận (AC) | Mã Sub-tasks Kỹ Thuật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-001, SRC-002 (R7) | BR-01, BR-02 | FR-01 | EP-01 / SCRUM-6 | FEAT-01 | **SCRUM-5 / S1-01** | AC-001, AC-002, AC-003, AC-004 | ST-001, ST-002, ST-003, ST-004, ST-005, ST-006, ST-007, ST-008, ST-009, ST-010, ST-011 |
| SRC-002 (R8) | BR-02 | FR-02 | EP-01 / SCRUM-6 | FEAT-01 | **S1-02** | AC: Gia hạn tự động, Thu hồi phiên server, Hết hạn báo rõ | ST-012, ST-013, ST-014, ST-015 |
| SRC-002 (R9) | BR-05 | FR-03 | EP-01 / SCRUM-6 | FEAT-01 | **S1-03** | AC: Token 30p, Dùng 1 lần, Chống dò quét email | ST-016, ST-017, ST-018, ST-019 |
| SRC-002 (R10) | BR-01, BR-05 | FR-04 | EP-01 / SCRUM-6 | FEAT-01 | **S1-04** | AC: Nhập mk hiện tại, Độ dài >= 8, Thu hồi phiên khác | ST-020, ST-021, ST-022 |
| SRC-002 (R11, Sh2) | BR-01, BR-03 | FR-05 | EP-01 / SCRUM-6 | FEAT-02 | **S1-05** | AC: Phân quyền 7 vai trò, Default Deny, Ẩn giá vốn, Test 3 vai trò | ST-023, ST-024, ST-025 |
| SRC-002 (R12) | BR-02, BR-03 | FR-06 | EP-01 / SCRUM-6 | FEAT-02 | **S1-06** | AC: Ẩn menu không quyền, Hiện user/kho/địa bàn, Mobile 360px | ST-026, ST-027, ST-028 |
| SRC-002 (R13) | BR-02 | FR-07 | EP-01 / SCRUM-6 | FEAT-02 | **S1-07** | AC: Layout chuẩn, Nút gợi ý hành động | ST-029, ST-030 |
| SRC-002 (R14) | BR-04 | FR-08 | EP-01 / SCRUM-6 | FEAT-03 | **S1-08** | AC: Gửi email mk tạm, Chống trùng lặp, Tìm kiếm & lọc, Phân trang 20 dòng | ST-031, ST-032, ST-033, ST-034 |
| SRC-002 (R15) | BR-03, BR-04 | FR-09 | EP-01 / SCRUM-6 | FEAT-03 | **S1-09** | AC: Đa vai trò, Buộc gán kho cho thủ kho, Chống tự hạ quyền Admin | ST-035, ST-036, ST-037 |
| SRC-002 (R16) | BR-04 | FR-10 | EP-01 / SCRUM-6 | FEAT-03 | **S1-10** | AC: Vô hiệu hóa & thu hồi token, Bắt buộc lý do, Cảnh báo bàn giao | ST-038, ST-039, ST-040 |

---

## 12. Assumptions (Nhật Ký Giả Định)

| Mã Giả Định | Nội Dung Giả Định Nghiệp Vụ & Kỹ Thuật | Căn Cứ & Lý Do | Tác Động Dự Kiến Nếu Giả Định Sai | Trạng Thái Xác Nhận |
| --- | --- | --- | --- | --- |
| **ASM-001** | Chưa tích hợp nhà cung cấp dịch vụ Email thứ ba (SendGrid/SES) ở Sprint 1; tạm thời dùng SMTP Server hoặc ghi log ra console trên môi trường phát triển nội bộ. | Giúp đội dev tập trung hoàn thiện core logic nghiệp vụ xác thực mà không bị phụ thuộc đăng ký tài khoản dịch vụ ngoài. | Nếu cần gửi email thật ngay, phải bổ sung cấu hình SMTP trong file môi trường (`.env`). | Cần Tech Lead xác nhận |
| **ASM-002** | Cơ chế phân quyền RBAC được lưu tĩnh (static roles/permissions) trong mã nguồn/database seed; chưa cần xây dựng màn hình giao diện tùy biến thêm bớt quyền động cho Admin. | Sheet 2 đã định nghĩa cứng 7 vai trò chuẩn và ma trận quyền cố định cho toàn bộ 8 tuần pilot. | Giảm được 8 Story Points so với việc xây dựng hệ thống Dynamic Permission Builder. | Đã thống nhất theo Sheet 2 |
| **ASM-003** | Khóa tạm thời 15 phút sau 5 lần sai được quản lý theo địa chỉ IP hoặc định danh tài khoản bằng Redis Cache hoặc bảng cơ sở dữ liệu. | Đảm bảo tính sẵn sàng cao và không bị mất trạng thái khi máy chủ khởi động lại. | Cần cài đặt Redis instance hoặc tận dụng bảng trong PostgreSQL. | Cần Tech Lead chốt kiến trúc |
| **ASM-004** | Một nhân viên kinh doanh có thể được gắn với 1 hoặc nhiều địa bàn, nhưng tại một thời điểm chỉ phụ trách một tập đại lý xác định. | Hỗ trợ mô hình kinh doanh phân chia theo quận/huyện hoặc tỉnh thành. | Cấu trúc dữ liệu `user_territories` hỗ trợ quan hệ nhiều - nhiều (N-N). | Phù hợp thiết kế |

---

## 13. Open Questions (Câu Hỏi Mở Chờ Làm Rõ)

### Đối với Product Owner (PO)

- [ ] **Q-PO-01:** Đối với tài khoản Đại lý (`Customer`), việc tạo tài khoản sẽ do Quản trị viên tạo chủ động hay Đại lý được đăng ký trực tuyến từ Cổng đặt hàng? *(Hiện tại Sprint 1 chỉ có US S1-08 Admin tạo tài khoản; cần xác nhận luồng tự đăng ký nếu có ở Sprint 5).*
- [ ] **Q-PO-02:** Khi tài khoản bị khoá tạm 15 phút, người dùng có thể dùng chức năng "Quên mật khẩu" để tự mở khoá ngay lập tức hay bắt buộc phải chờ hết 15 phút?

### Đối với Tech Lead / Developer

- [ ] **Q-DEV-01:** Stack công nghệ Backend chính thức cho Sprint 1 chốt là **Spring Boot (Java)** hay **NestJS (TypeScript)**? *(Cần chốt dứt điểm theo Sheet 1 Row 54 để đội viết entity và migration chuẩn).*
- [ ] **Q-DEV-02:** Cơ chế Blacklist Token khi người dùng Đăng xuất hoặc Đổi mật khẩu sẽ lưu trữ trên Redis hay bảng `revoked_tokens` trong PostgreSQL?

### Đối với QA Lead

- [ ] **Q-QA-01:** Bộ dữ liệu kiểm thử thử nghiệm (Pilot Test Data) cho 7 vai trò đã có sẵn danh sách họ tên, email thật chưa để tiến hành chạy E2E test vào ngày thứ 4 của Sprint?

---

## 14. Risks (Phân Tích Rủi Ro & Kế Hoạch Ứng Phó)

Bảng rủi ro trích xuất và ánh xạ từ Sheet `5. Sprint Plan` của sổ tay dự án:

| STT | Rủi Ro Nhận Diện | Khả Năng | Tác Động | Biện Pháp Phòng Ngừa & Ứng Phó Cụ Thể |
| --- | --- | --- | --- | --- |
| **RSK-01** | **Velocity thực tế của đội thấp hơn 42 point ở hai sprint đầu** | Cao | Cao | - Đội 5 người mới ghép nhóm cần làm quen quy trình.<br>- Tổ chức Daily Scrum đúng 15 phút mỗi sáng để tháo gỡ vướng mắc kỹ thuật ngay lập tức.<br>- Nếu chậm tiến độ vào ngày thứ 4, lập tức cắt giảm story Should-have (`S1-07`, 1 point) và tập trung 100% nguồn lực đóng gói các story Must-have. |
| **RSK-02** | **Công việc kỹ thuật nền tảng (Database setup, Docker, CI/CD) không nằm trong backlog nên bị bỏ quên và ngốn thời gian** | Cao | Cao | - Bảo vệ tối thiểu 15% thời lượng Sprint 1 cho công tác hạ tầng (DevOps & Kiến trúc).<br>- Tận dụng các sub-task kỹ thuật đã được phân rã rõ ràng trong tài liệu này. |
| **RSK-03** | **Rò rỉ dữ liệu giá vốn do lập trình viên chỉ ẩn trường trên giao diện Frontend mà không lọc ở Backend API** | Trung bình | Rất Cao | - Bắt buộc áp dụng Data Transfer Object (DTO) riêng biệt cho từng vai trò.<br>- Đưa tiêu chí kiểm tra API payload vào Checklist Code Review và DoD: Tuyệt đối không có trường `cost_price` trả về cho vai trò không phải `Sales Manager`. |
| **RSK-04** | **Lỗi giao diện trên màn hình di động 360px làm nhân viên kinh doanh không thao tác được menu khi đi thị trường** | Cao | Trung bình | - Đưa bài kiểm tra Responsive 360px vào Definition of Done của từng story có UI.<br>- QA kiểm thử trực tiếp trên thiết bị di động thật hoặc Chrome Device Emulation ở khổ 360x640px trước khi chuyển PO nghiệm thu. |

---

## 15. Final Quality Report

### 15.1 Thống Kê Định Lượng Yêu Cầu Sprint 1

| Chỉ Số Định Lượng | Giá Trị Đo Lường | Trạng Thái Đánh Giá |
| --- | --- | --- |
| **Số lượng Epic bao phủ** | 1 Epic (`EP-01 / SCRUM-6`) | Đạt 100% phạm vi phân bổ |
| **Số lượng Feature** | 3 Features (`FEAT-01`, `FEAT-02`, `FEAT-03`) | Phân rã cấu trúc logic hoàn chỉnh |
| **Số lượng Yêu cầu Nghiệp vụ (BR)** | 5 Requirements (`BR-01` đến `BR-05`) | Đầy đủ mục tiêu giá trị kinh doanh |
| **Số lượng Yêu cầu Chức năng (FR)** | 10 Requirements (`FR-01` đến `FR-10`) | Ánh xạ 1:1 sang 10 User Stories |
| **Tổng số User Stories** | **10 Stories** (`S1-01` đến `S1-10`) | Khớp 100% Backlog Sprint 1 |
| **Tổng số Story Points** | **42 Points** | Khớp 100% mục tiêu Velocity Sprint 1 |
| **Tỷ lệ phân bổ MoSCoW** | Must: 9 stories (41 pt - 97.6%) \| Should: 1 story (1 pt - 2.4%) | Phù hợp chuẩn Sprint cam kết cao |
| **Tổng số Tiêu chí chấp nhận (AC)** | **32 Kịch bản BDD chi tiết** | Đảm bảo bao phủ toàn diện Happy/Unhappy path |
| **Tổng số Quy tắc nghiệp vụ (BRULE)** | 14 Quy tắc chuẩn hóa | Định lượng rõ ràng không mơ hồ |
| **Tổng số Sub-tasks kỹ thuật** | 40 Sub-tasks | Phân bổ cân đối cho Frontend, Backend, QA |
| **Tỷ lệ truy vết (Traceability Coverage)** | **100% (42/42 Points & 10/10 Stories)** | Đạt chuẩn PASS |
| **Số lượng xung đột phát hiện & giải quyết** | 4 Xung đột (CONFLICT-001 đến CONFLICT-004) | Đã có phương án xử lý minh bạch |

### 15.2 Thẩm Định Tiêu Chuẩn INVEST Cho Toàn Bộ User Stories

| Tiêu Chí INVEST | Đánh Giá Thực Tế Trong Tài Liệu | Kết Quả |
| --- | --- | --- |
| **I — Independent (Độc lập)** | Các User Stories được phân tách rõ ràng. Câu chuyện phức tạp về phân quyền (`S1-05`) được tách riêng khỏi menu điều hướng (`S1-06`) và quản trị tài khoản (`S1-08`). | **PASS** |
| **N — Negotiable (Có thể thương lượng)** | Phạm vi chấp nhận được mô tả qua BDD, các giải định kỹ thuật (ASM-001 đến ASM-004) để mở cho thảo luận giữa PO và Tech Lead. | **PASS** |
| **V — Valuable (Mang lại giá trị)** | Mỗi câu chuyện đều có phần Business Value và Business Context làm rõ lợi ích kinh tế (bảo vệ giá vốn, chống mất đơn khi rớt mạng). | **PASS** |
| **E — Estimable (Có thể ước lượng)** | Tất cả stories đều có điểm Story Point đã được thẩm định từ Backlog gốc (từ 1 đến 8 điểm, không có story nào vượt quá 8 điểm). | **PASS** |
| **S — Small (Vừa vặn trong Sprint)** | Điểm lớn nhất là 8 point (S1-05, S1-08) đã có kế hoạch phân rã sub-tasks API và UI để hoàn thành gọn trong chu kỳ 1 tuần. | **PASS** |
| **T — Testable (Có thể kiểm thử được)** | 100% stories đi kèm các kịch bản BDD (Given - When - Then) cụ thể với điều kiện biên và mã phản hồi HTTP đo đếm được. | **PASS** |

### 15.3 Bản Ký Duyệt & Chấp Thuận Yêu Cầu (Requirements Sign-Off)

Tài liệu này là căn cứ chính thức để:

1. Đội ngũ Lập trình viên (Developers) tiến hành phân bổ công việc và viết mã nguồn.
2. Đội ngũ Kiểm thử viên (QA/QC) xây dựng Test Plan, Test Cases và kịch bản Automation Tests.
3. Product Owner nghiệm thu sản phẩm tại buổi Sprint Review / Demo cuối Sprint 1.

*Tài liệu được khởi tạo và cam kết chất lượng bởi Hệ thống Tác tử Antigravity - Senior Business Analyst & Product Owner.*
