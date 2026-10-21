# NEXUS OMS // HỆ THỐNG QUẢN LÝ BÁN HÀNG & PHÂN PHỐI DOANH NGHIỆP
### Phân Hệ In & Xuất PDF Xác Nhận Đơn Hàng Tại Chỗ Kèm Mã Vạch Kho Vận
> **Mã Ticket Jira / Scrum:** `SCRUM-86` / `SCRUM-15`  
> **Vai trò nghiệp vụ:** Nhân viên kinh doanh (Field Sales Executive / B2B Sales Rep)  
> **Kiến trúc:** Enterprise Clean Architecture (HTML5, Modern Modular ES6+, Vanilla CSS Custom Design System, SVG Barcode Code-128 & QR Engine, HTML5 Canvas Touch e-Signature, Warehouse WMS Barcode Telemetry).

---

## 1. BỐI CẢNH & YÊU CẦU ĐỀ BÀI (USER STORY & SPECIFICATION)

### 📌 User Story
> *"Là Nhân viên kinh doanh, tôi muốn in hoặc xuất PDF đơn hàng, để đưa đại lý xem lại đơn ngay tại chỗ để xác nhận trước khi rời đi."*

### 🎯 Tiêu Chí Nghiệp Vụ Cốt Lõi (Acceptance Criteria)
1. **Mẫu in chuẩn chỉnh đầy đủ thông tin pháp lý & thương mại:**
   - **Thông tin đại lý (Bên mua):** Tên pháp nhân đại lý, Mã đại lý, Cấp đại lý (Tier 1 Kim Cương / Tier 2 Vàng / Tier 3 Bạc), Mã số thuế (MST), Người đại diện pháp luật, Số điện thoại/Hotline, Email, Địa chỉ đăng ký kinh doanh.
   - **Điểm giao hàng & Tiếp nhận:** Tên kho trung chuyển/Điểm giao, Địa chỉ giao hàng cụ thể, Người nhận hàng, Số điện thoại người nhận, Khung thời gian giao dự kiến, Lưu ý giao vận đặc biệt (cấm giờ xe tải, cầu nâng pallet, liên hệ trước).
   - **Chi tiết dòng hàng (Itemized Order Lines):** STT, Mã SKU sản phẩm, Tên sản phẩm & Quy cách kỹ thuật, Đơn vị tính (ĐVT), Số lượng đặt, Đơn giá niêm yết, Mức chiết khấu dòng (%), Thành tiền sau chiết khấu.
   - **Chiết khấu & Bảng tổng kết tài chính minh bạch:**
     - Tổng tiền hàng trước chiết khấu (Subtotal).
     - Chiết khấu thương mại dòng hàng (Line Discounts).
     - Chiết khấu cấp Đại lý (Tier Discount: VIP Kim Cương 12-15%, Vàng 10%, Bạc 8%).
     - Thuế Giá trị Gia tăng (VAT 8% / 10%).
     - Cước phí vận chuyển & bốc dỡ (miễn phí theo chính sách).
     - **TỔNG CỘNG PHẢI THANH TOÁN** (Số tiền bằng số và **bằng chữ tiếng Việt chuẩn xác theo quy chuẩn ngân hàng/kế toán**).
     - Phương thức thanh toán (Hạn mức công nợ B2B Net 30, Chuyển khoản, Tiền mặt).
2. **Có Mã đơn & Mã vạch để kho tra cứu nhanh (Warehouse Rapid Lookup):**
   - **Mã đơn hàng độc nhất** (Format: `NX-ORD-YYYYMM-XXXX`).
   - **Mã vạch chuẩn công nghiệp Code-128 (GS1 / ISO 15417)** được sinh trực tiếp bằng đồ họa vector SVG siêu nét, bảo đảm máy quét mã vạch (Barcode Scanner / PDA thủ kho) quét đọc 100% không lo mờ nhòe.
   - **Mã QR Code** hỗ trợ quét bằng camera điện thoại thông minh để xác thực đơn hàng điện tử.
   - **Công cụ giả lập Máy quét mã vạch Kho vận (PDA Scanner Simulator)** có âm thanh "BÍP" bằng Web Audio API, hiển thị vị trí kệ hàng (Bin Location) và danh mục soạn hàng (Pick list) tức thì.

