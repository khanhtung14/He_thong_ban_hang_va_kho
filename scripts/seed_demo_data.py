"""Create an isolated SQLite database and login fixture for local manual testing.

Run from the repository root with:
    python scripts/seed_demo_data.py

Set DATABASE_URL before running to seed a different database. The default is
database/demo.db so this script does not touch the configured MySQL database.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from datetime import date

import bcrypt


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "database"
DATABASE_DIR.mkdir(exist_ok=True)
os.environ.setdefault("DATABASE_URL", "sqlite:///./database/demo.db")
sys.path.insert(0, str(ROOT))

from sqlalchemy import inspect, select  # noqa: E402

from src.backend.database import SessionLocal, engine, migrate_pricing_schema  # noqa: E402
from src.backend.models import (  # noqa: E402
    AccountAuditLog,
    AccountStatus,
    Base,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    PriceList,
    PriceListItem,
    Permission,
    Role,
    Territory,
    User,
    Warehouse,
)


DEMO_PASSWORD = "Demo1234!"

ROLE_DEFINITIONS = [
    ("CUSTOMER", "Đại lý", "Đặt và theo dõi đơn hàng"),
    ("SALES", "Nhân viên kinh doanh", "Quản lý khách hàng và đơn hàng"),
    ("SALES_MANAGER", "Quản lý kinh doanh", "Theo dõi hoạt động kinh doanh"),
    ("WAREHOUSE", "Thủ kho", "Xử lý xuất nhập và soạn hàng"),
    ("WH_MANAGER", "Quản lý kho", "Quản lý kho và phân công"),
    ("ACCOUNTANT", "Kế toán", "Theo dõi hóa đơn và công nợ"),
    ("ADMIN", "Quản trị hệ thống", "Quản lý người dùng và cấu hình"),
]

PERMISSION_DEFINITIONS = [
    ("orders.read", "Xem đơn hàng"),
    ("orders.create", "Tạo đơn hàng"),
    ("customers.read", "Xem đại lý"),
    ("customers.manage", "Quản lý đại lý"),
    ("inventory.read", "Xem tồn kho"),
    ("inventory.manage", "Quản lý tồn kho"),
    ("accounting.read", "Xem công nợ và hóa đơn"),
    ("users.manage", "Quản lý tài khoản người dùng"),
]

ROLE_PERMISSIONS = {
    "CUSTOMER": ["orders.read", "orders.create"],
    "SALES": ["orders.read", "orders.create", "customers.read", "customers.manage", "inventory.read"],
    "SALES_MANAGER": ["orders.read", "customers.read", "customers.manage", "inventory.read"],
    "WAREHOUSE": ["orders.read", "inventory.read", "inventory.manage"],
    "WH_MANAGER": ["orders.read", "inventory.read", "inventory.manage"],
    "ACCOUNTANT": ["orders.read", "accounting.read"],
    "ADMIN": [code for code, _ in PERMISSION_DEFINITIONS],
}

WAREHOUSE_DEFINITIONS = [
    ("WH-HN", "Kho Hà Nội", "Long Biên, Hà Nội"),
    ("WH-HCM", "Kho TP. Hồ Chí Minh", "Thủ Đức, TP. Hồ Chí Minh"),
]

TERRITORY_DEFINITIONS = [
    ("VN", "Việt Nam", None),
    ("HN", "Hà Nội", "VN"),
    ("HCM", "TP. Hồ Chí Minh", "VN"),
    ("DN", "Đà Nẵng", "VN"),
]

# All accounts use DEMO_PASSWORD. The locked account is useful for checking
# that login rejects a non-ACTIVE account.
ACCOUNT_DEFINITIONS = [
    ("demo_customer", "customer@example.com", "Nguyễn Đại Lý", "CUSTOMER", "ACTIVE"),
    ("demo_sales", "sales@example.com", "Trần Kinh Doanh", "SALES", "ACTIVE"),
    ("demo_sales_mgr", "sales.manager@example.com", "Lê Quản Lý Kinh Doanh", "SALES_MANAGER", "ACTIVE"),
    ("demo_warehouse", "warehouse@example.com", "Phạm Thủ Kho", "WAREHOUSE", "ACTIVE"),
    ("demo_wh_mgr", "warehouse.manager@example.com", "Võ Quản Lý Kho", "WH_MANAGER", "ACTIVE"),
    ("demo_accountant", "accountant@example.com", "Đặng Kế Toán", "ACCOUNTANT", "ACTIVE"),
    ("demo_admin", "admin@example.com", "Bùi Quản Trị", "ADMIN", "ACTIVE"),
    ("demo_locked", "locked@example.com", "Tài Khoản Đang Khóa", "SALES", "LOCKED"),
]


def seed() -> Path:
    _upgrade_legacy_demo_schema()
    Base.metadata.create_all(bind=engine)
    migrate_pricing_schema()
    db = SessionLocal()
    try:
        permissions: dict[str, Permission] = {}
        for code, description in PERMISSION_DEFINITIONS:
            permission = db.scalar(select(Permission).where(Permission.code == code))
            if permission is None:
                permission = Permission(code=code, description=description)
                db.add(permission)
            else:
                permission.description = description
            permissions[code] = permission

        roles: dict[str, Role] = {}
        for code, name, description in ROLE_DEFINITIONS:
            role = db.scalar(select(Role).where(Role.code == code))
            if role is None:
                role = Role(code=code, name=name, description=description)
                db.add(role)
            else:
                role.name = name
                role.description = description
            role.permissions = [permissions[item] for item in ROLE_PERMISSIONS[code]]
            roles[code] = role

        territories: dict[str, Territory] = {}
        for code, name, _parent_code in TERRITORY_DEFINITIONS:
            territory = db.scalar(select(Territory).where(Territory.code == code))
            if territory is None:
                territory = Territory(code=code, name=name)
                db.add(territory)
            else:
                territory.name = name
            territories[code] = territory
        db.flush()
        for code, _name, parent_code in TERRITORY_DEFINITIONS:
            territories[code].parent_id = territories[parent_code].id if parent_code else None

        warehouses: dict[str, Warehouse] = {}
        for code, name, address in WAREHOUSE_DEFINITIONS:
            warehouse = db.scalar(select(Warehouse).where(Warehouse.code == code))
            if warehouse is None:
                warehouse = Warehouse(code=code, name=name, address=address, is_active=True)
                db.add(warehouse)
            else:
                warehouse.name = name
                warehouse.address = address
                warehouse.is_active = True
            warehouses[code] = warehouse

        db.flush()
        login_accounts = []
        seeded_users: dict[str, User] = {}
        for username, email, full_name, role_code, status_value in ACCOUNT_DEFINITIONS:
            password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            user = db.scalar(select(User).where(User.username == username))
            if user is None:
                user = User(
                    username=username,
                    email=email,
                    full_name=full_name,
                    password_hash=password_hash,
                )
                db.add(user)
            user.email = email
            user.full_name = full_name
            user.password_hash = password_hash
            user.status = AccountStatus(status_value)
            user.roles = [roles[role_code]]
            user.territories = []
            user.warehouses = []
            if role_code in {"SALES", "SALES_MANAGER"}:
                user.territories = [territories["HN"], territories["DN"]]
            elif role_code == "CUSTOMER":
                user.territories = [territories["HN"]]
            if role_code in {"WAREHOUSE", "WH_MANAGER"}:
                user.warehouses = [warehouses["WH-HN"], warehouses["WH-HCM"]]
            seeded_users[username] = user
            login_accounts.append(
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                    "role_code": role_code,
                    "status": status_value,
                }
            )

        db.flush()
        admin_id = seeded_users["demo_admin"].id
        audit_exists = db.scalar(
            select(AccountAuditLog.id).where(
                AccountAuditLog.user_id == seeded_users["demo_locked"].id,
                AccountAuditLog.action == "ACCOUNT_LOCKED",
                AccountAuditLog.reason == "Tài khoản demo để kiểm tra đăng nhập bị khóa",
            )
        )
        if audit_exists is None:
            db.add(
                AccountAuditLog(
                    user_id=seeded_users["demo_locked"].id,
                    actor_user_id=admin_id,
                    action="ACCOUNT_LOCKED",
                    reason="Tài khoản demo để kiểm tra đăng nhập bị khóa",
                )
            )

        _seed_sales_manager_data(db, seeded_users, territories)

        db.commit()
        fixture_path = DATABASE_DIR / "demo_login_users.json"
        fixture_path.write_text(
            json.dumps(login_accounts, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return fixture_path
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _upgrade_legacy_demo_schema() -> None:
    """Add columns introduced after an existing local SQLite demo DB was created."""
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "phone" not in existing_columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN phone VARCHAR(20)")
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_users_phone ON users (phone)"
            )
        if "must_change_password" not in existing_columns:
            connection.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 1"
            )


def _seed_sales_manager_data(db, users: dict[str, User], territories: dict[str, Territory]) -> None:
    """Seed repeatable customer, pricing, order and approval data for the manager UI."""
    today = date.today()
    start_date = today.replace(month=1, day=1)
    end_date = today.replace(month=12, day=31)
    sales_rep_id = users["demo_sales"].id
    territory_id = territories["HN"].id

    customers_data = [
        ("DEMO-CUST-L1", "Đại lý Minh Phát (Cấp 1)", "DEALER_LEVEL_1"),
        ("DEMO-CUST-L2", "Đại lý An Khang (Cấp 2)", "DEALER_LEVEL_2"),
        ("DEMO-CUST-RT", "Cửa hàng Demo (Khách lẻ)", "RETAIL"),
    ]
    customers: dict[str, Customer] = {}
    for code, name, customer_group in customers_data:
        customer = db.scalar(select(Customer).where(Customer.code == code))
        if customer is None:
            customer = Customer(code=code, name=name)
            db.add(customer)
        customer.name = name
        customer.sales_rep_id = sales_rep_id
        customer.territory_id = territory_id
        customer.customer_group = customer_group
        customer.is_active = True
        customer.is_locked = False
        customer.lock_reason = None
        customers[customer_group] = customer
    db.flush()

    price_definitions = {
        "DEALER_LEVEL_1": ("PL-DEMO-L1", [("SKU-001", 470000, 450000), ("SKU-002", 225000, 210000)]),
        "DEALER_LEVEL_2": ("PL-DEMO-L2", [("SKU-001", 490000, 470000), ("SKU-002", 232000, 220000)]),
        "RETAIL": ("PL-DEMO-RETAIL", [("SKU-001", 500000, 480000), ("SKU-002", 240000, 225000)]),
    }
    price_lists: dict[str, PriceList] = {}
    for customer_group, (code, line_definitions) in price_definitions.items():
        price_list = db.scalar(
            select(PriceList).where(PriceList.code == code, PriceList.version == 1)
        )
        if price_list is None:
            price_list = PriceList(code=code, version=1)
            db.add(price_list)
        price_list.customer_group = customer_group
        price_list.start_date = start_date
        price_list.end_date = end_date
        price_list.published = True
        price_list.items = [
            PriceListItem(sku=sku, sale_price=sale_price, floor_price=floor_price)
            for sku, sale_price, floor_price in line_definitions
        ]
        price_lists[customer_group] = price_list
    db.flush()

    order_definitions = [
        {
            "order_code": "DEMO-ORD-COMPLETE-001",
            "customer": "DEALER_LEVEL_1",
            "status": OrderStatus.COMPLETED,
            "lines": [("SKU-001", "Nước tăng lực Red Bull 250ml", 8, 470000, 450000), ("SKU-002", "Cà phê lon Highlands 235ml", 5, 225000, 210000)],
            "approval_reason": None,
            "note": "Đơn demo đã hoàn tất để hiển thị báo cáo doanh số.",
        },
        {
            "order_code": "DEMO-ORD-APPROVAL-001",
            "customer": "DEALER_LEVEL_1",
            "status": OrderStatus.PENDING,
            "lines": [("SKU-001", "Nước tăng lực Red Bull 250ml", 2, 440000, 450000)],
            "approval_reason": "SKU-001: 440000 dưới giá sàn 450000",
            "note": "Đơn demo chờ quản lý duyệt giá dưới sàn.",
        },
        {
            "order_code": "DEMO-ORD-PROCESSING-001",
            "customer": "DEALER_LEVEL_2",
            "status": OrderStatus.PROCESSING,
            "lines": [("SKU-002", "Cà phê lon Highlands 235ml", 4, 232000, 220000)],
            "approval_reason": None,
            "note": "Đơn demo đang được xử lý.",
        },
    ]
    for definition in order_definitions:
        order = db.scalar(select(Order).where(Order.order_code == definition["order_code"]))
        if order is None:
            order = Order(order_code=definition["order_code"])
            db.add(order)
        customer = customers[definition["customer"]]
        order.customer_id = customer.id
        order.created_by_id = sales_rep_id
        order.status = definition["status"]
        order.approval_reason = definition["approval_reason"]
        order.note = definition["note"]
        order.total_amount = sum(quantity * unit_price for _, _, quantity, unit_price, _ in definition["lines"])
        order.items = [
            OrderItem(
                sku=sku,
                product_name=product_name,
                quantity=quantity,
                unit_price=unit_price,
                floor_price=floor_price,
                price_list_id=price_lists[definition["customer"]].id,
            )
            for sku, product_name, quantity, unit_price, floor_price in definition["lines"]
        ]


if __name__ == "__main__":
    fixture_path = seed()
    print(f"Demo database: {engine.url}")
    print(f"Login fixture: {fixture_path.relative_to(ROOT)}")
    print(f"Shared password: {DEMO_PASSWORD}")
    print("PowerShell: $env:LOGIN_USERS_JSON = Get-Content database/demo_login_users.json -Raw")
    print("Start API:  python -m uvicorn src.backend.main:app --reload")
