"""Admin APIs for assigning user roles and operating scopes."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import AccountAuditLog, Role, Territory, User, Warehouse
    from app.core.security import require_admin
except ImportError:  # pragma: no cover - direct script execution
    from app.core.database import get_db
    from app.models.models import AccountAuditLog, Role, Territory, User, Warehouse
    from app.core.security import require_admin


router = APIRouter(prefix="/api/v1/admin", tags=["Admin User Assignments"])


class AssignmentUpdateRequest(BaseModel):
    role_ids: List[int] = Field(default_factory=list)
    warehouse_ids: List[int] = Field(default_factory=list)
    territory_ids: List[int] = Field(default_factory=list)


WAREHOUSE_ROLE_CODES = {"WAREHOUSE", "WH_MANAGER", "WAREHOUSE_KEEPER", "THU_KHO", "WAREHOUSE_STAFF"}


def _assignment_payload(user: User) -> dict:
    return {
        "user_id": user.id,
        "role_ids": [role.id for role in user.roles],
        "warehouse_ids": [warehouse.id for warehouse in user.warehouses],
        "territory_ids": [territory.id for territory in user.territories],
    }


@router.get("/assignment-options")
def get_assignment_options(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return {
        "roles": [
            {"id": role.id, "code": role.code, "name": role.name}
            for role in db.query(Role).order_by(Role.name).all()
        ],
        "warehouses": [
            {"id": warehouse.id, "code": warehouse.code, "name": warehouse.name}
            for warehouse in db.query(Warehouse)
            .filter(Warehouse.is_active.is_(True))
            .order_by(Warehouse.name)
            .all()
        ],
        "territories": [
            {"id": territory.id, "code": territory.code, "name": territory.name}
            for territory in db.query(Territory).order_by(Territory.name).all()
        ],
    }


@router.get("/users/{user_id}/assignments")
def get_user_assignments(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")
    return _assignment_payload(user)


@router.put("/users/{user_id}/assignments")
def update_user_assignments(
    user_id: int,
    payload: AssignmentUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

    role_ids = set(payload.role_ids)
    warehouse_ids = set(payload.warehouse_ids)
    territory_ids = set(payload.territory_ids)
    new_roles = db.query(Role).filter(Role.id.in_(role_ids)).all() if role_ids else []
    if not new_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Người dùng phải có ít nhất một vai trò.")
    if len(new_roles) != len(role_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Có vai trò được chọn không tồn tại.")

    new_role_codes = {role.code.upper() for role in new_roles}
    if target_user.id == current_admin.id:
        currently_admin = any(role.code.upper() == "ADMIN" for role in target_user.roles)
        if currently_admin and "ADMIN" not in new_role_codes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tự thu hồi vai trò quản trị của chính mình.",
            )

    new_warehouses = db.query(Warehouse).filter(
        Warehouse.id.in_(warehouse_ids), Warehouse.is_active.is_(True)
    ).all() if warehouse_ids else []
    if len(new_warehouses) != len(warehouse_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Có kho được chọn không tồn tại hoặc đã ngừng hoạt động.")
    if new_role_codes & WAREHOUSE_ROLE_CODES and not new_warehouses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho đang hoạt động.",
        )

    new_territories = db.query(Territory).filter(Territory.id.in_(territory_ids)).all() if territory_ids else []
    if len(new_territories) != len(territory_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Có địa bàn được chọn không tồn tại.")

    target_user.roles = new_roles
    target_user.warehouses = new_warehouses
    target_user.territories = new_territories
    db.add(AccountAuditLog(
        user_id=target_user.id,
        actor_user_id=current_admin.id,
        action="UPDATE_USER_ASSIGNMENTS",
        reason=f"Roles: {sorted(new_role_codes)}, Warehouses: {sorted(warehouse_ids)}, Territories: {sorted(territory_ids)}",
    ))
    db.commit()
    db.refresh(target_user)
    return {"message": "Đã cập nhật vai trò và phạm vi hoạt động.", **_assignment_payload(target_user)}
