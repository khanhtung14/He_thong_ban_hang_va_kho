import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Database configuration (Hỗ trợ MySQL theo chỉ thị Team Lead & Fallback SQLite an toàn)
DATABASE_FILE = BASE_DIR / "database" / "app.db"
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "123456")
MYSQL_DB = os.getenv("MYSQL_DB", "he_thong_kho")

MYSQL_URL = f"mysql+mysqlconnector://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}"
SQLITE_URL = f"sqlite:///{DATABASE_FILE}"


def resolve_database_url() -> str:
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]
    try:
        from sqlalchemy import create_engine
        test_engine = create_engine(MYSQL_URL, connect_args={"connect_timeout": 1}, pool_pre_ping=True)
        with test_engine.connect():
            return MYSQL_URL
    except Exception:
        return SQLITE_URL


DATABASE_URL = resolve_database_url()

# Pagination defaults (Yêu cầu Jira: mặc định 20 dòng)
DEFAULT_PAGE_SIZE = 20
DEFAULT_PAGE = 1

# Security configuration
TEMP_PASSWORD_LENGTH = 10

# Danh mục 7 vai trò chuẩn hóa theo tài liệu hệ thống (Sheet 2: User Roles)
DEFAULT_ROLES = [
    {"code": "SALES", "name": "Nhân viên kinh doanh", "description": "Nhân viên kinh doanh phụ trách địa bàn và khách hàng"},
    {"code": "ADMIN", "name": "Quản trị hệ thống", "description": "Toàn quyền quản trị tài khoản và phân quyền hệ thống"},
    {"code": "SALES_MANAGER", "name": "Quản lý kinh doanh", "description": "Phụ trách hoạt động bán hàng, duyệt đơn đặc biệt"},
    {"code": "WAREHOUSE", "name": "Nhân viên kho", "description": "Thủ kho, người soạn hàng theo lô và xuất nhập kho"},
    {"code": "WH_MANAGER", "name": "Quản lý kho", "description": "Phụ trách kho bãi, duyệt điều chỉnh tồn và chuyển kho"},
    {"code": "ACCOUNTANT", "name": "Kế toán công nợ", "description": "Theo dõi công nợ đại lý, hoá đơn và thanh toán"},
    {"code": "CUSTOMER", "name": "Đại lý", "description": "Khách hàng mua buôn, đặt hàng qua cổng tự phục vụ"},
]

# User statuses
DEFAULT_STATUSES = [
    {"code": "PENDING_ACTIVATION", "name": "Chờ kích hoạt", "description": "Tài khoản mới tạo, chưa đăng nhập đổi mật khẩu"},
    {"code": "ACTIVE", "name": "Đang hoạt động", "description": "Tài khoản đang hoạt động bình thường"},
    {"code": "LOCKED", "name": "Bị khóa", "description": "Tài khoản tạm thời bị khóa truy cập"},
]
