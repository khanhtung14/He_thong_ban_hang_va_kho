from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Generic, Literal, Optional, TypeVar

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    normalize_role,
    require_roles,
)
from app.core.database import get_db
from app.models.models import (
    DispatchItem,
    Customer,
    Dispatch,
    Inventory,
    InventoryLot,
    InventoryStock,
    InventoryTransaction,
    Invoice,
    Order,
    Product,
    ProductUnit,
    ReturnOrder,
    ReturnOrderItem,
    User,
    Warehouse,
)

router = APIRouter(prefix="/api/v1/returns", tags=["Returns"])
RESERVED_RETURN_STATUSES = {"PENDING", "PENDING_RECEIPT", "RECEIVED"}


class ReturnItemRequest(BaseModel):
    product_id: int = Field(gt=0, alias="productId")
    unit_id: Optional[int] = Field(default=None, gt=0, alias="unitId")
    lot_number: Optional[str] = Field(default=None, max_length=100, alias="lotNumber")
    quantity: float = Field(gt=0, allow_inf_nan=False)

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("lot_number")
    @classmethod
    def clean_lot_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ReturnCreateRequest(BaseModel):
    invoice_id: int = Field(gt=0, alias="invoiceId")
    warehouse_id: int = Field(gt=0, alias="warehouseId")
    return_date: date = Field(alias="returnDate")
    reason: str = Field(min_length=1, max_length=2000)
    items: list[ReturnItemRequest] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Lý do trả hàng không được để trống.")
        return cleaned


class ReturnReceiveItemRequest(BaseModel):
    return_item_id: int = Field(gt=0, alias="returnItemId")
    condition: Literal["GOOD", "DAMAGED"]

    model_config = ConfigDict(populate_by_name=True)


class ReturnReceiveRequest(BaseModel):
    items: list[ReturnReceiveItemRequest] = Field(min_length=1)


class ReturnableUnitResponse(BaseModel):
    unitId: int
    unitName: str
    conversionRate: float
    isBaseUnit: bool


class ReturnableItemResponse(BaseModel):
    productId: int
    sku: str
    productName: str
    manageByLot: bool
    lotNumber: Optional[str]
    deliveredBaseQuantity: float
    returnedBaseQuantity: float
    returnableBaseQuantity: float
    baseUnit: str
    units: list[ReturnableUnitResponse]


class EligibleInvoiceResponse(BaseModel):
    id: int
    invoiceDate: Optional[str]
    customerId: int
    customerName: str
    totalAmount: float


class ReturnableInvoiceData(BaseModel):
    invoiceId: int
    customerId: int
    customerName: str
    items: list[ReturnableItemResponse]


class ReturnItemResponse(BaseModel):
    id: int
    productId: int
    sku: Optional[str]
    unitId: Optional[int]
    unitName: Optional[str]
    quantity: float
    baseQuantity: float
    lotNumber: Optional[str]
    condition: Optional[str]


class ReturnOrderResponse(BaseModel):
    id: int
    invoiceId: int
    customerName: Optional[str]
    warehouseId: int
    returnDate: Optional[str]
    reason: str
    status: str
    receivedAt: Optional[str]
    items: list[ReturnItemResponse]


T = TypeVar("T")


class ApiEnvelope(BaseModel, Generic[T]):
    success: bool
    code: int
    message: Optional[str] = None
    data: T


def _account_for_user(db: Session, user: AuthenticatedUser) -> Optional[User]:
    return db.query(User).filter(User.username == user.username).first()


def _customer_is_assigned(db: Session, user: AuthenticatedUser, customer: Customer) -> bool:
    if normalize_role(user.role) == "Admin":
        return True
    account = _account_for_user(db, user)
    if account is None or not account.is_active:
        return False
    return account.id in {customer.sales_rep_id, customer.assigned_sales_id}


