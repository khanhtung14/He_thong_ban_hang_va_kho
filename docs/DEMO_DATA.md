# Dữ liệu mẫu để kiểm thử thủ công

## Tạo dữ liệu và chạy ứng dụng (PowerShell)

Từ thư mục gốc của dự án:

```powershell
$env:DATABASE_URL = "sqlite:///./database/demo.db"
.venv\Scripts\python.exe scripts/seed_demo_data.py
$env:LOGIN_USERS_JSON = Get-Content database/demo_login_users.json -Raw
.venv\Scripts\python.exe -m uvicorn src.backend.main:app --reload
```

Mở `http://127.0.0.1:8000/docs` để gọi API. Seed có thể chạy lại; nó cập nhật các bản ghi demo có cùng username/code và giữ dữ liệu không thuộc bộ demo. Database SQLite được tạo riêng ở `database/demo.db`, không ghi vào MySQL.

## Tài khoản đăng nhập

Tất cả tài khoản dùng mật khẩu `Demo1234!`.

| Username | Vai trò | Trạng thái | Trang sau đăng nhập |
|---|---|---|---|
| `demo_customer` | Đại lý (`CUSTOMER`) | ACTIVE | `/portal/orders` |
| `demo_sales` | Nhân viên kinh doanh (`SALES`) | ACTIVE | `/sales/orders` |
| `demo_sales_mgr` | Quản lý kinh doanh (`SALES_MANAGER`) | ACTIVE | `/manager/dashboard` |
| `demo_warehouse` | Thủ kho (`WAREHOUSE`) | ACTIVE | `/warehouse/picking` |
| `demo_wh_mgr` | Quản lý kho (`WH_MANAGER`) | ACTIVE | `/warehouse/dashboard` |
| `demo_accountant` | Kế toán (`ACCOUNTANT`) | ACTIVE | `/accounting/debt-book` |
| `demo_admin` | Quản trị hệ thống (`ADMIN`) | ACTIVE | `/admin/users` |
| `demo_locked` | Nhân viên kinh doanh (`SALES`) | LOCKED | Dùng để thử đăng nhập bị từ chối |

Tài khoản hoạt động được lưu trong `database/demo_login_users.json` dưới dạng bcrypt hash và được API login đọc qua `LOGIN_USERS_JSON`. Tài khoản `demo_locked` có `status=LOCKED`; login hiện tại từ chối trạng thái này như thông tin đăng nhập sai.

## Dữ liệu nghiệp vụ được tạo

- 7 vai trò, 8 quyền và liên kết quyền theo vai trò.
- 4 địa bàn: Việt Nam, Hà Nội, TP. Hồ Chí Minh và Đà Nẵng.
- 2 kho: Hà Nội và TP. Hồ Chí Minh.
- 8 tài khoản, gán vai trò, địa bàn hoặc kho phù hợp.
- Một audit log mẫu cho tài khoản khóa.

## Thử nhanh đăng nhập bằng API

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"username":"demo_sales","password":"Demo1234!"}'
```

Đổi `demo_sales` thành username của vai trò muốn thử. Login hiện trả URL điều hướng theo vai trò; các trang nghiệp vụ đó có thể chưa được triển khai.

## Quên mật khẩu

Module quên mật khẩu hiện có dữ liệu giả lập riêng trong bộ nhớ, chưa đọc tài khoản từ seed database. Hai email demo được hỗ trợ là `nhanvien@congty.com` và `admin@congty.com`. Gửi yêu cầu tại `POST /forgot-password`; link test xuất hiện trong response demo hoặc tại `GET /dev/mock-outbox`. Giao diện ở `http://127.0.0.1:8000/forgot-password`.

> Bộ dữ liệu chỉ dành cho phát triển cục bộ. Không dùng mật khẩu mẫu hay tài khoản này trên môi trường thật.
