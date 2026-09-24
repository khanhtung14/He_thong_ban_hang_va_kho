# USER STORIES — HỆ THỐNG QUẢN LÝ TÀI KHOẢN VÀ PHÂN QUYỀN

Tài liệu đặc tả hệ thống User Story chính thức cho Sprint 1 (Epic SCRUM-6: Tài khoản, Phân quyền).  
Nguồn dữ liệu gốc (Source of Truth): Issue Jira **SCRUM-62**.

---

## 1. Thông tin Sprint

| Thuộc tính | Nội dung trích xuất từ Jira |
|---|---|
| **Sprint** | `Sprint 1: Tài khoản & phân quyền` (trên Jira hiển thị: *Sprint 1: Tài khoản & phân quy...*) |
| **Sprint Title** | `SCRUM-62`: Là Quản trị hệ thống, tôi muốn tạo, sửa và tìm kiếm tài khoản người dùng, để cấp quyền cho nhân viên kinh doanh mới ngay ngày đầu họ nhận địa bàn. |
| **Sprint Description** | • Tạo tài khoản gửi email kích hoạt kèm mật khẩu tạm<br>• Tài khoản trùng bị từ chối kèm thông báo cụ thể<br>• Tìm theo tên, tài khoản, số điện thoại; lọc theo vai trò và trạng thái<br>• Danh sách phân trang, mặc định 20 dòng |
| **Epic / Feature liên quan** | `SCRUM-6`: Tài khoản, Phân quyền |
| **Assignee** | NONG QUOC TUAN |
| **Reporter** | NGUYEN THI ANH |
| **Priority gốc** | Medium |
| **Story Point gốc** | 8 |
| **Trạng thái hiện tại** | In Progress |

---

## 2. Mục tiêu Sprint

Xây dựng module quản lý tài khoản người dùng phục vụ nhu cầu vận hành của Quản trị hệ thống:
* Cung cấp công cụ tra cứu, tìm kiếm đa tiêu chí và hiển thị danh sách người dùng trực quan, có phân trang chuẩn.
* Tự động hóa quy trình khởi tạo tài khoản và phân phối thông tin đăng nhập ban đầu an toàn qua email cho nhân sự kinh doanh mới ngay trong ngày đầu nhận địa bàn làm việc.
* Đảm bảo tính toàn vẹn dữ liệu thông qua cơ chế kiểm tra chống trùng lặp tài khoản nghiêm ngặt.

---

## 3. Phạm vi Sprint

### 3.1. Trong phạm vi (In-Scope)
* **Hiển thị danh sách tài khoản:** Bảng dữ liệu có phân trang, mặc định hiển thị 20 bản ghi/trang.
* **Tra cứu & Lọc dữ liệu:**
  * Tìm kiếm theo 3 trường: Họ tên, Tên tài khoản (Username), Số điện thoại.
  * Bộ lọc 2 tiêu chí: Vai trò (Role) và Trạng thái (Status).
* **Tạo mới tài khoản người dùng:**
  * Nhập liệu thông tin tài khoản người dùng mới.
  * Kiểm tra trùng lặp (Username, Email, Số điện thoại) và đưa ra thông báo từ chối cụ thể tương ứng.
  * Tự động tạo mật khẩu tạm thời ngẫu nhiên an toàn.
  * Gửi email kích hoạt tự động chứa mật khẩu tạm thời đến địa chỉ email của người dùng.
* **Chỉnh sửa thông tin tài khoản:** Có đề cập tại tiêu đề User Story gốc (`SCRUM-62`), được định hình khung nghiệp vụ cơ bản nhưng cần PO chốt danh sách trường chi tiết.

### 3.2. Ngoài phạm vi (Out-of-Scope)
* Xóa vĩnh viễn tài khoản (Hard delete).
* Tự đăng ký tài khoản từ phía người dùng ngoài hệ thống (Public Self-Registration).
* Quản lý phân quyền chi tiết tới cấp độ màn hình/tính năng (Permission Matrix) — thuộc các User Story khác trong Epic SCRUM-6.

---

## 4. Actor

Dựa trên nội dung thể hiện trực tiếp từ Jira, các tác nhân tham gia hệ thống gồm:

1. **Quản trị hệ thống (System Administrator / Admin):**
   * *Căn cứ Jira:* Được định danh trực tiếp trong câu mở đầu: *"Là Quản trị hệ thống..."*.
   * *Vai trò:* Người dùng nội bộ có quyền quản trị cao nhất, trực tiếp thao tác tra cứu, tìm kiếm, tạo mới và cập nhật thông tin tài khoản nhân viên.
