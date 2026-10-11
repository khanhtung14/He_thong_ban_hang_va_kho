"""Warehouse operations: Receipts, Transfers, Audits, PickLists, Dispatches."""

from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    require_permissions,
    normalize_role,
)
from app.core.database import get_db
from app.models.models import (
    WarehouseReceipt, WarehouseReceiptItem, 
    WarehouseTransfer, WarehouseTransferItem,
    WarehouseAudit, WarehouseAuditItem,
    Inventory, Product, Warehouse, InventoryLot
)

router = APIRouter(prefix="/api/v1/warehouse", tags=["Warehouse"])

class ReceiptItemSchema(BaseModel):
    productId: int
    unitId: int
    lotNumber: str
    mfgDate: str
    expDate: str
    quantity: float
    unitCost: float

class ReceiptSchema(BaseModel):
    supplierId: int
    warehouseId: int
    documentNo: str
    receiptDate: str
    items: List[ReceiptItemSchema]

@router.post("/receipts")
def create_receipt(
    data: ReceiptSchema,
    user: AuthenticatedUser = Depends(require_permissions("inventory:adjust")),
    db: Session = Depends(get_db),
):
    receipt = WarehouseReceipt(
        supplier_id=data.supplierId,
        warehouse_id=data.warehouseId,
        status="COMPLETED"
    )
    db.add(receipt)
    db.flush()
    
    for item in data.items:
        receipt_item = WarehouseReceiptItem(
            receipt_id=receipt.id,
            product_id=item.productId,
            lot_number=item.lotNumber,
            quantity=item.quantity,
            unit_price=item.unitCost,
        )
        db.add(receipt_item)
        
        # Increase Inventory
        inv = db.query(Inventory).filter(
            Inventory.product_id == item.productId,
            Inventory.warehouse_id == data.warehouseId
        ).first()
        if not inv:
            inv = Inventory(
                product_id=item.productId,
                warehouse_id=data.warehouseId,
                physical_qty=item.quantity,
                reserved_qty=0.0,
                available_qty=item.quantity
            )
            db.add(inv)
        else:
            inv.physical_qty += item.quantity
            inv.available_qty += item.quantity
            
        # Add to Lots
        lot = InventoryLot(
            lot_number=item.lotNumber,
            product_id=item.productId,
            warehouse_id=data.warehouseId,
            mfg_date=datetime.strptime(item.mfgDate, "%Y-%m-%d").date(),
            exp_date=datetime.strptime(item.expDate, "%Y-%m-%d").date(),
            quantity=item.quantity
        )
        db.add(lot)
        
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": "Phiếu nhập kho đã ghi sổ",
        "data": {"receiptId": receipt.id}
    }