def _get_invoice_for_user(
    db: Session,
    invoice_id: int,
    user: AuthenticatedUser,
) -> tuple[Invoice, Customer, list[DispatchItem]]:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn.")
    customer = db.get(Customer, invoice.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý của hóa đơn.")
    if not _customer_is_assigned(db, user, customer):
        raise HTTPException(status_code=403, detail="Bạn không được lập phiếu trả cho đại lý này.")
    if invoice.dispatch_id is None:
        raise HTTPException(status_code=422, detail="Hóa đơn chưa liên kết phiếu giao hàng.")
    dispatch = db.get(Dispatch, invoice.dispatch_id)
    order = db.get(Order, dispatch.order_id) if dispatch else None
    if order is None or order.customer_id != invoice.customer_id:
        raise HTTPException(status_code=409, detail="Hóa đơn không khớp đại lý của phiếu giao.")
    dispatch_items = (
        db.query(DispatchItem)
        .filter(DispatchItem.dispatch_id == invoice.dispatch_id, DispatchItem.actual_qty > 0)
        .all()
    )
    if not dispatch_items:
        raise HTTPException(status_code=422, detail="Hóa đơn không có dòng hàng đã giao để trả.")
    return invoice, customer, dispatch_items


def _return_key(product_id: int, lot_number: Optional[str], manage_by_lot: bool) -> tuple[int, Optional[str]]:
    return product_id, lot_number if manage_by_lot else None


def _reserved_quantities(db: Session, invoice_id: int) -> dict[tuple[int, Optional[str]], float]:
    totals: dict[tuple[int, Optional[str]], float] = {}
    returns = (
        db.query(ReturnOrder)
        .filter(
            ReturnOrder.invoice_id == invoice_id,
            ReturnOrder.status.in_(RESERVED_RETURN_STATUSES),
        )
        .all()
    )
    for return_order in returns:
        for item in db.query(ReturnOrderItem).filter(ReturnOrderItem.return_id == return_order.id).all():
            product = db.get(Product, item.product_id)
            if product is None:
                continue
            key = _return_key(item.product_id, item.lot_number, product.manage_by_lot)
            totals[key] = totals.get(key, 0.0) + item.base_quantity
    return totals


def _eligible_lines(
    db: Session,
    invoice_id: int,
    dispatch_items: list[DispatchItem],
) -> list[dict]:
    reserved = _reserved_quantities(db, invoice_id)
    delivered: dict[tuple[int, Optional[str]], float] = {}
    for dispatch_item in dispatch_items:
        product = db.get(Product, dispatch_item.product_id)
        if product is None:
            continue
        lot_number = dispatch_item.lot_number if product.manage_by_lot else None
        key = _return_key(product.id, lot_number, product.manage_by_lot)
        delivered[key] = delivered.get(key, 0.0) + dispatch_item.actual_qty

    lines = []
    for (product_id, lot_number), delivered_qty in delivered.items():
        product = db.get(Product, product_id)
        remaining = max(0.0, delivered_qty - reserved.get((product_id, lot_number), 0.0))
        if product is None or remaining <= 1e-8:
            continue
        units = (
            db.query(ProductUnit)
            .filter(ProductUnit.product_id == product_id)
            .order_by(ProductUnit.is_base_unit.desc(), ProductUnit.id.asc())
            .all()
        )
        lines.append(
            {
                "productId": product.id,
                "sku": product.sku,
                "productName": product.name,
                "manageByLot": bool(product.manage_by_lot),
                "lotNumber": lot_number,
                "deliveredBaseQuantity": delivered_qty,
                "returnedBaseQuantity": reserved.get((product_id, lot_number), 0.0),
                "returnableBaseQuantity": remaining,
                "baseUnit": product.base_unit,
                "units": [
                    {
                        "unitId": unit.id,
                        "unitName": unit.unit_name,
                        "conversionRate": unit.conversion_rate,
                        "isBaseUnit": bool(unit.is_base_unit),
                    }
                    for unit in units
                ],
            }
        )
    return lines


def _return_data(db: Session, return_order: ReturnOrder) -> dict:
    invoice = db.get(Invoice, return_order.invoice_id)
    customer = db.get(Customer, invoice.customer_id) if invoice else None
    items = db.query(ReturnOrderItem).filter(ReturnOrderItem.return_id == return_order.id).all()
    item_data = []
    for item in items:
        product = db.get(Product, item.product_id)
        item_data.append(
            {
                "id": item.id,
                "productId": item.product_id,
                "sku": product.sku if product else None,
                "unitId": item.unit_id,
                "unitName": item.unit_name,
                "quantity": item.quantity,
                "baseQuantity": item.base_quantity,
                "lotNumber": item.lot_number,
                "condition": item.received_condition,
            }
        )
    return {
        "id": return_order.id,
        "invoiceId": return_order.invoice_id,
        "customerName": customer.name if customer else None,
        "warehouseId": return_order.warehouse_id,
        "returnDate": return_order.return_date.isoformat() if return_order.return_date else None,
        "reason": return_order.reason,
        "status": return_order.status,
        "receivedAt": return_order.received_at.isoformat() if return_order.received_at else None,
        "items": item_data,
    }


@router.get("/eligible-invoices", response_model=ApiEnvelope[list[EligibleInvoiceResponse]])
def list_eligible_invoices(
    user: AuthenticatedUser = Depends(require_roles("Sales Rep", "Admin")),
    db: Session = Depends(get_db),
) -> dict:
    account = _account_for_user(db, user)
    query = db.query(Invoice, Customer).join(Customer, Customer.id == Invoice.customer_id)
    if normalize_role(user.role) != "Admin":
        if account is None or not account.is_active:
            raise HTTPException(status_code=403, detail="Không tìm thấy tài khoản nhân viên kinh doanh.")
        query = query.filter(
            (Customer.sales_rep_id == account.id) | (Customer.assigned_sales_id == account.id)
        )
    result = []
    for invoice, customer in query.order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).all():
        if invoice.dispatch_id is None:
            continue
        dispatch_items = (
            db.query(DispatchItem)
            .filter(DispatchItem.dispatch_id == invoice.dispatch_id, DispatchItem.actual_qty > 0)
            .all()
        )
        if _eligible_lines(db, invoice.id, dispatch_items):
            result.append(
                {
                    "id": invoice.id,
                    "invoiceDate": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
                    "customerId": customer.id,
                    "customerName": customer.name,
                    "totalAmount": invoice.total_amount,
                }
            )
    return {"success": True, "code": 200, "data": result}