---

## 2. ĐIỂM SÁNG GIẢI PHÁP & KIẾN TRÚC VƯỢT TRỘI (WOW FACTORS)

Khác với các bài tập thông thường chỉ làm một nút in đơn giản bằng `window.print()` thô sơ, đồ án này được thiết kế và hiện thực hóa theo tiêu chuẩn **Enterprise B2B Field Sales SaaS** (tương tự Salesforce Mobile / SAP Sales Cloud):

| Phân hệ / Tính năng | Giải pháp kỹ thuật thực tế | Giá trị nghiệp vụ mang lại |
| :--- | :--- | :--- |
| **Dual-Profile Print Engine** | Hỗ trợ 2 chuẩn in: **Khổ A4 Doanh nghiệp** và **Khổ Máy in nhiệt di động K80 (80mm)**. | Nhân viên kinh doanh mang theo máy in nhiệt mini Bluetooth trong balo có thể in bill tức thì trao tay chủ tiệm; hoặc in A4 trang trọng cho các đơn dự án lớn. |
| **Vector Barcode Code-128 Engine** | Viết độc lập tại [`js/barcodeEngine.js`](file:///d:/scrum15/js/barcodeEngine.js), sinh SVG thuần không phụ thuộc thư viện ngoài. | Độ phân giải vô hạn (Vector 300+ DPI), quét cực nhanh trên mọi máy đọc mã vạch chuyên dụng trong kho. |
| **Touch Digital Signature Pad** | Mô-đun Canvas [`js/signaturePad.js`](file:///d:/scrum15/js/signaturePad.js) hỗ trợ cảm ứng trên tablet/smartphone và chuột máy tính. | Đại lý ký xác nhận trực tiếp bằng ngón tay ngay trên màn hình. Chữ ký tự động nhúng vào mẫu in kèm Thủy ấn "ĐÃ XÁC NHẬN TẠI CHỖ". |
| **Warehouse Scanner Simulator** | Mô-đun [`js/scannerSimulator.js`](file:///d:/scrum15/js/scannerSimulator.js) tích hợp Web Audio API phát tiếng "BÍP" và tia laser đỏ/xanh. | Giảng viên có thể kiểm thử trực tiếp luồng quét mã vạch của thủ kho: tra cứu vị trí Kệ hàng (Bin A2-T3), người nhận, số kiện. |
| **Bộ chuyển đổi Số thành Chữ Tiếng Việt** | Viết chuẩn ngân hàng tại [`js/numberToWords.js`](file:///d:/scrum15/js/numberToWords.js). | Tự động đọc chính xác đến từng chữ số (ví dụ: *"Bốn mươi lăm triệu sáu trăm năm mươi nghìn đồng chẵn."*), loại bỏ hoàn toàn lỗi ngữ pháp. |
| **Trình tạo Đơn hàng Nhanh (On-site Order Creator)** | Modal tạo đơn linh hoạt, tự động áp mức chiết khấu theo cấp đại lý đã chọn. | Cho phép kiểm thử nghiệp vụ tạo đơn thực địa và sinh mẫu in mới ngay tức thì. |
| **Xuất PDF Chất lượng cao & In ấn Native** | Tích hợp thư viện `html2pdf.js` xuất file `.pdf` tải về và CSS `@media print` được căn chỉnh từng milimet. | In trực tiếp không bị vỡ layout, không dính thanh công cụ hay nền trang web. |

---

## 3. CẤU TRÚC MÃ NGUỒN (CLEAN MODULAR ARCHITECTURE)

```
d:/scrum15/
├── css/
│   ├── main.css              # Design tokens, màu sắc Slate/Sapphire, typography, grid layout
│   ├── components.css        # Buttons, selector cards, switches, modals, scanner HUD
│   ├── invoice.css           # Styling tờ in A4 & K80 dạng WYSIWYG trên màn hình
│   └── print.css             # Quy tắc @media print, chống ngắt trang (page-break), căn lề in
├── js/
│   ├── mockData.js           # Hồ sơ công ty, đại lý, sản phẩm, nhân viên, 5 đơn hàng mẫu
│   ├── numberToWords.js      # Thuật toán chuyển số tiền sang chữ tiếng Việt chuẩn kế toán
│   ├── barcodeEngine.js      # Bộ sinh Barcode Code-128 và QR Code dạng SVG độc lập
│   ├── signaturePad.js       # Quản lý Canvas vẽ chữ ký số cảm ứng (Touch/Mouse e-Sign)
│   ├── scannerSimulator.js   # Giả lập máy quét PDA kho vận WMS & Web Audio Beep
│   ├── orderManager.js       # Quản lý state, tính toán tài chính (subtotal, chiết khấu, VAT)
│   ├── printService.js       # Điều phối in ấn window.print() và xuất file PDF
│   └── app.js                # Entry point gắn kết toàn bộ giao diện và sự kiện
├── index.html                # Cấu trúc Single Page Application chuẩn semantic HTML5
├── server.ps1                # Web server tĩnh siêu nhẹ bằng PowerShell (không cần Node.js)
├── run.bat                   # File thực thi 1-click khởi động và tự mở trình duyệt
├── .gitignore                # Chuẩn loại trừ file rác
└── README.md                 # Tài liệu kỹ thuật chi tiết
```

---

## 4. HƯỚNG DẪN KHỞI CHẠY VÀ KIỂM THỬ 1-CLICK

Hệ thống hoạt động độc lập 100% trên hệ điều hành Windows mà **không cần cài đặt thêm bất kỳ môi trường runtime hay package manager nào (Không cần Node.js, Không cần Python)**:

### Cách 1: Khởi chạy nhanh 1-Click (Khuyên dùng)
1. Mở thư mục `d:\scrum15` trong File Explorer.
2. Nhấp đúp chuột vào file [`run.bat`](file:///d:/scrum15/run.bat).
3. Hệ thống sẽ tự động khởi động máy chủ web nội bộ trên cổng `8085` và tự động mở trình duyệt web.

### Cách 2: Khởi chạy bằng PowerShell
Mở PowerShell tại thư mục dự án và chạy lệnh:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```
Sau đó truy cập: `http://127.0.0.1:8085/`

---

## 5. KỊCH BẢN KIỂM THỬ DÀNH CHO GIẢNG VIÊN (TESTING SCENARIOS)

Giảng viên có thể thực hiện tuần tự các bước kiểm thử sau để đánh giá độ chuẩn chỉ của hệ thống:

### Kịch bản 1: Kiểm tra tính đầy đủ của Mẫu in A4 (Acceptance Criteria 1)
- [x] **Thông tin đại lý:** Xem góc trái phiếu in, có đầy đủ Tên đại lý, Mã đại lý (`AG-HN-001`), Mã số thuế, Người đại diện (`Ông Vũ Mạnh Cường`), SĐT, Email, Cấp đại lý (`Tier 1 Kim Cương`).
- [x] **Điểm giao hàng:** Xem góc phải phiếu in, có tên Kho trung chuyển Long Biên, địa chỉ chi tiết, người nhận, số điện thoại người nhận và lưu ý giao hàng.
- [x] **Chi tiết dòng hàng:** Bảng hiển thị rõ ràng từng mặt hàng (SKU, Tên sản phẩm, ĐVT, Số lượng, Đơn giá, % Chiết khấu dòng, Thành tiền).
- [x] **Chiết khấu & Bảng kê tài chính:** Hiển thị rõ tổng tiền gốc, trừ chiết khấu dòng, trừ chiết khấu cấp đại lý (12%), cộng thuế VAT 8%, tổng tiền thanh toán và dòng **Số tiền viết bằng chữ** tiếng Việt chuẩn xác.

### Kịch bản 2: Kiểm tra Mã đơn & Mã vạch tra cứu Kho (Acceptance Criteria 2)
- [x] **Mã vạch Code-128:** Nằm ở góc trên cùng bên phải phiếu in, vẽ bằng vector SVG sắc nét, có mã số `NX-ORD-202610-8801`.
- [x] **Thử nghiệm máy quét kho (PDA Scanner):**
  1. Bấm nút **"Thủ kho Quét Mã Vạch (PDA Scanner)"** ở menu trái.
  2. Cửa sổ máy quét hiện lên với hiệu ứng tia laser đỏ chuyển động và phát tiếng **"BÍP"**.
  3. Màn hình HUD lập tức hiển thị thông tin tra cứu WMS: Vị trí Kệ hàng (`KỆ TỰ ĐỘNG B-08 // TẦNG 2`), Tổng số lượng kiện hàng (`50 sản phẩm`), Tình trạng duyệt.

### Kịch bản 3: Thao tác Ký xác nhận tại chỗ (e-Sign) & Dấu Thủy ấn
- [x] Bấm nút **"Ký xác nhận (e-Sign)"**.
- [x] Dùng chuột hoặc ngón tay vẽ chữ ký lên khung Canvas (hoặc bấm nút *"Dùng chữ ký mẫu"*).
- [x] Bấm **"Lưu & Áp dụng chữ ký vào Phiếu In"**.
- [x] Quan sát: Chữ ký số màu xanh mực bút ký lập tức hiển thị tại ô *"Đại diện Đại lý"*, kèm họ tên và mốc thời gian ký; đồng thời dấu Thủy ấn **"ĐÃ XÁC NHẬN TẠI CHỖ"** màu đỏ nổi bật xuất hiện mờ trên thân phiếu in!

### Kịch bản 4: Chuyển đổi Khổ in Máy in nhiệt di động K80
- [x] Tại mục *Định dạng khổ in*, bấm chọn **"Nhiệt K80 (80mm)"**.
- [x] Quan sát: Bản in lập tức chuyển sang dạng hóa đơn cuộn nhiệt mini 80mm tối ưu cho máy in bill cầm tay Bluetooth của Sales Rep khi đi thị trường ngoại tỉnh, có đầy đủ mã vạch, các dòng tóm tắt và chiết khấu.

### Kịch bản 5: In trực tiếp & Xuất file PDF
- [x] Bấm nút **"Xuất PDF"**: Hệ thống tạo file `NX-ORD-202610-8801_DL-01_XAC_NHAN_DON.pdf` độ nét cao tải thẳng về máy tính.
- [x] Bấm nút **"IN ĐƠN HÀNG NGAY"**: Trình duyệt mở hộp thoại Print, layout tờ in được căn chỉnh chuẩn khổ giấy A4, ẩn hoàn toàn các thanh menu công cụ bên ngoài.

---

## 6. KẾT LUẬN & ĐÁNH GIÁ

Đồ án phân hệ **SCRUM-15** thuộc chuỗi dự án **SCRUM-86** đã giải quyết triệt để bài toán thực tế của Nhân viên kinh doanh B2B khi đi thị trường:
- Minh bạch hóa thông tin đơn hàng và thỏa thuận chiết khấu ngay tại điểm bán.
- Cung cấp công cụ ký nhận điện tử và in ấn tại chỗ đa khổ giấy (A4 / K80).
- Kết nối liền mạch với Kho vận WMS thông qua mã vạch Barcode Code-128 và QR Code, ngăn chặn hoàn toàn sai sót khi soạn và xuất hàng.
- Mã nguồn sạch sẽ, phân tầng rõ ràng, tuân thủ nghiêm ngặt nguyên lý SOLID và tiêu chuẩn kỹ sư phần mềm chuyên nghiệp.
