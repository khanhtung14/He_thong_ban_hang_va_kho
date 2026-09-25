import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import JWTError, jwt

SPECIAL_CHARACTERS = "!@#$%^&*"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "oms_super_secret_jwt_key_sprint_1_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


def generate_temporary_password(length: int = 10) -> str:
    """
    Sinh mật khẩu tạm thời ngẫu nhiên an toàn:
    - Độ dài tối thiểu 8 ký tự (mặc định 10).
    - Có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.
    - Sử dụng thư viện secrets để đảm bảo độ ngẫu nhiên bảo mật.
    """
    if length < 8:
        length = 8

    # Đảm bảo mỗi nhóm có ít nhất 1 ký tự
    password_chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(SPECIAL_CHARACTERS),
    ]

    all_characters = string.ascii_letters + string.digits + SPECIAL_CHARACTERS
    for _ in range(length - 4):
        password_chars.append(secrets.choice(all_characters))

    # Xáo trộn các ký tự
    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)


def hash_password(password: str) -> str:
    """Mã hóa mật khẩu bằng BCrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu khớp với hash BCrypt"""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Tạo JWT access token theo đặc tả xác thực hệ thống"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Giải mã và xác thực JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