@router.get("/invoices/{invoice_id}/items", response_model=ApiEnvelope[ReturnableInvoiceData])
def list_invoice_returnable_items(
    invoice_id: int,
    user: AuthenticatedUser = Depends(require_roles("Sales Rep", "Admin")),
    db: Session = Depends(get_db),
) -> dict:
    invoice, customer, dispatch_items = _get_invoice_for_user(db, invoice_id, user)
    return {
        "success": True,
        "code": 200,
        "data": {
            "invoiceId": invoice.id,
            "customerId": customer.id,
            "customerName": customer.name,
            "items": _eligible_lines(db, invoice.id, dispatch_items),
        },
    }


@router.get("", response_model=ApiEnvelope[list[ReturnOrderResponse]])
def list_returns(
    user: AuthenticatedUser = Depends(require_roles("Sales Rep", "WH Manager", "Admin")),
    db: Session = Depends(get_db),
) -> dict:
    role = normalize_role(user.role)
    query = db.query(ReturnOrder)
    if role == "Sales Rep":
        account = _account_for_user(db, user)
        if account is None or not account.is_active:
            raise HTTPException(status_code=403, detail="Không tìm thấy tài khoản nhân viên kinh doanh.")
        assigned_customer_ids = select(Customer.id).where(
            (Customer.sales_rep_id == account.id) | (Customer.assigned_sales_id == account.id)
        )
        assigned_invoice_ids = select(Invoice.id).where(Invoice.customer_id.in_(assigned_customer_ids))
        query = query.filter(ReturnOrder.invoice_id.in_(assigned_invoice_ids))
    elif role == "WH Manager":
        account = _account_for_user(db, user)
        if account is None or not account.is_active:
            raise HTTPException(status_code=403, detail="Tài khoản quản lý kho không hoạt động.")
        assigned_warehouse_ids = {warehouse.id for warehouse in account.warehouses if warehouse.is_active} if account else set()
        assigned_warehouse_ids.update(user.warehouse_ids)
        if not assigned_warehouse_ids:
            raise HTTPException(status_code=403, detail="Tài khoản chưa được phân công kho.")
        query = query.filter(ReturnOrder.warehouse_id.in_(assigned_warehouse_ids))
    result = query.order_by(ReturnOrder.id.desc()).all()
    return {"success": True, "code": 200, "data": [_return_data(db, item) for item in result]}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ApiEnvelope[ReturnOrderResponse])
