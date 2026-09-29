from __future__ import annotations

from typing import Any, Optional
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
    actor_user_id: Optional[int] = None
    assigned_dealers_count: Optional[int] = None


def count_assigned_dealers(db: Session, user_id: int) -> int:
    """Đếm số lượng đại lý / khách hàng do nhân viên này phụ trách."""
    check_sources = [
        ("customers", "sales_rep_id"),
        ("user_customers", "user_id"),
        ("dealers", "sales_rep_id"),
        ("user_dealers", "user_id"),
        ("user_territories", "user_id"),
    ]
    for table_name, col_name in check_sources:
        try:
            count = db.execute(
                text(f"SELECT COUNT(*) FROM {table_name} WHERE {col_name} = :uid"),
                {"uid": user_id},
            ).scalar()
            if count is not None and count > 0:
                return int(count)
        except Exception:
            continue
    return 0


def _ensure_audit_logs_table(db: Session):
    """Đảm bảo bảng account_audit_logs tồn tại trong database (kể cả SQLite test)."""
    try:
        db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS account_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    actor_user_id INTEGER,
                    action VARCHAR(80) NOT NULL,
                    reason TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
        )
    except Exception:
        pass


@router.post("/api/users/lock")
def lock_user(data: LockUserRequest, db: Session = Depends(get_db)):
    # 1. Kiểm tra điều kiện bắt buộc có lý do khóa (không rỗng / blank)
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
    username_actual = user[1]

    # 3. Thực hiện câu lệnh UPDATE cập nhật trạng thái is_active = False và status = 'LOCKED' vào Database
    try:
        try:
            update_stmt = text(
                "UPDATE users SET is_active = :is_active, status = 'LOCKED' WHERE id = :user_id"
            )
            db.execute(update_stmt, {"is_active": False, "user_id": user_actual_id})
        except Exception:
            update_stmt = text(
                "UPDATE users SET is_active = :is_active WHERE id = :user_id"
            )
            db.execute(update_stmt, {"is_active": False, "user_id": user_actual_id})

        # Thu hồi / vô hiệu hóa các phiên đăng nhập đang mở của user bị khóa
        try:
            revoke_stmt = text(
                "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = :user_id AND revoked_at IS NULL"
            )
            db.execute(revoke_stmt, {"user_id": user_actual_id})
        except Exception as sess_exc:
            # Nếu không có bảng user_sessions thì bỏ qua, nếu bảng có mà lỗi câu lệnh thì ném lỗi
            err_msg = str(sess_exc).lower()
            if "no such table" not in err_msg and "doesn't exist" not in err_msg:
                raise sess_exc

        # Lưu lý do khóa vào bảng audit log / history
        _ensure_audit_logs_table(db)
        log_stmt = text(
            """
            INSERT INTO account_audit_logs (user_id, actor_user_id, action, reason, created_at)
            VALUES (:user_id, :actor_user_id, 'LOCK_ACCOUNT', :reason, CURRENT_TIMESTAMP)
            """
        )
        db.execute(
            log_stmt,
            {
                "user_id": user_actual_id,
                "actor_user_id": data.actor_user_id,
                "reason": data.reason.strip(),
            },
        )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi cập nhật cơ sở dữ liệu: {str(exc)}"
        )

    # 4. Kiểm tra logic cảnh báo bàn giao đại lý phụ trách khi khóa tài khoản
    assigned_count = count_assigned_dealers(db, user_actual_id)
    if data.assigned_dealers_count is not None:
        assigned_count = max(assigned_count, data.assigned_dealers_count)

    handover_required = assigned_count > 0
    warning_message = None
    handover_url = None

    if handover_required:
        warning_message = (
            f"CẢNH BÁO BÀN GIAO: Nhân viên này đang phụ trách {assigned_count} đại lý. "
            f"Vui lòng phân công người phụ trách mới để không làm gián đoạn tiếp nhận đơn hàng!"
        )
        handover_url = "/admin/territory-handover"

    response = {
        "success": True,
        "message": f"Tài khoản {data.user_id} đã bị khóa. Phiên làm việc đã bị thu hồi.",
        "user_id": user_actual_id,
        "username": username_actual,
        "is_active": False,
        "status": "LOCKED",
        "handover_required": handover_required,
        "assigned_dealers_count": assigned_count,
    }
    if handover_required:
        response["warning"] = warning_message
        response["handover_url"] = handover_url

    return response


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
    username_actual = user[1]

    # 2. Thực hiện câu lệnh UPDATE cập nhật trạng thái is_active = True và status = 'ACTIVE' vào Database
    try:
        try:
            update_stmt = text(
                "UPDATE users SET is_active = :is_active, status = 'ACTIVE' WHERE id = :user_id"
            )
            db.execute(update_stmt, {"is_active": True, "user_id": user_actual_id})
        except Exception:
            update_stmt = text(
                "UPDATE users SET is_active = :is_active WHERE id = :user_id"
            )
            db.execute(update_stmt, {"is_active": True, "user_id": user_actual_id})

        # Ghi nhận mở khóa vào audit log
        _ensure_audit_logs_table(db)
        try:
            log_stmt = text(
                """
                INSERT INTO account_audit_logs (user_id, action, reason, created_at)
                VALUES (:user_id, 'UNLOCK_ACCOUNT', 'Mở khóa tài khoản', CURRENT_TIMESTAMP)
                """
            )
            db.execute(log_stmt, {"user_id": user_actual_id})
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
        "message": f"Tài khoản {user_id} đã được mở khóa thành công.",
        "user_id": user_actual_id,
        "username": username_actual,
        "is_active": True,
        "status": "ACTIVE",
    }


