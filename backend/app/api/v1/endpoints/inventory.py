"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any, Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from datetime import date, datetime

from app.api.v1.endpoints.rbac import (
    PERM_INVENTORY_ADJUST,
    PERM_INVENTORY_VIEW,
    PERM_INVENTORY_RECEIVE,
    PERM_INVENTORY_PICK,
    AuthenticatedUser,
    get_current_user,
    require_permissions,
    sanitize_financial_data,
    normalize_role,
)
from app.core.database import get_db
from app.models.models import (
    User,
    Inventory,
    Product,
    Warehouse,
    InventoryLot,
    ProductUnit,
    InventoryTransaction,
    InventoryStock,
)

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])
legacy_router = APIRouter(tags=["Inventory"])


class InventoryAdjustmentRequest(BaseModel):
    sku: str = Field(min_length=1)
    warehouse_id: int = Field(gt=0)
    quantity_delta: int
    reason: str = Field(min_length=1)


MOCK_INVENTORY_ITEMS = [
    {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "product_id": 1,
        "warehouse_id": 1,
        "warehouse_name": "Kho Tổng Hà Nội",
        "quantity_available": 120,
        "quantity_reserved": 20,
        "cost_price": 350000,
        "margin": "30.0%",
        "unit": "Thùng 24 lon",
    },
    {
        "sku": "SKU-002",
        "name": "Cà phê lon Highlands 235ml",
        "product_id": 2,
        "warehouse_id": 1,
        "warehouse_name": "Kho Tổng Hà Nội",
        "quantity_available": 85,
        "quantity_reserved": 15,
        "cost_price": 180000,
        "margin": "25.0%",
        "unit": "Thùng 24 lon",
    },
]


def _sync_warehouse_scope(user: AuthenticatedUser, db: Session) -> None:
    """Use current DB assignments so a changed warehouse scope takes effect immediately."""
    if normalize_role(user.role) not in {"Warehouse", "WH Manager"}:
        return
    try:
        account = db.query(User).filter(User.username == user.username).first()
        if account is not None:
            user.warehouse_ids = [warehouse.id for warehouse in account.warehouses if warehouse.is_active]
    except Exception:
        return


@router.post("/adjust")
def adjust_inventory(
    data: InventoryAdjustmentRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_ADJUST)),
    db: Session = Depends(get_db),
):
    """Adjust inventory quantity.

    RBAC Rule:
    - Sales Rep TUYỆT ĐỐI KHÔNG có quyền (bị chặn 403 Forbidden).
    - Chỉ WH Manager (và Admin) được phép thực hiện điều chỉnh tồn.
    """
    _sync_warehouse_scope(user, db)
    if normalize_role(user.role) in {"Warehouse", "WH Manager"} and user.warehouse_ids and data.warehouse_id not in user.warehouse_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không được thao tác ngoài kho đã được phân công.",
        )

    for item in MOCK_INVENTORY_ITEMS:
        if item["sku"] == data.sku and item["warehouse_id"] == data.warehouse_id:
            item["quantity_available"] += data.quantity_delta
            return {
                "message": "Điều chỉnh tồn kho thành công",
                "sku": data.sku,
                "warehouse_id": data.warehouse_id,
                "new_quantity_available": item["quantity_available"],
                "reason": data.reason,
            }

    new_item = {
        "sku": data.sku,
        "name": data.sku,
        "product_id": 999,
        "warehouse_id": data.warehouse_id,
        "warehouse_name": f"Kho #{data.warehouse_id}",
        "quantity_available": data.quantity_delta,
        "quantity_reserved": 0,
        "unit": "Đơn vị",
    }
    MOCK_INVENTORY_ITEMS.append(new_item)
    return {
        "message": "Điều chỉnh tồn kho thành công",
        "sku": data.sku,
        "warehouse_id": data.warehouse_id,
        "new_quantity_available": data.quantity_delta,
        "reason": data.reason,
    }


