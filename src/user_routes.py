from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
except ImportError:
    try:
        from backend.database import get_db
    except ImportError:
        from .backend.database import get_db

router = APIRouter()

# Schema nhận dữ liệu yêu cầu khóa tài khoản
class LockUserRequest(BaseModel):
    user_id: str
    reason: str  # Bắt buộc phải nhập lý do khóa

@router.post("/api/users/lock")
def lock_user(data: LockUserRequest, db: Session = Depends(get_db)):
    # 1. Kiểm tra điều kiện bắt buộc có lý do khóa
    if not data.reason or not data.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do khóa tài khoản."
        )
    
    user_id_clean = data.user_id.strip()
    if not user_id_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp ID hoặc username của người dùng."
        )

    # 2. Kiểm tra xem người dùng có tồn tại trong database MySQL hay không
    if user_id_clean.isdigit():
        find_stmt = text(
            "SELECT id, username FROM users WHERE id = :uid_int OR username = :uid_str LIMIT 1"
        )
        user = db.execute(find_stmt, {"uid_int": int(user_id_clean), "uid_str": user_id_clean}).fetchone()
    else:
        find_stmt = text(
            "SELECT id, username FROM users WHERE username = :uid_str LIMIT 1"
        )
        user = db.execute(find_stmt, {"uid_str": user_id_clean}).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng: {data.user_id}"
        )

    user_actual_id = user[0]

    # 3. Thực hiện câu lệnh UPDATE cập nhật trạng thái is_active = False vào Database MySQL
    try:
        update_stmt = text(
            "UPDATE users SET is_active = :is_active WHERE id = :user_id"
        )
        db.execute(update_stmt, {"is_active": False, "user_id": user_actual_id})

        # Thu hồi phiên đăng nhập / hủy token của user bị khóa nếu có bảng user_sessions
        try:
            revoke_stmt = text(
                "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = :user_id AND revoked_at IS NULL"
            )
            db.execute(revoke_stmt, {"user_id": user_actual_id})
        except Exception:
            pass

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi cập nhật cơ sở dữ liệu: {str(exc)}"
        )
    
    return {
        "success": True,
        "message": f"Tài khoản {data.user_id} đã bị khóa. Phiên làm việc đã bị thu hồi."
    }

@router.post("/api/users/unlock/{user_id}")
def unlock_user(user_id: str, db: Session = Depends(get_db)):
    user_id_clean = user_id.strip()
    if not user_id_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp ID hoặc username của người dùng."
        )

    # 1. Kiểm tra xem người dùng có tồn tại trong database MySQL hay không
    if user_id_clean.isdigit():
        find_stmt = text(
            "SELECT id, username FROM users WHERE id = :uid_int OR username = :uid_str LIMIT 1"
        )
        user = db.execute(find_stmt, {"uid_int": int(user_id_clean), "uid_str": user_id_clean}).fetchone()
    else:
        find_stmt = text(
            "SELECT id, username FROM users WHERE username = :uid_str LIMIT 1"
        )
        user = db.execute(find_stmt, {"uid_str": user_id_clean}).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng: {user_id}"
        )

    user_actual_id = user[0]

    # 2. Thực hiện câu lệnh UPDATE cập nhật trạng thái is_active = True vào Database MySQL
    try:
        update_stmt = text(
            "UPDATE users SET is_active = :is_active WHERE id = :user_id"
        )
        db.execute(update_stmt, {"is_active": True, "user_id": user_actual_id})
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi cập nhật cơ sở dữ liệu: {str(exc)}"
        )

    return {
        "success": True,
        "message": f"Tài khoản {user_id} đã được mở khóa thành công."
    }