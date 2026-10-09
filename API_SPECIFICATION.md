# TÀI LIỆU ĐẶC TẢ THIẾT KẾ RESTFUL API
## DỰ ÁN: HỆ THỐNG BÁN HÀNG & KHO (KỲ TTCS_T926_K13C4)
*Dành cho AI Coding Agents, Backend & Frontend Engineers*

---

## 1. QUY CHUẨN KỸ THUẬT DÙNG CHUNG (GLOBAL STANDARDS)

### 1.1. Base URL & Giao thức
- **Base URL:** `https://api.domain.com/api/v1`
- **Format:** `application/json; charset=utf-8` (ngoại trừ các endpoint Upload dùng `multipart/form-data`)
- **Authentication:** `Authorization: Bearer <access_token>`

### 1.2. Danh sách vai trò phân quyền (RBAC Roles)
- `Admin`: Quản trị hệ thống, tài khoản, cấu hình.
- `Sales Manager`: Quản lý kinh doanh, duyệt ngoại lệ, cấu hình bảng giá, KPI.
- `Sales Rep`: Nhân viên kinh doanh phụ trách tuyến, tạo đơn, thu tiền tuyến.
- `WH Manager`: Quản lý kho, điều chỉnh tồn, chốt kiểm kê, tạo tuyến xe.
- `Warehouse`: Nhân viên thủ kho, nhập kho, soạn hàng FEFO, xuất kho.
- `Accountant`: Kế toán công nợ, xuất hóa đơn, thu tiền, đối chiếu công nợ.
- `Customer`: Đại lý / Khách sỉ tự đặt hàng, theo dõi đơn và công nợ.

### 1.3. Cấu trúc Response Envelope chuẩn
#### Success Response (200 OK / 201 Created):
```json
{
  "success": true,
  "code": 200,
  "message": "Thao tác thành công",
  "data": {},
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalRecords": 100,
    "totalPages": 5
  }
}
```

#### Error Response (400, 401, 403, 404, 422, 500):
```json
{
  "success": false,
  "code": 422,
  "error": "VALIDATION_FAILED",
  "message": "Dữ liệu gửi lên không hợp lệ",
  "details": [
    {
      "field": "sku",
      "message": "Mã SKU đã tồn tại trong hệ thống"
    }
  ]
}
```

---

## 2. DANH SÁCH ENDPOINTS CHI TIẾT THEO EPICS

### EP-01: TÀI KHOẢN, PHÂN QUYỀN & HỒ SƠ (SPRINT 1 - 2)

#### `POST /auth/login`
- **Story:** S1-01
- **Phân quyền:** Public
- **Request Body:**
```json
{
  "username": "sales_rep_01",
  "password": "Password123!"
}
```
- **Response Data:**
```json
{
  "accessToken": "ey...",
  "refreshToken": "ey...",
  "expiresIn": 3600,
  "user": {
    "id": 1,
    "username": "sales_rep_01",
    "fullName": "Nguyễn Văn A",
    "roles": ["Sales Rep"],
    "avatarUrl": "https://..."
  }
}
```

#### `POST /auth/refresh-token`
- **Story:** S1-02
- **Phân quyền:** Public
- **Request Body:** `{"refreshToken": "ey..."}`
- **Response Data:** `{"accessToken": "ey...", "refreshToken": "ey...", "expiresIn": 3600}`

#### `POST /auth/logout`
- **Story:** S1-02
- **Phân quyền:** Authenticated
- **Request Body:** `{"refreshToken": "ey..."}`
- **Response Data:** `{"success": true}`

#### `POST /auth/forgot-password`
- **Story:** S1-03
- **Phân quyền:** Public
- **Request Body:** `{"email": "user@example.com"}`
- **Response Data:** `{"message": "Đã gửi liên kết khôi phục qua email nếu tài khoản tồn tại"}`

#### `POST /auth/reset-password`
- **Story:** S1-03
- **Phân quyền:** Public
- **Request Body:** `{"token": "reset_token_str", "newPassword": "NewPassword123!"}`
- **Response Data:** `{"success": true}`

#### `POST /auth/change-password`
- **Story:** S1-04
- **Phân quyền:** Authenticated
- **Request Body:** `{"currentPassword": "OldPass123!", "newPassword": "NewPassword123!"}`
- **Response Data:** `{"success": true}`

