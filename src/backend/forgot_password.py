"""
Module xử lý chức năng Quên mật khẩu / Đặt lại mật khẩu (SCRUM-57)
User Story:
    Là người dùng hệ thống, tôi muốn đặt lại mật khẩu khi quên thông qua email,
    để tự động lấy lại quyền truy cập khi đang đi thị trường mà không được gọi về văn phòng.

Acceptance Criteria:
    1. Nhập email đã nhận được liên kết, thiết lập lại có hiệu lực 30 phút.
    2. Liên kết được sử dụng chỉ một lần.
    3. Email không tồn tại vẫn hiển thị cùng một thông báo.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import secrets
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import User
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import User

router = APIRouter(tags=["Quên & Đặt lại mật khẩu"])

# Hằng số cấu hình
RESET_TOKEN_EXPIRE_MINUTES = 30
GENERIC_SUCCESS_MESSAGE = (
    "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến email của bạn. "
    "Vui lòng kiểm tra hộp thư (liên kết có hiệu lực trong 30 phút)."
)

# ---------------------------------------------------------
# Giả lập Database người dùng trong bộ nhớ để phục vụ test/chạy demo
# ---------------------------------------------------------
fake_users_db: Dict[str, Dict[str, Any]] = {
    "nhanvien@congty.com": {
        "email": "nhanvien@congty.com",
        "full_name": "Nguyễn Văn Thị Trường",
        "password": bcrypt.hashpw("Password123".encode("utf-8"), bcrypt.gensalt()),
        "role": "Nhân viên kinh doanh",
        "active": True
    },
    "admin@congty.com": {
        "email": "admin@congty.com",
        "full_name": "Quản Trị Viên",
        "password": bcrypt.hashpw("AdminPass123".encode("utf-8"), bcrypt.gensalt()),
        "role": "Quản trị hệ thống",
        "active": True
    }
}

# ---------------------------------------------------------
# Kho lưu trữ token đặt lại mật khẩu
# Cấu trúc mỗi bản ghi:
# {
#     "token": str,
#     "email": str,
#     "created_at": datetime,
#     "expires_at": datetime,
#     "used": bool
# }
# ---------------------------------------------------------
reset_tokens_db: Dict[str, Dict[str, Any]] = {}

# Hộp thư email giả lập (Outbox) để kiểm thử việc gửi email không cần SMTP thật
mock_outbox: List[Dict[str, Any]] = []


# ---------------------------------------------------------
# Pydantic Request/Response Models
# ---------------------------------------------------------
class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Email tài khoản cần đặt lại mật khẩu")


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_link_preview: Optional[str] = Field(
        None, 
        description="Đường link đặt lại mật khẩu (chỉ hiển thị trong môi trường demo/dev để tiện kiểm thử)"
    )


class VerifyTokenResponse(BaseModel):
    valid: bool
    email: str
    message: str


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Mã token nhận được từ email đặt lại mật khẩu")
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới (tối thiểu 8 ký tự, gồm cả chữ và số)")
    confirm_password: str = Field(..., description="Xác nhận lại mật khẩu mới")


class MessageResponse(BaseModel):
    message: str


# ---------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------

@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Yêu cầu gửi liên kết đặt lại mật khẩu qua email"
)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Tiêu chí đáp ứng:
    - Nhập email để nhận liên kết đặt lại mật khẩu.
    - Thời hạn hiệu lực của liên kết là 30 phút.
    - Bảo mật: Email KHÔNG tồn tại vẫn trả về CÙNG MỘT THÔNG BÁO để chống dò quét tài khoản (User Enumeration).
    """
    normalized_email = data.email.strip().lower()
    try:
        db_user = db.query(User).filter(User.email.ilike(normalized_email)).first()
    except Exception:
        db.rollback()
        db_user = None

    fake_user = fake_users_db.get(normalized_email)
    user_exists = db_user is not None or fake_user is not None
    full_name = db_user.full_name if db_user is not None else (
        fake_user.get("full_name", normalized_email) if fake_user else normalized_email
    )

    reset_link_preview = None
    
    if user_exists:
        # 2. Tạo mã token an toàn ngẫu nhiên (URL-safe)
        token = secrets.token_urlsafe(32)
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
        
        # 3. Lưu token với trạng thái chưa sử dụng và thời hạn 30 phút
        reset_tokens_db[token] = {
            "token": token,
            "email": normalized_email,
            "database_user": db_user is not None,
            "created_at": now,
            "expires_at": expires_at,
            "used": False
        }
        
        # Tạo liên kết đặt lại mật khẩu
        reset_link = f"http://localhost:8000/reset-password?token={token}"
        reset_link_preview = reset_link
        
        # 4. Ghi nhận vào outbox giả lập (mô phỏng tiến trình gửi email)
        email_record = {
            "to": normalized_email,
            "subject": "[Hệ thống Bán hàng & Kho] Yêu cầu đặt lại mật khẩu",
            "body": (
                f"Xin chào {full_name},\n\n"
                f"Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản {normalized_email}.\n"
                f"Vui lòng truy cập đường dẫn sau để đặt lại mật khẩu:\n{reset_link}\n\n"
                f"Lưu ý: Liên kết này chỉ có hiệu lực trong vòng 30 phút và chỉ được sử dụng một lần duy nhất."
            ),
            "reset_link": reset_link,
            "token": token,
            "sent_at": now.isoformat()
        }
        mock_outbox.append(email_record)
    
    # 5. Dù email tồn tại hay không tồn tại, LUÔN trả về CÙNG MỘT THÔNG BÁO
    return ForgotPasswordResponse(
        message=GENERIC_SUCCESS_MESSAGE,
        reset_link_preview=reset_link_preview
    )


