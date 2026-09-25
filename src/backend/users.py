from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from src.backend.config import DEFAULT_PAGE_SIZE, DEFAULT_ROLES, DEFAULT_STATUSES
from src.backend.database import get_db
from src.backend.email_service import email_service
from src.backend.schemas import (
    RoleResponse,
    StatusResponse,
    UserCreate,
    UserCreateResponse,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from src.backend.users_service import (
    create_user,
    get_user_by_id,
    list_users,
    resend_activation_email,
    toggle_user_lock,
    update_user,
)

router = APIRouter(prefix="/api/v1", tags=["User Management"])


@router.get("/roles", response_model=List[RoleResponse])
def get_roles():
    """Lấy danh mục các vai trò trong hệ thống"""
    return DEFAULT_ROLES


@router.get("/statuses", response_model=List[StatusResponse])
def get_statuses():
    """Lấy danh mục các trạng thái người dùng trong hệ thống"""
    return DEFAULT_STATUSES


@router.get("/users", response_model=UserListResponse)
def get_users_list(
    search: Optional[str] = Query(None, description="Tìm theo tên, tên tài khoản hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo vai trò"),
    user_status: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái tài khoản"),
    page: int = Query(1, ge=1, description="Số trang hiển thị (bắt đầu từ 1)"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=100, description="Số dòng mỗi trang (mặc định 20)"),
    db: Session = Depends(get_db)
):
    """
    US-001: Xem danh sách, tìm kiếm và phân trang tài khoản
    - Mặc định phân trang 20 dòng/trang (AC1)
    - Tìm kiếm theo Tên, Username, Số điện thoại (AC2)
    - Lọc theo Vai trò và Trạng thái (AC3)
    - Kết hợp cả Tìm kiếm và Bộ lọc (AC4)
    - Empty state khi không tìm thấy bản ghi phù hợp (AC5)
    """
    items, total, total_pages = list_users(
        db=db,
        search=search,
        role=role,
        user_status=user_status,
        page=page,
        page_size=page_size
    )

    return UserListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.post("/users", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_new_user(
    data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    US-002: Tạo mới tài khoản người dùng & gửi email kích hoạt kèm mật khẩu tạm
    - Kiểm tra trùng lặp Tên tài khoản, Email, Số điện thoại độc lập (AC1)
    - Tự động sinh mật khẩu tạm ngẫu nhiên an toàn và mã hóa bcrypt (AC2)
    - Gửi email kích hoạt kèm mật khẩu tạm tới email nhân viên (AC3)
    - Xử lý thông báo khi gửi email thất bại (AC4)
    """
    user, email_sent, temp_password = create_user(db=db, data=data)

    if email_sent:
        msg = "Tạo tài khoản thành công. Email kích hoạt kèm mật khẩu tạm đã được gửi tới nhân viên."
    else:
        msg = "Tạo tài khoản thành công nhưng gửi email kích hoạt thất bại. Vui lòng gửi lại email sau."

    return UserCreateResponse(
        message=msg,
        user=user,
        email_sent=email_sent,
        temp_password=temp_password
    )


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    US-003 AC1: Tải dữ liệu người dùng lên form chỉnh sửa
    """
    return get_user_by_id(db=db, user_id=user_id)


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user_info(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db)
):
    """
    US-003: Cập nhật thông tin tài khoản người dùng
    - Khóa trường Username (AC2 - không nhận hoặc không cập nhật username)
    - Cập nhật thông tin và kiểm tra trùng lặp email/phone loại trừ chính user (AC3)
    """
    return update_user(db=db, user_id=user_id, data=data)


@router.post("/users/{user_id}/resend-activation")
def resend_activation(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    US-002 AC4: Gửi lại email kích hoạt kèm mật khẩu tạm mới
    """
    user, email_sent, temp_password = resend_activation_email(db=db, user_id=user_id)
    if email_sent:
        return {
            "message": f"Đã gửi lại email kích hoạt thành công tới {user.email}",
            "email_sent": True
        }
    return {
        "message": "Gửi email kích hoạt thất bại. Vui lòng kiểm tra lại dịch vụ email.",
        "email_sent": False
    }


@router.post("/users/{user_id}/toggle-lock", response_model=UserResponse)
def toggle_lock(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    S1-10: Khóa hoặc mở khóa tài khoản người dùng
    - Tài khoản bị khóa không thể đăng nhập hoặc đổi mật khẩu
    - Ngăn chặn khóa tài khoản Quản trị viên duy nhất
    """
    return toggle_user_lock(db=db, user_id=user_id)


@router.get("/email-logs")
def get_email_logs():
    """Xem danh sách các email kích hoạt đã được gửi đi"""
    return email_service.get_sent_emails()