#### `GET /users/me`
- **Story:** S1-06, S2-02
- **Phân quyền:** Authenticated
- **Response Data:**
```json
{
  "id": 1,
  "username": "sales_rep_01",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "roles": ["Sales Rep"],
  "permissions": ["orders:create", "orders:view", "debts:collect"],
  "menus": [
    {"title": "Đơn hàng", "path": "/orders"},
    {"title": "Khách hàng", "path": "/customers"}
  ]
}
```

#### `PUT /users/me`
- **Story:** S2-02
- **Phân quyền:** Authenticated
- **Request Body:** `{"fullName": "Nguyễn Văn A", "phone": "0912345678"}`
- **Response Data:** `{"id": 1, "fullName": "Nguyễn Văn A", "phone": "0912345678"}`

#### `POST /users/me/avatar`
- **Story:** S2-03
- **Phân quyền:** Authenticated
- **Content-Type:** `multipart/form-data`
- **Body:** `file` (JPG/PNG, max 2MB)
- **Response Data:** `{"avatarUrl": "https://cdn.domain.com/avatars/1.jpg"}`

#### `GET /admin/users`
- **Story:** S1-08
- **Phân quyền:** Admin
- **Query Params:** `page`, `limit`, `keyword`, `role`, `status`
- **Response Data:** Danh sách users kèm role, địa bàn/kho phụ trách.

#### `POST /admin/users`
- **Story:** S1-08, S1-09
- **Phân quyền:** Admin
- **Request Body:**
```json
{
  "username": "sales_rep_02",
  "email": "rep02@domain.com",
  "fullName": "Trần Văn B",
  "phone": "0987654321",
  "roleIds": [2],
  "warehouseIds": [1],
  "regionIds": [10]
}
```
- **Response Data:** Chi tiết user vừa tạo. Tự động gửi email kích hoạt và mật khẩu tạm.

#### `PUT /admin/users/{id}`
- **Story:** S1-09
- **Phân quyền:** Admin
- **Request Body:** `{"fullName": "...", "phone": "...", "roleIds": [...], "warehouseIds": [...], "regionIds": [...]}`
- **Response Data:** Chi tiết user đã cập nhật.

#### `PATCH /admin/users/{id}/status`
- **Story:** S1-10
- **Phân quyền:** Admin
- **Request Body:** `{"status": "ACTIVE" | "LOCKED"}`
- **Response Data:** `{"id": 1, "status": "LOCKED"}`

#### `POST /admin/users/import-excel`
- **Story:** S2-01
- **Phân quyền:** Admin
- **Content-Type:** `multipart/form-data`
- **Body:** `file` (Excel .xlsx)
- **Response Data:** `{"totalRows": 50, "successCount": 48, "failedRows": [{"row": 12, "error": "Email trùng lặp"}]}`

#### `GET /admin/audit-logs`
- **Story:** S2-04
- **Phân quyền:** Admin
- **Query Params:** `page`, `limit`, `module`, `action`, `userId`, `fromDate`, `toDate`
- **Response Data:** Mảng log chi tiết ghi nhận thao tác trên tồn kho, giá, hạn mức công nợ.

---

### EP-02: DANH MỤC SẢN PHẨM & BẢNG GIÁ (SPRINT 2 - 3)

#### `GET /categories/tree`
- **Story:** S2-06
- **Phân quyền:** All Staff
- **Response Data:** Cây danh mục 3 cấp `[{"id": 1, "code": "BEV", "name": "Đồ uống", "children": [...]}]`

#### `POST /categories`
- **Story:** S2-06
- **Phân quyền:** Sales Manager
- **Request Body:** `{"code": "BEV_BEER", "name": "Bia & Cồn nhẹ", "parentId": 1, "description": "..."}`
- **Response Data:** Thông tin category vừa tạo.

#### `GET /products`
- **Story:** S2-05
- **Phân quyền:** All Staff, Customer
- **Query Params:** `page`, `limit`, `keyword`, `categoryId`, `status`
- **Response Data:** Danh sách SKU kèm ĐVT cơ sở, quy cách đóng gói, trạng thái.

