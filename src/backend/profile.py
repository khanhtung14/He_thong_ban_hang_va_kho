import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Dữ liệu mẫu để kiểm tra API.
# Sau này sẽ thay bằng dữ liệu lấy từ database.
current_user = {
    "username": "nguyenvana",
    "full_name": "Nguyen Van A",
    "phone": "0912345678",
    "role": "sales",
    "warehouse": "Kho 1",
    "area": "Thai Nguyen",
}


class UpdateProfileRequest(BaseModel):
    full_name: str
    phone: str


@router.get("/profile")
def get_profile():
    """Lấy thông tin hồ sơ cá nhân."""
    return current_user


@router.put("/profile")
def update_profile(request: UpdateProfileRequest):
    """Cập nhật họ tên và số điện thoại."""

    full_name = request.full_name.strip()
    phone = request.phone.strip()

    if not full_name:
        raise HTTPException(
            status_code=400,
            detail="Họ và tên không được để trống."
        )

    if not re.fullmatch(r"0\d{9}", phone):
        raise HTTPException(
            status_code=400,
            detail="Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0."
        )

    current_user["full_name"] = full_name
    current_user["phone"] = phone

    return {
        "message": "Cập nhật hồ sơ thành công.",
        "profile": current_user
    }