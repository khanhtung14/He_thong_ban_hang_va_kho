from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import bcrypt

try:
    from app.core.database import get_db
    from app.models.models import User
    from app.core.security import require_active_user
except ImportError:  # pragma: no cover - direct script execution
    from app.core.database import get_db
    from app.models.models import User
    from app.core.security import require_active_user

router = APIRouter()

# User giả để test
fake_user = {
    "password": bcrypt.hashpw(
        "Oldpass123".encode("utf-8"),
        bcrypt.gensalt()
    )
}


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


@router.post("/api/v1/auth/change-password")
def change_authenticated_password(
    data: ChangePasswordRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
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

    from datetime import datetime, timezone
    from app.models.models import AccountStatus

    user.password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    user.must_change_password = False
    if user.status == AccountStatus.PENDING_ACTIVATION:
        user.status = AccountStatus.ACTIVE
    user.password_changed_at = datetime.now(timezone.utc)
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

    return {
        "message": "Đổi mật khẩu thành công"
    }
