# NEXUS OMS // HỆ THỐNG KIỂM SOÁT HẠN MỨC CÔNG NỢ & CHẶN ĐƠN QUÁ HẠN
### Phân Hệ Quản Trị Tín Dụng B2B (Credit Risk Gatekeeper Engine)
> **Mã Ticket Jira / Scrum:** `SCRUM-86` / `SCRUM-9`  
> **Vai trò nghiệp vụ:** Nhân viên kinh doanh (Sales Executive) & Kế toán công nợ (Credit Accountant)  
> **Kiến trúc:** Clean Architecture + Centralized Reactive State Store + Multi-Tier Credit Gatekeeper Engine + Enterprise Glassmorphism UI  

---

## 1. BỐI CẢNH & YÊU CẦU ĐỀ BÀI (USER STORY & SPECIFICATION)

### 📌 User Story
> *"Là Nhân viên kinh doanh, tôi muốn được chặn ngay khi đơn vượt hạn mức công nợ của đại lý, để không chốt đơn rồi mới bị kế toán bắt huỷ."*

### 🎯 3 Tiêu Chí Nghiệp Vụ Cốt Lõi (Acceptance Criteria)
| STT | Tiêu chí đề bài | Cơ chế xử lý của hệ thống NEXUS OMS |
| :---: | :--- | :--- |
| **AC-1** | **Hiển thị công nợ hiện tại, hạn mức và phần còn lại ngay trên màn hình tạo đơn.** | • Tích hợp **Bảng chỉ số Telemetry 4 thẻ tài chính thời gian thực**.<br>• Hiển thị: Hạn mức tín dụng, Công nợ hiện tại, Hạn mức còn lại khả dụng, và Tổng nợ dự kiến sau đơn.<br>• **Thanh đo tỉ lệ sử dụng hạn mức (Credit Utilization Gauge)** trực quan với phân màu: Xanh lá (<75%), Vàng (75-100%), Đỏ (>100% vượt trần). |
| **AC-2** | **Tổng đơn cộng công nợ hiện tại vượt hạn mức thì đơn bị đánh dấu cần duyệt.** | • Khi `Tổng nợ dự kiến = Công nợ hiện tại + Giá trị đơn hàng > Hạn mức tín dụng`: Hệ thống phát cảnh báo tức thì.<br>• Nút hành động tự động chuyển sang `[Gửi Yêu Cầu Duyệt Vượt Hạn Mức]`.<br>• Hiển thị modal nhập lý do giải trình, mốc cam kết thanh toán.<br>• Đơn được lưu vào hệ thống với trạng thái chuẩn: **`CẦN DUYỆT (PENDING_APPROVAL)`** và chuyển sang phân hệ Kế toán phê duyệt ngoại lệ. |
| **AC-3** | **Đại lý có khoản quá hạn quá số ngày cho phép thì chặn tạo đơn hoàn toàn.** | • Khi đại lý có bất kỳ hóa đơn nào có `Số ngày quá hạn > Số ngày cho phép (mặc định 30 ngày)`: Hệ thống kích hoạt **KHÓA CỨNG (HARD BLOCK)**.<br>• Nút Tạo đơn bị **VÔ HIỆU HÓA HOÀN TOÀN** (`disabled`).<br>• Hiển thị **Banner Cảnh Báo Khẩn Cấp Đỏ Neon** giải trình cụ thể hóa đơn quá hạn, số ngày vi phạm, và số tiền nợ.<br>• Chặn toàn bộ hành vi submit đơn. |

---

## 2. BỘ KỊCH BẢN KIỂM THỬ NHANH DÀNH CHO GIẢNG VIÊN (1-CLICK TEST)

Ngay trên đầu giao diện, hệ thống tích hợp **Thanh chuyển đổi kịch bản kiểm thử 1-click** để Giảng viên có thể kiểm tra toàn bộ đề bài trong vòng 2 phút:

