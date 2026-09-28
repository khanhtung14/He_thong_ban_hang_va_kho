# USER STORIES — QUẢN LÝ TÀI KHOẢN VÀ ĐẶT LẠI MẬT KHẨU QUA EMAIL

## 1. Thông tin Sprint & Jira Issue

| Thuộc tính | Nội dung |
|---|---|
| **Parent / Epic** | `SCRUM-6` — Quản lý Tài khoản & Phân quyền |
| **Jira Issue** | `SCRUM-57` |
| **Loại công việc** | User Story (Chức năng) |
| **Tiêu đề Jira** | Là người dùng hệ thống, tôi muốn đặt lại mật khẩu khi quên thông qua email, để tự động lấy lại quyền truy cập khi đang đi thị trường mà không được gọi về văn phòng. |
| **Mục tiêu Story** | Cung cấp quy trình tự phục hồi quyền truy cập tài khoản khi quên mật khẩu qua email, an toàn, nhanh chóng, độc lập cho nhân sự đi thị trường mà không cần liên hệ bộ phận hỗ trợ kỹ thuật tại văn phòng. |
| **Trạng thái** | In Progress / Ready for Review |
| **Sprint** | Sprint 1 — Quản lý Tài khoản & Xác thực Người dùng |
| **Priority** | High / Must Have (Tự phục hồi quyền truy cập, giảm tải vận hành) |

---

## 2. Mục tiêu Sprint & Nghiệp vụ

Trong quá trình đi thị trường (sales, thị trường kho vận, giám sát phân phối), nhân viên thường xuyên hoạt động bên ngoài văn phòng và có thể quên mật khẩu truy cập hệ thống. Nếu phải gọi điện về văn phòng để xin cấp lại mật khẩu thủ công:
1. Gây gián đoạn công việc bán hàng, kiểm hàng trực tiếp tại địa bàn.
2. Tăng chi phí vận hành và tải công việc của bộ phận Quản trị hệ thống (Admin/IT Support).
3. Tiềm ẩn rủi ro lộ mật khẩu khi truyền miệng qua điện thoại/tin nhắn.

Tính năng **SCRUM-57** cung cấp cơ chế tự động gửi liên kết đặt lại mật khẩu qua email được mã hóa bảo mật, giới hạn thời gian 30 phút và chỉ dùng một lần duy nhất, đồng thời bảo vệ chống rò rỉ danh sách tài khoản (chống User Enumeration).

---

## 3. Phạm vi (Scope)

### 3.1. Trong phạm vi (In-Scope)
- **Cơ chế gửi liên kết:** Người dùng nhập email đăng ký; hệ thống kiểm tra và gửi email chứa liên kết token đặt lại mật khẩu có hiệu lực đúng **30 phút**.
- **Cơ chế sử dụng một lần (Single-Use Token):** Liên kết token bị hủy hiệu lực ngay lập tức sau khi người dùng hoàn tất đặt lại mật khẩu mới thành công, không thể tái sử dụng.
- **Bảo mật chống dò quét tài khoản (Anti-User Enumeration):** Khi nhập email không tồn tại trong hệ thống, hệ thống **vẫn hiển thị cùng một thông điệp** thông báo chung với trường hợp email có tồn tại, không tiết lộ sự tồn tại của email.
- **Quy chuẩn mật khẩu an toàn:** Kiểm tra mật khẩu mới đạt tối thiểu 8 ký tự, gồm cả chữ và số, xác nhận mật khẩu khớp nhau, không cho phép trùng mật khẩu cũ và mã hóa bằng thuật toán `bcrypt`.
- **Giao diện người dùng (UI):** Màn hình yêu cầu gửi liên kết (`/forgot-password`) và màn hình thiết lập mật khẩu mới (`/reset-password?token=...`).

### 3.2. Ngoài phạm vi (Out-of-Scope)
- Đăng nhập 2 bước (2FA / OTP qua SMS).
- Phục hồi tài khoản qua câu hỏi bảo mật.
- Tự động khóa vĩnh viễn địa chỉ IP khi gửi spam (thuộc Epic Bảo mật nâng cao).

---

## 4. Actor (Tác nhân)

| Actor | Mô tả |
|---|---|
| **Người dùng hệ thống** | Nhân viên kinh doanh đi thị trường, nhân viên kho, hoặc bất kỳ người dùng nào có tài khoản hợp lệ bị quên mật khẩu đăng nhập. |
| **Hệ thống Backend (FastAPI)** | Tiếp nhận yêu cầu, sinh token bảo mật, kiểm tra TTL, mã hóa mật khẩu và hủy token sau sử dụng. |
| **Hệ thống Email (Mock/SMTP Service)** | Tiếp nhận và chuyển phát nội dung thư kèm liên kết đặt lại mật khẩu đến hòm thư người dùng. |

