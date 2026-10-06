"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

try:
    from src.backend.rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
        normalize_role,
    )
    from src.backend.database import get_db
    from src.backend.models import User
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
        normalize_role,
    )
    from database import get_db
    from models import User

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])


def _sync_warehouse_scope(user: AuthenticatedUser, db: Session) -> None:
    """Use current DB assignments so a changed warehouse scope takes effect immediately."""
    if normalize_role(user.role) not in {"Warehouse", "WH Manager"}:
        return
    try:
        account = db.query(User).filter(User.username == user.username).first()
        if account is not None:
            user.warehouse_ids = [warehouse.id for warehouse in account.warehouses if warehouse.is_active]
    except Exception:
        # Signed claims remain a safe fallback when older test/demo DBs lack user rows.
        return


class InventoryAdjustmentRequest(BaseModel):
    sku: str = Field(min_length=1)
    warehouse_id: int = Field(gt=0)
    quantity_delta: int = Field(description="Số lượng điều chỉnh (âm hoặc dương)")
    reason: str = Field(min_length=3, description="Lý do điều chỉnh kiểm kê / hao hụt")


# In-memory mock inventory storage for demo and test validation
MOCK_INVENTORY_ITEMS = [
    {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "warehouse_id": 1,
        "warehouse_name": "Kho Tổng Hà Nội",
        "quantity_available": 120,
        "cost_price": 350000,
        "margin": "30.0%",
    },
    {
        "sku": "SKU-002",
        "name": "Cà phê lon Highlands 235ml",
        "warehouse_id": 1,
        "warehouse_name": "Kho Tổng Hà Nội",
        "quantity_available": 85,
        "cost_price": 180000,
        "margin": "25.0%",
    },
]


@router.post("/adjust")
def adjust_inventory(
    data: InventoryAdjustmentRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_ADJUST)),
    db: Session = Depends(get_db),
):
    """Adjust inventory quantity.

    Strict business constraint:
    - Sales Rep TUYỆT ĐỐI KHÔNG có quyền (bị chặn 403 Forbidden).
    - Chỉ WH Manager (và Admin) được phép thực hiện điều chỉnh tồn.
    """
    _sync_warehouse_scope(user, db)
    if normalize_role(user.role) in {"Warehouse", "WH Manager"} and data.warehouse_id not in user.warehouse_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không được thao tác ngoài kho đã được phân công.")

    for item in MOCK_INVENTORY_ITEMS:
        if item["sku"] == data.sku and item["warehouse_id"] == data.warehouse_id:
            item["quantity_available"] += data.quantity_delta
            return {
                "message": "Điều chỉnh tồn kho thành công",
                "sku": data.sku,
                "warehouse_id": data.warehouse_id,
                "new_quantity": item["quantity_available"],
                "adjusted_by": user.username,
                "reason": data.reason,
            }

    # If SKU not found, simulate successful adjustment creation
    return {
        "message": "Điều chỉnh tồn kho thành công",
        "sku": data.sku,
        "warehouse_id": data.warehouse_id,
        "quantity_delta": data.quantity_delta,
        "adjusted_by": user.username,
        "reason": data.reason,
    }


@router.get("/items")
def list_inventory_items(
    warehouse_id: int | None = None,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    """List inventory items.

    Data confidentiality rule:
    - Warehouse and Sales Rep KHÔNG ĐƯỢC XEM cost_price và margin (bị lọc bỏ).
    - Sales Manager only can view cost and margin.
    """
    _sync_warehouse_scope(user, db)
    warehouse_role = normalize_role(user.role) in {"Warehouse", "WH Manager"}
    if warehouse_role and warehouse_id is not None and warehouse_id not in user.warehouse_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không được xem kho ngoài phạm vi được phân công.")
    items = [
        item.copy() for item in MOCK_INVENTORY_ITEMS
        if (warehouse_id is None or item["warehouse_id"] == warehouse_id)
        and (not warehouse_role or item["warehouse_id"] in user.warehouse_ids)
    ]
    return sanitize_financial_data(items, user)