#### `POST /products`
- **Story:** S2-05
- **Phân quyền:** Sales Manager
- **Request Body:**
```json
{
  "sku": "BIA-HN-LON-330",
  "name": "Bia Hà Nội lon 330ml",
  "categoryId": 5,
  "baseUnit": "Lon",
  "manageByLot": true,
  "minStock": 500,
  "description": "Thùng 24 lon"
}
```
- **Response Data:** Sản phẩm vừa tạo.

#### `GET /products/{id}`
- **Story:** S2-07
- **Phân quyền:** All Staff
- **Response Data:** Chi tiết sản phẩm kèm danh sách đơn vị quy đổi (`units`: `[{"unitName": "Thùng", "conversionRate": 24, "barcode": "893..."}]`).

#### `PUT /products/{id}/units`
- **Story:** S2-07
- **Phân quyền:** Sales Manager
- **Request Body:**
```json
{
  "units": [
    {"unitName": "Lon", "conversionRate": 1, "isBaseUnit": true, "barcode": "893001"},
    {"unitName": "Lốc", "conversionRate": 6, "isBaseUnit": false, "barcode": "893002"},
    {"unitName": "Thùng", "conversionRate": 24, "isBaseUnit": false, "barcode": "893003"}
  ]
}
```
- **Response Data:** Cập nhật bảng quy đổi ĐVT thành công.

#### `POST /products/import-excel`
- **Story:** S2-08
- **Phân quyền:** Sales Manager
- **Content-Type:** `multipart/form-data`
- **Body:** `file` (Excel .xlsx)
- **Response Data:** Báo cáo kết quả import.

#### `GET /price-lists`
- **Story:** S2-10
- **Phân quyền:** Sales Manager, Sales Rep
- **Query Params:** `customerGroupId`, `effectiveDate`
- **Response Data:** Bảng giá hiện hành áp dụng theo nhóm khách.

#### `POST /price-lists`
- **Story:** S2-10
- **Phân quyền:** Sales Manager
- **Request Body:**
```json
{
  "name": "Bảng giá Đại lý Cấp 1 - Q4/2026",
  "customerGroupId": 1,
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "items": [
    {"productId": 101, "unitId": 1, "price": 12000, "floorPrice": 10500},
    {"productId": 101, "unitId": 3, "price": 280000, "floorPrice": 250000}
  ]
}
```
- **Response Data:** Bảng giá vừa tạo.

#### `POST /discount-policies`
- **Story:** S3-01
- **Phân quyền:** Sales Manager
- **Request Body:**
```json
{
  "name": "Chiết khấu sản lượng bia lon Q4",
  "scope": "SKU",
  "targetId": 101,
  "tiers": [
    {"minQty": 50, "maxQty": 99, "discountPercent": 2.0},
    {"minQty": 100, "maxQty": 999999, "discountPercent": 5.0}
  ]
}
```
- **Response Data:** Chính sách chiết khấu bậc thang vừa lưu.

#### `GET /products/{id}/price-history`
- **Story:** S3-02
- **Phân quyền:** Sales Manager
- **Query Params:** `fromDate`, `toDate`
- **Response Data:** `[{"changedAt": "2026-09-01T08:00:00Z", "oldPrice": 270000, "newPrice": 280000, "changedBy": "Admin", "note": "Tăng giá vụ Tết"}]`

---

### EP-03: ĐẠI LÝ & HẠN MỨC CÔNG NỢ (SPRINT 3)

#### `GET /customers`
- **Story:** S3-08
- **Phân quyền:** Sales Rep, Sales Manager, Accountant
- **Query Params:** `page`, `limit`, `keyword`, `regionId`, `customerGroupId`, `assignedRepId`, `status`
- **Response Data:** Danh sách đại lý kèm dư nợ hiện tại, hạn mức, NVKD quản lý.

#### `POST /customers`
- **Story:** S3-03
- **Phân quyền:** Accountant, Sales Manager
- **Request Body:**
```json
{
  "code": "DL-HN-001",
  "name": "Đại lý Bách Hóa Cầu Giấy",
  "taxCode": "0101234567",
  "phone": "0901234567",
  "email": "bachhoacaugiay@gmail.com",
  "customerGroupId": 1,
  "regionId": 3,
  "address": "123 Cầu Giấy, Hà Nội"
}
```
- **Response Data:** Thông tin đại lý vừa tạo.

