"""Pydantic schemas for User Management (SCRUM-62)."""

from datetime import datetime
import re
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from src.backend.models import AccountStatus


PHONE_REGEX = re.compile(r"^0\d{9}$")
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_.-]+$")


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: Optional[str] = None


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="Tên đăng nhập")
    full_name: str = Field(..., min_length=1, max_length=150, description="Họ và tên")
    email: EmailStr = Field(..., description="Địa chỉ email")
    phone: Optional[str] = Field(None, description="Số điện thoại di động (10 chữ số bắt đầu bằng 0)")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tên đăng nhập không được để trống.")
        if not USERNAME_REGEX.match(v):
            raise ValueError("Tên đăng nhập chỉ chứa chữ cái, số, gạch dưới, gạch ngang hoặc dấu chấm.")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Họ và tên không được để trống.")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not PHONE_REGEX.match(v):
            raise ValueError("Số điện thoại không hợp lệ. Phải gồm 10 chữ số và bắt đầu bằng số 0.")
        return v


class UserCreate(UserBase):
    role_codes: Optional[List[str]] = Field(default=None, description="Danh sách mã vai trò (hoặc vai trò đơn)")
    role: Optional[str] = Field(default=None, description="Mã vai trò đơn (tiện ích cho form)")
    status: Optional[AccountStatus] = Field(default=AccountStatus.ACTIVE, description="Trạng thái tài khoản ban đầu")


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role_codes: Optional[List[str]] = None
    role: Optional[str] = None
    status: Optional[AccountStatus] = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Họ và tên không được để trống.")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                return None
            if not PHONE_REGEX.match(v):
                raise ValueError("Số điện thoại không hợp lệ. Phải gồm 10 chữ số và bắt đầu bằng số 0.")
        return v


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: str
    phone: Optional[str] = None
    status: AccountStatus
    roles: List[RoleResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CreateUserResult(BaseModel):
    message: str
    user: UserResponse
    email_sent: bool