2. **Nhân viên kinh doanh mới (New Sales Representative):**
   * *Căn cứ Jira:* Được thể hiện tại vế giá trị nghiệp vụ: *"...để cấp quyền cho nhân viên kinh doanh mới ngay ngày đầu họ nhận địa bàn"*.
   * *Vai trò:* Người thụ hưởng tài khoản; tiếp nhận email kích hoạt và mật khẩu tạm để đăng nhập vào hệ thống làm việc.
3. **Hệ thống gửi Email tự động (Notification / Email Service):**
   * *Căn cứ Jira:* Thể hiện tại yêu cầu: *"Tạo tài khoản gửi email kích hoạt kèm mật khẩu tạm"*.
   * *Vai trò:* Dịch vụ nền tảng ngầm chịu trách nhiệm xử lý hàng đợi, sinh mật khẩu tạm ngẫu nhiên và gửi thư kích hoạt tự động.

---

## 5. Business Requirements

* **BR-01 (Hiển thị & Tra cứu tài khoản):**
  * Hệ thống phải hiển thị danh sách người dùng dưới dạng bảng dữ liệu có phân trang, mặc định là **20 dòng/trang**.
  * Cho phép tìm kiếm kết hợp hoặc độc lập theo: Tên người dùng, Tên tài khoản, Số điện thoại.
  * Cho phép lọc danh sách theo: Vai trò và Trạng thái tài khoản.
* **BR-02 (Khởi tạo tài khoản & Cấp phát mật khẩu qua Email):**
  * Cho phép Quản trị viên nhập thông tin để tạo mới tài khoản cho nhân viên.
  * Cơ chế kiểm tra trùng lặp: Nếu thông tin bị trùng (Tên tài khoản, Email, Số điện thoại), hệ thống phải từ chối lưu và hiển thị thông báo lỗi cụ thể cho từng trường vi phạm.
  * Cơ chế cấp phát mật khẩu: Khi tài khoản được tạo thành công, hệ thống phải tự động sinh mật khẩu tạm thời ngẫu nhiên có độ phức tạp an toàn và tự động gửi email kích hoạt kèm mật khẩu tạm đến hộp thư của nhân viên.
* **BR-03 (Cập nhật thông tin người dùng):**
  * Quản trị viên có thể chỉnh sửa thông tin người dùng để phục vụ công tác điều chuyển hoặc cập nhật thông tin liên hệ.
  * *Lưu ý:* `[CẦN XÁC NHẬN]` Phạm vi chi tiết các trường được phép sửa.

---

## 6. Danh sách User Story

> **Ghi chú phân rã từ BA/PO:** Issue gốc **SCRUM-62** là một Compound Story lớn (8 Story Points), gộp 3 hành vi (Xem/Tìm kiếm, Tạo mới, Chỉnh sửa). Để đảm bảo nguyên tắc **INVEST** (đặc biệt là tính *Small* và *Independent*), issue được phân rã thành **03 User Story độc lập**:

| ID | User Story | Actor | Priority | Story Point | Dependency |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **US-001** | Xem danh sách, tìm kiếm và lọc tài khoản người dùng | Quản trị hệ thống | Must Have | 3 | Không có dependency |
| **US-002** | Tạo mới tài khoản người dùng & gửi email kích hoạt kèm mật khẩu tạm | Quản trị hệ thống | Must Have | 5 | Phụ thuộc danh mục Vai trò (Roles) |
| **US-003** | Cập nhật thông tin tài khoản người dùng | Quản trị hệ thống | Should Have | 2 | Phụ thuộc US-001, US-002 |

---

## 7. Chi tiết User Story

---

### US-001 — Xem danh sách, tìm kiếm và lọc tài khoản người dùng

**User Story**
> Với vai trò là **Quản trị hệ thống**,  
> tôi muốn **xem danh sách tài khoản có phân trang, tìm kiếm theo tên, tài khoản, số điện thoại và lọc theo vai trò, trạng thái**,  
> để **tôi có thể nhanh chóng tra cứu, kiểm tra và quản lý tình trạng tài khoản của toàn bộ nhân viên trong tổ chức**.

**Business Value**
Giúp Quản trị hệ thống tiết kiệm thời gian vận hành, tra cứu chính xác nhân sự cần cấp quyền hoặc xử lý thông tin mà không bị chậm trễ hay quá tải dữ liệu hiển thị.