#### `GET /customers/{id}`
- **Story:** S3-03
- **Phân quyền:** All Staff, Customer (xem chính mình)
- **Response Data:** Chi tiết đại lý, người phụ trách, điểm giao, tình trạng công nợ.

#### `GET /customers/{id}/delivery-addresses`
- **Story:** S3-04
- **Phân quyền:** All Staff, Customer
- **Response Data:** Danh sách các điểm giao hàng của đại lý.

#### `POST /customers/{id}/delivery-addresses`
- **Story:** S3-04
- **Phân quyền:** Sales Rep, Customer
- **Request Body:**
```json
{
  "receiverName": "Anh Tuấn (Kho 2)",
  "phone": "0911223344",
  "address": "45 Dịch Vọng Hậu, Cầu Giấy, Hà Nội",
  "isDefault": false,
  "note": "Giao sau 14h"
}
```
- **Response Data:** Điểm giao hàng mới.

#### `PUT /customers/{id}/credit-limit`
- **Story:** S3-05
- **Phân quyền:** Accountant
- **Request Body:**
```json
{
  "creditLimit": 200000000.0,
  "maxDueDays": 30,
  "warningThresholdPercent": 80
}
```
- **Response Data:** Cập nhật hạn mức và số ngày nợ tối đa.

#### `PATCH /customers/{id}/assign-sales-rep`
- **Story:** S3-06
- **Phân quyền:** Sales Manager
- **Request Body:** `{"salesRepId": 5}`
- **Response Data:** Gán NVKD phụ trách đại lý thành công.

#### `PATCH /customers/{id}/transaction-status`
- **Story:** S3-07
- **Phân quyền:** Accountant
- **Request Body:** `{"status": "ACTIVE" | "LOCKED_FOR_DEBT", "reason": "Nợ quá hạn trên 45 ngày"}`
- **Response Data:** Khóa/Mở giao dịch bán hàng với đại lý.

---

### EP-04: ĐẶT HÀNG & DUYỆT ĐƠN (SPRINT 3 - 5)

#### `POST /orders/simulate`
- **Story:** S4-01, S4-02, S4-03
- **Phân quyền:** Sales Rep, Customer
- **Mục đích:** Tính toán giá tự động, áp chiết khấu, kiểm tra tồn khả dụng và kiểm tra chạm hạn mức nợ trước khi lưu đơn thật.
- **Request Body:**
```json
{
  "customerId": 1024,
  "warehouseId": 1,
  "items": [
    {"productId": 101, "unitId": 3, "quantity": 50}
  ]
}
```
- **Response Data:**
```json
{
  "subTotal": 14000000.0,
  "discountAmount": 280000.0,
  "taxAmount": 1097600.0,
  "grandTotal": 14817600.0,
  "currentDebt": 120000000.0,
  "creditLimit": 150000000.0,
  "debtAfterOrder": 134817600.0,
  "isCreditLimitExceeded": false,
  "itemsValidation": [
    {
      "productId": 101,
      "requestedQty": 50,
      "availableQty": 120,
      "unitPrice": 280000.0,
      "discountPercent": 2.0,
      "isBelowFloorPrice": false
    }
  ]
}
```

#### `GET /customers/{id}/purchase-history`
- **Story:** S4-04
- **Phân quyền:** Sales Rep, Sales Manager
- **Query Params:** `months` (default = 3)
- **Response Data:** Danh sách các mặt hàng đại lý đã mua trong 3 tháng qua, số lượng gần nhất, đơn giá.

#### `GET /orders`
- **Story:** S4-07
- **Phân quyền:** All Staff, Customer (lọc theo chính mình)
- **Query Params:** `page`, `limit`, `status`, `customerId`, `salesRepId`, `fromDate`, `toDate`
- **Response Data:** Mảng đơn hàng kèm trạng thái vòng đời.

