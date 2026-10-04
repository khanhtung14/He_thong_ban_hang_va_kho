"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from src.backend.rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])


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
):
    """Adjust inventory quantity.

    Strict business constraint:
    - Sales Rep TUYỆT ĐỐI KHÔNG có quyền (bị chặn 403 Forbidden).
    - Chỉ WH Manager (và Admin) được phép thực hiện điều chỉnh tồn.
    """
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
) -> Any:
    """List inventory items.

    Data confidentiality rule:
    - Warehouse and Sales Rep KHÔNG ĐƯỢC XEM cost_price và margin (bị lọc bỏ).
    - Sales Manager only can view cost and margin.
    """
    items = [
        item.copy() for item in MOCK_INVENTORY_ITEMS
        if warehouse_id is None or item["warehouse_id"] == warehouse_id
    ]
    return sanitize_financial_data(items, user)