**Preconditions**
- Quản trị hệ thống đã đăng nhập thành công với tài khoản có quyền Admin.
- Đang truy cập vào màn hình "Quản lý tài khoản" (User Management).

**Main Flow**
1. Quản trị hệ thống truy cập vào màn hình Quản lý tài khoản.
2. Hệ thống tải dữ liệu và hiển thị danh sách người dùng dưới dạng bảng với số lượng mặc định là **20 dòng/trang**.
3. Quản trị hệ thống nhập từ khóa tìm kiếm (Họ tên, Tên tài khoản hoặc Số điện thoại) và/hoặc chọn giá trị lọc (Vai trò, Trạng thái).
4. Hệ thống kiểm tra điều kiện lọc, truy vấn cơ sở dữ liệu và hiển thị danh sách kết quả phù hợp kèm thông tin phân trang cập nhật.
5. Quản trị hệ thống điều hướng qua các trang (Trang sau, Trang trước hoặc bấm số trang cụ thể).

**Alternative Flow**
1. Quản trị hệ thống xóa từ khóa tìm kiếm hoặc nhấn nút "Đặt lại bộ lọc" (Reset filter).
2. Hệ thống khôi phục danh sách hiển thị toàn bộ người dùng ở trang 1 với 20 dòng mặc định.

**Exception / Error Flow**
1. Không có tài khoản nào thỏa mãn điều kiện tìm kiếm/lọc $\rightarrow$ Hệ thống hiển thị trạng thái rỗng (Empty state) với thông báo: *"Không tìm thấy tài khoản người dùng nào phù hợp"*.
2. Lỗi gián đoạn đường truyền hoặc máy chủ $\rightarrow$ Hệ thống hiển thị thông báo lỗi: *"Không thể tải danh sách tài khoản, vui lòng thử lại sau"*.

---

### US-002 — Tạo mới tài khoản người dùng & gửi email kích hoạt kèm mật khẩu tạm

**User Story**
> Với vai trò là **Quản trị hệ thống**,  
> tôi muốn **tạo tài khoản mới cho nhân viên với cơ chế kiểm tra chống trùng lặp và tự động gửi email kích hoạt kèm mật khẩu tạm**,  
> để **nhân viên kinh doanh mới nhận được thông tin đăng nhập và có quyền làm việc ngay ngày đầu họ nhận địa bàn**.

**Business Value**
Tự động hóa hoàn toàn luồng cấp phát tài khoản ban đầu, rút ngắn thời gian chuẩn bị nhân sự mới, đồng thời bảo mật tuyệt đối mật khẩu ban đầu bằng phương thức gửi thẳng vào email của nhân viên.

**Preconditions**
- Quản trị hệ thống có quyền tạo mới tài khoản người dùng.
- Dịch vụ gửi Email tự động của hệ thống đang hoạt động bình thường.

**Main Flow**
1. Quản trị hệ thống bấm nút **"Thêm mới tài khoản"** trên giao diện danh sách.
2. Hệ thống hiển thị form nhập liệu tạo tài khoản (Họ tên, Tên tài khoản, Email, Số điện thoại, Vai trò,...).
3. Quản trị hệ thống nhập đầy đủ thông tin hợp lệ và bấm **"Lưu"** / **"Tạo tài khoản"**.
4. Hệ thống kiểm tra dữ liệu đầu vào (Validation) và kiểm tra tính duy nhất (Check trùng lặp): Tên tài khoản, Email, Số điện thoại.
5. Hệ thống ghi nhận tài khoản mới vào cơ sở dữ liệu với trạng thái ban đầu (ví dụ: *Chờ kích hoạt*).
6. Hệ thống tự động sinh một mật khẩu tạm thời ngẫu nhiên an toàn, mã hóa mật khẩu để lưu trữ và đẩy thông báo vào hàng đợi gửi email.
7. Dịch vụ Email gửi thư kích hoạt tài khoản kèm mật khẩu tạm thời đến địa chỉ email của nhân viên.
8. Hệ thống thông báo trên giao diện: *"Tạo tài khoản thành công. Email kích hoạt kèm mật khẩu tạm đã được gửi tới nhân viên."*, đồng thời đóng form và cập nhật danh sách hiển thị.

**Alternative Flow**
1. Quản trị hệ thống bấm nút "Hủy" trên form tạo tài khoản $\rightarrow$ Hệ thống đóng modal/form và không lưu dữ liệu.