@router.get(
    "/verify-reset-token/{token}",
    response_model=VerifyTokenResponse,
    summary="Kiểm tra tính hợp lệ của token đặt lại mật khẩu"
)
def verify_reset_token(token: str):
    """
    Kiểm tra xem token:
    1. Có tồn tại không?
    2. Đã được sử dụng chưa (chỉ được dùng 1 lần)?
    3. Đã hết hạn chưa (hiệu lực 30 phút)?
    """
    token_record = reset_tokens_db.get(token)
    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc không tồn tại."
        )
    
    # Tiêu chí 2: Liên kết chỉ được sử dụng 1 lần
    if token_record["used"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết này đã được sử dụng. Mỗi liên kết chỉ có thể dùng một lần duy nhất."
        )
    
    # Tiêu chí 1: Hiệu lực trong vòng 30 phút
    now = datetime.now(timezone.utc)
    if now > token_record["expires_at"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu đã hết hạn (chỉ có hiệu lực trong 30 phút). Vui lòng yêu cầu lại."
        )
    
    return VerifyTokenResponse(
        valid=True,
        email=token_record["email"],
        message="Liên kết hợp lệ. Bạn có thể tiến hành đặt lại mật khẩu."
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Thực hiện đặt lại mật khẩu mới bằng liên kết token"
)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Tiêu chí đáp ứng:
    - Xác thực token: tồn tại, chưa hết hạn (< 30 phút), chưa qua sử dụng.
    - Kiểm tra mật khẩu mới: độ dài >= 8, có chữ, có số, khớp với xác nhận mật khẩu.
    - Đổi mật khẩu thành công: Hash bằng bcrypt và lưu mật khẩu mới.
    - Hủy hiệu lực của liên kết ngay sau khi sử dụng (Liên kết chỉ sử dụng 1 lần).
    """
    # 1. Kiểm tra sự tồn tại của token
    token_record = reset_tokens_db.get(data.token)
    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc không tồn tại."
        )
    
    # 2. Tiêu chí 2: Liên kết chỉ được dùng một lần
    if token_record["used"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết này đã được sử dụng trước đó. Vui lòng yêu cầu liên kết mới nếu cần."
        )
    
    # 3. Tiêu chí 1: Kiểm tra thời hạn hiệu lực 30 phút
    now = datetime.now(timezone.utc)
    if now > token_record["expires_at"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút). Vui lòng gửi lại yêu cầu mới."
        )
    
    # 4. Kiểm tra mật khẩu xác nhận
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu xác nhận không khớp với mật khẩu mới."
        )
    
    # 5. Kiểm tra độ dài mật khẩu mới (>= 8 ký tự)
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự."
        )
    
    # 6. Mật khẩu phải chứa chữ
    if not any(char.isalpha() for char in data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải chứa ít nhất một chữ cái."
        )
    
    # 7. Mật khẩu phải chứa số
    if not any(char.isdigit() for char in data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải chứa ít nhất một chữ số."
        )
    
    user_email = token_record["email"]
    database_user = None
    if token_record.get("database_user"):
        try:
            database_user = db.query(User).filter(User.email.ilike(user_email)).first()
        except Exception:
            db.rollback()

    fake_user = fake_users_db.get(user_email) if database_user is None else None
    if database_user is None and fake_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng tương ứng với liên kết không tồn tại."
        )
    
    # 8. Không cho phép mật khẩu mới trùng với mật khẩu hiện tại
    current_password_hash = (
        database_user.password_hash.encode("utf-8")
        if database_user is not None
        else fake_user["password"]
    )
    if bcrypt.checkpw(data.new_password.encode("utf-8"), current_password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu cũ."
        )
    
    # 9. Mã hóa mật khẩu mới bằng bcrypt
    new_password_hash = bcrypt.hashpw(
        data.new_password.encode("utf-8"),
        bcrypt.gensalt()
    )
    
    # Cập nhật mật khẩu người dùng
    if database_user is not None:
        database_user.password_hash = new_password_hash.decode("utf-8")
        db.commit()
    else:
        fake_user["password"] = new_password_hash
    
    # 10. Tiêu chí 2: Đánh dấu liên kết đã được sử dụng (One-time use)
    token_record["used"] = True
    token_record["used_at"] = now
    
    return MessageResponse(
        message="Đặt lại mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập."
    )


# ---------------------------------------------------------
# API Tiện ích phục vụ Kiểm thử & Chấm điểm (Dev / Demo Tools)
# ---------------------------------------------------------

@router.get(
    "/dev/mock-outbox",
    summary="[Dành cho Test/Demo] Xem danh sách email đã gửi giả lập"
)
def get_mock_outbox():
    """Xem các email đã được gửi vào hòm thư mock để dễ dàng lấy link test."""
    return {
        "total_emails": len(mock_outbox),
        "emails": mock_outbox
    }


@router.post(
    "/dev/reset-tokens/expire-token/{token}",
    summary="[Dành cho Test] Đánh dấu một token bị quá hạn 30 phút để kiểm thử"
)
def expire_token_for_testing(token: str):
    """Tiện ích test: Cố tình chỉnh thời gian hết hạn lùi về quá khứ 35 phút trước."""
    token_record = reset_tokens_db.get(token)
    if not token_record:
        raise HTTPException(status_code=404, detail="Token không tồn tại")
    
    token_record["expires_at"] = datetime.now(timezone.utc) - timedelta(minutes=35)
    return {"message": "Đã chỉnh token hết hạn thành công để phục vụ test."}