@router.get("/api/users/{user_id}/handover-status")
def get_user_handover_status(user_id: str, db: Session = Depends(get_db)):
    """Kiểm tra số lượng đại lý nhân viên đang phụ trách để chuẩn bị bàn giao."""
    user_id_clean = user_id.strip()
    if user_id_clean.isdigit():
        user = db.execute(
            text("SELECT id, username FROM users WHERE id = :uid_int OR username = :uid_str LIMIT 1"),
            {"uid_int": int(user_id_clean), "uid_str": user_id_clean},
        ).fetchone()
    else:
        user = db.execute(
            text("SELECT id, username FROM users WHERE username = :uid_str LIMIT 1"),
            {"uid_str": user_id_clean},
        ).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy người dùng: {user_id}",
        )

    user_actual_id = user[0]
    username_actual = user[1]
    assigned_count = count_assigned_dealers(db, user_actual_id)
    handover_required = assigned_count > 0

    return {
        "user_id": user_actual_id,
        "username": username_actual,
        "assigned_dealers_count": assigned_count,
        "handover_required": handover_required,
        "warning": (
            f"CẢNH BÁO BÀN GIAO: Nhân viên này đang phụ trách {assigned_count} đại lý. "
            f"Vui lòng phân công người phụ trách mới để không làm gián đoạn tiếp nhận đơn hàng!"
            if handover_required
            else None
        ),
        "handover_url": "/admin/territory-handover" if handover_required else None,
    }


@router.get("/api/users/{user_id}/audit-logs")
def get_user_audit_logs(user_id: str, db: Session = Depends(get_db)):
    """Lấy danh sách lịch sử khóa / mở khóa và audit log của người dùng."""
    user_id_clean = user_id.strip()
    if user_id_clean.isdigit():
        user = db.execute(
            text("SELECT id FROM users WHERE id = :uid_int OR username = :uid_str LIMIT 1"),
            {"uid_int": int(user_id_clean), "uid_str": user_id_clean},
        ).fetchone()
    else:
        user = db.execute(
            text("SELECT id FROM users WHERE username = :uid_str LIMIT 1"),
            {"uid_str": user_id_clean},
        ).fetchone()

    if not user:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng: {user_id}")

    user_actual_id = user[0]
    try:
        rows = db.execute(
            text(
                """
                SELECT id, user_id, actor_user_id, action, reason, created_at
                FROM account_audit_logs
                WHERE user_id = :uid
                ORDER BY id DESC
                """
            ),
            {"uid": user_actual_id},
        ).mappings().all()
        return {"audit_logs": [dict(r) for r in rows]}
    except Exception:
        return {"audit_logs": []}


@router.get("/api/users")
def list_users(db: Session = Depends(get_db)):
    """Danh sách người dùng cho giao diện quản trị Admin."""
    try:
        rows = db.execute(
            text(
                """
                SELECT id, username,
                       COALESCE(is_active, 1) AS is_active,
                       COALESCE(status, 'ACTIVE') AS status
                FROM users
                ORDER BY id ASC
                """
            )
        ).mappings().all()
        users_list = []
        for r in rows:
            u_dict = dict(r)
            u_dict["is_active"] = bool(u_dict.get("is_active"))
            u_dict["assigned_dealers_count"] = count_assigned_dealers(db, u_dict["id"])
            users_list.append(u_dict)
        return {"users": users_list}
    except Exception:
        return {"users": []}