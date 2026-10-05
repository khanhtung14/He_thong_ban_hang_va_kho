"""Authenticated self-service profile endpoints."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from src.backend.database import engine, get_db
from src.backend.models import User
from src.backend.security import require_active_user

router = APIRouter(prefix="/api/v1", tags=["Personal profile"])


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=10, max_length=20)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Họ và tên không được để trống.")
        return value

    @field_validator("phone")
    @classmethod
    def validate_vietnamese_phone(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"0[0-9]{9}", value):
            raise ValueError("Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.")
        return value


def migrate_profile_schema() -> None:
    """Add the profile field to databases created before this feature."""
    if not inspect(engine).has_table("users"):
        return
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "phone" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL"))


def _serialize_profile(user: User) -> dict:
    role = user.roles[0] if user.roles else None
    warehouses = [warehouse.name for warehouse in user.warehouses]
    territories = [territory.name for territory in user.territories]
    return {
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone or "",
        "role": role.name if role else "Chưa gán vai trò",
        "warehouse": ", ".join(warehouses) if warehouses else "Chưa phân kho",
        "area": ", ".join(territories) if territories else "Chưa phân địa bàn",
    }


@router.get("/profile")
def get_profile(
    user: User = Depends(require_active_user),
) -> dict:
    # The startup migration runs before auth queries load the newly mapped field.
    return _serialize_profile(user)


@router.put("/profile")
def update_profile(
    request: UpdateProfileRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> dict:
    user.full_name = request.full_name
    user.phone = request.phone
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể lưu hồ sơ lúc này. Vui lòng thử lại.",
        ) from exc
    db.refresh(user)
    return {"message": "Cập nhật hồ sơ thành công.", "profile": _serialize_profile(user)}
