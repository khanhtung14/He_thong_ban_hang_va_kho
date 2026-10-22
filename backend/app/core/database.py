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
    from app.models.models import Base, PriceList, PriceListItem, CustomerHandoverHistory, ProductPriceHistory

    Base.metadata.create_all(
        bind=engine,
        tables=[
            PriceList.__table__,
            PriceListItem.__table__,
            CustomerHandoverHistory.__table__,
            ProductPriceHistory.__table__,
        ],
    )
    inspector = inspect(engine)
    additions = {
        "customers": {
            "customer_group": "VARCHAR(30) NOT NULL DEFAULT 'RETAIL'",
            "is_locked": "BOOLEAN NOT NULL DEFAULT 0",
            "lock_reason": "VARCHAR(255) NULL",
            "locked_at": "DATETIME NULL",
            "locked_by_id": "INTEGER NULL",
            "phone": "VARCHAR(20) NULL",
        },
        "orders": {"approval_reason": "TEXT NULL"},
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


def migrate_delivery_confirmation_schema():
    """Create additive SCRUM-51 delivery evidence tables for existing installs."""
    from app.models.models import Base, DeliveryConfirmation, DeliveryProofImage

    Base.metadata.create_all(
        bind=engine,
        tables=[DeliveryConfirmation.__table__, DeliveryProofImage.__table__],
    )
