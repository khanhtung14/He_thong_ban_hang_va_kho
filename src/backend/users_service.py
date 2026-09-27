"""Business Service for User Management (SCRUM-62)."""

import logging
import secrets
import string
from typing import List, Optional, Tuple

import bcrypt
from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.backend.email_service import email_service
from src.backend.models import AccountStatus, Role, User, seed_default_roles
from src.backend.schemas import UserCreate, UserUpdate

logger = logging.getLogger("users_service")


def generate_temporary_password(length: int = 12) -> str:
    """
    Generate a strong temporary password containing:
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 digit
    - At least 1 special symbol
    Minimum length: 8 characters.
    """
    if length < 8:
        length = 8

    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits = string.digits
    symbols = "!@#$%^&*()_+"

    # Ensure at least one from each category
    password = [
        secrets.choice(uppercase),
        secrets.choice(lowercase),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]

    all_chars = uppercase + lowercase + digits + symbols
    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))

    # Shuffle to eliminate predictable category order
    shuffled = list(password)
    # Using secrets to safely shuffle
    for i in range(len(shuffled) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

    return "".join(shuffled)


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt with a salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def check_duplicate_user(
    db: Session,
    username: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    exclude_user_id: Optional[int] = None,
):
    """
    Validate that username, email, and phone are unique in the database.
    Raise an informative 400 Bad Request exception if a collision is detected.
    """
    collision_fields = []

    if username:
        query = db.query(User).filter(func.lower(User.username) == username.strip().lower())
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if query.first():
            collision_fields.append("Tên đăng nhập")

    if email:
        query = db.query(User).filter(func.lower(User.email) == email.strip().lower())
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if query.first():
            collision_fields.append("Email")

    if phone and phone.strip():
        query = db.query(User).filter(User.phone == phone.strip())
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if query.first():
            collision_fields.append("Số điện thoại")

    if collision_fields:
        if "Tên đăng nhập" in collision_fields and "Email" in collision_fields:
            detail_msg = "Tên đăng nhập hoặc Email đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."
        else:
            joined = ", ".join(collision_fields)
            detail_msg = f"{joined} đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail_msg)


def resolve_roles(
    db: Session,
    role_codes: Optional[List[str]] = None,
    role: Optional[str] = None
) -> List[Role]:
    """Resolve role codes or names to Role model entities."""
    codes: List[str] = []
    if role_codes:
        codes.extend(role_codes)
    if role and role not in codes:
        codes.append(role)

    # If no role provided, default to SALES_REP per business requirements
    if not codes:
        codes = ["SALES_REP"]

    roles_to_assign: List[Role] = []
    seed_default_roles(db)

    for code in codes:
        clean_code = code.strip()
        if not clean_code:
            continue
        role_entity = (
            db.query(Role)
            .filter(
                or_(
                    func.upper(Role.code) == clean_code.upper(),
                    func.lower(Role.name) == clean_code.lower()
                )
            )
            .first()
        )
        if not role_entity:
            # Map common human readable variants
            variant_map = {
                "SALES": "SALES_REP",
                "SALES REP": "SALES_REP",
                "NHAN VIEN KINH DOANH": "SALES_REP",
                "NHÂN VIÊN KINH DOANH": "SALES_REP",
                "ADMIN": "ADMIN",
                "QUẢN TRỊ HỆ THỐNG": "ADMIN",
                "QUAN TRI HE THONG": "ADMIN",
                "SALES MANAGER": "SALES_MANAGER",
                "QUẢN LÝ KINH DOANH": "SALES_MANAGER",
                "WAREHOUSE": "WAREHOUSE",
                "THỦ KHO": "WAREHOUSE",
                "NHÂN VIÊN KHO": "WAREHOUSE",
                "WH MANAGER": "WH_MANAGER",
                "QUẢN LÝ KHO": "WH_MANAGER",
                "ACCOUNTANT": "ACCOUNTANT",
                "KẾ TOÁN CÔNG NỢ": "ACCOUNTANT",
                "CUSTOMER": "CUSTOMER",
                "ĐẠI LÝ": "CUSTOMER",
            }
            mapped_code = variant_map.get(clean_code.upper())
            if mapped_code:
                role_entity = db.query(Role).filter(Role.code == mapped_code).first()

        if not role_entity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vai trò '{clean_code}' không hợp lệ hoặc không tồn tại trong hệ thống."
            )
        if role_entity not in roles_to_assign:
            roles_to_assign.append(role_entity)

    return roles_to_assign


