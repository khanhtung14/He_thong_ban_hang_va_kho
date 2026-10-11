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
    "mysql+pymysql://oms_user:change-me@localhost:3306/oms?charset=utf8mb4",
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
    from app.models.models import Base, PriceList, PriceListItem, Supplier

    Base.metadata.create_all(bind=engine, tables=[PriceList.__table__, PriceListItem.__table__, Supplier.__table__])
    inspector = inspect(engine)
    additions = {
        "customers": {
            "customer_group": "VARCHAR(30) NOT NULL DEFAULT 'RETAIL'",
            "is_locked": "BOOLEAN NOT NULL DEFAULT 0",
            "lock_reason": "VARCHAR(255) NULL",
            "locked_at": "DATETIME NULL",
            "locked_by_id": "INTEGER NULL",
        },
        "suppliers": {
            "contact_person": "VARCHAR(100) NULL",
            "payment_terms": "VARCHAR(100) NULL",
            "is_active": "BOOLEAN NOT NULL DEFAULT 1",
            "created_at": "DATETIME NULL",
            "updated_at": "DATETIME NULL",
        },
        "orders": {"approval_reason": "TEXT NULL"},
        "order_items": {
            "floor_price": "INTEGER NULL",
            "price_list_id": "INTEGER NULL",
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
