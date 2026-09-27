"""FastAPI router for User Management (SCRUM-62)."""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import AccountStatus
from src.backend.schemas import (
    CreateUserResult,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from src.backend.users_service import (
    create_user,
    get_user_by_id,
    list_users,
    update_user,
)

router = APIRouter(prefix="/api/v1/admin/users", tags=["Admin User Management"])


def verify_admin_access(
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    authorization: Optional[str] = Header(None)
):
    """
    Ensure the request is performed by an Administrator.
    Returns HTTP 403 Forbidden if a non-admin role is provided.
    Follows Default Deny principle from BRULE-009 / US-05.
    """
    if x_user_role:
        role = x_user_role.strip().upper()
        if role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập vào chức năng này."
            )
    return True


@router.get("", response_model=UserListResponse, dependencies=[Depends(verify_admin_access)])
def get_users(
    search: Optional[str] = Query(None, description="Tìm kiếm theo họ tên, tên đăng nhập hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo mã hoặc tên vai trò"),
    status: Optional[AccountStatus] = Query(None, description="Lọc theo trạng thái tài khoản"),
    page: int = Query(default=1, ge=1, description="Số thứ tự trang"),
    page_size: int = Query(default=20, ge=1, le=100, description="Số dòng mỗi trang (mặc định 20)"),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách người dùng có hỗ trợ:
    - Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại
    - Lọc theo vai trò và trạng thái
    - Phân trang chuẩn, mặc định 20 dòng/trang
    """
    users, total, total_pages = list_users(
        db=db,
        search=search,
        role=role,
        status_filter=status,
        page=page,
        page_size=page_size
    )

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.post("", response_model=CreateUserResult, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_admin_access)])
def create_new_user(
    data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Tạo tài khoản người dùng mới:
    - Kiểm tra tính trùng lặp tên đăng nhập, email, số điện thoại
    - Tự động sinh mật khẩu tạm ngẫu nhiên mạnh
    - Băm mật khẩu bằng bcrypt trước khi lưu cơ sở dữ liệu
    - Gửi email kích hoạt kèm mật khẩu tạm
    - Không để lộ mật khẩu trong response bảo mật
    """
    user, email_sent, _ = create_user(db=db, user_data=data)

    return CreateUserResult(
        message="Tạo tài khoản thành công và đã gửi email kích hoạt.",
        user=UserResponse.model_validate(user),
        email_sent=email_sent
    )


@router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(verify_admin_access)])
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Lấy thông tin chi tiết một người dùng theo ID."""
    user = get_user_by_id(db, user_id=user_id)
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(verify_admin_access)])
def update_user_info(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db)
):
    """
    Cập nhật thông tin tài khoản người dùng:
    - Họ và tên
    - Email (kiểm tra trùng lặp)
    - Số điện thoại (kiểm tra định dạng và trùng lặp)
    - Vai trò
    - Trạng thái
    """
    updated = update_user(db=db, user_id=user_id, user_data=data)
    return UserResponse.model_validate(updated)
