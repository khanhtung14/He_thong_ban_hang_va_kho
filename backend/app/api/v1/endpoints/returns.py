"""Return-order workflow for SCRUM-56 and the accounting credit note."""
from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions, require_roles
from app.core.database import get_db
from app.models.models import (
    CreditNote,
    Customer,
    CustomerDebt,
    Dispatch,
    DispatchItem,
    Inventory,
    InventoryLot,
    Invoice,
    Order,
    OrderItem,
    ReturnOrder,
    ReturnOrderItem,
    Warehouse,
)

router = APIRouter(prefix="/api/v1/returns", tags=["Returns"])


class ReturnItem(BaseModel):
    product_id: int = Field(validation_alias=AliasChoices("productId", "product_id"))
    unit_id: int = Field(validation_alias=AliasChoices("unitId", "unit_id"))
    lot_number: str = Field(validation_alias=AliasChoices("lotNumber", "lot_number"))
    quantity: float = Field(gt=0)


class ReturnCreate(BaseModel):
    invoice_id: int = Field(validation_alias=AliasChoices("invoiceId", "invoice_id"))
    warehouse_id: int = Field(validation_alias=AliasChoices("warehouseId", "warehouse_id"))
    return_date: str = Field(validation_alias=AliasChoices("returnDate", "return_date"))
    reason: str = Field(min_length=1)
    items: List[ReturnItem] = Field(min_length=1)


class CreditNoteCreate(BaseModel):
    return_id: int = Field(validation_alias=AliasChoices("returnId", "return_id"))
    note: str = Field(min_length=1)


def _delivered_quantities(db: Session, invoice: Invoice) -> Dict[Tuple[int, str], float]:
    if not invoice.dispatch_id:
        return {}
    rows = db.query(DispatchItem).filter(DispatchItem.dispatch_id == invoice.dispatch_id).all()
    return {(row.product_id, row.lot_number or ""): float(row.actual_qty or 0) for row in rows}


def _sold_unit_prices(db: Session, invoice: Invoice) -> Dict[int, float]:
    """Get the historical selling price per product from the original order."""
    if not invoice.dispatch_id:
        return {}
    dispatch = db.get(Dispatch, invoice.dispatch_id)
    order = db.get(Order, dispatch.order_id) if dispatch else None
    if not order:
        return {}
    totals: dict[int, float] = {}
    quantities: dict[int, float] = {}
    for item in db.query(OrderItem).filter(OrderItem.order_id == order.id).all():
        quantity = float(item.quantity or 0)
        if quantity <= 0 or item.product_id is None:
            continue
        line_value = float(item.line_total or 0.0)
        if line_value <= 0:
            line_value = quantity * float(item.unit_price or 0.0)
        totals[item.product_id] = totals.get(item.product_id, 0.0) + line_value
        quantities[item.product_id] = quantities.get(item.product_id, 0.0) + quantity
    return {
        product_id: totals[product_id] / quantities[product_id]
        for product_id in totals
        if quantities.get(product_id, 0.0) > 0
    }


