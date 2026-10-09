# TÀI LIỆU QUY CHUẨN LẬP TRÌNH (CODING CONVENTIONS)
**Dự án:** Hệ Thống Bán Hàng & Kho  
**Tech Stack:** Python (Backend) · React (Frontend) · MySQL (Database)  
**Mục tiêu:** Đồng bộ phong cách viết code, tối ưu khả năng đọc hiểu, giảm thiểu xung đột mã nguồn (merge conflicts) và đảm bảo chất lượng hệ thống khi phát triển song song nhiều thành viên.

---

## 1. QUY ƯỚC QUẢN LÝ MÃ NGUỒN & GIT (GIT WORKFLOW)

### 1.1. Chiến lược phân nhánh (Branching Strategy)
* `main` / `master`: Nhánh sản phẩm, mã nguồn ổn định, đã kiểm thử xong từng Sprint. Nghiêm cấm push code trực tiếp.
* `develop`: Nhánh tích hợp chính của cả nhóm. Mọi tính năng sau khi review xong sẽ merge vào đây.
* `feature/<story-id>-<tên-ngắn-gọn>`: Nhánh làm tính năng theo từng User Story.
  * Ví dụ: `feature/S4-01-order-pricing`, `feature/S1-01-auth-login`.
* `bugfix/<story-id>-<mô-tả>`: Nhánh sửa lỗi phát sinh trong sprint.
  * Ví dụ: `bugfix/S5-05-fix-reserved-stock-calc`.

### 1.2. Quy ước thông điệp Commit (Conventional Commits)
Cấu trúc commit chuẩn:
```text
<type>(<scope>): <mô tả ngắn gọn bằng tiếng Việt hoặc tiếng Anh> [Story-ID]
```

* **Type quy định:**
  * `feat`: Thêm tính năng mới (Feature).
  * `fix`: Sửa lỗi (Bug fix).
  * `refactor`: Tái cấu trúc mã nguồn nhưng không đổi logic/tính năng.
  * `style`: Chỉnh sửa định dạng code (khoảng trắng, dấu chấm phẩy, format).
  * `docs`: Cập nhật tài liệu kỹ thuật, README.
  * `chore`: Cập nhật cấu hình build, dependencies, Docker, gitignore.
* **Ví dụ mẫu:**
  * `feat(order): thêm logic tính tự động chiết khấu theo sản lượng [S4-01]`
  * `fix(inventory): xử lý lỗi trừ âm tồn khả dụng khi duyệt đơn [S5-06]`
  * `refactor(auth): tách middleware xác thực JWT thành file riêng [S1-02]`

### 1.3. Quy trình Pull Request (PR) & Code Review
* Mỗi PR chỉ giải quyết trọn vẹn **1 User Story** hoặc 1 tác vụ cụ thể.
* PR phải có ít nhất **1 thành viên khác (Peer Review)** phê duyệt trước khi merge vào `develop`.
* Luôn cập nhật (rebase/pull) từ `develop` về nhánh cá nhân trước khi mở PR để giải quyết xung đột cục bộ.

---

## 2. DATABASE CONVENTION (MySQL)

### 2.1. Cấu hình bảng & Kiểu dữ liệu
* **Storage Engine:** Bắt buộc sử dụng `InnoDB` (hỗ trợ Transaction và Foreign Key ràng buộc toàn vẹn).
* **Bảng mã (Charset/Collation):** `utf8mb4` kết hợp `utf8mb4_unicode_ci` (hỗ trợ đầy đủ tiếng Việt có dấu và ký tự đặc biệt).
* **Số tiền (Currency):** **Tuyệt đối không dùng `FLOAT` hoặc `DOUBLE`**. Bắt buộc dùng `DECIMAL(18, 2)` (hoặc `DECIMAL(15, 2)`).
* **Số lượng hàng hóa (Quantity/Unit Conversion):** Dùng `DECIMAL(12, 3)` để hỗ trợ các đơn vị lẻ (kg, lít, mét).
* **Thời gian:** Dùng `DATETIME` hoặc `TIMESTAMP` (khuyến nghị lưu UTC).

### 2.2. Quy tắc đặt tên (Naming Rules)
* **Tên bảng:** Viết thường `snake_case`, dùng **danh từ số nhiều**.
  * Chuẩn: `users`, `products`, `orders`, `order_items`, `warehouse_receipts`.
  * Không dùng: `tbl_User`, `Product`, `Order_Detail`.