---

## 5. Business Requirements (Yêu cầu nghiệp vụ)

| ID | Yêu cầu nghiệp vụ (Business Requirement) | Nguồn yêu cầu |
|---|---|---|
| **BR-001** | Nhập email đã nhận được liên kết, thiết lập lại có hiệu lực 30 phút. | Jira SCRUM-57 (Description - Tiêu chí 1) |
| **BR-002** | Liên kết đặt lại mật khẩu chỉ được sử dụng một lần duy nhất. | Jira SCRUM-57 (Description - Tiêu chí 2) |
| **BR-003** | Email không tồn tại vẫn hiển thị cùng một thông báo để đảm bảo an toàn thông tin. | Jira SCRUM-57 (Description - Tiêu chí 3) |
| **BR-004** | Mật khẩu mới phải đáp ứng tiêu chuẩn an toàn (tối thiểu 8 ký tự, có chữ, có số) và mã hóa an toàn bằng bcrypt. | Tiêu chuẩn bảo mật hệ thống (kế thừa SCRUM-58) |

---

## 6. Danh sách User Story

| Mã User Story | Tên User Story | Actor | Priority | Story Point | Dependency |
|---|---|---|---|:---:|---|
| **US-001** | Đặt lại mật khẩu khi quên thông qua email | Người dùng hệ thống | Must Have | 5 | SCRUM-6 (Quản lý tài khoản) |

---

## 7. Chi tiết User Story (US-001)

### 7.1. Định dạng User Story
> **Là** người dùng hệ thống,  
> **tôi muốn** đặt lại mật khẩu khi quên thông qua email,  
> **để** tự động lấy lại quyền truy cập khi đang đi thị trường mà không được gọi về văn phòng.

### 7.2. Luồng thực hiện (Flow of Events)

#### Luồng chính (Main Flow):
1. Người dùng truy cập trang Quên mật khẩu (`/forgot-password`).
2. Người dùng nhập địa chỉ email đã đăng ký và nhấn "Gửi liên kết đặt lại mật khẩu".
3. Hệ thống tạo ra một chuỗi token URL-safe ngẫu nhiên có thời hạn hết hạn 30 phút, lưu vào bộ nhớ/CSDL với trạng thái `used = False`.
4. Hệ thống gửi email chứa liên kết dạng: `http://<domain>/reset-password?token=<token>`.
5. Hệ thống hiển thị thông báo chung: *"Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (liên kết có hiệu lực trong 30 phút)."*
6. Người dùng mở email trong vòng 30 phút và bấm vào liên kết đặt lại mật khẩu.
7. Trình duyệt mở trang Đặt lại mật khẩu (`/reset-password?token=...`). Hệ thống tự động xác thực token (còn hạn < 30 phút và chưa sử dụng).
8. Người dùng nhập mật khẩu mới, xác nhận lại mật khẩu mới và bấm "Cập nhật mật khẩu mới".
9. Hệ thống kiểm tra mật khẩu hợp lệ (>= 8 ký tự, có chữ cái, có chữ số, trùng khớp và khác mật khẩu cũ), mã hóa mật khẩu bằng `bcrypt`, cập nhật mật khẩu tài khoản và đánh dấu token `used = True`.
10. Hệ thống hiển thị thông báo thành công và cho phép người dùng đăng nhập bằng mật khẩu mới.

#### Luồng phụ / Bảo mật (Alternative Flow 1 — Email không tồn tại):
1. Người dùng nhập một email không có trong CSDL (hoặc kẻ tấn công nhập thử email ngẫu nhiên).
2. Hệ thống kiểm tra không thấy user, không tạo liên kết và không gửi email.
3. Hệ thống **vẫn trả về mã HTTP 200 và cùng một thông báo thành công chung** như ở Luồng chính (bước 5). Kẻ tấn công không thể phân biệt email nào có thật trong hệ thống.

#### Luồng ngoại lệ 1 (Exception Flow 1 — Liên kết hết hạn > 30 phút):
1. Người dùng mở liên kết sau hơn 30 phút kể từ lúc nhận email.
2. Hệ thống kiểm tra `now > token.expires_at`.
3. Hệ thống từ chối và hiển thị thông báo lỗi rõ ràng: *"Liên kết đặt lại mật khẩu đã hết hạn (chỉ có hiệu lực trong 30 phút). Vui lòng yêu cầu lại."* Form đổi mật khẩu bị vô hiệu hóa.