@router.get("/items")
def list_inventory_items_compat(
    warehouse_id: Optional[int] = Query(None, alias="warehouse_id"),
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    """List inventory items (compat endpoint)."""
    _sync_warehouse_scope(user, db)
    warehouse_role = normalize_role(user.role) in {"Warehouse", "WH Manager"}
    if warehouse_role and user.warehouse_ids and warehouse_id is not None and warehouse_id not in user.warehouse_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không được xem kho ngoài phạm vi được phân công.")

    items = [
        item.copy() for item in MOCK_INVENTORY_ITEMS
        if (warehouse_id is None or item["warehouse_id"] == warehouse_id)
        and (not warehouse_role or not user.warehouse_ids or item["warehouse_id"] in user.warehouse_ids)
    ]
    try:
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
            p_id = item.get("product_id")
            if p_id in quantities:
                item["quantity_available"] = quantities[p_id]
    except Exception:
        pass

    return sanitize_financial_data(items, user)



@router.get("")
def list_inventory_items(
    warehouse_id: Optional[int] = Query(None, alias="warehouseId"),
    category_id: Optional[int] = Query(None, alias="categoryId"),
    keyword: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    """List inventory items."""
    _sync_warehouse_scope(user, db)
    warehouse_role = normalize_role(user.role) in {"Warehouse", "WH Manager"}
    
    if warehouse_role and user.warehouse_ids and warehouse_id is not None and warehouse_id not in user.warehouse_ids:
        raise HTTPException(status_code=403, detail="Bạn không được xem kho ngoài phạm vi được phân công.")

    query = db.query(Inventory, Product, Warehouse).join(Product).join(Warehouse)
    
    if warehouse_id:
        query = query.filter(Inventory.warehouse_id == warehouse_id)
    elif warehouse_role and user.warehouse_ids:
        query = query.filter(Inventory.warehouse_id.in_(user.warehouse_ids))
        
    if category_id:
        query = query.filter(Product.category_id == category_id)
        
    if keyword:
        query = query.filter((Product.name.ilike(f"%{keyword}%")) | (Product.sku.ilike(f"%{keyword}%")))
        
    results = query.all()
    
    items = []
    for inv, prod, wh in results:
        items.append({
            "productId": prod.id,
            "sku": prod.sku,
            "productName": prod.name,
            "baseUnit": prod.base_unit,
            "warehouseId": wh.id,
            "warehouseName": wh.name,
            "physicalQty": inv.physical_qty,
            "reservedQty": inv.reserved_qty,
            "availableQty": inv.available_qty,
            "minStock": prod.min_stock,
            "isBelowMinStock": inv.physical_qty < prod.min_stock,
            "costPrice": prod.cost_price,
        })
        
    sanitized = sanitize_financial_data(items, user)
    return {
        "success": True,
        "code": 200,
        "data": sanitized
    }

@router.get("/alerts")
def get_inventory_alerts(
    warehouse_id: Optional[int] = Query(None, alias="warehouseId"),
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
):
    """Get low stock alerts."""
    _sync_warehouse_scope(user, db)
    warehouse_role = normalize_role(user.role) in {"Warehouse", "WH Manager"}
    
    query = db.query(Inventory, Product).join(Product).filter(Inventory.physical_qty < Product.min_stock)
    
    if warehouse_id:
        query = query.filter(Inventory.warehouse_id == warehouse_id)
    elif warehouse_role and user.warehouse_ids:
        query = query.filter(Inventory.warehouse_id.in_(user.warehouse_ids))
        
    results = query.all()
    
    items = []
    for inv, prod in results:
        items.append({
            "productId": prod.id,
            "sku": prod.sku,
            "productName": prod.name,
            "warehouseId": inv.warehouse_id,
            "physicalQty": inv.physical_qty,
            "minStock": prod.min_stock,
        })
        
    return {
        "success": True,
        "code": 200,
        "data": items
    }

@router.get("/lots")
def list_inventory_lots(
    product_id: Optional[int] = Query(None, alias="productId"),
    warehouse_id: Optional[int] = Query(None, alias="warehouseId"),
    is_expired: Optional[bool] = Query(None, alias="isExpired"),
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
):
    query = db.query(InventoryLot)
    if product_id:
        query = query.filter(InventoryLot.product_id == product_id)
    if warehouse_id:
        query = query.filter(InventoryLot.warehouse_id == warehouse_id)
    if is_expired is True:
        query = query.filter(InventoryLot.exp_date < date.today())
    elif is_expired is False:
        query = query.filter(InventoryLot.exp_date >= date.today())
        
    lots = query.all()
    return {
        "success": True,
        "code": 200,
        "data": [
            {
                "id": lot.id,
                "lotNumber": lot.lot_number,
                "productId": lot.product_id,
                "warehouseId": lot.warehouse_id,
                "mfgDate": lot.mfg_date,
                "expDate": lot.exp_date,
                "quantity": lot.quantity,
            } for lot in lots
        ]
    }


class TransactionCreateRequest(BaseModel):
    product_id: int = Field(gt=0)
    warehouse_id: int = Field(gt=0)
    transaction_type: Literal["IN", "OUT"]
    unit_name: str = Field(min_length=1, max_length=100)
    input_quantity: float = Field(gt=0, allow_inf_nan=False)


class LegacyTransactionCreateRequest(BaseModel):
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
    movement_permission = PERM_INVENTORY_RECEIVE if payload.transaction_type == "IN" else PERM_INVENTORY_PICK
    if not user.has_permission(movement_permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Bạn không có quyền ghi nhận giao dịch {payload.transaction_type}.",
        )

    _sync_warehouse_scope(user, db)
    if normalize_role(user.role) in {"Warehouse", "WH Manager"} and user.warehouse_ids and payload.warehouse_id not in user.warehouse_ids:
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

