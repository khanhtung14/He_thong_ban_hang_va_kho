"""FastAPI login endpoint.

Accounts are supplied through LOGIN_USERS_JSON as a JSON array, for example:
[{"username":"sales01","password_hash":"$2b$12$...","role_code":"SALES"}]
Only bcrypt password hashes should be stored in this setting.
"""

import json
import os
import threading
import time
from collections import defaultdict
from typing import Any

import bcrypt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
GENERIC_LOGIN_ERROR = "Tên đăng nhập hoặc mật khẩu không chính xác."

_attempts: dict[str, int] = defaultdict(int)
_locked_until: dict[str, float] = {}
_attempts_lock = threading.Lock()

ROLE_HOME_PAGES = {
    "CUSTOMER": "/portal/orders",
    "SALES": "/sales/orders",
    "SALES_REP": "/sales/orders",
    "SALES_MANAGER": "/manager/dashboard",
    "WAREHOUSE": "/inventory/home",
    "WH_MANAGER": "/inventory/home",
    "ACCOUNTANT": "/accounting/dashboard",
    "ADMIN": "/admin/dashboard",
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


@router.post("/login")
def login(data: LoginRequest):
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
                detail={"message": "Tài khoản tạm thời bị khóa.", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        if locked_until is not None:
            _locked_until.pop(normalized_username, None)
            _attempts.pop(normalized_username, None)

    account = _load_accounts().get(normalized_username)
    valid_password = False
    if account is not None:
        stored_hash = account["password_hash"].encode("utf-8")
        try:
            valid_password = bcrypt.checkpw(data.password.encode("utf-8"), stored_hash)
        except (ValueError, TypeError):
            # Invalid hash configuration is treated as an authentication failure.
            valid_password = False

    if not valid_password or account is None or account.get("status", "ACTIVE") != "ACTIVE":
        with _attempts_lock:
            _attempts[normalized_username] += 1
            if _attempts[normalized_username] >= MAX_FAILED_ATTEMPTS:
                _locked_until[normalized_username] = time.monotonic() + LOCKOUT_SECONDS
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    role_code = account["role_code"].strip().upper()
    redirect_url = ROLE_HOME_PAGES.get(role_code)
    if redirect_url is None:
        # Unknown roles are denied access instead of receiving a generic home page.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vai trò tài khoản chưa được hỗ trợ.")

    with _attempts_lock:
        _attempts.pop(normalized_username, None)
        _locked_until.pop(normalized_username, None)

    return {
        "message": "Đăng nhập thành công",
        "redirect_url": redirect_url,
        "user": {
            "username": account["username"],
            "role_code": role_code,
        },
    }
