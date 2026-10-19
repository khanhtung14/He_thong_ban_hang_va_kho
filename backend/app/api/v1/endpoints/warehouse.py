"""Warehouse operations: Receipts, Transfers, Audits, PickLists, Dispatches, and Warehouse/Territory Directory CRUD."""

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    require_permissions,
    require_roles,
    normalize_role,
)
from app.core.database import get_db
from app.models.models import (
    WarehouseReceipt, WarehouseReceiptItem, 
    WarehouseTransfer, WarehouseTransferItem,
    WarehouseAudit, WarehouseAuditItem,
    Inventory, Product, Warehouse, InventoryLot,
    Territory, Role,
    Order, OrderItem, OrderStatus, Customer, User,
    Dispatch, DispatchItem, RoleCode,
)
from app.services.inventory_service import _inventory_lock, calculate_available_qty
import uuid

router = APIRouter(prefix="/api/v1/warehouse", tags=["Warehouse"])
warehouses_router = APIRouter(prefix="/api/v1/warehouses", tags=["Warehouses Directory"])
territories_router = APIRouter(prefix="/api/v1/territories", tags=["Territories Directory"])
roles_router = APIRouter(prefix="/api/v1/roles", tags=["Roles Directory"])


def seed_default_warehouses_and_territories(db: Session) -> None:
    """Seed initial warehouses and territories if tables are empty."""
    try:
        if db.query(Warehouse).count() == 0:
            db.add_all([
                Warehouse(
                    code="WH-HN-01",
                    name="Kho Tổng Hà Nội",
                    address="Cụm Công nghiệp Long Biên, Phường Long Biên, TP. Hà Nội",
                    is_active=True,
                ),
                Warehouse(
                    code="WH-HCM-01",
                    name="Kho Chi nhánh TP. Hồ Chí Minh",
                    address="Khu chế xuất Tân Thuận, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh",
                    is_active=True,
                ),
            ])
            db.commit()
    except Exception:
        db.rollback()

    try:
        if db.query(Territory).count() == 0:
            db.add_all([
                Territory(code="TT-VN", name="Toàn quốc"),
                Territory(code="TT-MB", name="Miền Bắc (Hà Nội)"),
                Territory(code="TT-MN", name="Miền Nam (TP.HCM)"),
                Territory(code="TT-MT", name="Miền Trung (Đà Nẵng)"),
            ])
            db.commit()
    except Exception:
        db.rollback()

    try:
        from sqlalchemy import func
        wh1 = db.query(Warehouse).filter(Warehouse.id == 1).first() or db.query(Warehouse).first()
        if wh1:
            prod = db.query(Product).filter(func.upper(Product.sku) == "SUA-VINAMILK-100").first()
            if prod:
                inv = db.query(Inventory).filter(
                    Inventory.product_id == prod.id,
                    Inventory.warehouse_id == wh1.id,
                ).first()
                if not inv:
                    db.add(Inventory(
                        product_id=prod.id,
                        warehouse_id=wh1.id,
                        physical_qty=100.0,
                        reserved_qty=0.0,
                        available_qty=100.0,
                    ))
                    db.commit()
    except Exception:
        db.rollback()


# -------------------------------------------------------------
# Schemas
# -------------------------------------------------------------

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

class WarehouseCreateSchema(BaseModel):
    code: str = Field(..., min_length=1, max_length=40, description="Mã định danh kho")
    name: str = Field(..., min_length=1, max_length=150, description="Tên kho hàng")
    address: Optional[str] = Field(None, max_length=255, description="Địa chỉ vị trí kho")
    is_active: bool = Field(True, description="Trạng thái hoạt động")

class WarehouseUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=150, description="Tên kho hàng")
    address: Optional[str] = Field(None, max_length=255, description="Địa chỉ kho")
    is_active: Optional[bool] = Field(None, description="Trạng thái hoạt động")

class TerritoryCreateSchema(BaseModel):
    code: str = Field(..., min_length=1, max_length=40, description="Mã địa bàn")
    name: str = Field(..., min_length=1, max_length=150, description="Tên địa bàn / khu vực")
    parent_id: Optional[int] = Field(None, description="Địa bàn cấp cha (nếu có)")

class TerritoryUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=150, description="Tên địa bàn")
    parent_id: Optional[int] = Field(None, description="Địa bàn cấp cha")