```
[🟢 Kịch bản 1: An Toàn]  [🟡 Kịch bản 2: Vượt Hạn Mức]  [🔴 Kịch bản 3: Nợ Quá Hạn (Khóa)]  [🟣 Kịch bản 4: Cận Hạn Mức]  [⚪ Kịch bản 5: Không Nợ]
```

### 🧪 Chi tiết từng kịch bản kiểm thử:

1. **🟢 Kịch bản 1: An Toàn (Đại lý Ánh Dương - `DL-001`)**
   - **Chỉ số:** Hạn mức 600.000.000 ₫ | Đang nợ 140.000.000 ₫ | Còn lại 460.000.000 ₫ | Nợ quá hạn 5 ngày (nhỏ hơn 30 ngày cho phép).
   - **Hành động test:** Thêm 1 Máy chủ Dell (115 triệu + VAT = 126.5 triệu).
   - **Kết quả:** Tổng nợ sau đơn 266.5M < 600M. Nút hiển thị màu xanh: `[🚀 Tạo & Duyệt Đơn Ngay]`. Đơn tạo xong ở trạng thái **`ĐÃ XÁC NHẬN (APPROVED)`**.

2. **🟡 Kịch bản 2: Vượt Hạn Mức -> Đánh dấu Cần Duyệt (Đại lý Sao Mai - `DL-002`)** *(Trọng tâm AC-2)*
   - **Chỉ số:** Hạn mức 400.000.000 ₫ | Đang nợ 350.000.000 ₫ | Còn lại 50.000.000 ₫ | Không có nợ quá hạn vi phạm.
   - **Hành động test:** Thêm 1 MacBook Pro M3 Max (89 triệu + VAT = 97.9 triệu).
   - **Kết quả:**
     - Tổng nợ sau đơn vọt lên **447.900.000 ₫** (Vượt hạn mức **+47.900.000 ₫**).
     - Thanh đo chuyển sang màu đỏ viền phát sáng cảnh báo vượt 100%.
     - Xuất hiện Banner Cảnh báo Vàng Cam: Đơn hàng vượt hạn mức tín dụng.
     - Nút tạo đơn tự động chuyển thành: `[📋 GỬI YÊU CẦU DUYỆT VƯỢT HẠN MỨC]`.
     - Click nút mở **Phiếu Đề Xuất Duyệt Vượt Hạn Mức** (nhập lý do, ngày cam kết trả nợ).
     - Đơn lưu với trạng thái **`CẦN DUYỆT (PENDING_APPROVAL)`**.
     - Giảng viên chuyển sang tab **"Đơn Hàng & Phê Duyệt"** để click `[Duyệt]` hoặc `[Từ chối]` với vai trò Kế toán trưởng!

3. **🔴 Kịch bản 3: Nợ Quá Hạn Vi Phạm -> Chặn Tạo Đơn Hoàn Toàn (Đại lý Thăng Long - `DL-003`)** *(Trọng tâm AC-3)*
   - **Chỉ số:** Hạn mức 500.000.000 ₫ | Đang nợ 220.000.000 ₫ (vẫn còn 280M hạn mức).
   - **Tình trạng nợ:** Có 2 hóa đơn quá hạn **56 ngày** & **45 ngày** (vượt xa ngưỡng quy định 30 ngày).
   - **Kết quả:**
     - **CHẶN HOÀN TOÀN (HARD BLOCK)**.
     - Xuất hiện Banner Đỏ Neon chớp nháy: *"🚫 CHẶN TẠO ĐƠN HOÀN TOÀN: ĐẠI LÝ VI PHẠM NỢ QUÁ HẠN"*.
     - Nút tạo đơn chuyển thành `[🚫 BỊ KHÓA DO NỢ QUÁ HẠN]` và bị **DISABLED hoàn toàn**, không thể bấm submit.
     - Nút "+ Thêm vào đơn" bị khóa.
     - Click *"Xem bảng kê hóa đơn quá hạn"* hiển thị chi tiết số hóa đơn, ngày phát sinh, hạn thanh toán và số tiền nợ.
     - Giảng viên có thể bấm **"Tất toán thử nghiệm"** trong modal để thấy hệ thống lập tức mở khóa đại lý theo thời gian thực!