#### `POST /orders`
- **Story:** S3-09, S4-10
- **Phân quyền:** Sales Rep, Customer
- **Request Body:**
```json
{
  "customerId": 1024,
  "deliveryAddressId": 12,
  "warehouseId": 1,
  "deliveryDateExpected": "2026-10-15",
  "note": "Giao giờ hành chính",
  "items": [
    {
      "productId": 101,
      "unitId": 3,
      "quantity": 50,
      "unitPrice": 280000.0,
      "discountPercent": 2.0
    }
  ]
}
```
- **Response Data:** Đơn hàng tạo thành công. Trạng thái: `DRAFT` (hoặc `PENDING_APPROVAL` nếu tự động submit mà vi phạm hạn mức).

#### `GET /orders/{id}`
- **Story:** S4-06
- **Phân quyền:** All Staff, Customer
- **Response Data:** Chi tiết đơn hàng, dòng sản phẩm, lịch sử phê duyệt, trạng thái giao vận.

#### `PATCH /orders/{id}/submit`
- **Story:** S4-06
- **Phân quyền:** Sales Rep, Customer
- **Response Data:** Nếu hợp lệ -> `APPROVED` (giữ chỗ tồn); nếu vi phạm giá sàn/nợ -> `PENDING_APPROVAL`.

#### `POST /orders/{id}/approve`
- **Story:** S4-05
- **Phân quyền:** Sales Manager
- **Request Body:** `{"overrideReason": "Đặc cách duyệt cho khách hàng thân thiết"}`
- **Response Data:** Đơn chuyển sang `APPROVED`, kích hoạt tăng `reserved_qty` trên kho.

#### `POST /orders/{id}/reject`
- **Story:** S4-05
- **Phân quyền:** Sales Manager
- **Request Body:** `{"rejectReason": "Nợ xấu quá lâu chưa giải trình"}`
- **Response Data:** Đơn chuyển sang `REJECTED`.

#### `PATCH /orders/{id}/cancel`
- **Story:** S4-06
- **Phân quyền:** Sales Rep, Sales Manager, Customer
- **Request Body:** `{"cancelReason": "Khách đổi kế hoạch kinh doanh"}`
- **Response Data:** Đơn chuyển sang `CANCELLED`, giải phóng `reserved_qty`.

#### `POST /orders/{id}/clone`
- **Story:** S4-09, S5-02
- **Phân quyền:** Sales Rep, Customer
- **Response Data:** Sinh đơn hàng mới từ các mặt hàng của đơn cũ, tự động nạp đơn giá hiện hành.

#### `GET /orders/{id}/print-pdf`
- **Story:** S4-08
- **Phân quyền:** Sales Rep, Customer
- **Response Data:** Stream file PDF in phiếu đặt hàng.

---

### EP-05: KHO & TỒN KHO (SPRINT 2, 5, 6, 8)

#### `GET /suppliers` & `POST /suppliers`
- **Story:** S2-09
- **Phân quyền:** Warehouse, WH Manager
- **Post Body:** `{"code": "NCC-HN", "name": "Công ty Bia Hà Nội", "taxCode": "...", "phone": "...", "address": "..."}`
- **Response Data:** Danh mục nhà cung cấp.

#### `GET /warehouses` & `POST /warehouses`
- **Story:** S5-03
- **Phân quyền:** WH Manager
- **Post Body:** `{"code": "WH-LONG-BIEN", "name": "Kho Tổng Long Biên", "address": "...", "managerId": 3, "locations": [{"code": "K1-A1", "name": "Kệ 1 Dãy A"}]}`
- **Response Data:** Danh mục kho bãi và vị trí lưu kho.

#### `GET /inventory`
- **Story:** S5-05
- **Phân quyền:** Warehouse, WH Manager, Sales Rep
- **Query Params:** `warehouseId`, `categoryId`, `keyword`
- **Response Data:**
```json
[
  {
    "productId": 101,
    "sku": "BIA-HN-LON-330",
    "productName": "Bia Hà Nội lon 330ml",
    "baseUnit": "Lon",
    "physicalQty": 24000,
    "reservedQty": 2400,
    "availableQty": 21600,
    "minStock": 5000,
    "isBelowMinStock": false
  }
]
```

#### `GET /inventory/alerts`
- **Story:** S5-09
- **Phân quyền:** WH Manager, Sales Manager
- **Query Params:** `warehouseId`
- **Response Data:** Danh sách SKU có `physicalQty` < `minStock`.

