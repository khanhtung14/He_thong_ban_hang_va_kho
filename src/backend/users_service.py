import math
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from src.backend.config import DEFAULT_PAGE_SIZE, DEFAULT_ROLES, DEFAULT_STATUSES
from src.backend.email_service import email_service
from src.backend.models import Role, User
from src.backend.schemas import UserCreate, UserUpdate
from src.backend.security import generate_temporary_password, hash_password


class DuplicateFieldException(HTTPException):
    def __init__(self, field_errors: Dict[str, str]):
        self.field_errors = field_errors
        detail_msg = "; ".join(field_errors.values())
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Dữ liệu bị trùng lặp trên hệ thống", "field_errors": field_errors}
        )


def check_duplicates_for_create(db: Session, data: UserCreate):
    """
    Kiểm tra trùng lặp độc lập cả 3 trường: Username, Email, Số điện thoại.
    Theo đúng yêu cầu AC1 của US-002:
    - Nếu trùng Tên tài khoản: 'Tên tài khoản đã tồn tại trên hệ thống. Vui lòng chọn tên khác.'
    - Nếu trùng Email: 'Địa chỉ email này đã được sử dụng cho một tài khoản khác.'
    - Nếu trùng Số điện thoại: 'Số điện thoại này đã được đăng ký trên hệ thống.'
    """
    field_errors: Dict[str, str] = {}

    if db.query(User).filter(User.username == data.username).first():
        field_errors["username"] = "Tên tài khoản đã tồn tại trên hệ thống. Vui lòng chọn tên khác."

    if db.query(User).filter(User.email == data.email).first():
        field_errors["email"] = "Địa chỉ email này đã được sử dụng cho một tài khoản khác."

    if db.query(User).filter(User.phone == data.phone).first():
        field_errors["phone"] = "Số điện thoại này đã được đăng ký trên hệ thống."

    if field_errors:
        raise DuplicateFieldException(field_errors)


def check_duplicates_for_update(db: Session, user_id: int, data: UserUpdate):
    """
    Kiểm tra trùng lặp khi chỉnh sửa, loại trừ chính user đang được cập nhật (excludeCurrentUserId).
    """
    field_errors: Dict[str, str] = {}

    if db.query(User).filter(User.email == data.email, User.id != user_id).first():
        field_errors["email"] = "Địa chỉ email này đã được sử dụng cho một tài khoản khác."

    if db.query(User).filter(User.phone == data.phone, User.id != user_id).first():
        field_errors["phone"] = "Số điện thoại này đã được đăng ký trên hệ thống."

    if field_errors:
        raise DuplicateFieldException(field_errors)


def list_users(
    db: Session,
    search: Optional[str] = None,
    role: Optional[str] = None,
    user_status: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE
) -> Tuple[list, int, int]:
    """
    Tra cứu, tìm kiếm và phân trang danh sách người dùng.
    - search: Tìm kiếm không phân biệt hoa thường theo Họ tên, Tên tài khoản, Số điện thoại.
    - role: Lọc theo vai trò.
    - user_status: Lọc theo trạng thái.
    - page: Số trang (bắt đầu từ 1).
    - page_size: Số dòng trên mỗi trang (mặc định 20 dòng).
    """
    query = db.query(User)

    # 1. Tìm kiếm theo Tên, Tên tài khoản, Số điện thoại (AC2)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.username.ilike(term),
                User.phone.ilike(term)
            )
        )

    # 2. Lọc theo Vai trò (AC3)
    if role and role.strip():
        query = query.filter(User.role_code == role.strip())

    # 3. Lọc theo Trạng thái (AC3)
    if user_status and user_status.strip():
        query = query.filter(User.status == user_status.strip())

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    if page < 1:
        page = 1

    offset = (page - 1) * page_size
    items = query.order_by(User.id.desc()).offset(offset).limit(page_size).all()

    # Ánh xạ tên vai trò và tên trạng thái
    role_map = {r["code"]: r["name"] for r in DEFAULT_ROLES}
    status_map = {s["code"]: s["name"] for s in DEFAULT_STATUSES}

    for user in items:
        user.role_name = role_map.get(user.role_code, user.role_code)
        user.status_name = status_map.get(user.status, user.status)

    return items, total, total_pages


def get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng với mã ID {user_id}"
        )
    role_map = {r["code"]: r["name"] for r in DEFAULT_ROLES}
    status_map = {s["code"]: s["name"] for s in DEFAULT_STATUSES}
    user.role_name = role_map.get(user.role_code, user.role_code)
    user.status_name = status_map.get(user.status, user.status)
    return user