* **Khóa chính (Primary Key):** Đặt tên ngắn gọn là `id` (kiểu `BIGINT UNSIGNED AUTO_INCREMENT`).
* **Khóa ngoại (Foreign Key):** Dạng `{tên_bảng_số_ít}_id`.
  * Ví dụ: `user_id`, `product_id`, `warehouse_id`, `order_id`.
* **Cột cờ trạng thái (Boolean):** Bắt đầu bằng tiền tố `is_` hoặc `has_` (kiểu `TINYINT(1)`).
  * Ví dụ: `is_active`, `is_expired`, `has_tax`.
* **Cột trạng thái danh mục/vòng đời:** Dùng `VARCHAR(30)` dạng `UPPER_SNAKE_CASE` (ví dụ: `PENDING_APPROVAL`, `APPROVED`, `DELIVERED`).

### 2.3. Các trường bắt buộc cho mọi bảng nghiệp vụ
```sql
CREATE TABLE `orders` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `order_code` VARCHAR(50) NOT NULL UNIQUE,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    `total_amount` DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    -- Trường hệ thống bắt buộc:
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME NULL, -- Phục vụ Soft Delete (Xóa mềm)
    
    CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
    INDEX `idx_orders_customer_id` (`customer_id`),
    INDEX `idx_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. BACKEND CONVENTION (PYTHON)

### 3.1. Cấu trúc thư mục chuẩn (Layered Architecture)
```text
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── endpoints/      # Controller / Router tiếp nhận Request (auth.py, orders.py)
│   │   │   └── api_router.py   # Gom các router
│   ├── core/                  # Cấu hình hệ thống (config.py, security.py, database.py)
│   ├── models/                # SQLAlchemy / Tortoise ORM Models
│   ├── schemas/               # Pydantic DTO (Request/Response schemas)
│   ├── services/              # Business Logic (tính giá, kiểm hạn mức, kho FEFO)
│   ├── repositories/          # Tương tác Database trực tiếp
│   └── utils/                 # Hàm tiện ích dùng chung (formatters, helpers)
├── migrations/                # Quản lý script DB (Alembic)
├── tests/                     # Unit test, Integration test
├── requirements.txt
└── main.py                    # Entrypoint ứng dụng
```

### 3.2. Quy tắc đặt tên trong Python (Tuân thủ chuẩn PEP 8)
* **Biến, Hàm, Method:** `snake_case` (ví dụ: `calculate_total_price()`, `available_qty`)
* **Class, ORM Model, Schema:** `PascalCase` (ví dụ: `OrderService`, `ProductModel`, `UserCreateRequest`)
* **Hằng số (Constants):** `UPPER_SNAKE_CASE` (ví dụ: `MAX_CREDIT_DAYS`, `DEFAULT_PAGE_SIZE`, `JWT_SECRET_KEY`)
* **Module / File (`.py`):** `snake_case` (ví dụ: `order_service.py`, `token_handler.py`)
* **Thuộc tính/Hàm nội bộ:** `_prefix_snake_case` (ví dụ: `_validate_stock()`, `_generate_order_code()`)

### 3.3. Type Annotations & Xử lý DTO (Pydantic)
* Mọi hàm đều phải khai báo kiểu dữ liệu cho tham số đầu vào và giá trị trả về (`Type Hinting`).
* Chuyển đổi linh hoạt giữa `snake_case` trong Python và `camelCase` khi trả JSON ra Frontend qua alias:

```python
from pydantic import BaseModel, ConfigDict
from decimal import Decimal
from typing import Optional

def to_camel(string: str) -> str:
    words = string.split('_')
    return words[0] + ''.join(word.capitalize() for word in words[1:])

class BaseDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class OrderItemCreate(BaseDTO):
    product_id: int
    unit_id: int
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0.0")
```

### 3.4. Xử lý ngoại lệ (Exception Handling)
* Không dùng `except Exception: pass`.
* Tạo Exception nghiệp vụ riêng biệt kế thừa Exception cơ sở:

```python
class BusinessLogicError(Exception):
    def __init__(self, message: str, code: int = 400):
        self.message = message
        self.code = code

class InsufficientStockError(BusinessLogicError):
    def __init__(self, sku: str):
        super().__init__(f"Sản phẩm {sku} không đủ số lượng tồn khả dụng.", code=422)
```

---

## 4. FRONTEND CONVENTION (REACT)