@router.post("")
def create_return(
    data: ReturnCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permissions("inventory:view")),
):
    invoice = db.get(Invoice, data.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn gốc.")
    delivered = _delivered_quantities(db, invoice)
    if not delivered:
        raise HTTPException(status_code=422, detail="Hóa đơn chưa có dữ liệu giao hàng để đối chiếu số lượng trả.")
    previous = db.query(ReturnOrderItem).join(ReturnOrder).filter(
        ReturnOrder.invoice_id == data.invoice_id,
        ReturnOrder.status.in_(["PENDING", "RECEIVED", "RECEIVED_DAMAGED"]),
    ).all()
    already_returned: dict[tuple[int, str], float] = {}
    for row in previous:
        key = (row.product_id, row.lot_number or "")
        already_returned[key] = already_returned.get(key, 0) + float(row.quantity or 0)

    for item in data.items:
        key = (item.product_id, item.lot_number)
        delivered_qty = delivered.get(key)
        if delivered_qty is None or item.quantity + already_returned.get(key, 0) > delivered_qty:
            raise HTTPException(status_code=422, detail=f"Số lượng trả SKU #{item.product_id}, lô {item.lot_number} vượt số đã giao.")

    order = ReturnOrder(
        invoice_id=data.invoice_id,
        warehouse_id=data.warehouse_id,
        return_date=date.fromisoformat(data.return_date),
        reason=data.reason.strip(),
        status="PENDING",
    )
    db.add(order)
    db.flush()
    for item in data.items:
        db.add(ReturnOrderItem(
            return_id=order.id,
            product_id=item.product_id,
            lot_number=item.lot_number,
            quantity=item.quantity,
        ))
    db.commit()
    return {
        "success": True,
        "code": 201,
        "message": "Phiếu trả hàng đã được lập, chờ Quản lý kho xác nhận.",
        "data": {"id": order.id, "status": order.status},
    }


@router.post("/{return_id}/confirm-receipt")
def confirm_return_receipt(
    return_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Warehouse", "WH Manager")),
):
    order = db.get(ReturnOrder, return_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu trả hàng.")
    if order.status != "PENDING":
        raise HTTPException(status_code=409, detail="Phiếu trả hàng đã được xác nhận hoặc đã xử lý.")
    items = db.query(ReturnOrderItem).filter(ReturnOrderItem.return_id == return_id).all()
    is_damaged = any(word in order.reason.lower() for word in ("hỏng", "hong", "damaged", "móp", "vỡ"))
    destination_warehouse_id = order.warehouse_id
    if is_damaged:
        source_warehouse = db.get(Warehouse, order.warehouse_id)
        if source_warehouse:
            damaged_code = f"{source_warehouse.code}-DAMAGED"
            damaged_warehouse = db.query(Warehouse).filter(Warehouse.code == damaged_code).first()
            if not damaged_warehouse:
                damaged_warehouse = Warehouse(
                    code=damaged_code,
                    name=f"{source_warehouse.name} - Kho hàng lỗi",
                    address=source_warehouse.address,
                    is_active=True,
                )
                db.add(damaged_warehouse)
                db.flush()
            destination_warehouse_id = damaged_warehouse.id
    for item in items:
        inventory = db.query(Inventory).filter(
            Inventory.product_id == item.product_id,
            Inventory.warehouse_id == destination_warehouse_id,
        ).first()
        if not inventory:
            inventory = Inventory(product_id=item.product_id, warehouse_id=destination_warehouse_id, physical_qty=0, reserved_qty=0, available_qty=0)
            db.add(inventory)
        inventory.physical_qty += item.quantity
        inventory.available_qty += item.quantity
        lot = db.query(InventoryLot).filter(
            InventoryLot.product_id == item.product_id,
            InventoryLot.warehouse_id == destination_warehouse_id,
            InventoryLot.lot_number == (item.lot_number or "UNKNOWN"),
        ).first()
        if lot:
            lot.quantity += item.quantity
        else:
            db.add(InventoryLot(
                product_id=item.product_id,
                warehouse_id=destination_warehouse_id,
                lot_number=item.lot_number or "UNKNOWN",
                quantity=item.quantity,
            ))
    order.status = "RECEIVED_DAMAGED" if is_damaged else "RECEIVED"
    order.confirmed_at = datetime.utcnow()
    order.confirmed_by = user.id
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": "Đã xác nhận nhận hàng trả và cộng tồn kho.",
        "data": {"id": order.id, "status": order.status, "warehouseId": destination_warehouse_id},
    }


@router.post("/{return_id}/credit-note")
def create_credit_note(
    return_id: int,
    data: CreditNoteCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    if data.return_id != return_id:
        raise HTTPException(status_code=422, detail="returnId không khớp với URL.")
    order = db.get(ReturnOrder, return_id)
    if not order or order.status not in ("RECEIVED", "RECEIVED_DAMAGED"):
        raise HTTPException(status_code=409, detail="Phiếu trả hàng chưa được kho xác nhận.")
    if db.query(CreditNote).filter(CreditNote.return_id == return_id).first():
        raise HTTPException(status_code=409, detail="Phiếu trả hàng đã có chứng từ giảm trừ.")
    invoice = db.get(Invoice, order.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn gốc của phiếu trả hàng.")
    customer = db.get(Customer, invoice.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý của hóa đơn gốc.")
    returned_items = db.query(ReturnOrderItem).filter(ReturnOrderItem.return_id == return_id).all()
    prices = _sold_unit_prices(db, invoice)
    missing_prices = sorted({row.product_id for row in returned_items if row.product_id not in prices})
    if missing_prices:
        raise HTTPException(
            status_code=422,
            detail=f"Không tìm thấy đơn giá bán lịch sử trên hóa đơn cho sản phẩm: {missing_prices}.",
        )
    amount = sum(
        float(row.quantity or 0.0) * prices[row.product_id]
        for row in returned_items
    )
    note = CreditNote(return_id=return_id, note=data.note, amount=amount)
    db.add(note)
    customer.current_debt = max(0.0, float(customer.current_debt or 0.0) - amount)
    debt = db.query(CustomerDebt).filter(CustomerDebt.customer_id == customer.id).first()
    if debt:
        debt.total_debt = max(0.0, float(debt.total_debt or 0.0) - amount)
    else:
        db.add(CustomerDebt(customer_id=customer.id, total_debt=0.0))
    db.commit()
    return {
        "success": True,
        "code": 201,
        "message": "Đã tạo chứng từ giảm trừ công nợ.",
        "data": {
            "id": note.id,
            "returnId": return_id,
            "originalInvoiceId": invoice.id,
            "customerId": customer.id,
            "returnDate": order.return_date.isoformat() if order.return_date else None,
            "amount": amount,
            "currentDebt": customer.current_debt,
            "availableCredit": max(0.0, float(customer.credit_limit or 0.0) - customer.current_debt),
        },
    }
