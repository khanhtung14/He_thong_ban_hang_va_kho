from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.backend.config import DEFAULT_ROLES, DEFAULT_STATUSES
from src.backend.database import get_db
from src.backend.models import User
from src.backend.schemas import LoginRequest, TokenResponse, UserResponse
from src.backend.security import create_access_token, decode_access_token, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

ROLE_NAME_MAP = {r["code"]: r["name"] for r in DEFAULT_ROLES}
STATUS_NAME_MAP = {s["code"]: s["name"] for s in DEFAULT_STATUSES}


def format_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        role_code=user.role_code,
        role_name=ROLE_NAME_MAP.get(user.role_code, user.role_code),
        status=user.status,
        status_name=STATUS_NAME_MAP.get(user.status, user.status),
        is_temporary_password=user.is_temporary_password,
        email_sent=user.email_sent,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """
    S1-01: Đăng nhập bằng tài khoản và mật khẩu
    - Validate Input
    - Authentication API -> User Service -> Database -> Authentication Result
    - Trả thông báo chung nếu sai thông tin (không lộ tài khoản có tồn tại hay không)
    - Chặn tài khoản bị khóa (LOCKED) với mã lỗi 403 Forbidden
    """
    username_or_email = data.username.strip()
    user = db.query(User).filter(
        (User.username == username_or_email) | (User.email == username_or_email)
    ).first()

    # 1. Kiểm tra tài khoản tồn tại và mật khẩu
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Kiểm tra tài khoản bị khóa (S1-10: Tài khoản bị khoá không đăng nhập được)
    if user.status == "LOCKED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để được hỗ trợ.",
        )

    # 3. Tạo JWT access token
    token_payload = {
        "sub": user.username,
        "role": user.role_code,
        "id": user.id,
        "full_name": user.full_name,
    }
    access_token = create_access_token(data=token_payload)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=format_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Lấy thông tin người dùng đang đăng nhập từ JWT Token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu hoặc sai định dạng Access Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản người dùng",
        )

    if user.status == "LOCKED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa",
        )

    return format_user_response(user)


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    """S1-02: Đăng xuất an toàn"""
    return {"message": "Đăng xuất thành công", "success": True}
