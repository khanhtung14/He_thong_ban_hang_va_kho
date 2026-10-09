from __future__ import annotations

import hashlib
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import update
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import PasswordResetToken, User
except ImportError:  # pragma: no cover - direct script execution
    from app.core.database import get_db
    from app.models.models import PasswordResetToken, User

router = APIRouter(prefix="/api/v1/auth", tags=["Quên & Đặt lại mật khẩu"])

RESET_TOKEN_EXPIRE_MINUTES = 30
GENERIC_SUCCESS_MESSAGE = (
    "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến email của bạn. "
    "Vui lòng kiểm tra hộp thư (liên kết có hiệu lực trong 30 phút)."
)

# Only used when SMTP is not configured, for local development and demos.
mock_outbox: List[Dict[str, Any]] = []


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Email tài khoản cần đặt lại mật khẩu")


class ForgotPasswordResponse(BaseModel):
    message: str
    demo_mode: bool


class VerifyTokenResponse(BaseModel):
    valid: bool
    email: str
    message: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Mã token nhận được từ email đặt lại mật khẩu")
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới")
    confirm_password: str = Field(..., description="Xác nhận mật khẩu mới")


class MessageResponse(BaseModel):
    message: str


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def _demo_mode_enabled() -> bool:
    return os.getenv("APP_ENV", "development").strip().lower() not in {"prod", "production"}


def _build_reset_link(token: str) -> str:
    base_url = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    return f"{base_url}/reset-password?{urlencode({'token': token})}"


def _send_reset_email(to_email: str, full_name: str, reset_link: str) -> None:
    host = os.environ["SMTP_HOST"]
    sender = os.environ["SMTP_FROM"]
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes"}

    message = EmailMessage()
    message["Subject"] = "[Hệ thống Bán hàng & Kho] Đặt lại mật khẩu"
    message["From"] = sender
    message["To"] = to_email
    message.set_content(
        f"Xin chào {full_name},\n\n"
        "Bạn đã yêu cầu đặt lại mật khẩu. Mở liên kết sau để tiếp tục:\n"
        f"{reset_link}\n\n"
        "Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần. "
        "Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email."
    )

    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_class(host, port, timeout=15) as smtp:
        if not use_ssl:
            smtp.starttls()
        if username:
            smtp.login(username, password or "")
        smtp.send_message(message)


def _load_valid_token(
    db: Session, token: str
) -> Optional[Tuple[PasswordResetToken, User]]:
    record = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == _token_hash(token))
        .first()
    )
    if record is None or record.used_at is not None:
        return None

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None

    user = db.query(User).filter(User.id == record.user_id).first()
    if user is None:
        return None
    return record, user


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Yêu cầu gửi liên kết đặt lại mật khẩu qua email",
)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    if not _smtp_configured() and not _demo_mode_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ gửi email đặt lại mật khẩu chưa được cấu hình.",
        )

    normalized_email = data.email.strip().lower()
    try:
        user = db.query(User).filter(User.email.ilike(normalized_email)).first()
    except Exception:
        db.rollback()
        user = None

    if user is not None:
        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        reset_link = _build_reset_link(raw_token)
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=_token_hash(raw_token),
            expires_at=now + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
        )
        try:
            db.add(record)
            db.commit()
            if _smtp_configured():
                _send_reset_email(user.email, user.full_name, reset_link)
            elif _demo_mode_enabled():
                mock_outbox.append(
                    {
                        "to": user.email,
                        "subject": "[Hệ thống Bán hàng & Kho] Đặt lại mật khẩu",
                        "body": f"Liên kết đặt lại mật khẩu (hiệu lực 30 phút): {reset_link}",
                        "reset_link": reset_link,
                        "token": raw_token,
                        "sent_at": now.isoformat(),
                    }
                )
                print("\n" + "="*70)
                print(f"📧 [DEMO MODE] EMAIL GIẢ LẬP ĐÃ ĐƯỢC GỬI ĐẾN: {user.email}")
                print(f"🔗 LIÊN KẾT ĐẶT LẠI MẬT KHẨU CỦA BẠN LÀ:")
                print(f"   {reset_link}")
                print("="*70 + "\n")
            else:
                raise RuntimeError("SMTP must be configured outside demo mode")
        except Exception as e:
            db.rollback()
            import traceback
            traceback.print_exc()
            print(f"LỖI KHI GỬI EMAIL QUÊN MẬT KHẨU: {e}")
            # Remove an unusable token if persistence succeeded but delivery failed.
            try:
                persisted = (
                    db.query(PasswordResetToken)
                    .filter(PasswordResetToken.token_hash == _token_hash(raw_token))
                    .first()
                )
                if persisted is not None:
                    db.delete(persisted)
                    db.commit()
            except Exception:
                db.rollback()
            # Keep the public response identical for existing and unknown emails.
            # Do not expose reset links or mail delivery errors to the caller.

    return ForgotPasswordResponse(
        message=GENERIC_SUCCESS_MESSAGE,
        demo_mode=_demo_mode_enabled() and not _smtp_configured(),
    )


@router.get(
    "/verify-reset-token/{token}",
    response_model=VerifyTokenResponse,
    summary="Kiểm tra tính hợp lệ của token đặt lại mật khẩu",
)
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    result = _load_valid_token(db, token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc đã hết hạn.",
        )
    _, user = result
    return VerifyTokenResponse(
        valid=True,
        email=user.email,
        message="Liên kết hợp lệ. Bạn có thể tiến hành đặt lại mật khẩu.",
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu bằng liên kết token",
)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    result = _load_valid_token(db, data.token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc đã hết hạn.",
        )
    record, user = result

    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Mật khẩu xác nhận không khớp với mật khẩu mới.")
    if not any(char.isalpha() for char in data.new_password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải chứa ít nhất một chữ cái.")
    if not any(char.isdigit() for char in data.new_password):
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải chứa ít nhất một chữ số.")

    if bcrypt.checkpw(data.new_password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(status_code=400, detail="Mật khẩu mới không được trùng với mật khẩu cũ.")

    now = datetime.now(timezone.utc)
    # Atomically claim the token to prevent concurrent requests from using it twice.
    claimed = db.execute(
        update(PasswordResetToken).execution_options(synchronize_session=False)
        .where(
            PasswordResetToken.id == record.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ, đã dùng hoặc đã hết hạn.",
        )

    user.password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    db.commit()
    return MessageResponse(
        message="Đặt lại mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập."
    )


@router.get("/dev/mock-outbox", summary="Xem email giả lập trong môi trường demo")
def get_mock_outbox():
    if _smtp_configured() or not _demo_mode_enabled():
        raise HTTPException(status_code=404, detail="Không tìm thấy tài nguyên.")
    return {"total_emails": len(mock_outbox), "emails": mock_outbox}


@router.post("/dev/reset-tokens/expire-token/{token}", summary="Tiện ích test đánh dấu token hết hạn")
def expire_token_for_testing(token: str, db: Session = Depends(get_db)):
    if _smtp_configured() or not _demo_mode_enabled():
        raise HTTPException(status_code=404, detail="Không tìm thấy tài nguyên.")
    result = _load_valid_token(db, token)
    if result is None:
        raise HTTPException(status_code=404, detail="Token không tồn tại")
    record, _ = result
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=35)
    db.commit()
    return {"message": "Đã chỉnh token hết hạn thành công để phục vụ test."}