def _format_warehouse(w: Warehouse) -> dict:
    return {
        "id": w.id,
        "code": w.code,
        "name": w.name,
        "address": w.address or "",
        "is_active": w.is_active,
    }


# -------------------------------------------------------------
# Warehouse Receipts (Preserved original logic)
# -------------------------------------------------------------

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


# -------------------------------------------------------------
# Warehouse Directory CRUD Operations (Shared Handlers)
# -------------------------------------------------------------

def handle_get_warehouses(
    search: Optional[str] = Query(None, description="Tìm theo mã hoặc tên kho"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    db: Session = Depends(get_db),
):
    seed_default_warehouses_and_territories(db)
    query = db.query(Warehouse)
    if is_active is not None:
        query = query.filter(Warehouse.is_active == is_active)
    if search:
        kw = f"%{search.strip()}%"
        query = query.filter(
            (Warehouse.name.ilike(kw)) | 
            (Warehouse.code.ilike(kw)) | 
            (Warehouse.address.ilike(kw))
        )
    warehouses = query.order_by(Warehouse.id.asc()).all()
    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách kho hàng thành công",
        "data": [_format_warehouse(w) for w in warehouses],
    }


def handle_create_warehouse(
    data: WarehouseCreateSchema,
    db: Session = Depends(get_db),
):
    code = data.code.strip().upper()
    name = data.name.strip()
    if not code or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã kho và tên kho không được để trống.",
        )
    existing = db.query(Warehouse).filter(Warehouse.code == code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã kho '{code}' đã tồn tại trong hệ thống.",
        )
    warehouse = Warehouse(
        code=code,
        name=name,
        address=data.address.strip() if data.address else None,
        is_active=data.is_active,
    )
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return {
        "success": True,
        "code": 201,
        "message": f"Tạo kho hàng '{warehouse.name}' thành công.",
        "data": _format_warehouse(warehouse),
    }


def handle_update_warehouse(
    warehouse_id: int,
    data: WarehouseUpdateSchema,
    db: Session = Depends(get_db),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin kho hàng.",
        )
    if data.name is not None:
        wh.name = data.name.strip()
    if data.address is not None:
        wh.address = data.address.strip()
    if data.is_active is not None:
        wh.is_active = data.is_active
    db.commit()
    db.refresh(wh)
    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật kho '{wh.name}' thành công.",
        "data": _format_warehouse(wh),
    }


def handle_toggle_warehouse_status(
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin kho hàng.",
        )
    wh.is_active = not wh.is_active
    db.commit()
    db.refresh(wh)
    status_label = "kích hoạt hoạt động" if wh.is_active else "tạm ngừng hoạt động"
    return {
        "success": True,
        "code": 200,
        "message": f"Kho '{wh.name}' đã được chuyển sang trạng thái {status_label}.",
        "data": _format_warehouse(wh),
    }


def handle_delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin kho hàng.",
        )
    wh.is_active = False
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": f"Đã tạm dừng kho hàng '{wh.name}'.",
        "data": _format_warehouse(wh),
    }


# Register routes on both warehouses_router (/api/v1/warehouses) and router (/api/v1/warehouse)
warehouses_router.add_api_route("", handle_get_warehouses, methods=["GET"])
warehouses_router.add_api_route("/", handle_get_warehouses, methods=["GET"], include_in_schema=False)
warehouses_router.add_api_route("", handle_create_warehouse, methods=["POST"], status_code=201)
warehouses_router.add_api_route("/{warehouse_id}", handle_update_warehouse, methods=["PUT"])
warehouses_router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PATCH"])
warehouses_router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PUT"], include_in_schema=False)
warehouses_router.add_api_route("/{warehouse_id}/status/", handle_toggle_warehouse_status, methods=["PATCH", "PUT"], include_in_schema=False)
warehouses_router.add_api_route("/{warehouse_id}", handle_delete_warehouse, methods=["DELETE"])

router.add_api_route("", handle_get_warehouses, methods=["GET"])
router.add_api_route("/", handle_get_warehouses, methods=["GET"], include_in_schema=False)
router.add_api_route("", handle_create_warehouse, methods=["POST"], status_code=201)
router.add_api_route("/{warehouse_id}", handle_update_warehouse, methods=["PUT"])
router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PATCH"])
router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PUT"], include_in_schema=False)
router.add_api_route("/{warehouse_id}/status/", handle_toggle_warehouse_status, methods=["PATCH", "PUT"], include_in_schema=False)
router.add_api_route("/{warehouse_id}", handle_delete_warehouse, methods=["DELETE"])


