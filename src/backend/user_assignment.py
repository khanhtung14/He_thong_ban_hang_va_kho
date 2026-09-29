"""API endpoints and business logic for SCRUM-63: Assign roles, warehouses, and territories."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, Role, Warehouse, Territory, AccountAuditLog
from .login import get_current_user


router = APIRouter(prefix="/api/admin/users", tags=["User Assignment"])


class AssignmentUpdateRequest(BaseModel):
    role_ids: List[int]
    warehouse_ids: List[int] = []
    territory_ids: List[int] = []


ADMIN_ROLE_CODE = "ADMIN"
WAREHOUSE_ROLE_CODES = ["WAREHOUSE_KEEPER", "THU_KHO", "WAREHOUSE_STAFF"]


@router.put("/{user_id}/assignments")
def update_user_assignments(
    user_id: int,
    payload: AssignmentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng không tồn tại",
        )

    new_roles = db.query(Role).filter(Role.id.in_(payload.role_ids)).all()
    new_role_codes = {r.code.upper() for r in new_roles}

    # 1. Không thể tự thu hồi vai trò quản trị của chính mình
    if current_user.id == target_user.id:
        has_admin_currently = any(r.code.upper() == ADMIN_ROLE_CODE for r in target_user.roles)
        will_have_admin = ADMIN_ROLE_CODE in new_role_codes
        if has_admin_currently and not will_have_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự thu hồi vai trò quản trị của chính mình.",
            )

    # 2. Người dùng thuộc vai trò kho phải gắn với ít nhất một kho cụ thể
    is_warehouse_user = any(code in new_role_codes for code in WAREHOUSE_ROLE_CODES)
    if is_warehouse_user:
        if not payload.warehouse_ids or len(payload.warehouse_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Người dùng thuộc vai trò kho phải gắn với ít nhất một kho cụ thể.",
            )
        new_warehouses = (
            db.query(Warehouse)
            .filter(Warehouse.id.in_(payload.warehouse_ids), Warehouse.is_active == True)
            .all()
        )
        if len(new_warehouses) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kho được gán không tồn tại hoặc không còn hoạt động.",
            )
    else:
        new_warehouses = []

    # 3. Gán địa bàn
    new_territories = []
    if payload.territory_ids:
        new_territories = (
            db.query(Territory).filter(Territory.id.in_(payload.territory_ids)).all()
        )

    # 4. Gán vai trò (nhiều vai trò cùng lúc)
    target_user.roles = new_roles
    target_user.warehouses = new_warehouses
    target_user.territories = new_territories

    audit_log = AccountAuditLog(
        user_id=target_user.id,
        actor_user_id=current_user.id,
        action="UPDATE_USER_ASSIGNMENTS",
        reason=f"Roles: {list(new_role_codes)}, Warehouses: {payload.warehouse_ids}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(target_user)

    return {
        "message": "Gán vai trò và phạm vi hoạt động thành công!",
        "user_id": target_user.id,
        "roles": [r.code for r in target_user.roles],
        "warehouses": [w.code for w in target_user.warehouses],
        "territories": [t.code for t in target_user.territories],
    }