def create_user(
    db: Session,
    user_data: UserCreate,
    login_url: str = "/login"
) -> Tuple[User, bool, str]:
    """
    Create a new user:
    1. Check duplicates for username, email, and phone.
    2. Generate random strong temporary password.
    3. Hash password with bcrypt.
    4. Resolve and associate role(s).
    5. Save User in database.
    6. Dispatch activation email.
    Returns: (new_user, email_sent, temp_password)
    """
    username = user_data.username.strip()
    full_name = user_data.full_name.strip()
    email = user_data.email.strip().lower()
    phone = user_data.phone.strip() if user_data.phone else None

    # Step 1: Check duplicate
    check_duplicate_user(db, username=username, email=email, phone=phone)

    # Step 2: Generate temporary password
    temp_password = generate_temporary_password(12)

    # Step 3: Hash password
    password_hash = hash_password(temp_password)

    # Step 4: Resolve roles
    roles = resolve_roles(db, role_codes=user_data.role_codes, role=user_data.role)

    # Step 5: Save User to DB
    new_user = User(
        username=username,
        email=email,
        full_name=full_name,
        phone=phone,
        password_hash=password_hash,
        status=user_data.status or AccountStatus.ACTIVE,
        roles=roles,
    )

    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError as exc:
        db.rollback()
        logger.error(f"Database IntegrityError while creating user: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên đăng nhập hoặc Email đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."
        ) from exc

    # Step 6: Dispatch activation email
    email_sent = email_service.send_activation_email(
        to_email=new_user.email,
        full_name=new_user.full_name,
        username=new_user.username,
        temp_password=temp_password,
        login_url=login_url
    )

    return new_user, email_sent, temp_password


def get_user_by_id(db: Session, user_id: int) -> User:
    """Retrieve user by ID or raise HTTP 404."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng có ID {user_id}."
        )
    return user


def update_user(db: Session, user_id: int, user_data: UserUpdate) -> User:
    """Update user information: full_name, email, phone, role(s), status."""
    user = get_user_by_id(db, user_id)

    new_email = user_data.email.strip().lower() if user_data.email else None
    new_phone = user_data.phone.strip() if user_data.phone is not None else None

    # Check duplicates if email or phone is updated
    check_duplicate_user(
        db,
        email=new_email if (new_email and new_email != user.email) else None,
        phone=new_phone if (new_phone and new_phone != user.phone) else None,
        exclude_user_id=user_id
    )

    if user_data.full_name is not None:
        user.full_name = user_data.full_name.strip()

    if new_email is not None:
        user.email = new_email

    if user_data.phone is not None:
        user.phone = new_phone

    if user_data.status is not None:
        user.status = user_data.status

    if user_data.role_codes is not None or user_data.role is not None:
        roles = resolve_roles(db, role_codes=user_data.role_codes, role=user_data.role)
        user.roles = roles

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thông tin cập nhật bị trùng lặp với người dùng khác."
        ) from exc

    return user


def list_users(
    db: Session,
    search: Optional[str] = None,
    role: Optional[str] = None,
    status_filter: Optional[AccountStatus] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[User], int, int]:
    """
    Search, filter, and paginate users at the database query level.
    Default page_size = 20.
    Returns: (users, total_count, total_pages)
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    query = db.query(User)

    # Search by full_name, username, or phone
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.username.ilike(term),
                User.phone.ilike(term)
            )
        )

    # Filter by role
    if role and role.strip():
        role_term = role.strip()
        query = query.join(User.roles).filter(
            or_(
                func.upper(Role.code) == role_term.upper(),
                Role.name.ilike(f"%{role_term}%")
            )
        )

    # Filter by status
    if status_filter:
        query = query.filter(User.status == status_filter)

    total_count = query.distinct().count()
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1

    users = (
        query.distinct()
        .order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return users, total_count, total_pages
