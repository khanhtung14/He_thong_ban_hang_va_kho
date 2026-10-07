"""FastAPI router for User Management (SCRUM-62)."""

from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import AccountStatus, User
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
from src.backend.security import require_admin

router = APIRouter(prefix="/api/v1/admin/users", tags=["Admin User Management"])
compat_router = APIRouter(prefix="/users", tags=["User Management (Direct)"])


@router.get("", response_model=UserListResponse, dependencies=[Depends(require_admin)])
@compat_router.get("", response_model=UserListResponse, dependencies=[Depends(require_admin)])
def get_users(
    search: Optional[str] = Query(None, description="Tìm kiếm theo họ tên, tên đăng nhập hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo mã hoặc tên vai trò"),
    status: Optional[AccountStatus] = Query(None, description="Lọc theo trạng thái tài khoản"),
    page: int = Query(default=1, ge=1, description="Số thứ tự trang"),
    page_size: int = Query(default=20, ge=1, le=100, description="Số dòng mỗi trang (mặc định 20)"),
    size: Optional[int] = Query(default=None, ge=1, le=100, description="Tham số phân trang alias size"),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách người dùng có hỗ trợ (SCRUM-104, SCRUM-105):
    - Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại
    - Lọc theo vai trò và trạng thái
    - Phân trang chuẩn, mặc định 20 dòng/trang, hỗ trợ tham số page/size/page_size
    """
    effective_page_size = size if size is not None else page_size
    users, total, total_pages = list_users(
        db=db,
        search=search,
        role=role,
        status_filter=status,
        page=page,
        page_size=effective_page_size
    )

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=effective_page_size,
        total_pages=total_pages
    )


@router.post("", response_model=CreateUserResult, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
@compat_router.post("", response_model=CreateUserResult, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_new_user(
    data: UserCreate,
    x_actor_id: Optional[int] = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db)
):
    """
    Tạo tài khoản người dùng mới (SCRUM-99, 100, 101, 102, 106):
    - Kiểm tra tính trùng lặp tên đăng nhập, email, số điện thoại
    - Tự động sinh mật khẩu tạm ngẫu nhiên mạnh
    - Băm mật khẩu bằng bcrypt trước khi lưu cơ sở dữ liệu
    - Gán cờ must_change_password=True và trạng thái chờ kích hoạt
    - Ghi audit log hệ thống
    - Gửi email kích hoạt kèm mật khẩu tạm và link kích hoạt có thời hạn
    - Không để lộ mật khẩu trong response bảo mật
    """
    user, email_sent, _ = create_user(db=db, user_data=data, actor_user_id=x_actor_id)

    return CreateUserResult(
        message="Tạo tài khoản thành công và đã gửi email kích hoạt.",
        user=UserResponse.model_validate(user),
        email_sent=email_sent
    )


@router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
@compat_router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Lấy thông tin chi tiết một người dùng theo ID."""
    user = get_user_by_id(db, user_id=user_id)
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
@compat_router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
def update_user_info(
    user_id: int,
    data: UserUpdate,
    x_actor_id: Optional[int] = Header(None, alias="X-Actor-Id"),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Cập nhật thông tin tài khoản người dùng (SCRUM-103, SCRUM-106):
    - Họ và tên
    - Email (kiểm tra trùng lặp)
    - Số điện thoại (kiểm tra định dạng và trùng lặp)
    - Vai trò
    - Trạng thái (khóa / mở khóa)
    - Ghi audit log hệ thống
    """
    actor_id = x_actor_id if x_actor_id is not None else getattr(current_admin, "id", None)
    updated = update_user(db=db, user_id=user_id, user_data=data, actor_user_id=actor_id)
    return UserResponse.model_validate(updated)
