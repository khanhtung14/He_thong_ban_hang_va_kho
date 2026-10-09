from fastapi import APIRouter, Depends, HTTPException
import hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import bcrypt

try:
    from src.backend.database import get_db
    from src.backend.models import User, UserSession
    from src.backend.security import require_active_user
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import User, UserSession
    from .security import require_active_user

router = APIRouter()
_bearer = HTTPBearer(auto_error=False)

# User giả để test
fake_user = {
    "password": bcrypt.hashpw(
        "Oldpass123".encode("utf-8"),
        bcrypt.gensalt()
    )
}

# Các phiên đăng nhập hiện tại của tài khoản
active_sessions = [
    "session_device_1",
    "session_device_2",
    "session_device_3"
]


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/api/v1/auth/change-password")
def change_authenticated_password(
    data: ChangePasswordRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
):
    """Change the password for the currently authenticated account."""
    try:
        current_matches = bcrypt.checkpw(
            data.current_password.encode("utf-8"),
            user.password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        current_matches = False
    if not current_matches:
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Mật khẩu mới không được giống mật khẩu hiện tại")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 8 ký tự")
    if not any(char.isalpha() for char in data.new_password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải chứa chữ")
    if not any(char.isdigit() for char in data.new_password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải chứa số")

    now = datetime.now(timezone.utc)
    user.password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    user.must_change_password = False
    user.password_changed_at = now

    current_session_hash = None
    if credentials is not None and credentials.scheme.lower() == "bearer":
        current_session_hash = hashlib.sha256(
            credentials.credentials.encode("utf-8")
        ).hexdigest()
    other_sessions = db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.revoked_at.is_(None),
    )
    if current_session_hash is not None:
        other_sessions = other_sessions.filter(
            UserSession.refresh_token_hash != current_session_hash
        )
    other_sessions.update(
        {UserSession.revoked_at: now},
        synchronize_session=False,
    )
    db.commit()
    return {"message": "Đổi mật khẩu thành công"}


@router.post("/change-password")
def change_password(data: ChangePasswordRequest):

    # 1. Kiểm tra mật khẩu hiện tại
    if not bcrypt.checkpw(
        data.current_password.encode("utf-8"),
        fake_user["password"]
    ):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu hiện tại không đúng"
        )

    # 2. Không cho mật khẩu mới giống mật khẩu cũ
    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới không được giống mật khẩu hiện tại"
        )

    # 3. Kiểm tra độ dài
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự"
        )

    # 4. Phải có chữ
    if not any(char.isalpha() for char in data.new_password):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải chứa chữ"
        )

    # 5. Phải có số
    if not any(char.isdigit() for char in data.new_password):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải chứa số"
        )

    # 6. Hash mật khẩu mới
    new_password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"),
        bcrypt.gensalt()
    )

    # 7. Lưu mật khẩu mới
    fake_user["password"] = new_password_hash

    # 8. Đăng xuất các phiên đăng nhập cũ
    active_sessions.clear()

    return {
        "message": "Đổi mật khẩu thành công",
        "logged_out_sessions": True
    }
