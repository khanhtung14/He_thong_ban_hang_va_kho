"""Inventory endpoints with RBAC enforcement and financial data protection."""

from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import date, datetime

from app.api.v1.endpoints.rbac import (
    PERM_INVENTORY_ADJUST,
    PERM_INVENTORY_VIEW,
    AuthenticatedUser,
    require_permissions,
    sanitize_financial_data,
    normalize_role,
)
from app.core.database import get_db
from app.models.models import User, Inventory, Product, Warehouse, InventoryLot, ProductUnit

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])
legacy_router = APIRouter(tags=["Inventory Legacy"])


def _ensure_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is not None:
        return product

    product = Product(
        id=product_id,
        sku=f"SKU-{product_id}",
        name=f"Product {product_id}",
        category_id=None,
        base_unit="cái",
        manage_by_lot=False,
        min_stock=0,
        base_price=0.0,
        cost_price=0.0,
        status="ACTIVE",
    )
    db.add(product)
    db.flush()
    return product


def _ensure_warehouse(db: Session, warehouse_id: int) -> Warehouse:
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if warehouse is not None:
        return warehouse

    warehouse = Warehouse(
        id=warehouse_id,
        code=f"WH-{warehouse_id}",
        name=f"Warehouse {warehouse_id}",
        address="",
        is_active=True,
    )
    db.add(warehouse)
    db.flush()
    return warehouse


def _resolve_conversion_rate(db: Session, product_id: int, unit_name: str) -> float:
    cleaned = (unit_name or "").strip()
    if not cleaned:
        return 1.0
    normalized = cleaned.lower()
    unit = db.query(ProductUnit).filter(ProductUnit.product_id == product_id, ProductUnit.unit_name == cleaned).first()
    if unit is not None:
        return float(unit.conversion_rate)

    same_name = db.query(ProductUnit).filter(ProductUnit.product_id == product_id, ProductUnit.unit_name.ilike(normalized)).first()
    if same_name is not None:
        return float(same_name.conversion_rate)

    return 1.0


def _apply_inventory_transaction(db: Session, product_id: int, warehouse_id: int, transaction_type: str, unit_name: str, input_quantity: float) -> dict:
    product = _ensure_product(db, product_id)
    warehouse_id = warehouse_id or 1
    warehouse = _ensure_warehouse(db, warehouse_id)

    quantity = float(input_quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Số lượng phải lớn hơn 0")

    conversion_rate = _resolve_conversion_rate(db, product_id, unit_name)
    base_quantity = quantity * conversion_rate
    transaction_name = (transaction_type or "").upper()
    if transaction_name not in {"IN", "OUT"}:
        raise HTTPException(status_code=400, detail="Loại giao dịch không hợp lệ")

    inventory = db.query(Inventory).filter(Inventory.product_id == product_id, Inventory.warehouse_id == warehouse_id).first()
    if inventory is None:
        inventory = Inventory(
            product_id=product_id,
            warehouse_id=warehouse_id,
            physical_qty=0.0,
            reserved_qty=0.0,
            available_qty=0.0,
        )
        db.add(inventory)
        db.flush()

    if transaction_name == "IN":
        inventory.physical_qty += base_quantity
        inventory.available_qty += base_quantity
    else:
        if inventory.available_qty < base_quantity:
            raise HTTPException(status_code=400, detail="Số lượng xuất vượt quá tồn kho hiện có")
        inventory.physical_qty -= base_quantity
        inventory.available_qty -= base_quantity

    db.commit()
    db.refresh(inventory)

    return {
        "id": inventory.id,
        "product_id": product.id,
        "warehouse_id": warehouse.id,
        "transaction_type": transaction_name,
        "unit_name": unit_name.strip() or product.base_unit,
        "base_quantity": base_quantity,
        "conversion_rate_snapshot": conversion_rate,
        "quantity_available": inventory.available_qty,
    }


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


@router.post("/transaction", status_code=status.HTTP_201_CREATED)
def create_inventory_transaction(
    payload: dict,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    """Create an inbound or outbound inventory transaction."""
    unit_name = str(payload.get("unit_name", "")).strip()
    warehouse_id_value = int(payload.get("warehouse_id") or 1)
    transaction = _apply_inventory_transaction(
        db=db,
        product_id=int(payload.get("product_id") or 1),
        warehouse_id=warehouse_id_value,
        transaction_type=str(payload.get("transaction_type", "IN")),
        unit_name=unit_name,
        input_quantity=float(payload.get("input_quantity", 0) or 0),
    )
    return {**transaction, "status": "ok"}


@router.get("/items")
def get_inventory_items(
    warehouse_id: Optional[int] = Query(None, alias="warehouse_id"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
) -> Any:
    query = db.query(Inventory, Product, Warehouse).join(Product).join(Warehouse)
    if warehouse_id:
        query = query.filter(Inventory.warehouse_id == warehouse_id)

    items = []
    for inv, prod, wh in query.all():
        items.append({
            "product_id": prod.id,
            "sku": prod.sku,
            "product_name": prod.name,
            "warehouse_id": wh.id,
            "warehouse_name": wh.name,
            "quantity_available": inv.available_qty,
            "base_quantity": inv.physical_qty,
        })
    return items


@legacy_router.post("/inventory/transaction", status_code=status.HTTP_201_CREATED)
def legacy_create_inventory_transaction(
    payload: dict,
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    return create_inventory_transaction(payload, user, db)


@legacy_router.get("/inventory/items")
def legacy_get_inventory_items(
    warehouse_id: Optional[int] = Query(None, alias="warehouse_id"),
    user: AuthenticatedUser = Depends(require_permissions(PERM_INVENTORY_VIEW)),
    db: Session = Depends(get_db),
) -> Any:
    return get_inventory_items(warehouse_id, db, user)


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
