import re
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str
    description: Optional[str] = None



class StatusResponse(BaseModel):
    code: str
    name: str
    description: Optional[str] = None


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Họ và tên người dùng")
    email: str = Field(..., description="Địa chỉ email")
    phone: str = Field(..., description="Số điện thoại liên hệ")
    role_code: str = Field(..., description="Mã vai trò (vd: SALES, ADMIN, ...)")
    status: str = Field(default="PENDING_ACTIVATION", description="Trạng thái tài khoản")

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(email_regex, v):
            raise ValueError("Định dạng email không hợp lệ")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str) -> str:
        v = v.strip().replace(" ", "").replace(".", "").replace("-", "")
        # Số điện thoại VN: 10 chữ số bắt đầu bằng 0, hoặc có +84
        phone_regex = r"^(\+?84|0)[3|5|7|8|9][0-9]{8}$"
        if not re.match(phone_regex, v):
            raise ValueError("Định dạng số điện thoại không hợp lệ (cần 10 số, bắt đầu bằng 03, 05, 07, 08, 09)")
        return v


class UserCreate(UserBase):
    username: str = Field(..., min_length=3, max_length=50, description="Tên đăng nhập / Tên tài khoản")

    @field_validator("username")
    @classmethod
    def validate_username_format(cls, v: str) -> str:
        v = v.strip()
        username_regex = r"^[a-zA-Z0-9_.-]+$"
        if not re.match(username_regex, v):
            raise ValueError("Tên tài khoản chỉ được chứa chữ cái, số, dấu gạch dưới, gạch ngang hoặc dấu chấm")
        return v


class UserUpdate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(...)
    phone: str = Field(...)
    role_code: str = Field(...)
    status: str = Field(...)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(email_regex, v):
            raise ValueError("Định dạng email không hợp lệ")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str) -> str:
        v = v.strip().replace(" ", "").replace(".", "").replace("-", "")
        phone_regex = r"^(\+?84|0)[3|5|7|8|9][0-9]{8}$"
        if not re.match(phone_regex, v):
            raise ValueError("Định dạng số điện thoại không hợp lệ (cần 10 số, bắt đầu bằng 03, 05, 07, 08, 09)")
        return v


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: str
    phone: str
    role_code: str
    role_name: Optional[str] = None
    status: str
    status_name: Optional[str] = None
    is_temporary_password: bool
    email_sent: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None



class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class UserCreateResponse(BaseModel):
    message: str
    user: UserResponse
    email_sent: bool
    temp_password: Optional[str] = None


class DuplicateErrorResponse(BaseModel):
    detail: str
    field_errors: Dict[str, str]


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Tên tài khoản hoặc email đăng nhập")
    password: str = Field(..., min_length=1, description="Mật khẩu người dùng")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class LockToggleRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Lý do khóa hoặc mở khóa tài khoản")