**Exception / Error Flow**
1. **Trùng lặp Tên tài khoản (Username):** Hệ thống từ chối tạo và hiển thị lỗi cụ thể: *"Tên tài khoản đã tồn tại trên hệ thống. Vui lòng chọn tên khác."*
2. **Trùng lặp Email:** Hệ thống từ chối tạo và hiển thị lỗi cụ thể: *"Địa chỉ email này đã được sử dụng cho một tài khoản khác."*
3. **Trùng lặp Số điện thoại:** Hệ thống từ chối tạo và hiển thị lỗi cụ thể: *"Số điện thoại này đã được đăng ký trên hệ thống."*
   *(Lưu ý: Hệ thống giữ nguyên toàn bộ dữ liệu đã nhập trên form để Quản trị hệ thống không phải nhập lại).*
4. **Lỗi gửi email:** Tài khoản đã lưu vào cơ sở dữ liệu nhưng tiến trình gửi email gặp sự cố $\rightarrow$ Hệ thống hiển thị cảnh báo: *"Tạo tài khoản thành công nhưng gửi email kích hoạt thất bại. Vui lòng nhấn gửi lại email từ danh sách."*

---

### US-003 — Cập nhật thông tin tài khoản người dùng `[CẦN XÁC NHẬN CHI TIẾT]`

**User Story**
> Với vai trò là **Quản trị hệ thống**,  
> tôi muốn **chỉnh sửa thông tin tài khoản của nhân viên**,  
> để **kịp thời cập nhật lại thông tin cá nhân, phân quyền lại vai trò hoặc thay đổi trạng thái khi nhân viên có sự thay đổi về địa bàn hoặc vị trí công tác**.

**Business Value**
Duy trì dữ liệu nhân sự luôn chính xác và cập nhật, cho phép linh hoạt điều chuyển quyền hạn của nhân viên kinh doanh giữa các địa bàn.

**Preconditions**
- Quản trị hệ thống có quyền chỉnh sửa tài khoản.
- Tài khoản cần sửa đang tồn tại trên hệ thống.

**Main Flow**
1. Quản trị hệ thống tìm kiếm tài khoản cần sửa trên danh sách và bấm nút **"Chỉnh sửa"** (Edit).
2. Hệ thống hiển thị form cập nhật với đầy đủ dữ liệu hiện tại của tài khoản đó.
3. Quản trị hệ thống thay đổi các thông tin cho phép sửa (Họ tên, Số điện thoại, Vai trò, Trạng thái,...). *(Tên tài khoản/Username khóa cố định)*.
4. Quản trị hệ thống bấm **"Lưu thay đổi"**.
5. Hệ thống kiểm tra tính hợp lệ và kiểm tra trùng lặp Email/SĐT (loại trừ chính tài khoản đang sửa).
6. Hệ thống lưu dữ liệu cập nhật, ghi log lịch sử và hiển thị thông báo: *"Cập nhật tài khoản thành công"*.

**Alternative Flow**
1. Quản trị hệ thống bấm "Hủy" $\rightarrow$ Hệ thống đóng form và giữ nguyên dữ liệu ban đầu.

**Exception / Error Flow**
1. Email hoặc Số điện thoại chỉnh sửa bị trùng với một tài khoản khác đang có $\rightarrow$ Hệ thống báo lỗi trùng lặp và từ chối lưu thay đổi.

---

## 8. Acceptance Criteria

### Dành cho US-001 (Xem danh sách, tìm kiếm & phân trang)

#### Acceptance Criteria

**AC1 — Phân trang danh sách mặc định 20 dòng**
- **Given:** Quản trị hệ thống đã đăng nhập và truy cập vào màn hình Quản lý tài khoản.
- **When:** Danh sách người dùng được tải lần đầu hoặc khi đặt lại bộ lọc.
- **Then:** Hệ thống hiển thị tối đa **20 dòng tài khoản trên một trang** theo mặc định, kèm thanh điều hướng phân trang hiển thị rõ ràng tổng số trang và tổng số bản ghi.

**AC2 — Tìm kiếm theo Tên, Tên tài khoản, Số điện thoại**
- **Given:** Quản trị hệ thống đang ở màn hình danh sách tài khoản.
- **When:** Nhập từ khóa tìm kiếm (hỗ trợ tìm kiếm không phân biệt hoa thường với Họ tên, Tên tài khoản hoặc Số điện thoại) và nhấn Tìm kiếm/Enter.
- **Then:** Hệ thống trả về danh sách các tài khoản có chứa từ khóa khớp với ít nhất một trong ba trường trên; phân trang tự động tính toán lại theo số kết quả tìm được.

