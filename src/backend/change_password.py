from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import bcrypt
from sqlalchemy.orm import Session
from src.backend.database import get_db
from src.backend.models import User

router = APIRouter()

# User giả để test (đảm bảo tương thích ngược)
DEFAULT_FAKE_PASSWORD_HASH = bcrypt.hashpw(
    "Oldpass123".encode("utf-8"),
    bcrypt.gensalt()
)
fake_user = {
    "password": DEFAULT_FAKE_PASSWORD_HASH
}


def reset_fake_user():
    """Khôi phục lại mật khẩu cho fake_user về mặc định để tránh ô nhiễm state giữa các tests"""
    fake_user["password"] = DEFAULT_FAKE_PASSWORD_HASH



class ChangePasswordRequest(BaseModel):
    username: Optional[str] = None
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db)):
    # Nếu có truyền username, kiểm tra và đổi mật khẩu cho user trong database
    if data.username:
        user = db.query(User).filter(User.username == data.username).first()
        if not user:
            raise HTTPException(
                status_code=404,
                detail="Không tìm thấy tài khoản người dùng"
            )
        if user.status == "LOCKED":
            raise HTTPException(
                status_code=403,
                detail="Tài khoản đang bị khóa, không thể đổi mật khẩu"
            )
        target_password_hash = user.password_hash.encode("utf-8") if isinstance(user.password_hash, str) else user.password_hash
    else:
        user = None
        target_password_hash = fake_user["password"].encode("utf-8") if isinstance(fake_user["password"], str) else fake_user["password"]

    # 1. Kiểm tra mật khẩu hiện tại
    try:
        is_valid = bcrypt.checkpw(
            data.current_password.encode("utf-8"),
            target_password_hash
        )
    except Exception:
        is_valid = False

    if not is_valid:
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

    # 3. Kiểm tra độ dài (Tối thiểu 8 ký tự, tối đa 72 byte theo chuẩn an toàn BCrypt)
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự"
        )
    if len(data.new_password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu mới không được dài quá 72 ký tự"
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
    if user:
        user.password_hash = new_password_hash.decode("utf-8")
        user.is_temporary_password = False
        db.commit()
    else:
        fake_user["password"] = new_password_hash

    return {
        "message": "Đổi mật khẩu thành công"
    }