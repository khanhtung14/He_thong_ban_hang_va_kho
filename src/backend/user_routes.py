from __future__ import annotations

from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import AccountAuditLog, User
    from src.backend.security import require_admin
except ImportError:  # pragma: no cover - direct script execution
    from .database import get_db
    from .models import AccountAuditLog, User
    from .security import require_admin


router = APIRouter(tags=["Quản lý tài khoản"])


class LockUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(default="", max_length=100)
    reason: str = Field(default="", max_length=2000)


def _find_user(db: Session, user_id: str) -> Optional[Any]:
    user_id_clean = user_id.strip()
    if not user_id_clean:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ID hoặc username của người dùng.")
    if user_id_clean.isdigit():
        return db.execute(
            text("SELECT id, username FROM users WHERE id = :uid_int OR username = :uid_str LIMIT 1"),
            {"uid_int": int(user_id_clean), "uid_str": user_id_clean},
        ).fetchone()
    return db.execute(
        text("SELECT id, username FROM users WHERE username = :uid_str LIMIT 1"),
        {"uid_str": user_id_clean},
    ).fetchone()


def count_assigned_dealers(db: Session, user_id: int) -> int:
    """Count actual customer/dealer records assigned to this sales employee."""
    if not inspect(db.get_bind()).has_table("customers"):
        return 0
    count = db.execute(
        text("SELECT COUNT(DISTINCT id) FROM customers WHERE sales_rep_id = :user_id"),
        {"user_id": user_id},
    ).scalar_one()
    return int(count or 0)


def _ensure_audit_logs_table(db: Session) -> None:
    """Create the mapped audit table portably when bootstrapping a test database."""
    AccountAuditLog.__table__.create(bind=db.get_bind(), checkfirst=True)


def _user_columns(db: Session) -> Set[str]:
    return {column["name"] for column in inspect(db.get_bind()).get_columns("users")}


def _set_account_state(db: Session, user_id: int, *, active: bool, state: str) -> None:
    columns = _user_columns(db)
    values: Dict[str, Any] = {"active": active, "user_id": user_id}
    assignments = ["is_active = :active"]
    if "status" in columns:
        assignments.append("status = :state")
        values["state"] = state
    db.execute(text(f"UPDATE users SET {', '.join(assignments)} WHERE id = :user_id"), values)


def _handover_message(count: int) -> Optional[str]:
    if count <= 0:
        return None
    return (
        f"CẢNH BÁO BÀN GIAO: Nhân viên này đang phụ trách {count} đại lý. "
        "Vui lòng phân công người phụ trách mới để không làm gián đoạn tiếp nhận đơn hàng!"
    )


@router.post("/api/users/lock")
def lock_user(
    data: LockUserRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    reason = data.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do khóa tài khoản.")

    user = _find_user(db, data.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng: {data.user_id}")

    user_id = int(user[0])
    username = str(user[1])
    if user_id == actor.id:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản quản trị viên đang đăng nhập.")

    try:
        if not inspect(db.get_bind()).has_table("user_sessions"):
            raise RuntimeError("Bảng user_sessions chưa được khởi tạo; không thể đảm bảo thu hồi phiên.")
        _set_account_state(db, user_id, active=False, state="LOCKED")
        revoked_sessions = db.execute(
            text(
                "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP "
                "WHERE user_id = :user_id AND revoked_at IS NULL"
            ),
            {"user_id": user_id},
        ).rowcount
        _ensure_audit_logs_table(db)
        db.execute(
            text(
                """
                INSERT INTO account_audit_logs (user_id, actor_user_id, action, reason, created_at)
                VALUES (:user_id, :actor_user_id, 'LOCK_ACCOUNT', :reason, CURRENT_TIMESTAMP)
                """
            ),
            {"user_id": user_id, "actor_user_id": actor.id, "reason": reason},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể khóa tài khoản: {exc}",
        ) from exc

    assigned_count = count_assigned_dealers(db, user_id)
    warning = _handover_message(assigned_count)
    response = {
        "success": True,
        "message": f"Tài khoản {username} đã bị khóa. Các phiên đăng nhập đã bị thu hồi.",
        "user_id": user_id,
        "username": username,
        "is_active": False,
        "status": "LOCKED",
        "revoked_sessions": max(0, revoked_sessions or 0),
        "handover_required": assigned_count > 0,
        "assigned_dealers_count": assigned_count,
    }
    if warning:
        response["warning"] = warning
        response["handover_url"] = "/admin/territory-handover"
    return response


@router.post("/api/users/unlock/{user_id}")
def unlock_user(
    user_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    user = _find_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng: {user_id}")

    user_actual_id = int(user[0])
    username = str(user[1])
    try:
        _set_account_state(db, user_actual_id, active=True, state="ACTIVE")
        _ensure_audit_logs_table(db)
        db.execute(
            text(
                """
                INSERT INTO account_audit_logs (user_id, actor_user_id, action, reason, created_at)
                VALUES (:user_id, :actor_user_id, 'UNLOCK_ACCOUNT', :reason, CURRENT_TIMESTAMP)
                """
            ),
            {
                "user_id": user_actual_id,
                "actor_user_id": actor.id,
                "reason": "Tài khoản được mở khóa",
            },
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể mở khóa tài khoản: {exc}",
        ) from exc

    return {
        "success": True,
        "message": f"Tài khoản {username} đã được mở khóa thành công.",
        "user_id": user_actual_id,
        "username": username,
        "is_active": True,
        "status": "ACTIVE",
    }


@router.get("/api/users/{user_id}/handover-status")
def get_user_handover_status(
    user_id: str,
    db: Session = Depends(get_db),
    _actor: User = Depends(require_admin),
):
    user = _find_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng: {user_id}")

    user_id_actual = int(user[0])
    count = count_assigned_dealers(db, user_id_actual)
    warning = _handover_message(count)
    return {
        "user_id": user_id_actual,
        "username": str(user[1]),
        "assigned_dealers_count": count,
        "handover_required": count > 0,
        "warning": warning,
        "handover_url": "/admin/territory-handover" if warning else None,
    }


@router.get("/api/users/{user_id}/audit-logs")
def get_user_audit_logs(
    user_id: str,
    db: Session = Depends(get_db),
    _actor: User = Depends(require_admin),
):
    user = _find_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy người dùng: {user_id}")
    _ensure_audit_logs_table(db)
    rows = db.execute(
        text(
            """
            SELECT id, user_id, actor_user_id, action, reason, created_at
            FROM account_audit_logs
            WHERE user_id = :user_id
            ORDER BY id DESC
            """
        ),
        {"user_id": int(user[0])},
    ).mappings().all()
    return {"audit_logs": [dict(row) for row in rows]}


@router.get("/api/users")
def list_users(
    db: Session = Depends(get_db),
    _actor: User = Depends(require_admin),
):
    rows = db.execute(
        text(
            """
            SELECT u.id, u.username, u.full_name,
                   u.is_active, u.status, r.code AS role_code
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r ON r.id = ur.role_id
            ORDER BY u.id ASC
            """
        )
    ).mappings().all()
    users: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        item = users.setdefault(
            int(row["id"]),
            {
                "id": int(row["id"]),
                "username": row["username"],
                "full_name": row["full_name"],
                "is_active": bool(row["is_active"]),
                "status": str(row["status"]),
                "roles": [],
            },
        )
        if row["role_code"] and row["role_code"] not in item["roles"]:
            item["roles"].append(row["role_code"])
    for item in users.values():
        item["assigned_dealers_count"] = count_assigned_dealers(db, item["id"])
    return {"users": list(users.values())}
