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
from app.models.models import User, Inventory, Product, Warehouse, InventoryLot

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
        return


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
