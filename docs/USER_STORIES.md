# USER STORIES

## 1. Thông tin Sprint

| Thuộc tính | Nội dung |
|---|---|
| Sprint | Sprint 1: Tài khoản & phân quy... *(phần tên Sprint bị cắt trong ảnh)* |
| Sprint Title | Sprint 1: Tài khoản & phân quy... *(cần xác nhận phần tên bị cắt)* |
| Sprint Description | Không hiển thị đầy đủ trong ảnh được cung cấp; nội dung yêu cầu thể hiện qua issue SCRUM-53. |
| Epic/Feature | SCRUM-6 — Tài khoản, Phân quy... *(tên Parent bị cắt trong ảnh)* |
| Mục tiêu | Duy trì phiên đăng nhập và hỗ trợ đăng xuất an toàn để tránh mất đơn đang dở khi mạng tại cửa hàng chập chờn. |
| Phạm vi | Gia hạn phiên khi còn hoạt động; vô hiệu hóa phiên ngay lập tức khi đăng xuất; đưa người dùng về trang đăng nhập khi phiên hết hạn và hiển thị thông báo rõ ràng. |
| Jira Issue | SCRUM-53 |
| Trạng thái | In Progress |
| Assignee | DUONG VAN TUAN |
| Priority trên Jira | Medium |

## 2. Mục tiêu Sprint

Trong phạm vi issue **SCRUM-53**, người dùng cần duy trì phiên đăng nhập ổn định khi phiên vẫn còn hoạt động, có thể đăng xuất an toàn và được xử lý rõ ràng khi phiên hết hạn. Mục tiêu nghiệp vụ trực tiếp được thể hiện trong Jira là giảm nguy cơ mất đơn đang dở khi mạng tại cửa hàng chập chờn.

## 3. Phạm vi Sprint

### Trong phạm vi

- Phiên được gia hạn tự động khi còn hoạt động.
- Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server.
- Khi phiên hết hạn, hệ thống đưa người dùng về trang đăng nhập và hiển thị thông báo rõ ràng.

### Ngoài phạm vi

Không có chức năng ngoài ba yêu cầu trên được thể hiện trong ảnh. Không bổ sung thêm chức năng nghiệp vụ khác.

## 4. Actor

| Actor | Vai trò |
|---|---|
| Người dùng hệ thống | Duy trì phiên đăng nhập, đăng xuất và tiếp tục làm việc trong điều kiện mạng chập chờn. |

## 5. Business Requirements

| ID | Business Requirement |
|---|---|
| BR-001 | Phiên được gia hạn tự động khi còn hoạt động. |
| BR-002 | Đăng xuất phải làm mất hiệu lực phiên ngay lập tức phía server. |
| BR-003 | Khi phiên hết hạn, hệ thống phải đưa người dùng về trang đăng nhập kèm thông báo rõ ràng. |

## 6. Danh sách User Story

| ID User Story | Actor | Priority | Story Point | Dependency |
|---|---|---|---|---|
| US-001 | Người dùng hệ thống | [CẦN PO XÁC NHẬN] | [CẦN DEV TEAM ESTIMATE] | Không có dependency được thể hiện trong Jira; thuộc Parent SCRUM-6. |

> **Lưu ý về Priority:** Jira hiển thị `Medium`, nhưng ảnh không cung cấp quy tắc ánh xạ `Medium` sang `Must Have / Should Have / Could Have / Won't Have`. Vì vậy không tự quy đổi; cần PO xác nhận.

## 7. Chi tiết User Story

### US-001 — Duy trì phiên đăng nhập và đăng xuất an toàn

**User Story**

> Với vai trò là **người dùng hệ thống**,  
> tôi muốn **duy trì phiên đăng nhập và đăng xuất an toàn**,  
> để **không mất đơn đang dở khi mạng ở cửa hàng chập chờn**.

**Business Value**

Giúp người dùng tiếp tục sử dụng hệ thống khi phiên vẫn còn hoạt động, chấm dứt phiên ngay khi đăng xuất và được thông báo rõ ràng khi phiên hết hạn, qua đó hỗ trợ tránh mất công việc/đơn đang dở trong điều kiện mạng chập chờn.

