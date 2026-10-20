"""Compatibility shim for src.backend pointing to backend/app."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from . import (
    audit_logs,
    change_password,
    database,
    email_service,
    forgot_password,
    inventory,
    login,
    main as main_module,
    models,
    navigation,
    price_lists,
    products,
    rbac,
    reports,
    security,
    session,
    suppliers,
    user_routes,
    users_service,
)

app = getattr(main_module, "app", None)

# Register all modules into sys.modules
sys.modules["src.backend.database"] = database
sys.modules["src.backend.models"] = models
sys.modules["src.backend.security"] = security
sys.modules["src.backend.session"] = session
sys.modules["src.backend.change_password"] = change_password
sys.modules["src.backend.login"] = login
sys.modules["src.backend.forgot_password"] = forgot_password
sys.modules["src.backend.rbac"] = rbac
sys.modules["src.backend.audit_logs"] = audit_logs
sys.modules["src.backend.navigation"] = navigation
sys.modules["src.backend.products"] = products
sys.modules["src.backend.price_lists"] = price_lists
sys.modules["src.backend.user_routes"] = user_routes
sys.modules["src.backend.email_service"] = email_service
sys.modules["src.backend.users_service"] = users_service
sys.modules["src.backend.suppliers"] = suppliers
sys.modules["src.backend.inventory"] = inventory
sys.modules["src.backend.reports"] = reports
sys.modules["src.backend.main"] = main_module

__all__ = [
    "app",
    "audit_logs",
    "change_password",
    "database",
    "email_service",
    "forgot_password",
    "inventory",
    "login",
    "main_module",
    "models",
    "navigation",
    "price_lists",
    "products",
    "rbac",
    "reports",
    "security",
    "session",
    "suppliers",
    "user_routes",
    "users_service",
]