# -------------------------------------------------------------
# Territories Directory CRUD
# -------------------------------------------------------------

@territories_router.get("")
@territories_router.get("/", include_in_schema=False)
def get_territories(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    seed_default_warehouses_and_territories(db)
    query = db.query(Territory)
    if search:
        kw = f"%{search.strip()}%"
        query = query.filter((Territory.name.ilike(kw)) | (Territory.code.ilike(kw)))
    territories = query.order_by(Territory.id.asc()).all()
    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách địa bàn thành công",
        "data": [
            {
                "id": t.id,
                "code": t.code,
                "name": t.name,
                "parent_id": t.parent_id,
            }
            for t in territories
        ],
    }


@territories_router.post("", status_code=201)
def create_territory(
    data: TerritoryCreateSchema,
    db: Session = Depends(get_db),
):
    code = data.code.strip().upper()
    name = data.name.strip()
    if not code or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã và tên địa bàn không được để trống.",
        )
    existing = db.query(Territory).filter(Territory.code == code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã địa bàn '{code}' đã tồn tại.",
        )
    territory = Territory(code=code, name=name, parent_id=data.parent_id)
    db.add(territory)
    db.commit()
    db.refresh(territory)
    return {
        "success": True,
        "code": 201,
        "message": f"Tạo địa bàn '{territory.name}' thành công.",
        "data": {
            "id": territory.id,
            "code": territory.code,
            "name": territory.name,
            "parent_id": territory.parent_id,
        },
    }


@territories_router.put("/{territory_id}")
def update_territory(
    territory_id: int,
    data: TerritoryUpdateSchema,
    db: Session = Depends(get_db),
):
    t = db.query(Territory).filter(Territory.id == territory_id).first()
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin địa bàn.",
        )
    if data.name:
        t.name = data.name.strip()
    if data.parent_id is not None:
        t.parent_id = data.parent_id
    db.commit()
    db.refresh(t)
    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật địa bàn '{t.name}' thành công.",
        "data": {
            "id": t.id,
            "code": t.code,
            "name": t.name,
            "parent_id": t.parent_id,
        },
    }


@territories_router.delete("/{territory_id}")
def delete_territory(
    territory_id: int,
    db: Session = Depends(get_db),
):
    t = db.query(Territory).filter(Territory.id == territory_id).first()
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin địa bàn.",
        )
    name = t.name
    db.delete(t)
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": f"Đã xóa địa bàn '{name}'.",
        "data": {"id": territory_id},
    }


# -------------------------------------------------------------
# Roles Directory
# -------------------------------------------------------------

@roles_router.get("")
@roles_router.get("/", include_in_schema=False)
def get_roles(
    db: Session = Depends(get_db),
):
    roles = db.query(Role).order_by(Role.id.asc()).all()
    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách vai trò chuẩn thành công",
        "data": [
            {
                "id": r.id,
                "code": r.code,
                "name": r.name,
                "description": r.description or "",
            }
            for r in roles
        ],
    }


# =============================================================
# SCRUM-46: Xác nhận xuất kho & xử lý giao thiếu (nợ hàng)
# =============================================================

class CreateDispatchItemInput(BaseModel):
    order_item_id: int
    actual_qty: int = Field(ge=0, description="Số lượng thực xuất kho")


class CreateDispatchInput(BaseModel):
    order_id: int
    warehouse_id: Optional[int] = None
    note: Optional[str] = None
    items: List[CreateDispatchItemInput] = []


class UpdateDispatchInput(BaseModel):
    note: Optional[str] = None
    items: Optional[List[CreateDispatchItemInput]] = None


