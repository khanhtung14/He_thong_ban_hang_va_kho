"""Session lifecycle endpoints for the FastAPI authentication service."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Dict, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import UserSession, User, AccountStatus
    from src.backend.security import SESSION_DURATION
    from src.backend.rbac import create_access_token, normalize_role
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import UserSession, User, AccountStatus
    from .security import SESSION_DURATION
    from .rbac import create_access_token, normalize_role


router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
_bearer = HTTPBearer(auto_error=False)


@router.post("/refresh")
def refresh_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Dict[str, Union[int, str]]:
    """Extend an active session; revoked, expired, or disabled sessions stay invalid."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên làm việc đã hết hạn.")

    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    session = db.query(UserSession).filter(
        UserSession.refresh_token_hash == token_hash,
        UserSession.revoked_at.is_(None),
    ).first()
    now = datetime.now(timezone.utc)
    expiry = session.expires_at if session else None
    if expiry is not None and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    user = session.user if session else None
    if (session is None or expiry <= now or user is None or user.is_active is False
            or user.status != AccountStatus.ACTIVE):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên làm việc đã hết hạn.")

    session.expires_at = now + SESSION_DURATION
    db.commit()
    role = next((normalize_role(item.code) for item in user.roles if normalize_role(item.code)), None)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản chưa được gán vai trò hợp lệ.")
    return {
        "expires_in": int(SESSION_DURATION.total_seconds()),
        "access_token": create_access_token({"sub": user.username, "role": role}),
    }


@router.post("/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Revoke the server-side session before confirming logout."""
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
        session = (
            db.query(UserSession)
            .filter(UserSession.refresh_token_hash == token_hash)
            .first()
        )
        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()

    return {"message": "Đăng xuất thành công"}