#### `GET /inventory/stock-cards`
- **Story:** S6-02
- **Phân quyền:** Warehouse, WH Manager, Accountant
- **Query Params:** `productId`, `warehouseId`, `fromDate`, `toDate`
- **Response Data:** Thẻ kho liệt kê toàn bộ phát sinh: Chứng từ, Ngày tháng, Số lượng nhập, Số lượng xuất, Tồn cuối kỳ.

#### `GET /inventory/lots`
- **Story:** S6-01
- **Phân quyền:** Warehouse, WH Manager
- **Query Params:** `productId`, `warehouseId`, `isExpired`
- **Response Data:** Danh sách lô hàng, ngày sản xuất, hạn sử dụng, số lượng tồn theo từng lô.

#### `POST /warehouse/receipts`
- **Story:** S5-04
- **Phân quyền:** Warehouse, WH Manager
- **Request Body:**
```json
{
  "supplierId": 1,
  "warehouseId": 1,
  "documentNo": "HD-NCC-9981",
  "receiptDate": "2026-10-09",
  "items": [
    {
      "productId": 101,
      "unitId": 3,
      "lotNumber": "LOT261009",
      "mfgDate": "2026-10-01",
      "expDate": "2027-10-01",
      "quantity": 500,
      "unitCost": 230000.0
    }
  ]
}
```
- **Response Data:** Phiếu nhập kho đã ghi sổ, tăng `physicalQty` và cập nhật giá vốn.

#### `POST /warehouse/transfers`
- **Story:** S5-07
- **Phân quyền:** Warehouse, WH Manager
- **Request Body:** `{"fromWarehouseId": 1, "toWarehouseId": 2, "transferDate": "2026-10-10", "items": [{"productId": 101, "lotNumber": "LOT261009", "quantity": 100}]}`
- **Response Data:** Phiếu chuyển kho nội bộ (hàng đưa vào trạng thái Đang luân chuyển).

#### `PATCH /warehouse/transfers/{id}/receive`
- **Story:** S5-07
- **Phân quyền:** Warehouse
- **Response Data:** Xác nhận nhận hàng chuyển kho, tăng tồn kho đích.

#### `POST /warehouse/audits`
- **Story:** S5-08
- **Phân quyền:** WH Manager
- **Request Body:**
```json
{
  "warehouseId": 1,
  "auditDate": "2026-10-09",
  "items": [
    {"productId": 101, "lotNumber": "LOT261009", "systemQty": 100, "actualQty": 98, "reason": "Hư hỏng vỡ lon trong quá trình bốc xếp"}
  ]
}
```
- **Response Data:** Phiếu kiểm kê kèm số liệu chênh lệch thừa/thiếu.

#### `POST /warehouse/audits/{id}/approve`
- **Story:** S5-08
- **Phân quyền:** WH Manager
- **Response Data:** Phê duyệt cân bằng tồn kho theo thực tế kiểm kê.

#### `GET /inventory/export-excel`
- **Story:** S8-08
- **Phân quyền:** WH Manager, Accountant
- **Response Data:** Stream file Excel xuất sổ tồn 3 cột.

---

### EP-06: XUẤT KHO & GIAO HÀNG (SPRINT 6)

#### `POST /warehouse/pick-lists`
- **Story:** S6-03
- **Phân quyền:** Warehouse
- **Request Body:** `{"orderId": 9851}`
- **Response Data:** Phiếu soạn hàng với danh sách SKU kèm vị trí kệ hàng tối ưu đường đi.

#### `GET /warehouse/pick-lists/{id}/suggest-lots`
- **Story:** S6-04
- **Phân quyền:** Warehouse
- **Response Data:** Gợi ý danh sách lô xuất tự động theo quy tắc **FEFO** (Hạn dùng gần nhất xuất trước).

#### `POST /warehouse/dispatches`
- **Story:** S6-05
- **Phân quyền:** Warehouse
- **Request Body:**
```json
{
  "orderId": 9851,
  "pickListId": 302,
  "items": [
    {"productId": 101, "lotNumber": "LOT261009", "actualQty": 48}
  ]
}
```
- **Response Data:** Phiếu xuất kho. Tồn giữ chỗ `reserved_qty` chuyển thành xuất thực tế khỏi `physical_qty`. Phần thiếu (2 thùng) được hệ thống ghi nhận xử lý.