**Preconditions**

- Người dùng đã đăng nhập vào hệ thống.
- Phiên đăng nhập đang hoạt động.

**Main Flow**

1. Người dùng đang sử dụng hệ thống với phiên đăng nhập còn hoạt động.
2. Hệ thống tự động gia hạn phiên khi phiên vẫn còn hoạt động.
3. Người dùng có thể tiếp tục làm việc trong phiên được duy trì.
4. Khi người dùng thực hiện đăng xuất, hệ thống làm mất hiệu lực phiên ngay lập tức phía server.

**Alternative Flow**

1. Trong quá trình sử dụng, nếu phiên không còn đáp ứng điều kiện duy trì, hệ thống xử lý theo luồng hết hạn phiên.
2. Người dùng được đưa về trang đăng nhập và nhận thông báo rõ ràng.

**Exception / Error Flow**

1. Khi phiên hết hạn, người dùng không tiếp tục sử dụng phiên cũ.
2. Hệ thống chuyển người dùng về trang đăng nhập và hiển thị thông báo rõ ràng về trạng thái phiên.

#### Acceptance Criteria

**AC1 — Tự động gia hạn phiên khi còn hoạt động**

- **Given:** Người dùng đã đăng nhập và phiên vẫn còn hoạt động.
- **When:** Người dùng tiếp tục sử dụng hệ thống.
- **Then:** Hệ thống tự động gia hạn phiên theo yêu cầu của Sprint.

**AC2 — Đăng xuất vô hiệu hóa phiên phía server**

- **Given:** Người dùng đang có một phiên đăng nhập hợp lệ.
- **When:** Người dùng thực hiện đăng xuất.
- **Then:** Phiên phải mất hiệu lực ngay lập tức phía server.

**AC3 — Phiên hết hạn đưa về trang đăng nhập**

- **Given:** Phiên đăng nhập đã hết hạn.
- **When:** Người dùng tiếp tục truy cập hệ thống bằng phiên đã hết hạn.
- **Then:** Hệ thống đưa người dùng về trang đăng nhập.

**AC4 — Hiển thị thông báo rõ ràng khi phiên hết hạn**

- **Given:** Phiên đăng nhập đã hết hạn.
- **When:** Hệ thống xử lý trạng thái phiên hết hạn.
- **Then:** Trang đăng nhập được hiển thị kèm thông báo rõ ràng cho người dùng.

**AC5 — Không duy trì phiên sau khi đăng xuất**

- **Given:** Người dùng đã đăng xuất thành công.
- **When:** Người dùng tiếp tục thực hiện yêu cầu bằng phiên vừa đăng xuất.
- **Then:** Phiên cũ không còn hiệu lực phía server.

#### Technical Tasks

- TASK-001: Implement cơ chế tự động gia hạn phiên khi phiên còn hoạt động.
- TASK-002: Implement xử lý đăng xuất làm mất hiệu lực phiên ngay lập tức phía server.
- TASK-003: Implement xử lý trạng thái phiên hết hạn và điều hướng về trang đăng nhập.
- TASK-004: Implement thông báo rõ ràng khi phiên hết hạn.
- TASK-005: Viết test cho gia hạn phiên, đăng xuất và phiên hết hạn theo các Acceptance Criteria.

## 8. Acceptance Criteria

Acceptance Criteria của **US-001** gồm:

- **AC1:** Gia hạn tự động khi phiên còn hoạt động.
- **AC2:** Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server.
- **AC3:** Phiên hết hạn đưa người dùng về trang đăng nhập.
- **AC4:** Phiên hết hạn phải đi kèm thông báo rõ ràng.
- **AC5:** Phiên cũ không còn hiệu lực sau khi người dùng đăng xuất.

## 9. Technical Tasks

