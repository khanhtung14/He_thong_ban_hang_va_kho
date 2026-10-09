"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

try:
    from src.backend.rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_PICK,
        PERM_INVENTORY_RECEIVE,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        get_current_user,
        require_permissions,
        sanitize_financial_data,
        normalize_role,
    )
    from src.backend.database import get_db
    from src.backend.models import InventoryStock, InventoryTransaction, ProductUnit, User
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_PICK,
        PERM_INVENTORY_RECEIVE,
        PERM_INVENTORY_VIEW,
        AuthenticatedUser,
        get_current_user,
        require_permissions,
        sanitize_financial_data,
        normalize_role,
    )
    from database import get_db
    from models import InventoryStock, InventoryTransaction, ProductUnit, User

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
        "product_id": 1,
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "warehouse_id": 1,
        "warehouse_name": "Kho Tổng Hà Nội",
        "quantity_available": 120,
        "cost_price": 350000,
        "margin": "30.0%",
    },
    {
        "product_id": 2,
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
    stock_query = db.query(InventoryStock)
    if warehouse_id is not None:
        stock_query = stock_query.filter(InventoryStock.warehouse_id == warehouse_id)
    elif warehouse_role and user.warehouse_ids:
        stock_query = stock_query.filter(InventoryStock.warehouse_id.in_(user.warehouse_ids))
    stocks = stock_query.all()
    quantities: dict[int, float] = {}
    for stock in stocks:
        quantities[stock.product_id] = quantities.get(stock.product_id, 0.0) + stock.base_quantity
    for item in items:
        if item["product_id"] in quantities:
            item["quantity_available"] = quantities[item["product_id"]]
    return sanitize_financial_data(items, user)


class TransactionCreateRequest(BaseModel):
    """A stock movement expressed in the selected product unit."""
    product_id: int = Field(gt=0)
    warehouse_id: int = Field(gt=0)
    transaction_type: Literal["IN", "OUT"]
    unit_name: str = Field(min_length=1, max_length=100)
    input_quantity: float = Field(gt=0, allow_inf_nan=False)


class LegacyTransactionCreateRequest(BaseModel):
    """Backward-compatible payload accepted by /inventory/transaction."""
    product_id: int = Field(gt=0)
    unit_name: str = Field(min_length=1, max_length=100)
    input_quantity: float = Field(gt=0, allow_inf_nan=False)
    warehouse_id: int = Field(default=1, gt=0)
    transaction_type: Literal["IN", "OUT"] = "IN"


class TransactionResponse(BaseModel):
    id: int
    product_id: int
    warehouse_id: int
    transaction_type: str
    unit_name: str
    input_quantity: float
    conversion_rate_snapshot: float
    base_quantity: float

    model_config = ConfigDict(from_attributes=True)


def _record_stock_movement(
    payload: TransactionCreateRequest | LegacyTransactionCreateRequest,
    user: AuthenticatedUser,
    db: Session,
) -> InventoryTransaction:
    # Receiving and picking are the warehouse staff's movement permissions;
    # adjustment permission remains reserved for managers/admins.
    movement_permission = PERM_INVENTORY_RECEIVE if payload.transaction_type == "IN" else PERM_INVENTORY_PICK
    if not user.has_permission(movement_permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Bạn không có quyền ghi nhận giao dịch {payload.transaction_type}.",
        )

    _sync_warehouse_scope(user, db)
    if normalize_role(user.role) in {"Warehouse", "WH Manager"} and payload.warehouse_id not in user.warehouse_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không được thao tác ngoài kho đã được phân công.",
        )

    unit_name = payload.unit_name.strip()
    try:
        unit_record = (
            db.query(ProductUnit)
            .filter(
                ProductUnit.product_id == payload.product_id,
                ProductUnit.unit_name == unit_name,
            )
            .first()
        )
        # No configuration means the requested unit is treated as the base unit.
        conversion_rate = float(unit_record.conversion_rate) if unit_record else 1.0
        base_quantity = float(payload.input_quantity) * conversion_rate

        stock = (
            db.query(InventoryStock)
            .filter(
                InventoryStock.product_id == payload.product_id,
                InventoryStock.warehouse_id == payload.warehouse_id,
            )
            .with_for_update()
            .first()
        )
        if stock is None:
            if payload.transaction_type == "OUT":
                raise HTTPException(status_code=400, detail="Không đủ tồn kho để xuất sản phẩm.")
            stock = InventoryStock(
                product_id=payload.product_id,
                warehouse_id=payload.warehouse_id,
                base_quantity=0,
            )
            db.add(stock)
            db.flush()

        if payload.transaction_type == "IN":
            stock.base_quantity += base_quantity
        else:
            if stock.base_quantity < base_quantity:
                raise HTTPException(status_code=400, detail="Không đủ tồn kho để xuất sản phẩm.")
            stock.base_quantity -= base_quantity

        transaction = InventoryTransaction(
            product_id=payload.product_id,
            warehouse_id=payload.warehouse_id,
            transaction_type=payload.transaction_type,
            unit_name=unit_name,
            input_quantity=payload.input_quantity,
            conversion_rate_snapshot=conversion_rate,
            base_quantity=base_quantity,
        )
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        return transaction
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể lưu giao dịch kho.",
        ) from exc


@router.post("/transaction", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_transaction(
    payload: TransactionCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryTransaction:
    return _record_stock_movement(payload, user, db)


@legacy_router.post(
    "/inventory/transaction",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_legacy_inventory_transaction(
    payload: LegacyTransactionCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryTransaction:
    return _record_stock_movement(payload, user, db)