#### `POST /deliveries/trips`
- **Story:** S6-06
- **Phân quyền:** WH Manager
- **Request Body:**
```json
{
  "driverName": "Bác Tài C",
  "vehicleNumber": "29H-123.45",
  "dispatchIds": [401, 402, 403],
  "routeName": "Tuyến Cầu Giấy - Từ Liêm"
}
```
- **Response Data:** Gom nhiều phiếu xuất vào một chuyến xe phân tuyến.

#### `GET /deliveries/trips/active`
- **Story:** S6-07
- **Phân quyền:** WH Manager, Sales Manager
- **Response Data:** Theo dõi chuyến hàng đang chạy, số điểm đã giao, số điểm còn lại.

#### `POST /deliveries/{dispatchId}/confirm-pod`
- **Story:** S6-08
- **Phân quyền:** Warehouse, Sales Rep
- **Content-Type:** `multipart/form-data`
- **Body:** `receiverName`, `receivedDate`, `note`, `proofImages` (ảnh biên bản bàn giao có chữ ký đại lý).
- **Response Data:** Đơn hàng chuyển sang `DELIVERED`, đủ điều kiện phát hành hóa đơn bán lẻ.

#### `GET /deliveries/track/{orderId}`
- **Story:** S6-09
- **Phân quyền:** Customer, Sales Rep
- **Response Data:** Timeline trực quan trạng thái giao hàng: `Đã duyệt` -> `Đang soạn` -> `Đã xuất kho` -> `Đang giao hàng` -> `Giao thành công`.

---

### EP-07: HÓA ĐƠN, CÔNG NỢ & THANH TOÁN (SPRINT 7 - 8)

#### `POST /invoices/from-dispatch`
- **Story:** S7-01
- **Phân quyền:** Accountant
- **Request Body:** `{"dispatchId": 401, "invoiceDate": "2026-10-10", "paymentTermDays": 30}`
- **Response Data:** Phát hành hóa đơn bán hàng sinh tự động từ số lượng thực tế giao thành công.

#### `GET /invoices`
- **Story:** S7-01
- **Phân quyền:** Accountant, Sales Rep
- **Query Params:** `customerId`, `status`, `fromDate`, `toDate`
- **Response Data:** Danh sách hóa đơn bán hàng (Chưa TT, Thanh toán 1 phần, Đã thanh toán).

#### `POST /payments`
- **Story:** S7-02, S7-05
- **Phân quyền:** Accountant, Sales Rep
- **Request Body:**
```json
{
  "customerId": 1024,
  "amount": 10000000.0,
  "paymentMethod": "BANK_TRANSFER",
  "paymentDate": "2026-10-10",
  "invoiceIds": [801],
  "receiptImage": "https://..."
}
```
- **Response Data:** Ghi nhận khoản thu và đối trừ trực tiếp vào sổ nợ của đại lý.

#### `GET /debts/aging`
- **Story:** S7-03
- **Phân quyền:** Accountant, Sales Manager
- **Query Params:** `page`, `limit`, `regionId`, `agingBucket`
- **Response Data:** Sổ công nợ phân tích theo 4 nhóm tuổi nợ: 0-30 ngày, 31-60 ngày, 61-90 ngày, trên 90 ngày.

#### `GET /customers/{id}/debts`
- **Story:** S7-07
- **Phân quyền:** Customer, Sales Rep
- **Response Data:** Bảng kê nợ chi tiết của chính đại lý: Danh sách hóa đơn chưa thanh toán, hạn trả, tổng tiền còn nợ.

#### `POST /debts/reconciliation`
- **Story:** S7-06
- **Phân quyền:** Accountant
- **Request Body:** `{"customerId": 1024, "startDate": "2026-09-01", "endDate": "2026-09-30"}`
- **Response Data:** Biên bản đối chiếu công nợ theo kỳ (Dư đầu kỳ, Phát sinh nợ, Phát sinh có, Dư cuối kỳ).