@router.get("/orders/ready-to-dispatch")
def get_orders_ready_to_dispatch(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho xuất"),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Danh sách đơn hàng sẵn sàng xuất kho (APPROVED hoặc PARTIALLY_DELIVERED)."""
    query = db.query(Order).filter(
        Order.status.in_([OrderStatus.APPROVED, OrderStatus.PARTIALLY_DELIVERED])
    )
    if warehouse_id:
        query = query.filter(Order.warehouse_id == warehouse_id)

    orders = query.order_by(Order.id.desc()).all()
    results = []
    for ord_obj in orders:
        cust = db.get(Customer, ord_obj.customer_id)
        wh = db.get(Warehouse, ord_obj.warehouse_id) if ord_obj.warehouse_id else None
        items_data = []
        for it in ord_obj.items:
            deliv = getattr(it, "quantity_delivered", 0) or 0
            remaining = max(0, it.quantity - deliv)
            items_data.append({
                "order_item_id": it.id,
                "product_id": it.product_id,
                "sku": it.sku,
                "product_name": it.product_name,
                "ordered_quantity": it.quantity,
                "quantity_delivered": deliv,
                "remaining_quantity": remaining,
                "unit_price": float(it.unit_price or 0.0),
            })
        results.append({
            "order_id": ord_obj.id,
            "order_code": ord_obj.order_code,
            "customer_id": ord_obj.customer_id,
            "customer_name": cust.name if cust else None,
            "customer_code": cust.code if cust else None,
            "customer_phone": cust.phone if cust else None,
            "warehouse_id": ord_obj.warehouse_id,
            "warehouse_name": wh.name if wh else None,
            "status": ord_obj.status.value if hasattr(ord_obj.status, "value") else str(ord_obj.status),
            "has_backorder": getattr(ord_obj, "has_backorder", False),
            "created_at": ord_obj.created_at.isoformat() if ord_obj.created_at else None,
            "items": items_data,
        })

    return {
        "success": True,
        "code": 200,
        "message": f"Lấy danh sách {len(results)} đơn hàng đủ điều kiện xuất kho.",
        "data": results,
    }


@router.get("/orders/backorders")
def get_backorder_orders(
    warehouse_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin", "Sales Manager")),
):
    """Danh sách các đơn hàng còn nợ hàng (SCRUM-46), hiển thị riêng để xử lý giao ở lượt sau."""
    query = db.query(Order).filter(
        (Order.has_backorder == True) | (Order.status == OrderStatus.PARTIALLY_DELIVERED)
    )
    if warehouse_id:
        query = query.filter(Order.warehouse_id == warehouse_id)

    orders = query.order_by(Order.id.desc()).all()
    results = []
    for ord_obj in orders:
        cust = db.get(Customer, ord_obj.customer_id)
        wh = db.get(Warehouse, ord_obj.warehouse_id) if ord_obj.warehouse_id else None
        backorder_items = []
        for it in ord_obj.items:
            deliv = getattr(it, "quantity_delivered", 0) or 0
            missing = max(0, it.quantity - deliv)
            if missing > 0:
                backorder_items.append({
                    "order_item_id": it.id,
                    "product_id": it.product_id,
                    "sku": it.sku,
                    "product_name": it.product_name,
                    "ordered_quantity": it.quantity,
                    "delivered_quantity": deliv,
                    "backorder_quantity": missing,
                })
        results.append({
            "order_id": ord_obj.id,
            "order_code": ord_obj.order_code,
            "customer_id": ord_obj.customer_id,
            "customer_name": cust.name if cust else None,
            "customer_code": cust.code if cust else None,
            "customer_phone": cust.phone if cust else None,
            "warehouse_id": ord_obj.warehouse_id,
            "warehouse_name": wh.name if wh else None,
            "status": ord_obj.status.value if hasattr(ord_obj.status, "value") else str(ord_obj.status),
            "created_at": ord_obj.created_at.isoformat() if ord_obj.created_at else None,
            "backorder_items": backorder_items,
        })

    return {
        "success": True,
        "code": 200,
        "message": f"Lấy danh sách {len(results)} đơn hàng nợ hàng.",
        "data": results,
    }


@router.post("/dispatches", status_code=status.HTTP_201_CREATED)
def create_dispatch_note(
    data: CreateDispatchInput,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Tạo phiếu xuất kho mới cho đơn hàng (SCRUM-46)."""
    order = db.get(Order, data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    if order.status not in (OrderStatus.APPROVED, OrderStatus.PARTIALLY_DELIVERED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Đơn hàng đang ở trạng thái '{order.status}', không thể tạo phiếu xuất!",
        )

    wh_id = data.warehouse_id or order.warehouse_id or 1
    today_str = datetime.now().strftime("%Y%m%d")
    unique_suffix = uuid.uuid4().hex[:4].upper()
    dispatch_code = f"DSP-{today_str}-{unique_suffix}"

    dispatch = Dispatch(
        dispatch_code=dispatch_code,
        order_id=order.id,
        warehouse_id=wh_id,
        created_by_id=getattr(user, "id", None),
        is_confirmed=False,
        note=data.note,
    )
    db.add(dispatch)
    db.flush()

    order_items_map = {it.id: it for it in order.items}
    for item_input in data.items:
        ord_item = order_items_map.get(item_input.order_item_id)
        if not ord_item:
            continue
        deliv = getattr(ord_item, "quantity_delivered", 0) or 0
        rem = max(0, ord_item.quantity - deliv)
        req_qty = min(rem, ord_item.quantity)
        act_qty = min(item_input.actual_qty, rem)
        miss_qty = max(0, req_qty - act_qty)

        disp_item = DispatchItem(
            dispatch_id=dispatch.id,
            order_item_id=ord_item.id,
            product_id=ord_item.product_id,
            sku=ord_item.sku,
            requested_qty=req_qty,
            actual_qty=act_qty,
            missing_qty=miss_qty,
        )
        db.add(disp_item)

    db.commit()
    db.refresh(dispatch)

    return {
        "success": True,
        "code": 201,
        "message": f"Tạo phiếu xuất {dispatch.dispatch_code} thành công.",
        "data": {
            "id": dispatch.id,
            "dispatch_code": dispatch.dispatch_code,
            "order_id": dispatch.order_id,
            "warehouse_id": dispatch.warehouse_id,
            "is_confirmed": dispatch.is_confirmed,
            "note": dispatch.note,
            "created_at": dispatch.created_at.isoformat() if dispatch.created_at else None,
        },
    }


@router.post("/dispatches/{dispatch_id}/confirm")
def confirm_dispatch_note(
    dispatch_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Xác nhận xuất kho (SCRUM-46):
    - Chuyển tồn giữ chỗ (reserved_qty) thành xuất thực (physical_qty giảm tương ứng).
    - Cập nhật số lượng đã xuất (quantity_delivered) cho từng dòng hàng.
    - Nếu xuất thiếu: ghi nhận nợ hàng (has_backorder = True, status = PARTIALLY_DELIVERED).
    - Nếu xuất đủ: cập nhật đơn thành DELIVERED / DISPATCHED, has_backorder = False.
    - Khóa phiếu xuất (is_confirmed = True, không sửa được sau khi xác nhận).
    """
    dispatch = db.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất kho!")

    if dispatch.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu xuất đã xác nhận không sửa được.",
        )

    order = db.get(Order, dispatch.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng tương ứng với phiếu xuất!")

    wh_id = dispatch.warehouse_id or order.warehouse_id or 1

    with _inventory_lock:
        for disp_item in dispatch.items:
            act_qty = disp_item.actual_qty
            if act_qty <= 0:
                continue

            # 1. Trừ tồn thực và giải phóng tồn giữ chỗ tương ứng
            if disp_item.product_id:
                inv = db.query(Inventory).filter(
                    Inventory.product_id == disp_item.product_id,
                    Inventory.warehouse_id == wh_id,
                ).first()
                if inv:
                    inv.physical_qty = max(0.0, inv.physical_qty - act_qty)
                    inv.reserved_qty = max(0.0, inv.reserved_qty - act_qty)
                    inv.available_qty = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
                    db.flush()

            # 2. Cập nhật số lượng đã giao trên OrderItem
            if disp_item.order_item_id:
                ord_item = db.get(OrderItem, disp_item.order_item_id)
                if ord_item:
                    cur_deliv = getattr(ord_item, "quantity_delivered", 0) or 0
                    ord_item.quantity_delivered = int(cur_deliv + act_qty)
                    db.flush()

        # 3. Đánh giá trạng thái hoàn thành của toàn bộ đơn hàng
        any_missing = False
        for it in order.items:
            deliv = getattr(it, "quantity_delivered", 0) or 0
            if deliv < it.quantity:
                any_missing = True
                break

        if any_missing:
            order.status = OrderStatus.PARTIALLY_DELIVERED
            order.has_backorder = True
        else:
            order.status = OrderStatus.DELIVERED
            order.has_backorder = False

        # 4. Khóa phiếu xuất đã xác nhận
        dispatch.is_confirmed = True
        dispatch.confirmed_at = datetime.now()
        db.commit()

    conf_at = dispatch.confirmed_at
    return {
        "success": True,
        "code": 200,
        "message": f"Xác nhận xuất kho phiếu {dispatch.dispatch_code} thành công.",
        "data": {
            "dispatch_id": dispatch.id,
            "dispatch_code": dispatch.dispatch_code,
            "is_confirmed": dispatch.is_confirmed,
            "confirmed_at": conf_at.isoformat() if conf_at is not None else None,
            "order_id": order.id,
            "order_code": order.order_code,
            "order_status": order.status.value if hasattr(order.status, "value") else str(order.status),
            "has_backorder": order.has_backorder,
        },
    }


@router.put("/dispatches/{dispatch_id}")
def update_dispatch_note(
    dispatch_id: int,
    data: UpdateDispatchInput,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Chỉnh sửa phiếu xuất kho chưa xác nhận. Nếu đã xác nhận -> Chặn sửa (SCRUM-46)."""
    dispatch = db.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất kho!")

    if dispatch.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu xuất đã xác nhận không sửa được.",
        )

    if data.note is not None:
        dispatch.note = data.note

    if data.items is not None:
        item_map = {it.order_item_id: it for it in dispatch.items}
        for item_input in data.items:
            existing_item = item_map.get(item_input.order_item_id)
            if existing_item:
                existing_item.actual_qty = item_input.actual_qty
                existing_item.missing_qty = max(0, existing_item.requested_qty - item_input.actual_qty)

    db.commit()
    db.refresh(dispatch)
    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật phiếu xuất {dispatch.dispatch_code} thành công.",
        "data": {"id": dispatch.id, "dispatch_code": dispatch.dispatch_code},
    }


@router.delete("/dispatches/{dispatch_id}")
def delete_dispatch_note(
    dispatch_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Xóa phiếu xuất kho chưa xác nhận. Nếu đã xác nhận -> Chặn xóa (SCRUM-46)."""
    dispatch = db.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất kho!")

    if dispatch.is_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiếu xuất đã xác nhận không sửa được.",
        )

    db.delete(dispatch)
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": f"Đã xóa phiếu xuất {dispatch.dispatch_code} thành công.",
    }


@router.get("/dispatches")
def list_dispatches(
    order_id: Optional[int] = Query(None),
    is_confirmed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Lấy danh sách các phiếu xuất kho."""
    query = db.query(Dispatch)
    if order_id:
        query = query.filter(Dispatch.order_id == order_id)
    if is_confirmed is not None:
        query = query.filter(Dispatch.is_confirmed == is_confirmed)

    dispatches = query.order_by(Dispatch.id.desc()).all()
    results = []
    for d in dispatches:
        ord_obj = db.get(Order, d.order_id)
        cust = db.get(Customer, ord_obj.customer_id) if ord_obj else None
        results.append({
            "id": d.id,
            "dispatch_code": d.dispatch_code,
            "order_id": d.order_id,
            "order_code": ord_obj.order_code if ord_obj else None,
            "customer_name": cust.name if cust else None,
            "warehouse_id": d.warehouse_id,
            "is_confirmed": d.is_confirmed,
            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
            "note": d.note,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "items_count": len(d.items),
        })

    return {
        "success": True,
        "code": 200,
        "data": results,
    }


@router.get("/dispatches/{dispatch_id}")
def get_dispatch_detail(
    dispatch_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Staff", "Warehouse", "Warehouse Manager", "WH Manager", "Admin")),
):
    """Chi tiết phiếu xuất kho kèm danh sách mặt hàng thực xuất và nợ hàng."""
    d = db.get(Dispatch, dispatch_id)
    if not d:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất kho!")

    ord_obj = db.get(Order, d.order_id)
    cust = db.get(Customer, ord_obj.customer_id) if ord_obj else None
    items_data = []
    for it in d.items:
        items_data.append({
            "id": it.id,
            "order_item_id": it.order_item_id,
            "product_id": it.product_id,
            "sku": it.sku,
            "requested_qty": it.requested_qty,
            "actual_qty": it.actual_qty,
            "missing_qty": it.missing_qty,
        })

    return {
        "success": True,
        "code": 200,
        "data": {
            "id": d.id,
            "dispatch_code": d.dispatch_code,
            "order_id": d.order_id,
            "order_code": ord_obj.order_code if ord_obj else None,
            "customer_name": cust.name if cust else None,
            "warehouse_id": d.warehouse_id,
            "is_confirmed": d.is_confirmed,
            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None,
            "note": d.note,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "items": items_data,
        },
    }
