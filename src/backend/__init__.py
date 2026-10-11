import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from . import (
    change_password,
    database,
    email_service,
    forgot_password,
    inventory,
    login,
    navigation,
    price_lists,
    products,
    rbac,
    reports,
    security,
    session,
    user_routes,
    users_service,
)

__all__ = [
    "change_password",
    "database",
    "email_service",
    "forgot_password",
    "inventory",
    "login",
    "navigation",
    "price_lists",
    "products",
    "rbac",
    "reports",
    "security",
    "session",
    "user_routes",
    "users_service",
]