| Task ID | Task | User Story |
|---|---|---|
| TASK-001 | Tự động gia hạn phiên khi phiên còn hoạt động | US-001 |
| TASK-002 | Vô hiệu hóa phiên ngay lập tức phía server khi đăng xuất | US-001 |
| TASK-003 | Xử lý phiên hết hạn và điều hướng về trang đăng nhập | US-001 |
| TASK-004 | Hiển thị thông báo rõ ràng khi phiên hết hạn | US-001 |
| TASK-005 | Kiểm thử các luồng phiên theo Acceptance Criteria | US-001 |

## 10. Dependency

- Không có dependency giữa các User Story được thể hiện trong ảnh.
- **Parent:** SCRUM-6 — Tài khoản, Phân quy... *(phần tên bị cắt trong ảnh)*.

## 11. Priority

| User Story | Priority trên Jira | Priority theo hệ Must/Should/Could/Won't |
|---|---|---|
| US-001 | Medium | [CẦN PO XÁC NHẬN] |

## 12. Story Point

| User Story | Story Point |
|---|---|
| US-001 | [CẦN DEV TEAM ESTIMATE] |

Không quy đổi Story Point thành số giờ.

## 13. Traceability Matrix

| Sprint Requirement | User Story | Acceptance Criteria | Technical Tasks |
|---|---|---|---|
| BR-001 — Phiên được gia hạn tự động khi còn hoạt động. | US-001 | AC1 | TASK-001, TASK-005 |
| BR-002 — Đăng xuất làm mất hiệu lực phiên ngay lập tức phía server. | US-001 | AC2, AC5 | TASK-002, TASK-005 |
| BR-003 — Phiên hết hạn đưa về trang đăng nhập kèm thông báo rõ ràng. | US-001 | AC3, AC4 | TASK-003, TASK-004, TASK-005 |

**Đối chiếu phạm vi:** 3/3 yêu cầu được ánh xạ vào User Story; không có yêu cầu Sprint nào trong ảnh bị bỏ sót.

## 14. Kiểm tra INVEST

| User Story | Independent | Negotiable | Valuable | Estimable | Small | Testable | Kết quả |
|---|---|---|---|---|---|---|---|
| US-001 | Một phần | Có | Có | Chưa đủ dữ liệu estimate | Có thể triển khai trong một phạm vi nhỏ | Có | Đạt có điều kiện; cần DEV estimate Story Point và PO xác nhận Priority. |

> **Ghi chú INVEST:** US-001 bao gồm ba hành vi liên quan chặt chẽ đến cùng một mục tiêu phiên đăng nhập. Vì Sprint Jira chỉ thể hiện một issue duy nhất cho nhóm yêu cầu này, không tự tách thành User Story khác để tránh mở rộng phạm vi. Các kỹ thuật triển khai được giữ dưới dạng Technical Task.

## 15. Các vấn đề cần xác nhận

### [CẦN PO XÁC NHẬN]

- Tên đầy đủ của Sprint và Parent SCRUM-6 bị cắt trong ảnh; cần xác nhận phần còn thiếu sau `Tài khoản & phân quy...` / `Tài khoản, Phân quy...`.
- Mapping từ Priority `Medium` của Jira sang một giá trị trong `Must Have / Should Have / Could Have / Won't Have` chưa được cung cấp.
- Thời điểm và điều kiện chi tiết của việc "gia hạn tự động khi còn hoạt động" chưa được định nghĩa trong ảnh (ví dụ ngưỡng hoặc thời lượng gia hạn). Không tự suy diễn thêm.

### [CẦN BA XÁC NHẬN]

- Câu chữ tiêu đề trong ảnh hiển thị `mạng ở cửa hàng chập chờn`; tài liệu sử dụng cách viết này để giữ đúng ý nghĩa đọc được từ ảnh.
- "Thông báo rõ ràng" chưa có nội dung/message cụ thể trong Jira; cần xác nhận câu thông báo nếu QA cần kiểm thử theo text chính xác.

### [CẦN DEV TEAM XÁC NHẬN]

- Story Point cho US-001.
- Cách triển khai kỹ thuật cụ thể của cơ chế gia hạn, vô hiệu hóa phiên phía server và xử lý phiên hết hạn.
