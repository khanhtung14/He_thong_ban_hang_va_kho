"""MySQL engine and SQLAlchemy session factory."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # "mysql+pymysql://oms_user:change-me@localhost:3306/oms?charset=utf8mb4",

    "sqlite:///./database/demo.db",

    
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
    from src.backend.models import Base, seed_default_roles
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_roles(db)