**AC3 — Lọc danh sách theo Vai trò và Trạng thái**
- **Given:** Quản trị hệ thống đang ở màn hình danh sách tài khoản.
- **When:** Chọn một hoặc nhiều giá trị trong bộ lọc "Vai trò" (ví dụ: Nhân viên kinh doanh, Quản trị hệ thống...) và/hoặc "Trạng thái" (ví dụ: Đang hoạt động, Chờ kích hoạt, Bị khóa...).
- **Then:** Hệ thống lọc và chỉ hiển thị các tài khoản thỏa mãn đồng thời các điều kiện lọc được chọn.

**AC4 — Kết hợp cả Tìm kiếm và Bộ lọc**
- **Given:** Quản trị hệ thống vừa nhập từ khóa tìm kiếm vừa chọn bộ lọc Vai trò hoặc Trạng thái.
- **When:** Nhấn thực hiện tìm kiếm.
- **Then:** Hệ thống chỉ hiển thị những bản ghi thỏa mãn đồng thời cả từ khóa tìm kiếm VÀ các giá trị lọc đã chọn.

**AC5 — Không có kết quả tìm kiếm (Empty State)**
- **Given:** Quản trị hệ thống nhập từ khóa hoặc điều kiện lọc không tồn tại trong hệ thống.
- **When:** Hệ thống thực hiện truy vấn.
- **Then:** Màn hình hiển thị thông báo *"Không tìm thấy tài khoản người dùng nào phù hợp"* thay vì hiển thị một bảng trống không có phản hồi.

---

### Dành cho US-002 (Tạo mới tài khoản & Gửi email kích hoạt)

#### Acceptance Criteria

**AC1 — Từ chối tài khoản trùng kèm thông báo cụ thể**
- **Given:** Quản trị hệ thống đang ở màn hình form tạo mới tài khoản.
- **When:** Nhập thông tin có Tên tài khoản (Username), Email hoặc Số điện thoại đã tồn tại trong hệ thống và nhấn "Lưu".
- **Then:** Hệ thống từ chối lưu dữ liệu, giữ nguyên các trường đã nhập trên form và hiển thị thông báo lỗi cụ thể ngay tại trường vi phạm:
  - Nếu trùng Tên tài khoản: Hiển thị lỗi *"Tên tài khoản đã tồn tại"*.
  - Nếu trùng Email: Hiển thị lỗi *"Email đã được sử dụng"*.
  - Nếu trùng Số điện thoại: Hiển thị lỗi *"Số điện thoại đã được đăng ký"*.

**AC2 — Tạo tài khoản thành công & Tự động sinh mật khẩu tạm**
- **Given:** Quản trị hệ thống nhập đầy đủ các trường thông tin hợp lệ và không trùng lặp.
- **When:** Nhấn nút "Lưu" / "Tạo tài khoản".
- **Then:** Hệ thống tạo mới bản ghi tài khoản vào cơ sở dữ liệu với trạng thái ban đầu, đồng thời tự động sinh mật khẩu tạm thời ngẫu nhiên có độ dài tối thiểu 8 ký tự gồm cả chữ hoa, chữ thường, số và ký tự đặc biệt (được mã hóa bảo mật khi lưu trữ).

**AC3 — Tự động gửi email kích hoạt kèm mật khẩu tạm**
- **Given:** Tài khoản người dùng được tạo mới thành công trong hệ thống.
- **When:** Quá trình lưu tài khoản hoàn tất.
- **Then:** Hệ thống tự động gửi một email kích hoạt đến đúng địa chỉ email đã đăng ký của nhân viên, nội dung email bao gồm: Lời chào, Tên tài khoản, Mật khẩu tạm thời, Đường link đăng nhập và hướng dẫn bắt buộc đổi mật khẩu trong lần đăng nhập đầu tiên.

**AC4 — Xử lý lỗi khi dịch vụ gửi email gặp sự cố**
- **Given:** Tài khoản đã được lưu vào cơ sở dữ liệu nhưng kết nối tới dịch vụ email bị lỗi.
- **When:** Gửi email thất bại.
- **Then:** Hệ thống cảnh báo rõ ràng trên giao diện cho Quản trị hệ thống: *"Tạo tài khoản thành công nhưng gửi email kích hoạt thất bại. Vui lòng gửi lại email sau."*, đồng thời cung cấp nút "Gửi lại email kích hoạt" trên bảng danh sách.

