"""Session lifecycle endpoints for the FastAPI authentication service."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import UserSession
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import UserSession


router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
_bearer = HTTPBearer(auto_error=False)


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict[str, str]:
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
