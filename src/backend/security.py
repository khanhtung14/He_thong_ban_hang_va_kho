"""Authentication dependencies for protected account administration APIs."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import AccountStatus, User, UserSession
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import AccountStatus, User, UserSession


_bearer = HTTPBearer(auto_error=False)


def require_active_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve a live opaque bearer token to its active database account."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Vui lòng đăng nhập để tiếp tục.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token_hash == token_hash,
            UserSession.revoked_at.is_(None),
        )
        .first()
    )
    if session is None:
        raise unauthorized

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise unauthorized

    user = session.user
    if user is None or user.is_active is False or user.status != AccountStatus.ACTIVE:
        raise unauthorized
    return user


def require_admin(user: User = Depends(require_active_user)) -> User:
    """Require the authenticated account to have the ADMIN role in the DB."""
    if not any(role.code.upper() == "ADMIN" for role in user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chức năng này chỉ dành cho Quản trị viên.",
        )
    return user