---

### Dành cho US-003 (Cập nhật thông tin tài khoản người dùng)

#### Acceptance Criteria

**AC1 — Tải dữ liệu hiện tại lên form chỉnh sửa**
- **Given:** Quản trị hệ thống bấm nút "Chỉnh sửa" tại một dòng tài khoản trên danh sách.
- **When:** Form chỉnh sửa tài khoản hiển thị.
- **Then:** Toàn bộ thông tin hiện tại của tài khoản đó (Họ tên, Tên tài khoản, Email, Số điện thoại, Vai trò, Trạng thái) được điền chính xác vào các trường nhập liệu tương ứng.

**AC2 — Khóa trường Tên tài khoản (Read-only)**
- **Given:** Form chỉnh sửa tài khoản đang hiển thị.
- **When:** Quản trị hệ thống kiểm tra trường Tên tài khoản (Username).
- **Then:** Trường Tên tài khoản ở trạng thái khóa (Disabled / Read-only) để đảm bảo định danh người dùng không bị thay đổi.

**AC3 — Cập nhật thông tin thành công**
- **Given:** Quản trị hệ thống thay đổi các thông tin hợp lệ (Họ tên, SĐT, Email, Vai trò, Trạng thái) và không bị trùng lặp với người dùng khác.
- **When:** Nhấn nút "Lưu thay đổi".
- **Then:** Dữ liệu mới được cập nhật vào cơ sở dữ liệu và màn hình danh sách tài khoản hiển thị ngay thông tin mới nhất.

---

## 9. Technical Tasks

### Technical Tasks cho US-001 (Xem danh sách, tìm kiếm & phân trang)
- `TASK-001`: Thiết kế giao diện UI/UX bảng danh sách tài khoản (Table), thanh tìm kiếm (Search bar) và các dropdown bộ lọc (Vai trò, Trạng thái).
- `TASK-002`: Xây dựng component Phân trang (Pagination) ở Frontend với giá trị mặc định `pageSize = 20`.
- `TASK-003`: Xây dựng Backend API `GET /api/v1/users` hỗ trợ các tham số: `search` (name, username, phone), `role`, `status`, `page`, `pageSize` (default: 20).
- `TASK-004`: Tạo Database Migration và đánh Index tối ưu truy vấn cho các cột: `username`, `phone`, `full_name`, `role_id`, `status`.
- `TASK-005`: Viết Unit Test và Integration Test cho API tìm kiếm, lọc và phân trang.

### Technical Tasks cho US-002 (Tạo mới tài khoản & Gửi email kích hoạt)
- `TASK-006`: Xây dựng modal/form Frontend "Thêm mới tài khoản" kèm validation rules (bắt buộc, định dạng email RFC 5322, định dạng số điện thoại Việt Nam).
- `TASK-007`: Xây dựng Backend API `POST /api/v1/users` thực hiện kiểm tra trùng lặp độc lập (`username`, `email`, `phone`) và trả về mã lỗi chi tiết.
- `TASK-008`: Xây dựng service sinh mật khẩu tạm ngẫu nhiên bảo mật (Secure Random Password Generator) và cơ chế băm mật khẩu (BCrypt/Argon2).
- `TASK-009`: Tích hợp dịch vụ hàng đợi (Message Queue: RabbitMQ / BullMQ) và dịch vụ Email (SMTP / SES) để xử lý gửi email kích hoạt bất đồng bộ.
- `TASK-010`: Xây dựng HTML Email Template thông báo kích hoạt tài khoản kèm mật khẩu tạm thời.
- `TASK-011`: Xử lý ánh xạ (mapping) thông báo lỗi trùng lặp từ Backend API hiển thị trực quan dưới từng field tương ứng trên form Frontend.
- `TASK-012`: Viết Unit Test và Integration Test kiểm tra luồng tạo tài khoản, kiểm tra chống trùng lặp và xác thực tiến trình gửi email.

### Technical Tasks cho US-003 (Cập nhật thông tin tài khoản)
- `TASK-013`: Xây dựng modal/form Frontend "Chỉnh sửa tài khoản", load dữ liệu chi tiết của người dùng và disable trường Username.
- `TASK-014`: Xây dựng Backend API `PUT /api/v1/users/{id}` kèm logic kiểm tra trùng lặp email/phone có loại trừ chính User ID đang sửa (`excludeCurrentUserId`).
- `TASK-015`: Viết Unit Test và Integration Test cho chức năng cập nhật thông tin tài khoản.

