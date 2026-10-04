"""Database engine and SQLAlchemy session factory."""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[2] / "database" / "demo.db"
DEFAULT_SQLITE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if DEFAULT_SQLITE_PATH.is_file():
        DATABASE_URL = DEFAULT_SQLITE_URL
    else:
        DATABASE_URL = "mysql+pymysql://oms_user:change-me@localhost:3306/oms?charset=utf8mb4"

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
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

