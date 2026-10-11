"""Compatibility shim for src.backend pointing to backend/app."""

from __future__ import annotations

import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import app.core.database as database
import app.models.models as models
import app.core.security as security
import app.core.session as session
import app.api.v1.endpoints.change_password as change_password
import app.api.v1.endpoints.login as login
import app.api.v1.endpoints.forgot_password as forgot_password
import app.api.v1.endpoints.rbac as rbac
import app.api.v1.endpoints.audit_logs as audit_logs
import app.api.v1.endpoints.navigation as navigation
import app.api.v1.endpoints.products as products
import app.api.v1.endpoints.price_lists as price_lists
import app.api.v1.endpoints.user_routes as user_routes
import app.services.email_service as email_service
import app.services.users_service as users_service
import app.api.v1.endpoints.suppliers as suppliers
import main as main_module

app = main_module.app

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
sys.modules["src.backend.main"] = main_module