### 4.1. Cấu trúc thư mục (Feature-based)
```text
frontend/src/
├── assets/             # Hình ảnh, icons, styles chung
├── components/         # Các UI component tái sử dụng (Button, Table, Modal, Input)
├── features/           # Gom nhóm theo màn hình nghiệp vụ
│   ├── auth/           # Login, ForgotPassword
│   ├── orders/         # OrderList, OrderCreate, OrderDetail
│   └── inventory/      # StockCheck, LotsManagement
├── hooks/              # Custom React Hooks (useDebounce, usePermission)
├── services/           # Gọi API qua Axios (apiClient.js, orderService.js)
├── constants/          # Enums, mapping text, đường dẫn router
└── utils/              # Helper functions (formatCurrency, formatDate)
```

### 4.2. Quy tắc đặt tên trong React
* **Component File & Name:** `PascalCase` (`OrderTable.jsx`, `CreateCustomerModal.jsx`)
* **Custom Hooks:** `camelCase` bắt đầu bằng `use` (`useAuth.js`, `useFetchInventory.js`)
* **File Utils, Services, APIs:** `camelCase` (`orderService.js`, `formatCurrency.js`, `apiClient.js`)
* **Biến, Hàm sự kiện:** `camelCase` (`orderData`, `handleFilterSubmit()`, `isLoading`)
* **Hằng số, Enums UI:** `UPPER_SNAKE_CASE` (`ORDER_STATUS_OPTIONS`, `DEFAULT_PAGE_LIMIT`)

### 4.3. Viết Component chuẩn & Quản lý State
* Luôn sử dụng Functional Component và React Hooks.
* Tách biệt logic gọi API vào `services/` hoặc Custom Hook.
* Xử lý đủ 3 trạng thái: `Loading`, `Success` và `Error`.

---

## 5. QUY ƯỚC NGHIỆP VỤ ĐẶC THÙ (HỆ THỐNG BÁN HÀNG & KHO)

### 5.1. Vòng đời Đơn hàng (Order Lifecycle)
```text
DRAFT -> PENDING_APPROVAL -> APPROVED -> PICKING -> DISPATCHED -> DELIVERED
   \              \
    \              +--------> REJECTED
     +----------------------> CANCELLED
```
* `DRAFT`: Đơn đang soạn, chưa duyệt.
* `PENDING_APPROVAL`: Đơn bị chặn do vượt hạn mức hoặc dưới giá sàn, đang chờ Sales Manager duyệt.
* `APPROVED`: Đã duyệt hợp lệ. **Hệ thống kích hoạt giữ chỗ tồn kho (Reserved Stock)**.
* `PICKING`: Nhân viên kho đang tiến hành soạn hàng theo lô FEFO.
* `DISPATCHED`: Đã xuất kho lên xe vận chuyển. Tồn giữ chỗ chuyển thành xuất thực tế.
* `DELIVERED`: Đại lý đã nhận và ký biên bản giao nhận (POD).
* `CANCELLED`: Hủy đơn. Bắt buộc **giải phóng tồn giữ chỗ (Release Reserved Stock)**.

### 5.2. Công thức tính Tồn kho 3 cột
Tại bảng `inventory`:
```text
Tồn khả dụng (available_qty) = Tồn thực tế (physical_qty) - Tồn đang giữ chỗ (reserved_qty)
```
* Khi kiểm tra hàng để tạo đơn: So sánh số lượng đặt với `available_qty`.
* Khi lập phiếu nhập kho: Tăng `physical_qty`.
* Khi đơn sang `APPROVED`: Tăng `reserved_qty`.
* Khi đơn `DISPATCHED`: Giảm đồng thời cả `physical_qty` và `reserved_qty`.

### 5.3. Định dạng hiển thị Dữ liệu
* **Tiền tệ:** Định dạng ngăn cách hàng nghìn + `₫` hoặc `VND` (ví dụ: `1,500,000 VND`).
* **Ngày tháng UI:** `DD/MM/YYYY` (ví dụ: `15/10/2026`).
* **Thời gian gửi API:** Chuẩn ISO-8601 `YYYY-MM-DD` hoặc `YYYY-MM-DDTHH:mm:ssZ`.

---

## 6. CHECKLIST TRƯỚC KHI PULL REQUEST
- [ ] Code đã qua linter & format (`black`/`flake8` cho Python, `prettier`/`eslint` cho React).
- [ ] Không commit file `.env`, mật khẩu, token hay API Key bí mật.
- [ ] Đã xóa bỏ các lệnh `print()`, `console.log()` rác.
- [ ] Backend response đúng Envelope chuẩn (`code`, `success`, `data`, `message`).
- [ ] Frontend xử lý đủ Empty State và Loading Spinner.
- [ ] Commit message đúng cú pháp `type(scope): mô tả [Story-ID]`.