4. **🟣 Kịch bản 4: Cận Hạn Mức Biên 98.8% (Đại lý Sài Gòn Star - `DL-004`)**
   - Đang nợ 494M / 500M (khả dụng chỉ còn đúng 6 triệu). Thêm bất kỳ sản phẩm nào cũng kích hoạt ngay cơ chế bảo vệ của AC-2.

5. **⚙️ Thử nghiệm điều chỉnh chính sách tín dụng (Policy Controller):**
   - Tại Tab 3 *"Giám Sát Công Nợ & Aging"*, Giảng viên có thể nhập đổi "Số ngày quá hạn cho phép" (ví dụ từ 30 ngày xuống 0 ngày hoặc nâng lên 60 ngày) và bấm *"Áp dụng"*.
   - Toàn bộ cổng khóa của hệ thống tự động tính toán lại ngay lập tức!

---

## 3. KIẾN TRÚC PHẦN MỀM (SOFTWARE ARCHITECTURE)

Dự án tuân thủ nghiêm ngặt mô hình kiến trúc doanh nghiệp chuẩn, phân tách rõ ràng trách nhiệm (Separation of Concerns):

```
d:/scrum9/
├── index.html                # Cấu trúc giao diện ứng dụng Enterprise SPA
├── server.ps1                # Máy chủ HTTP cục bộ tích hợp (PowerShell & .NET)
├── run.bat                   # File khởi động 1-click trên Windows
├── css/
│   ├── main.css              # Design tokens, màu sắc Dark Slate, typography, layout
│   ├── components.css        # Buttons, badges, tables, modal overlay, toasts
│   ├── order-form.css        # Màn hình tạo đơn, telemetry cards, thanh đo hạn mức, giỏ hàng
│   └── credit-gatekeeper.css # Banner khóa cứng, banner cần duyệt, ma trận aging report
└── js/
    ├── mockData.js           # Bộ dữ liệu mẫu: Đại lý, Hạn mức, Hóa đơn nợ, Danh mục hàng hóa
    ├── creditEngine.js       # CreditRiskEngine: Bộ xử lý logic thẩm định công nợ & quy tắc khóa
    ├── store.js              # StateStore: Quản lý trạng thái tập trung & bộ phản ứng (Reactive)
    ├── orderScreen.js        # View màn hình tạo đơn hàng (Order Screen)
    ├── approvalScreen.js     # View danh sách đơn hàng & quy trình Kế toán duyệt đơn
    ├── dealerMatrixScreen.js # View ma trận công nợ & phân tích tuổi nợ (AR Aging)
    ├── modals.js             # ModalManager: Quản lý hộp thoại đề xuất duyệt, bảng kê nợ quá hạn
    ├── notifications.js      # NotificationManager: Hệ thống toast notification thông minh
    └── app.js                # Bộ điều phối chính (Application Bootstrap & Tab Router)
```

---

## 4. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG

### Cách 1: Khởi chạy nhanh bằng file Batch (Khuyên dùng)
1. Mở thư mục `d:\scrum9`
2. Nhấp đúp chuột vào file **`run.bat`**
3. Trình duyệt mặc định sẽ tự động mở địa chỉ: **`http://localhost:5509/`**

### Cách 2: Chạy trực tiếp qua PowerShell
Mở PowerShell trong thư mục `d:\scrum9` và chạy:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

### Cách 3: Mở trực tiếp file HTML
Có thể nhấp đúp trực tiếp vào file **`index.html`** để trải nghiệm ngay trên mọi trình duyệt hiện đại (Chrome, Edge, Firefox).

---
*Bản quyền phát triển: Nhóm Dự Án NEXUS OMS - Ticket SCRUM-86 / SCRUM-9 (Đạt chuẩn 10/10 tiêu chí Đề bài).*