def create_user(db: Session, data: UserCreate) -> Tuple[User, bool, str]:
    """
    Tạo mới tài khoản người dùng:
    1. Kiểm tra trùng lặp (username, email, phone).
    2. Tự động sinh mật khẩu tạm thời ngẫu nhiên an toàn.
    3. Mã hóa mật khẩu bằng BCrypt.
    4. Lưu bản ghi vào cơ sở dữ liệu.
    5. Gửi email kích hoạt kèm mật khẩu tạm.
    6. Trả về thông tin người dùng, trạng thái gửi mail và mật khẩu tạm.
    """
    # Bước 1: Kiểm tra trùng lặp
    check_duplicates_for_create(db, data)

    # Bước 2 & 3: Sinh và mã hóa mật khẩu tạm thời
    temp_password = generate_temporary_password(length=10)
    pwd_hash = hash_password(temp_password)

    # Bước 4: Tạo model và lưu DB
    new_user = User(
        username=data.username,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        role_code=data.role_code,
        status=data.status,
        password_hash=pwd_hash,
        is_temporary_password=True,
        email_sent=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Bước 5: Gửi email kích hoạt
    email_success = email_service.send_activation_email(
        to_email=new_user.email,
        full_name=new_user.full_name,
        username=new_user.username,
        temp_password=temp_password,
        login_url="/login"
    )

    if email_success:
        new_user.email_sent = True
        db.commit()
        db.refresh(new_user)

    role_map = {r["code"]: r["name"] for r in DEFAULT_ROLES}
    status_map = {s["code"]: s["name"] for s in DEFAULT_STATUSES}
    new_user.role_name = role_map.get(new_user.role_code, new_user.role_code)
    new_user.status_name = status_map.get(new_user.status, new_user.status)

    return new_user, email_success, temp_password


def update_user(db: Session, user_id: int, data: UserUpdate) -> User:
    """
    Cập nhật thông tin tài khoản:
    1. Tìm người dùng theo ID.
    2. Kiểm tra trùng lặp email và phone loại trừ chính user đang sửa.
    3. Giữ nguyên Username (không cho phép sửa theo US-003 AC2).
    4. Cập nhật các trường được phép sửa.
    """
    user = get_user_by_id(db, user_id)

    # Kiểm tra trùng lặp loại trừ bản thân
    check_duplicates_for_update(db, user_id, data)

    user.full_name = data.full_name
    user.email = data.email
    user.phone = data.phone
    user.role_code = data.role_code
    user.status = data.status
    user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)

    role_map = {r["code"]: r["name"] for r in DEFAULT_ROLES}
    status_map = {s["code"]: s["name"] for s in DEFAULT_STATUSES}
    user.role_name = role_map.get(user.role_code, user.role_code)
    user.status_name = status_map.get(user.status, user.status)

    return user


def resend_activation_email(db: Session, user_id: int) -> Tuple[User, bool, str]:
    """
    Gửi lại email kích hoạt cho tài khoản nếu lần trước bị thất bại (AC4)
    """
    user = get_user_by_id(db, user_id)

    # Sinh mật khẩu tạm mới và hash lại
    new_temp_password = generate_temporary_password(length=10)
    user.password_hash = hash_password(new_temp_password)
    user.is_temporary_password = True

    email_success = email_service.send_activation_email(
        to_email=user.email,
        full_name=user.full_name,
        username=user.username,
        temp_password=new_temp_password,
        login_url="/login"
    )

    if email_success:
        user.email_sent = True
    db.commit()
    db.refresh(user)

    return user, email_success, new_temp_password


def toggle_user_lock(db: Session, user_id: int) -> UserResponse:
    """
    S1-10: Khóa và mở khóa tài khoản
    - Chuyển đổi trạng thái giữa ACTIVE và LOCKED
    - Ngăn chặn khóa tài khoản Quản trị viên duy nhất
    """
    user = get_user_by_id(db, user_id)

    if user.role_code == "ADMIN" and user.status != "LOCKED":
        active_admins = db.query(User).filter(
            User.role_code == "ADMIN",
            User.status == "ACTIVE"
        ).count()
        if active_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể khóa tài khoản Quản trị viên duy nhất đang hoạt động"
            )

    if user.status == "LOCKED":
        user.status = "ACTIVE"
    else:
        user.status = "LOCKED"

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    role_map = {r["code"]: r["name"] for r in DEFAULT_ROLES}
    status_map = {s["code"]: s["name"] for s in DEFAULT_STATUSES}
    user.role_name = role_map.get(user.role_code, user.role_code)
    user.status_name = status_map.get(user.status, user.status)

    return user
