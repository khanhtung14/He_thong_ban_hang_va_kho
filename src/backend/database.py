import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from app.core.database import *  # noqa: F401,F403
from app.core.database import engine, SessionLocal, get_db, init_db, migrate_pricing_schema

__all__ = ["engine", "SessionLocal", "get_db", "init_db", "migrate_pricing_schema"]