#### `POST /debts/send-reminder`
- **Story:** S7-08
- **Phân quyền:** System, Accountant
- **Request Body:** `{"customerId": 1024, "invoiceId": 801}`
- **Response Data:** Gửi email và thông báo đẩy nhắc nợ tự động trước hạn 3 ngày.

#### `GET /payments/{id}/receipt-pdf`
- **Story:** S7-09
- **Phân quyền:** Accountant, Sales Rep
- **Response Data:** Stream file PDF phiếu thu tiền có mã duy nhất.

#### `GET /debts/{customerId}/export-excel`
- **Story:** S8-10
- **Phân quyền:** Accountant
- **Response Data:** Xuất sổ chi tiết công nợ đại lý ra file Excel.

---

### EP-08: TRẢ HÀNG & ĐIỀU CHỈNH (SPRINT 8)

#### `POST /returns`
- **Story:** S8-01
- **Phân quyền:** Sales Rep, Warehouse
- **Request Body:**
```json
{
  "invoiceId": 801,
  "warehouseId": 1,
  "returnDate": "2026-10-10",
  "reason": "Hàng móp méo do vận chuyển",
  "items": [
    {"productId": 101, "unitId": 3, "lotNumber": "LOT261009", "quantity": 5}
  ]
}
```
- **Response Data:** Phiếu trả hàng nhập lại kho.

#### `POST /returns/{id}/credit-note`
- **Story:** S8-02
- **Phân quyền:** Accountant
- **Request Body:** `{"returnId": 501, "note": "Giảm trừ công nợ đại lý tương ứng hàng trả"}`
- **Response Data:** Chứng từ điều chỉnh giảm trừ công nợ đại lý.

#### `POST /inventory/adjustments`
- **Story:** S8-03
- **Phân quyền:** WH Manager
- **Request Body:**
```json
{
  "warehouseId": 1,
  "reason": "DAMAGED",
  "items": [
    {"productId": 101, "lotNumber": "LOT261009", "adjustQty": -2, "note": "Vỡ hỏng khi bốc dỡ"}
  ]
}
```
- **Response Data:** Phiếu điều chỉnh tồn hàng hỏng/hết hạn chờ phê duyệt.

#### `POST /inventory/adjustments/{id}/approve`
- **Story:** S8-03
- **Phân quyền:** WH Manager
- **Response Data:** Duyệt phiếu điều chỉnh, hạch toán giảm trừ tồn thực tế khỏi thẻ kho.

---

### EP-09: BÁO CÁO & DASHBOARD ĐIỀU HÀNH (SPRINT 8)

#### `POST /reports/sales-targets` & `GET /reports/sales-targets`
- **Story:** S8-04
- **Phân quyền:** Sales Manager
- **Post Body:** `{"salesRepId": 5, "month": 10, "year": 2026, "targetAmount": 500000000.0}`
- **Response Data:** Thiết lập và tra cứu tiến độ đạt KPI doanh số của nhân viên.

#### `GET /dashboard/overview`
- **Story:** S8-05
- **Phân quyền:** Sales Manager, Admin
- **Query Params:** `period` (`today` | `this_month`)
- **Response Data:**
```json
{
  "revenue": 1450000000.0,
  "pendingOrdersCount": 8,
  "lowStockSkusCount": 3,
  "overdueDebtAmount": 210000000.0
}
```

#### `GET /reports/sales`
- **Story:** S8-06
- **Phân quyền:** Sales Manager
- **Query Params:** `groupBy` (`sales_rep` | `region` | `customer` | `category`), `fromDate`, `toDate`
- **Response Data:** Báo cáo doanh thu đa chiều theo tiêu chí gom nhóm.

#### `GET /reports/inventory-turnover`
- **Story:** S8-07
- **Phân quyền:** WH Manager
- **Query Params:** `warehouseId`, `categoryId`
- **Response Data:** Giá trị tồn, hệ số vòng quay hàng tồn kho, số ngày tồn kho bình quân.

#### `GET /reports/debt-overdue`
- **Story:** S8-09
- **Phân quyền:** Accountant, Sales Manager
- **Query Params:** `salesRepId`, `regionId`
- **Response Data:** Báo cáo tổng hợp nợ xấu và nợ quá hạn theo từng nhân viên phụ trách.