---

## 10. Dependency

* **US-001 (Xem danh sách, tìm kiếm & phân trang):**
  - **Dependency:** Không có dependency. Có thể phát triển độc lập đầu tiên làm tiền đề cho màn hình quản trị.
* **US-002 (Tạo mới tài khoản & Gửi email kích hoạt):**
  - **Dependency:** 
    - Phụ thuộc vào danh mục **Vai trò (Roles)** từ Epic `SCRUM-6` để có dữ liệu cấp quyền cho "Nhân viên kinh doanh".
    - Tương tác giao diện với **US-001** (tạo tài khoản thành công sẽ làm mới và hiển thị trên bảng của US-001).
* **US-003 (Cập nhật thông tin tài khoản):**
  - **Dependency:** 
    - Phụ thuộc **US-001** (cần bảng danh sách để kích hoạt hành động sửa).
    - Phụ thuộc **US-002** (cần cấu trúc dữ liệu tài khoản và các rule validation đã định nghĩa).

---

## 11. Priority

Xếp hạng độ ưu tiên theo phương pháp **MoSCoW**, căn cứ trên mục tiêu Sprint trong Jira:

* **US-001 (Xem danh sách, tìm kiếm & phân trang 20 dòng):** **Must Have**  
  * *Lý do:* Chức năng hiển thị và tra cứu nền tảng bắt buộc phải có để kiểm tra, giám sát toàn bộ người dùng trong hệ thống.
* **US-002 (Tạo tài khoản, check trùng & gửi mail mật khẩu tạm):** **Must Have**  
  * *Lý do:* Nhu cầu cốt lõi nhất của Sprint nhằm *"cấp quyền cho nhân viên kinh doanh mới ngay ngày đầu họ nhận địa bàn"*.
* **US-003 (Cập nhật thông tin tài khoản):** **Should Have**  
  * *Lý do:* Cần thiết để hoàn thiện chu trình CRUD tài khoản, tuy nhiên phần Description trên Jira chưa có đặc tả chi tiết nên xếp sau US-001 và US-002 để chờ PO xác nhận phạm vi.

---

## 12. Story Point

Ước lượng độ phức tạp theo dãy Fibonacci (**Tổng estimate ban đầu của SCRUM-62 trong Jira là 8 Story Points**):

| User Story | Story Point | Lý do đánh giá |
| :--- | :---: | :--- |
| **US-001** | **3** | Giao diện bảng danh sách chuẩn, logic phân trang và tìm kiếm/lọc phổ biến, không có tích hợp dịch vụ bên thứ ba. |
| **US-002** | **5** | Đòi hỏi xử lý logic kiểm tra trùng lặp đa trường, sinh mật khẩu tạm bảo mật và tích hợp hệ thống gửi email bất đồng bộ. |
| **US-003** | **2** | Tái sử dụng form và validation từ US-002, chỉ bổ sung logic update và kiểm tra trùng lặp loại trừ bản thân. *(Có thể điều chỉnh sau khi PO chốt scope)*. |

> **Tổng Story Points cốt lõi:** 3 + 5 = **8 Story Points** (Hoàn toàn trùng khớp với Story Point Estimate ban đầu của Issue SCRUM-62 trên Jira).

---

## 13. Traceability Matrix

Bảng đối chiếu đảm bảo **100% yêu cầu trong Sprint Jira** được ánh xạ đầy đủ sang User Story, Acceptance Criteria và Technical Tasks:

| Yêu cầu trong Sprint Jira (SCRUM-62) | User Story ánh xạ | Acceptance Criteria | Technical Tasks |
| :--- | :--- | :--- | :--- |
| **Tìm theo tên, tài khoản, số điện thoại; lọc theo vai trò và trạng thái** | **US-001** | AC2, AC3, AC4, AC5 | `TASK-001`, `TASK-003`, `TASK-004`, `TASK-005` |
| **Danh sách phân trang, mặc định 20 dòng** | **US-001** | AC1 | `TASK-002`, `TASK-003` |
| **Tạo tài khoản gửi email kích hoạt kèm mật khẩu tạm** | **US-002** | AC2, AC3, AC4 | `TASK-006`, `TASK-007`, `TASK-008`, `TASK-009`, `TASK-010`, `TASK-012` |
| **Tài khoản trùng bị từ chối kèm thông báo cụ thể** | **US-002** | AC1 | `TASK-006`, `TASK-007`, `TASK-011`, `TASK-012` |
| **"Sửa... tài khoản người dùng"** *(trong Tiêu đề SCRUM-62)* | **US-003** | AC1, AC2, AC3 | `TASK-013`, `TASK-014`, `TASK-015` |