def create_return(
    data: ReturnCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Sales Rep", "Admin")),
) -> dict:
    invoice, _, dispatch_items = _get_invoice_for_user(db, data.invoice_id, user)
    warehouse = db.get(Warehouse, data.warehouse_id)
    if warehouse is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy kho nhận hàng.")
    if not warehouse.is_active:
        raise HTTPException(status_code=422, detail="Kho nhận hàng hiện không hoạt động.")

    returnable = {
        (line["productId"], line["lotNumber"]): line
        for line in _eligible_lines(db, invoice.id, dispatch_items)
    }
    request_keys: set[tuple[int, Optional[str]]] = set()
    prepared_items: list[dict] = []
    for item in data.items:
        product = db.get(Product, item.product_id)
        if product is None:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy sản phẩm {item.product_id}.")
        key_lot = item.lot_number if product.manage_by_lot else None
        key = (product.id, key_lot)
        if key in request_keys:
            raise HTTPException(status_code=422, detail="Không được lặp cùng sản phẩm/lô trong một phiếu trả.")
        request_keys.add(key)
        line = returnable.get(key)
        if line is None:
            raise HTTPException(
                status_code=422,
                detail=f"Sản phẩm {product.sku} và lô đã chọn không thuộc hàng còn được trả trên hóa đơn.",
            )
        if product.manage_by_lot and not item.lot_number:
            raise HTTPException(status_code=422, detail=f"Sản phẩm {product.sku} bắt buộc chọn đúng lô đã giao.")
        if product.manage_by_lot and item.lot_number != line["lotNumber"]:
            raise HTTPException(status_code=422, detail=f"Lô {item.lot_number} không khớp lô hàng đã giao.")

        unit = None
        if item.unit_id is not None:
            unit = db.get(ProductUnit, item.unit_id)
            if unit is None or unit.product_id != product.id:
                raise HTTPException(status_code=422, detail=f"Đơn vị tính không hợp lệ cho SKU {product.sku}.")
        if unit is None:
            unit = (
                db.query(ProductUnit)
                .filter(ProductUnit.product_id == product.id, ProductUnit.is_base_unit.is_(True))
                .first()
            )
        unit_name = unit.unit_name if unit else product.base_unit
        conversion_rate = float(unit.conversion_rate) if unit else 1.0
        base_quantity = item.quantity * conversion_rate
        if base_quantity > line["returnableBaseQuantity"] + 1e-8:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Số lượng trả SKU {product.sku} vượt số lượng còn được trả "
                    f"({line['returnableBaseQuantity']:g} {product.base_unit})."
                ),
            )
        prepared_items.append(
            {
                "product_id": product.id,
                "unit_id": unit.id if unit else None,
                "unit_name": unit_name,
                "conversion_rate_snapshot": conversion_rate,
                "quantity": item.quantity,
                "base_quantity": base_quantity,
                "lot_number": key_lot,
            }
        )

    account = _account_for_user(db, user)
    return_order = ReturnOrder(
        invoice_id=invoice.id,
        warehouse_id=data.warehouse_id,
        reason=data.reason,
        return_date=data.return_date,
        created_by_id=account.id if account else None,
        status="PENDING_RECEIPT",
    )
    db.add(return_order)
    try:
        db.flush()
        for item in prepared_items:
            db.add(ReturnOrderItem(return_id=return_order.id, **item))
        db.commit()
        db.refresh(return_order)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Không thể lưu phiếu trả hàng.") from exc
    return {"success": True, "code": 201, "message": "Đã tạo phiếu trả hàng chờ kho xác nhận.", "data": _return_data(db, return_order)}


def _validate_receive_warehouse(db: Session, user: AuthenticatedUser, warehouse_id: int) -> None:
    if normalize_role(user.role) == "Admin":
        return
    account = _account_for_user(db, user)
    if account is None or not account.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản quản lý kho không hoạt động.")
    assigned_ids = {warehouse.id for warehouse in account.warehouses if warehouse.is_active}
    assigned_ids.update(user.warehouse_ids)
    if warehouse_id not in assigned_ids:
        raise HTTPException(status_code=403, detail="Bạn không được xác nhận nhận hàng ngoài kho được phân công.")


