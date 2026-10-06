"""MySQL engine and SQLAlchemy session factory."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://oms_user:change-me@localhost:3306/oms?charset=utf8mb4",
)

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
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