---

## 14. Kiểm tra INVEST

Đánh giá chất lượng của từng User Story dựa trên tiêu chuẩn Agile/Scrum INVEST:

| User Story | Independent | Negotiable | Valuable | Estimable | Small | Testable | Kết quả | Ghi chú từ BA/PO |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **SCRUM-62 (Gốc)** | ❌ | ⚠️ | ✅ | ⚠️ (8 pts) | ❌ | ⚠️ | **Chưa đạt** | Gộp cả 3 thao tác Tạo, Sửa, Tìm kiếm; thiếu mô tả phần Sửa; cần phân rã. |
| **US-001 (Xem & Tra cứu)** | ✅ | ✅ | ✅ | ✅ (3 pts) | ✅ | ✅ | **ĐẠT** | Phạm vi độc lập, tiêu chí kiểm thử rõ ràng theo từng AC. |
| **US-002 (Tạo mới & Gửi mail)** | ✅ | ✅ | ✅ | ✅ (5 pts) | ✅ | ✅ | **ĐẠT** | Đáp ứng trực tiếp mục tiêu cấp quyền ngày đầu cho Sales. |
| **US-003 (Chỉnh sửa)** | ✅ | ✅ | ✅ | ⚠️ (2 pts) | ✅ | ✅ | **ĐẠT CÓ ĐIỀU KIỆN** | Cần PO xác nhận danh sách các trường được phép sửa trước khi triển khai. |

---

## 15. Các vấn đề cần xác nhận

### [CẦN PO XÁC NHẬN]
1. **Phạm vi chi tiết chức năng "Chỉnh sửa tài khoản":**  
   - Tiêu đề issue có ghi *"tạo, sửa và tìm kiếm"*, nhưng mục Description hoàn toàn không đề cập đến chức năng **Sửa**.
   - *Câu hỏi:* Những trường thông tin nào được phép sửa? Trường Tên tài khoản (Username) có được phép sửa không? Có cho phép đổi vai trò và đổi trạng thái (Active/Inactive) tại màn hình sửa không?
2. **Quy định về Mật khẩu tạm và Thời hạn kích hoạt:**  
   - Mật khẩu tạm thời gửi qua email có thời hạn hết hạn (TTL) không (ví dụ: hết hạn sau 24h hoặc 48h)?
   - Khi nhân viên đăng nhập lần đầu bằng mật khẩu tạm, hệ thống có bắt buộc chuyển hướng ngay sang màn hình **"Đổi mật khẩu mới"** không?
3. **Quy tắc kiểm tra trùng lặp tài khoản:**  
   - Cần xác nhận rõ ràng các trường dữ liệu xét tính duy nhất: Kiểm tra trùng độc lập cả 3 trường: Tên tài khoản, Email và Số điện thoại, hay chỉ kiểm tra Tên tài khoản?

### [CẦN BA XÁC NHẬN]
1. **Danh mục Vai trò (Roles) và Trạng thái (Statuses):**  
   - Danh sách "Vai trò" gồm những giá trị cụ thể nào ngoài "Nhân viên kinh doanh"? (Ví dụ: Quản trị hệ thống, Quản lý vùng, Nhân viên kinh doanh,...).
   - Danh sách "Trạng thái" gồm những trạng thái nào? (Đề xuất: *Chờ kích hoạt*, *Đang hoạt động*, *Tạm khóa*, *Ngừng hoạt động*).
2. **Mẫu Email Template kích hoạt:**  
   - Đã có mẫu Email Template kích hoạt chuẩn của công ty chưa, hay Developer tự thiết kế mẫu cơ bản?

### [CẦN DEV TEAM XÁC NHẬN]
1. **Cấu hình hạ tầng Dịch vụ Email:**  
   - Dự án sẽ sử dụng SMTP nội bộ, Amazon SES, SendGrid hay giải pháp nào để gửi email?
   - Cần kiểm tra giới hạn gửi thư (Rate limit) để đảm bảo không bị nghẽn khi tạo nhiều tài khoản cùng lúc.
2. **Ước lượng lại Story Points:**  
   - Dev team xác nhận mức phân bổ 3 Story Points (US-001) và 5 Story Points (US-002) có phù hợp với năng lực kỹ thuật hiện tại của Sprint không.
