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

The forgot-password flow looks up each account email in the `users` table and records a demo reset link in `GET /dev/mock-outbox`. Seed the demo database before requesting a reset for a seeded account.

For actual email delivery, configure `SMTP_HOST` and `SMTP_FROM`; optionally set
`SMTP_PORT` (default `587`), `SMTP_USERNAME`, `SMTP_PASSWORD`, and
`SMTP_USE_SSL=true` for implicit TLS. Set `PUBLIC_BASE_URL` to the public site
origin so emailed links point to the deployed application. Set `APP_ENV=production`
in deployed environments. The mock outbox and token-expiration demo endpoint
are available only in development/demo mode and are disabled when SMTP is
configured or `APP_ENV=production`.
Reset tokens are stored hashed in `password_reset_tokens` and expire after 30
minutes. The public response never contains the reset link.

> Bộ dữ liệu chỉ dành cho phát triển cục bộ. Không dùng mật khẩu mẫu hay tài khoản này trên môi trường thật.

### Demo account emails

| Username | Email |
|---|---|
| `demo_customer` | `customer@example.com` |
| `demo_sales` | `sales@example.com` |
| `demo_sales_mgr` | `sales.manager@example.com` |
| `demo_warehouse` | `warehouse@example.com` |
| `demo_wh_mgr` | `warehouse.manager@example.com` |
| `demo_accountant` | `accountant@example.com` |
| `demo_admin` | `admin@example.com` |
| `demo_locked` | `locked@example.com` |

These addresses are stored in the `users` table and `database/demo_login_users.json`. Run `scripts/seed_demo_data.py` to refresh the demo database and regenerate the fixture.
