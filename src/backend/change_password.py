from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import bcrypt

router = APIRouter()

# User giả để test
fake_user = {
    "password": bcrypt.hashpw(
        "Oldpass123".encode("utf-8"),
        bcrypt.gensalt()
    )
}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


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