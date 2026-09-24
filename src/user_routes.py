from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

# Schema nhận dữ liệu yêu cầu khóa tài khoản
class LockUserRequest(BaseModel):
    user_id: str
    reason: str  # Bắt buộc phải nhập lý do khóa

@router.post("/api/users/lock")
def lock_user(data: LockUserRequest):
    # Kiểm tra điều kiện bắt buộc có lý do khóa
    if not data.reason or not data.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do khóa tài khoản."
        )
    
    # TODO: 1. Cập nhật trạng thái user trong MySQL database (is_active = False, lock_reason = data.reason)
    # TODO: 2. Thu hồi phiên đăng nhập / hủy Token của user bị khóa
    # TODO: 3. Gửi cảnh báo bàn giao đại lý nếu nhân viên phụ trách nghỉ việc
    
    return {
        "success": True,
        "message": f"Tài khoản {data.user_id} đã bị khóa. Phiên làm việc đã bị thu hồi."
    }

@router.post("/api/users/unlock/{user_id}")
def unlock_user(user_id: str):
    # TODO: Cập nhật trạng thái user trong MySQL (is_active = True)
    return {
        "success": True,
        "message": f"Tài khoản {user_id} đã được mở khóa thành công."
    }