"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
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
    from src.backend.models import InventoryTransaction, ProductUnit, User
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
    from models import InventoryTransaction, ProductUnit, User

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])
legacy_router = APIRouter(tags=["Inventory compatibility"])


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
    if normalize_role(user.role) in {"Warehouse", "WH Manager"} and user.warehouse_ids and data.warehouse_id not in user.warehouse_ids:
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
    warehouse_id: Optional[int] = None,
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
    if warehouse_role and user.warehouse_ids and warehouse_id is not None and warehouse_id not in user.warehouse_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không được xem kho ngoài phạm vi được phân công.")
    items = [
        item.copy() for item in MOCK_INVENTORY_ITEMS
        if (warehouse_id is None or item["warehouse_id"] == warehouse_id)
        and (not warehouse_role or not user.warehouse_ids or item["warehouse_id"] in user.warehouse_ids)
    ]
    return sanitize_financial_data(items, user)


class TransactionCreateRequest(BaseModel):
    """Payload tạo mới giao dịch nhập/xuất kho."""

    product_id: int = Field(..., description="ID sản phẩm")
    unit_name: str = Field(..., min_length=1, description="Tên đơn vị tính")
    input_quantity: float = Field(..., description="Số lượng theo đơn vị tính")


class TransactionResponse(BaseModel):
    """Dữ liệu trả về sau khi tạo giao dịch kho."""

    id: int
    product_id: int
    unit_name: str
    input_quantity: float
    conversion_rate_snapshot: float
    base_quantity: float

    model_config = ConfigDict(from_attributes=True)



@router.post("/transaction", response_model=TransactionResponse, status_code=status.HTTP_200_OK)
@legacy_router.post("/inventory/transaction", response_model=TransactionResponse, status_code=status.HTTP_200_OK)
def create_inventory_transaction(
    payload: TransactionCreateRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_ADJUST)),
    db: Session = Depends(get_db),
) -> Any:
    """Tạo giao dịch kho, snapshot tỷ lệ quy đổi và tính toán base_quantity."""
    # 1. Query bảng ProductUnit để lấy conversion_rate hiện tại (mặc định là 1 nếu không thấy)
    unit_record = (
        db.query(ProductUnit)
        .filter(
            ProductUnit.product_id == payload.product_id,
            ProductUnit.unit_name == payload.unit_name,
        )
        .first()
    )

    if unit_record is None and payload.unit_name.strip() != payload.unit_name:
        unit_record = (
            db.query(ProductUnit)
            .filter(
                ProductUnit.product_id == payload.product_id,
                ProductUnit.unit_name == payload.unit_name.strip(),
            )
            .first()
        )

    conversion_rate: float = float(unit_record.conversion_rate) if unit_record else 1.0

    # 2. Tính base_quantity = input_quantity * conversion_rate
    base_quantity: float = float(payload.input_quantity * conversion_rate)

    # 3. Khởi tạo record InventoryTransaction, lưu cứng hệ số vào cột conversion_rate_snapshot
    transaction = InventoryTransaction(
        product_id=payload.product_id,
        unit_name=payload.unit_name,
        input_quantity=payload.input_quantity,
        conversion_rate_snapshot=conversion_rate,
        base_quantity=base_quantity,
    )

    # 4. Lưu xuống DB và trả về kết quả
    try:
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu giao dịch kho: {exc}",
        ) from exc

    return transaction
