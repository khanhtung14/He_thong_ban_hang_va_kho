"""MySQL engine and SQLAlchemy session factory."""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


# Load the project-level .env while allowing explicit shell variables to win.
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///../database/demo.db",
)

if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.endswith(":memory:"):
    db_path_str = DATABASE_URL.replace("sqlite:///", "")
    db_path = Path(db_path_str)
    if not db_path.is_absolute() and not db_path.exists():
        # Check project root directory or database/demo.db
        root_dir = Path(__file__).resolve().parents[3]
        candidate1 = root_dir / db_path_str.lstrip("./\\").replace("../", "")
        candidate2 = root_dir / "database" / "demo.db"
        if candidate1.exists():
            DATABASE_URL = f"sqlite:///{candidate1.resolve().as_posix()}"
        elif candidate2.exists():
            DATABASE_URL = f"sqlite:///{candidate2.resolve().as_posix()}"

connect_args = {}
engine_options = {"pool_pre_ping": True}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}
    engine_options["connect_args"] = connect_args
    if DATABASE_URL.endswith(":memory:") or DATABASE_URL == "sqlite://":
        # Keep one in-memory database shared by the app and TestClient threads.
        engine_options["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and seed default roles if needed."""
    from app.models.models import Base, seed_default_roles
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_roles(db)


def migrate_pricing_schema():
    """Create price-list tables and add pricing/approval fields to existing DBs."""
    from app.models.models import (
        Base,
        PriceList,
        PriceListItem,
        HandoverHistory,
        CustomerHandoverHistory,
        ProductPriceHistory,
        Supplier,
        DiscountPolicy,
        DiscountTier,
        CreditLimitLog,
    )

    Base.metadata.create_all(
        bind=engine,
        tables=[
            PriceList.__table__,
            PriceListItem.__table__,
            HandoverHistory.__table__,
            CustomerHandoverHistory.__table__,
            ProductPriceHistory.__table__,
            Supplier.__table__,
            DiscountPolicy.__table__,
            DiscountTier.__table__,
            CreditLimitLog.__table__,
        ],
        checkfirst=True,
    )
    inspector = inspect(engine)
    additions = {
        "customers": {
            "customer_group": "VARCHAR(30) NOT NULL DEFAULT 'RETAIL'",
            "region": "VARCHAR(100) NULL",
            "tax_code": "VARCHAR(50) NULL",
            "phone": "VARCHAR(25) NULL",
            "email": "VARCHAR(150) NULL",
            "address": "TEXT NULL",
            "sales_rep_id": "INTEGER NULL",
            "assigned_sales_id": "INTEGER NULL",
            "is_active": "BOOLEAN NOT NULL DEFAULT 1",
            "is_locked": "BOOLEAN NOT NULL DEFAULT 0",
            "lock_reason": "VARCHAR(255) NULL",
            "locked_at": "DATETIME NULL",
            "locked_by_id": "INTEGER NULL",
            "credit_limit": "FLOAT NOT NULL DEFAULT 0.0",
            "max_due_days": "INTEGER NOT NULL DEFAULT 30",
            "max_debt_days": "INTEGER NOT NULL DEFAULT 30",
            "current_debt": "FLOAT NOT NULL DEFAULT 0.0",
            "warning_threshold_percent": "FLOAT NOT NULL DEFAULT 80.0",
            "warning_threshold": "FLOAT NOT NULL DEFAULT 80.0",
        },
        "suppliers": {
            "contact_person": "VARCHAR(100) NULL",
            "payment_terms": "VARCHAR(100) NULL",
            "is_active": "BOOLEAN NOT NULL DEFAULT 1",
            "created_at": "DATETIME NULL",
            "updated_at": "DATETIME NULL",
        },
        "delivery_addresses": {
            "note": "TEXT NULL",
        },
        "orders": {
            "approval_reason": "TEXT NULL",
            "delivery_address_id": "INTEGER NULL",
        },
        "order_items": {
            "floor_price": "INTEGER NULL",
            "price_list_id": "INTEGER NULL",
            "sku": "VARCHAR(50) NULL",
            "product_name": "VARCHAR(255) NULL",
        },
        "product_units": {
            "is_base_unit": "BOOLEAN NOT NULL DEFAULT 0",
        },
        "price_list_items": {
            "sku": "VARCHAR(50) NULL",
        },
        "discount_policies": {
            "name": "VARCHAR(255) NOT NULL DEFAULT ''",
            "code": "VARCHAR(50) NULL",
            "scope": "VARCHAR(30) NOT NULL DEFAULT 'SKU'",
            "target_type": "VARCHAR(20) NOT NULL DEFAULT 'SKU'",
            "target_id": "VARCHAR(100) NULL",
            "product_id": "INTEGER NULL",
            "created_by_user_id": "INTEGER NULL",
            "start_date": "DATETIME NULL",
            "end_date": "DATETIME NULL",
            "discount_type": "VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE'",
            "is_active": "BOOLEAN NOT NULL DEFAULT 1",
            "created_at": "DATETIME NULL",
        },
        "discount_tiers": {
            "policy_id": "INTEGER NOT NULL DEFAULT 0",
            "discount_id": "INTEGER NULL",
            "min_qty": "INTEGER NOT NULL DEFAULT 1",
            "discount_percent": "FLOAT NOT NULL DEFAULT 0.0",
            "min_quantity": "INTEGER NOT NULL DEFAULT 1",
            "max_quantity": "INTEGER NULL",
            "discount_value": "FLOAT NOT NULL DEFAULT 0.0",
        },
    }
    for table_name, columns_to_add in additions.items():
        if not inspector.has_table(table_name):
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        missing = [(name, definition) for name, definition in columns_to_add.items() if name not in existing]
        if missing:
            with engine.begin() as connection:
                for name, definition in missing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {name} {definition}"))

    # Backfill phone từ delivery_addresses nếu cột customers.phone đang rỗng
    if inspector.has_table("customers") and inspector.has_table("delivery_addresses"):
        try:
            with engine.begin() as connection:
                connection.execute(text("""
                    UPDATE customers
                    SET phone = (
                        SELECT delivery_addresses.phone
                        FROM delivery_addresses
                        WHERE delivery_addresses.customer_id = customers.id
                        LIMIT 1
                    )
                    WHERE customers.phone IS NULL OR customers.phone = ''
                """))
        except Exception:
            pass

    # Khởi tạo bản ghi giá ban đầu cho các sản phẩm chưa có lịch sử giá
    inspector = inspect(engine)
    if inspector.has_table("product_price_history") and inspector.has_table("products"):
        try:
            with engine.begin() as connection:
                connection.execute(text("""
                    INSERT INTO product_price_history (product_id, old_price, new_price, changed_by, effective_date, reason, note)
                    SELECT id, NULL, base_price, 'Khởi tạo', CURRENT_TIMESTAMP, 'Giá khởi tạo ban đầu', 'Giá khởi tạo ban đầu'
                    FROM products
                    WHERE id NOT IN (SELECT DISTINCT product_id FROM product_price_history) AND base_price IS NOT NULL
                """))
        except Exception:
            pass

    # Đảm bảo bảng credit_limit_logs đồng bộ đầy đủ các cột customer_id, agency_id, changed_by_name, created_by
    if inspector.has_table("credit_limit_logs"):
        try:
            with engine.begin() as connection:
                cols = {c["name"] for c in inspector.get_columns("credit_limit_logs")}
                if "customer_id" not in cols:
                    connection.execute(text("ALTER TABLE credit_limit_logs ADD COLUMN customer_id INTEGER"))
                    connection.execute(text("UPDATE credit_limit_logs SET customer_id = agency_id WHERE customer_id IS NULL"))
                if "changed_by_user_id" not in cols:
                    connection.execute(text("ALTER TABLE credit_limit_logs ADD COLUMN changed_by_user_id INTEGER"))
                if "changed_by_name" not in cols:
                    connection.execute(text("ALTER TABLE credit_limit_logs ADD COLUMN changed_by_name VARCHAR(150)"))
                    connection.execute(text("UPDATE credit_limit_logs SET changed_by_name = created_by WHERE changed_by_name IS NULL"))
                if "agency_id" not in cols:
                    connection.execute(text("ALTER TABLE credit_limit_logs ADD COLUMN agency_id INTEGER"))
                    connection.execute(text("UPDATE credit_limit_logs SET agency_id = customer_id WHERE agency_id IS NULL"))
                if "created_by" not in cols:
                    connection.execute(text("ALTER TABLE credit_limit_logs ADD COLUMN created_by VARCHAR(150)"))
                    connection.execute(text("UPDATE credit_limit_logs SET created_by = changed_by_name WHERE created_by IS NULL"))
                connection.execute(text("""
                    CREATE TRIGGER IF NOT EXISTS trg_credit_limit_logs_sync 
                    AFTER INSERT ON credit_limit_logs 
                    BEGIN 
                        UPDATE credit_limit_logs 
                        SET agency_id = coalesce(NEW.agency_id, NEW.customer_id), 
                            created_by = coalesce(NEW.created_by, NEW.changed_by_name) 
                        WHERE id = NEW.id; 
                    END;
                """))
        except Exception:
            pass


def migrate_sales_order_draft_schema():
    """Add persisted delivery and price-breakdown fields for order drafts."""
    additions = {
        "orders": {
            "delivery_address_id": "INTEGER NULL",
            "desired_delivery_date": "DATE NULL",
            "subtotal_amount": "FLOAT NOT NULL DEFAULT 0",
            "discount_amount": "FLOAT NOT NULL DEFAULT 0",
        },
        "order_items": {
            "unit_name": "VARCHAR(50) NULL",
            "conversion_factor": "FLOAT NOT NULL DEFAULT 1",
            "discount_percent": "FLOAT NOT NULL DEFAULT 0",
            "line_subtotal": "FLOAT NOT NULL DEFAULT 0",
            "discount_amount": "FLOAT NOT NULL DEFAULT 0",
            "line_total": "FLOAT NOT NULL DEFAULT 0",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, columns in additions.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
                    )
