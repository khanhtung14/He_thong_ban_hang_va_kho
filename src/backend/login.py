"""FastAPI login endpoint.

Accounts can be retrieved from MySQL Database (users table) and/or LOGIN_USERS_JSON.
When accounts are in the database, is_active and status are checked to reject locked users.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
except ImportError:
    try:
        from backend.database import get_db
    except ImportError:
        from .database import get_db

try:
    from src.backend.rbac import create_access_token, normalize_role
except ModuleNotFoundError:  # pragma: no cover
    from rbac import create_access_token, normalize_role

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
GENERIC_LOGIN_ERROR = "Tên đăng nhập hoặc mật khẩu không chính xác."
LOCKED_LOGIN_ERROR = (
    "Tài khoản đã bị tạm khóa 15 phút do nhập sai thông tin 5 lần liên tiếp. "
    "Vui lòng thử lại sau."
)
ACCOUNT_LOCKED_ERROR = "Tài khoản của bạn đã bị khoá. Vui lòng liên hệ Quản trị viên."

_attempts: dict[str, int] = defaultdict(int)
_locked_until: dict[str, float] = {}
_attempts_lock = threading.Lock()

ROLE_HOME_PAGES = {
    "CUSTOMER": "/portal/orders",
    "Customer": "/portal/orders",
    "SALES": "/sales/orders",
    "Sales": "/sales/orders",
    "SALES REP": "/sales/orders",
    "SALES_REP": "/sales/orders",
    "Sales Rep": "/sales/orders",
    "SALES MANAGER": "/manager/dashboard",
    "SALES_MANAGER": "/manager/dashboard",
    "Sales Manager": "/manager/dashboard",
    "WAREHOUSE": "/warehouse/picking",
    "Warehouse": "/warehouse/picking",
    "WH MANAGER": "/warehouse/dashboard",
    "WH_MANAGER": "/warehouse/dashboard",
    "WH Manager": "/warehouse/dashboard",
    "ACCOUNTANT": "/accounting/debt-book",
    "Accountant": "/accounting/debt-book",
    "ADMIN": "/admin/users",
    "Admin": "/admin/users",
}


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


def _load_accounts() -> dict[str, dict[str, Any]]:
    raw_accounts = os.getenv("LOGIN_USERS_JSON", "[]")
    try:
        parsed = json.loads(raw_accounts)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ đăng nhập chưa được cấu hình đúng.",
        ) from exc

    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ đăng nhập chưa được cấu hình đúng.",
        )

    accounts: dict[str, dict[str, Any]] = {}
    for account in parsed:
        if not isinstance(account, dict):
            continue
        username = account.get("username")
        password_hash = account.get("password_hash")
        role_code = account.get("role_code")
        if isinstance(username, str) and isinstance(password_hash, str) and isinstance(role_code, str):
            accounts[username.casefold()] = account
    return accounts


def _fetch_db_user(db: Session, username: str) -> dict[str, Any] | None:
    """Tìm kiếm thông tin người dùng từ cơ sở dữ liệu MySQL / Database."""
    if db is None or not isinstance(db, Session):
        return None

    # Thử truy vấn kết hợp bảng roles
    try:
        stmt = text(
            """
            SELECT u.id, u.username, u.password_hash,
                   u.is_active, u.status,
                   r.code AS role_code
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE LOWER(u.username) = :uname
            LIMIT 1
            """
        )
        row = db.execute(stmt, {"uname": username.lower()}).mappings().first()
        if row:
            return dict(row)
    except Exception:
        pass

    # Truy vấn bảng users đơn thuần
    try:
        stmt = text(
            """
            SELECT id, username, password_hash,
                   is_active, status
            FROM users
            WHERE LOWER(username) = :uname
            LIMIT 1
            """
        )
        row = db.execute(stmt, {"uname": username.lower()}).mappings().first()
        if row:
            return dict(row)
    except Exception:
        pass

    # Truy vấn tối giản chỉ có id, username, is_active
    try:
        stmt = text(
            """
            SELECT id, username, is_active
            FROM users
            WHERE LOWER(username) = :uname
            LIMIT 1
            """
        )
        row = db.execute(stmt, {"uname": username.lower()}).mappings().first()
        if row:
            return dict(row)
    except Exception:
        pass

    return None


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    normalized_username = username.casefold()
    now = time.monotonic()
    with _attempts_lock:
        locked_until = _locked_until.get(normalized_username)
        if locked_until is not None and now < locked_until:
            retry_after = max(1, int(locked_until - now))
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={"message": LOCKED_LOGIN_ERROR, "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        if locked_until is not None:
            _locked_until.pop(normalized_username, None)
            _attempts.pop(normalized_username, None)

    # 1. Đọc thông tin từ MySQL Database
    db_user = _fetch_db_user(db, normalized_username)

    # 2. Kiểm tra nếu is_active == False (hoặc bị khóa) trong Database thì từ chối đăng nhập với thông báo lỗi rõ ràng
    if db_user is not None:
        is_active = db_user.get("is_active")
        user_status = str(db_user.get("status") or "").upper()
        if is_active is False or is_active == 0 or user_status == "LOCKED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCOUNT_LOCKED_ERROR,
            )
        if user_status == "DISABLED":
            with _attempts_lock:
                _attempts[normalized_username] += 1
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    # 3. Lấy thông tin tài khoản từ cấu hình JSON (nếu có)
    accounts = _load_accounts()
    json_account = accounts.get(normalized_username)

    if json_account is not None:
        if json_account.get("is_active") is False or str(json_account.get("status") or "").upper() == "LOCKED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ACCOUNT_LOCKED_ERROR,
            )
        if json_account.get("status", "ACTIVE") != "ACTIVE":
            with _attempts_lock:
                _attempts[normalized_username] += 1
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    # 4. Xác thực mật khẩu
    valid_password = False
    # Thử đối chiếu mật khẩu từ Database nếu có password_hash
    if db_user is not None and db_user.get("password_hash"):
        try:
            stored_hash = str(db_user["password_hash"]).encode("utf-8")
            valid_password = bcrypt.checkpw(data.password.encode("utf-8"), stored_hash)
        except (ValueError, TypeError):
            valid_password = False

    # Nếu chưa xác thực qua DB, thử đối chiếu với JSON account
    if db_user is None and json_account is not None and json_account.get("password_hash"):
        try:
            stored_hash = str(json_account["password_hash"]).encode("utf-8")
            valid_password = bcrypt.checkpw(data.password.encode("utf-8"), stored_hash)
        except (ValueError, TypeError):
            valid_password = False

    if not valid_password:
        with _attempts_lock:
            _attempts[normalized_username] += 1
            if _attempts[normalized_username] >= MAX_FAILED_ATTEMPTS:
                _locked_until[normalized_username] = time.monotonic() + LOCKOUT_SECONDS
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail={
                        "message": LOCKED_LOGIN_ERROR,
                        "retry_after_seconds": LOCKOUT_SECONDS,
                    },
                    headers={"Retry-After": str(LOCKOUT_SECONDS)},
                )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    # 5. Phân quyền và chuyển hướng theo vai trò (Role)
    raw_role = None
    if db_user and db_user.get("role_code"):
        raw_role = str(db_user["role_code"]).strip()
    elif json_account and json_account.get("role_code"):
        raw_role = str(json_account["role_code"]).strip()
    else:
        raw_role = "SALES"

    canonical_role = normalize_role(raw_role)
    if not canonical_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vai trò tài khoản chưa được hỗ trợ.")

    role_key = canonical_role.upper().replace(" ", "_")
    redirect_url = (
        ROLE_HOME_PAGES.get(role_key)
        or ROLE_HOME_PAGES.get(canonical_role)
        or ROLE_HOME_PAGES.get(raw_role.upper())
        or ROLE_HOME_PAGES.get(raw_role)
    )
    if redirect_url is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vai trò tài khoản chưa được hỗ trợ.")

    # 6. Ghi nhận phiên làm việc nếu có bảng user_sessions
    if db_user and db_user.get("id") and isinstance(db, Session):
        session_token = secrets.token_urlsafe(48)
        session_token_hash = hashlib.sha256(session_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)
        try:
            db.execute(
                text(
                    """
                    INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, revoked_at)
                    VALUES (:user_id, :token_hash, :expires_at, NULL)
                    """
                ),
                {
                    "user_id": db_user["id"],
                    "token_hash": session_token_hash,
                    "expires_at": expires_at,
                },
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Không thể tạo phiên đăng nhập. Vui lòng thử lại sau.",
            ) from exc
    else:
        session_token = None

    # Xóa bộ đếm số lần đăng nhập sai khi thành công
    with _attempts_lock:
        _attempts.pop(normalized_username, None)
        _locked_until.pop(normalized_username, None)

    resolved_username = (
        db_user.get("username")
        if db_user and db_user.get("username")
        else (json_account.get("username") if json_account else data.username)
    )

    token = create_access_token({
        "sub": resolved_username,
        "role": canonical_role,
    })

    response = {
        "message": "Đăng nhập thành công",
        "access_token": token,
        "token_type": "bearer",
        "redirect_url": redirect_url,
        "user": {
            "username": resolved_username,
            "role_code": raw_role,
        },
    }
    if session_token is not None:
        response["session_token"] = session_token
        response["expires_in"] = 12 * 60 * 60
    return response