@router.post("/{return_id}/receive", response_model=ApiEnvelope[ReturnOrderResponse])
def receive_return(
    return_id: int,
    data: ReturnReceiveRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("WH Manager", "Admin")),
) -> dict:
    return_order = db.query(ReturnOrder).filter(ReturnOrder.id == return_id).with_for_update().first()
    if return_order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu trả hàng.")
    _validate_receive_warehouse(db, user, return_order.warehouse_id)
    if return_order.status != "PENDING_RECEIPT":
        raise HTTPException(status_code=409, detail="Phiếu trả hàng không còn ở trạng thái chờ nhận.")

    return_items = (
        db.query(ReturnOrderItem)
        .filter(ReturnOrderItem.return_id == return_order.id)
        .with_for_update()
        .all()
    )
    conditions = {item.return_item_id: item.condition for item in data.items}
    if len(conditions) != len(data.items) or set(conditions) != {item.id for item in return_items}:
        raise HTTPException(status_code=422, detail="Phải xác nhận tình trạng cho từng dòng hàng đúng một lần.")

    try:
        for item in return_items:
            product = db.get(Product, item.product_id)
            if product is None:
                raise HTTPException(status_code=409, detail="Sản phẩm của phiếu trả không còn tồn tại.")
            inventory = (
                db.query(Inventory)
                .filter(
                    Inventory.product_id == item.product_id,
                    Inventory.warehouse_id == return_order.warehouse_id,
                )
                .with_for_update()
                .first()
            )
            if inventory is None:
                inventory = Inventory(
                    product_id=item.product_id,
                    warehouse_id=return_order.warehouse_id,
                    physical_qty=0,
                    reserved_qty=0,
                    available_qty=0,
                    damaged_qty=0,
                )
                db.add(inventory)
                db.flush()

            condition = conditions[item.id]
            if condition == "GOOD":
                inventory.physical_qty += item.base_quantity
                inventory.available_qty += item.base_quantity
                stock = (
                    db.query(InventoryStock)
                    .filter(
                        InventoryStock.product_id == item.product_id,
                        InventoryStock.warehouse_id == return_order.warehouse_id,
                    )
                    .with_for_update()
                    .first()
                )
                if stock is None:
                    stock = InventoryStock(
                        product_id=item.product_id,
                        warehouse_id=return_order.warehouse_id,
                        base_quantity=0,
                    )
                    db.add(stock)
                    db.flush()
                stock.base_quantity += item.base_quantity
            else:
                inventory.damaged_qty += item.base_quantity

            if product.manage_by_lot:
                if not item.lot_number:
                    raise HTTPException(status_code=409, detail=f"Thiếu số lô của SKU {product.sku}.")
                lot_query = db.query(InventoryLot).filter(
                    InventoryLot.product_id == item.product_id,
                    InventoryLot.lot_number == item.lot_number,
                    InventoryLot.warehouse_id == return_order.warehouse_id,
                )
                lot = lot_query.with_for_update().first()
                if lot is None:
                    source_lot = (
                        db.query(InventoryLot)
                        .filter(
                            InventoryLot.product_id == item.product_id,
                            InventoryLot.lot_number == item.lot_number,
                        )
                        .first()
                    )
                    lot = InventoryLot(
                        lot_number=item.lot_number,
                        product_id=item.product_id,
                        warehouse_id=return_order.warehouse_id,
                        mfg_date=source_lot.mfg_date if source_lot else None,
                        exp_date=source_lot.exp_date if source_lot else None,
                        quantity=0,
                        damaged_qty=0,
                    )
                    db.add(lot)
                    db.flush()
                if condition == "GOOD":
                    lot.quantity += item.base_quantity
                else:
                    lot.damaged_qty += item.base_quantity

            db.add(
                InventoryTransaction(
                    product_id=item.product_id,
                    warehouse_id=return_order.warehouse_id,
                    transaction_type="IN" if condition == "GOOD" else "DMG",
                    unit_name=item.unit_name or product.base_unit,
                    input_quantity=item.quantity,
                    conversion_rate_snapshot=item.conversion_rate_snapshot,
                    base_quantity=item.base_quantity,
                )
            )
            item.received_condition = condition

        account = _account_for_user(db, user)
        return_order.status = "RECEIVED"
        return_order.received_by_id = account.id if account else None
        return_order.received_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(return_order)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Không thể xác nhận nhận hàng trả.") from exc
    return {"success": True, "code": 200, "message": "Đã xác nhận nhận hàng trả.", "data": _return_data(db, return_order)}