#### Luồng ngoại lệ 2 (Exception Flow 2 — Sử dụng lại liên kết đã dùng):
1. Người dùng đã đặt lại mật khẩu thành công bằng liên kết đó, sau đó thử nhấn lại vào link trong email hoặc gửi lại form.
2. Hệ thống kiểm tra thấy `token.used == True`.
3. Hệ thống từ chối và báo lỗi: *"Liên kết này đã được sử dụng. Mỗi liên kết chỉ có thể dùng một lần duy nhất."*

#### Luồng ngoại lệ 3 (Exception Flow 3 — Mật khẩu không hợp lệ):
1. Người dùng nhập mật khẩu dưới 8 ký tự, hoặc không có chữ, hoặc không có số, hoặc mật khẩu xác nhận không khớp.
2. Hệ thống báo lỗi tương ứng ngay tại form và không lưu mật khẩu. Token vẫn giữ nguyên hiệu lực cho đến khi hết 30 phút hoặc được cập nhật thành công.

---

### 7.3. Acceptance Criteria (AC)

#### **AC1 — Nhập email nhận liên kết thiết lập lại có hiệu lực 30 phút**
- **Given:** Người dùng đang ở màn hình Quên mật khẩu và nhập email tài khoản của mình.
- **When:** Người dùng nhấn nút "Gửi liên kết đặt lại mật khẩu".
- **Then:** 
  - Hệ thống tạo ra một liên kết đặt lại mật khẩu có chứa token bảo mật.
  - Thời hạn hiệu lực của liên kết được thiết lập chính xác là 30 phút (`expires_at = now + 30 minutes`).
  - Trong vòng 30 phút, người dùng truy cập liên kết thì hệ thống cho phép thực hiện đổi mật khẩu.
  - Sau 30 phút, liên kết tự động vô hiệu hóa; nếu truy cập, hệ thống báo lỗi hết hạn và yêu cầu gửi lại.

#### **AC2 — Liên kết được sử dụng chỉ một lần (Single-Use Token)**
- **Given:** Người dùng đã nhận được liên kết đặt lại mật khẩu hợp lệ.
- **When:** Người dùng hoàn tất việc nhập mật khẩu mới và gửi yêu cầu đổi mật khẩu thành công lần đầu tiên.
- **Then:**
  - Hệ thống cập nhật mật khẩu mới của người dùng và đánh dấu trạng thái của token là đã sử dụng (`used = True`).
  - Nếu người dùng hoặc bất kỳ ai thử sử dụng lại liên kết/token này một lần nữa, hệ thống lập tức từ chối với thông báo: *"Liên kết này đã được sử dụng. Mỗi liên kết chỉ có thể dùng một lần duy nhất."*

#### **AC3 — Email không tồn tại vẫn hiển thị cùng một thông báo (Anti-Enumeration)**
- **Given:** Người dùng nhập một địa chỉ email hoàn toàn không tồn tại trong hệ thống.
- **When:** Người dùng nhấn nút "Gửi liên kết đặt lại mật khẩu".
- **Then:**
  - Hệ thống trả về mã phản hồi HTTP 200.
  - Nội dung thông báo hiển thị trên giao diện và trong API trả về giống hệt như trường hợp email có tồn tại: *"Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (liên kết có hiệu lực trong 30 phút)."*
  - Hệ thống không gửi email ra ngoài và không để lộ thông tin tài khoản.

#### **AC4 — Quy chuẩn mật khẩu mới**
- **Given:** Người dùng truy cập form đặt lại mật khẩu thông qua liên kết hợp lệ.
- **When:** Người dùng nhập mật khẩu mới.
- **Then:**
  - Mật khẩu phải có tối thiểu 8 ký tự.
  - Mật khẩu phải chứa ít nhất 1 chữ cái (a-z, A-Z).
  - Mật khẩu phải chứa ít nhất 1 chữ số (0-9).
  - Mật khẩu mới không được trùng với mật khẩu hiện tại.
  - Mật khẩu xác nhận phải trùng khớp 100% với mật khẩu mới.
  - Mật khẩu được mã hóa an toàn bằng hàm băm một chiều `bcrypt` có kèm muối ngẫu nhiên (salt).

---

## 8. Technical Tasks

