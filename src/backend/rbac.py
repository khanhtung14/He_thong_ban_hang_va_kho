import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from app.api.v1.endpoints.rbac import *  # noqa: F401,F403
from app.api.v1.endpoints.rbac import (
    create_access_token as create_access_token,
    require_roles as require_roles,
    get_current_user as get_current_user,
    AuthenticatedUser as AuthenticatedUser,
)

__all__ = ["create_access_token", "require_roles", "get_current_user", "AuthenticatedUser"]