| Task ID | Tên công việc kỹ thuật (Technical Task) | Thành phần | Trạng thái |
|---|---|---|:---:|
| **TASK-001** | Xây dựng API `POST /forgot-password` sinh token an toàn 30 phút và xử lý trả về cùng thông điệp bảo mật (AC1, AC3). | Backend (FastAPI) | Đã hoàn thành |
| **TASK-002** | Xây dựng API `GET /verify-reset-token/{token}` xác thực tính hợp lệ, kiểm tra hạn 30 phút và kiểm tra cờ đã sử dụng. | Backend (FastAPI) | Đã hoàn thành |
| **TASK-003** | Xây dựng API `POST /reset-password` kiểm tra validation, mã hóa `bcrypt`, cập nhật user và vô hiệu hóa token (AC2, AC4). | Backend (FastAPI) | Đã hoàn thành |
| **TASK-004** | Thiết kế giao diện HTML/CSS/JS cho màn hình Quên mật khẩu (`/forgot-password`) kèm Widget Hộp thư Email giả lập (Mock Inbox). | Frontend | Đã hoàn thành |
| **TASK-005** | Thiết kế giao diện HTML/CSS/JS cho màn hình Thiết lập mật khẩu mới (`/reset-password`) kèm checklist kiểm tra quy chuẩn mật khẩu thời gian thực. | Frontend | Đã hoàn thành |
| **TASK-006** | Viết trọn bộ Unit Test và Integration Test tự động hóa kiểm thử đầy đủ các AC và Edge Cases (11/11 tests Passed). | Testing (Pytest) | Đã hoàn thành |

---

## 9. Ma trận truy vết (Traceability Matrix)

| Yêu cầu trong Sprint Jira (SCRUM-57) | User Story ánh xạ | Acceptance Criteria | Technical Tasks | Kiểm thử tự động (Pytest) |
|---|---|---|---|---|
| **"Nhập email đã nhận được liên kết, thiết lập lại có hiệu lực 30 phút"** | US-001 | AC1 | `TASK-001`, `TASK-002`, `TASK-004` | `test_ac1_gui_email_tao_lien_ket_hieu_luc_30_phut`<br>`test_ac1_lien_ket_con_trong_han_30_phut_la_hop_le`<br>`test_ac1_lien_ket_qua_30_phut_bi_tu_choi_het_han` |
| **"Liên kết được sử dụng chỉ một lần"** | US-001 | AC2 | `TASK-002`, `TASK-003`, `TASK-005` | `test_ac2_lien_ket_duoc_su_dung_chi_mot_lan` |
| **"Email không tồn tại vẫn hiển thị cùng một thông báo"** | US-001 | AC3 | `TASK-001`, `TASK-004` | `test_ac3_email_khong_ton_tai_van_hien_thi_cung_thong_bao` |
| **Quy chuẩn mật khẩu mới và bảo mật** | US-001 | AC4 | `TASK-003`, `TASK-005` | `test_validation_mat_khau_khong_khop`<br>`test_validation_mat_khau_ngan_hon_8_ky_tu`<br>`test_validation_mat_khau_thieu_chu_hoac_so`<br>`test_validation_mat_khau_moi_trung_mat_khau_cu` |

---

## 10. Đánh giá theo tiêu chuẩn INVEST

| Tiêu chí INVEST | Đánh giá | Giải thích chi tiết |
|---|:---:|---|
| **I — Independent (Độc lập)** | ✅ Đạt | Chức năng có thể phát triển, kiểm thử và bàn giao độc lập với các phân hệ khác như giỏ hàng, đơn hàng. |
| **N — Negotiable (Thương lượng được)** | ✅ Đạt | Giao diện và thông báo người dùng có thể tùy biến linh hoạt theo định hướng của Product Owner. |
| **V — Valuable (Có giá trị nghiệp vụ)** | ✅ Đạt | Giúp nhân sự bán hàng ngoài thị trường tự phục hồi quyền truy cập ngay lập tức, không làm gián đoạn bán hàng. |
| **E — Estimable (Ước lượng được)** | ✅ Đạt | Đã phân tách rõ thành 6 Technical Tasks cụ thể, ước lượng 5 Story Points. |
| **S — Small (Vừa phải)** | ✅ Đạt | Phạm vi gói gọn trong một Sprint Scrum tiêu chuẩn. |
| **T — Testable (Kiểm thử được)** | ✅ Đạt | Mọi tiêu chí đều có kịch bản Given-When-Then rõ ràng và được kiểm chứng tự động bằng 11 test cases trong pytest. |

---

## 11. Hướng dẫn Chạy ứng dụng & Kiểm thử

### 11.1. Khởi động máy chủ Backend
```bash
python -m uvicorn src.backend.main:app --reload --port 8000
```

### 11.2. Trải nghiệm giao diện trực quan
- Trang Quên mật khẩu: [http://localhost:8000/forgot-password](http://localhost:8000/forgot-password)
- Xem tài liệu Swagger API: [http://localhost:8000/docs](http://localhost:8000/docs)
- Hộp thư email giả lập có sẵn trên giao diện để bấm trực tiếp vào link đổi mật khẩu.

### 11.3. Chạy toàn bộ Unit Tests
```bash
python -m pytest tests/test_forgot_password.py -v
```
*(Kết quả mong đợi: 11/11 tests PASSED)*
