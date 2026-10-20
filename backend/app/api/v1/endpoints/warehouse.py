"""Warehouse operations: Receipts, Transfers, Audits, PickLists, Dispatches, and Warehouse/Territory Directory CRUD."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_current_user,
    require_permissions,
    normalize_role,
    PERM_INVENTORY_PICK,
    PERM_INVENTORY_VIEW,
)
from app.core.database import get_db
from app.models.models import (
    WarehouseReceipt, WarehouseReceiptItem, 
    WarehouseTransfer, WarehouseTransferItem,
    WarehouseAudit, WarehouseAuditItem,
    Inventory, Product, Warehouse, InventoryLot,
    Territory, Role, PickList, Dispatch, DispatchItem,
    Order, OrderItem, OrderStatus,
)
from app.services.fefo_service import (
    get_fefo_lot_suggestions,
    is_fefo_override,
    validate_fefo_selection,
    deduct_lot_inventory,
)

router = APIRouter(prefix="/api/v1/warehouse", tags=["Warehouse"])
compat_router = APIRouter(prefix="/warehouse", tags=["Warehouse Compat"])
warehouses_router = APIRouter(prefix="/api/v1/warehouses", tags=["Warehouses Directory"])
territories_router = APIRouter(prefix="/api/v1/territories", tags=["Territories Directory"])
roles_router = APIRouter(prefix="/api/v1/roles", tags=["Roles Directory"])


def require_warehouse_staff(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    role = normalize_role(user.role)
    if role in {"Warehouse", "WH Manager", "Admin"} or user.has_permission(PERM_INVENTORY_PICK):
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền thực hiện thao tác kho này.",
    )


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
        "is_active": bool(w.is_active),
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


# -------------------------------------------------------------
# EP-06: Pick Lists, FEFO Lot Suggestions & Dispatches (SCRUM-43)
# -------------------------------------------------------------

class PickListCreateSchema(BaseModel):
    orderId: Optional[int] = Field(None, alias="orderId")
    order_id: Optional[int] = Field(None, alias="order_id")

    def get_order_id(self) -> int:
        val = self.orderId if self.orderId is not None else self.order_id
        if not val or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã đơn hàng (orderId) là bắt buộc.",
            )
        return val


class DispatchItemCreateSchema(BaseModel):
    productId: Optional[int] = Field(None, alias="productId")
    product_id: Optional[int] = Field(None, alias="product_id")
    lotNumber: Optional[str] = Field(None, alias="lotNumber")
    lot_number: Optional[str] = Field(None, alias="lot_number")
    actualQty: Optional[float] = Field(None, alias="actualQty")
    actual_qty: Optional[float] = Field(None, alias="actual_qty")
    quantity: Optional[float] = None
    overrideReason: Optional[str] = Field(None, alias="overrideReason")
    override_reason: Optional[str] = Field(None, alias="override_reason")
    reason: Optional[str] = None
    note: Optional[str] = None

    def get_product_id(self) -> int:
        val = self.productId if self.productId is not None else self.product_id
        if not val or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã sản phẩm (productId) là bắt buộc.",
            )
        return val

    def get_lot_number(self) -> str:
        val = self.lotNumber or self.lot_number or ""
        val = val.strip()
        if not val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lô (lotNumber) là bắt buộc.",
            )
        return val

    def get_actual_qty(self) -> float:
        val = self.actualQty if self.actualQty is not None else (
            self.actual_qty if self.actual_qty is not None else self.quantity
        )
        if val is None or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng thực xuất (actualQty) phải lớn hơn 0.",
            )
        return float(val)

    def get_override_reason(self) -> Optional[str]:
        return self.overrideReason or self.override_reason or self.reason or self.note


class DispatchCreateSchema(BaseModel):
    orderId: Optional[int] = Field(None, alias="orderId")
    order_id: Optional[int] = Field(None, alias="order_id")
    pickListId: Optional[int] = Field(None, alias="pickListId")
    pick_list_id: Optional[int] = Field(None, alias="pick_list_id")
    items: List[DispatchItemCreateSchema] = Field(default_factory=list)
    overrideReason: Optional[str] = Field(None, alias="overrideReason")
    override_reason: Optional[str] = Field(None, alias="override_reason")
    reason: Optional[str] = None
    note: Optional[str] = None

    def get_override_reason(self) -> Optional[str]:
        return self.overrideReason or self.override_reason or self.reason or self.note


def handle_create_pick_list(
    data: PickListCreateSchema,
    user: AuthenticatedUser = Depends(require_warehouse_staff),
    db: Session = Depends(get_db),
):
    order_id = data.get_order_id()
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{order_id}.",
        )
    pick_list = PickList(order_id=order.id, status="PENDING")
    db.add(pick_list)
    db.commit()
    db.refresh(pick_list)

    items = []
    for item in order.items:
        items.append({
            "productId": item.product_id,
            "sku": item.sku,
            "productName": item.product_name,
            "quantity": item.quantity,
            "location": "A-01-01",
        })
    return {
        "success": True,
        "code": 200,
        "message": "Phiếu soạn hàng đã được tạo thành công",
        "data": {
            "id": pick_list.id,
            "pickListId": pick_list.id,
            "orderId": order.id,
            "status": pick_list.status,
            "items": items,
        },
    }


def handle_suggest_lots_for_pick_list(
    id: int,
    user: AuthenticatedUser = Depends(require_warehouse_staff),
    db: Session = Depends(get_db),
):
    pick_list = db.query(PickList).filter(PickList.id == id).first()
    if not pick_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu soạn hàng #{id}.",
        )
    order = db.query(Order).filter(Order.id == pick_list.order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{pick_list.order_id}.",
        )

    suggested_items = []
    for item in order.items:
        needed_qty = float(item.quantity) - float(item.quantity_delivered or 0)
        if needed_qty <= 0:
            continue
        lots = get_fefo_lot_suggestions(db, item.product_id, order.warehouse_id, needed_qty)
        suggested_items.append({
            "productId": item.product_id,
            "sku": item.sku,
            "productName": item.product_name,
            "requestedQty": needed_qty,
            "suggestedLots": lots,
        })
    return {
        "success": True,
        "code": 200,
        "message": "Gợi ý danh sách lô xuất kho theo quy tắc FEFO thành công",
        "data": {
            "pickListId": pick_list.id,
            "orderId": order.id,
            "warehouseId": order.warehouse_id,
            "items": suggested_items,
        },
    }


def handle_suggest_lots(
    product_id: Optional[int] = Query(None, alias="productId"),
    product_id_alt: Optional[int] = Query(None, alias="product_id"),
    warehouse_id: Optional[int] = Query(None, alias="warehouseId"),
    warehouse_id_alt: Optional[int] = Query(None, alias="warehouse_id"),
    quantity: Optional[float] = Query(None, alias="quantity"),
    qty_alt: Optional[float] = Query(None, alias="qty"),
    user: AuthenticatedUser = Depends(require_warehouse_staff),
    db: Session = Depends(get_db),
):
    pid = product_id or product_id_alt
    if not pid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mã sản phẩm (productId) là bắt buộc.")
    wid = warehouse_id or warehouse_id_alt
    req_qty = quantity if quantity is not None else (qty_alt if qty_alt is not None else 1.0)

    lots = get_fefo_lot_suggestions(db, pid, wid, req_qty)
    return {
        "success": True,
        "code": 200,
        "message": "Gợi ý lô theo FEFO thành công",
        "data": {
            "productId": pid,
            "warehouseId": wid,
            "requiredQty": req_qty,
            "suggestedLots": lots,
        },
    }


def handle_create_dispatch(
    data: DispatchCreateSchema,
    user: AuthenticatedUser = Depends(require_warehouse_staff),
    db: Session = Depends(get_db),
):
    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách hàng xuất (items) không được để trống.",
        )

    order_id = data.orderId or data.order_id
    pick_list_id = data.pickListId or data.pick_list_id

    pick_list = None
    if pick_list_id:
        pick_list = db.query(PickList).filter(PickList.id == pick_list_id).first()
        if not order_id and pick_list:
            order_id = pick_list.order_id

    if not order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã đơn hàng (orderId) là bắt buộc để xuất kho.",
        )

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{order_id}.",
        )

    warehouse_id = order.warehouse_id or 1

    # 0. Kiểm tra tồn kho từng lô để chống âm kho ngay từ đầu
    for it in data.items:
        pid = it.get_product_id()
        lot_no = it.get_lot_number()
        actual_qty = it.get_actual_qty()
        lot = (
            db.query(InventoryLot)
            .filter(
                InventoryLot.product_id == pid,
                InventoryLot.warehouse_id == warehouse_id,
                InventoryLot.lot_number == lot_no,
            )
            .first()
        )
        if not lot:
            lot = (
                db.query(InventoryLot)
                .filter(
                    InventoryLot.product_id == pid,
                    InventoryLot.lot_number == lot_no,
                )
                .first()
            )
        if not lot:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lô hàng '{lot_no}' không tồn tại trong kho cho sản phẩm #{pid}.",
            )
        if lot.quantity < actual_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Số lượng xuất ({actual_qty}) vượt quá tồn kho khả dụng của lô '{lot_no}' "
                    f"(tồn hiện tại: {lot.quantity}). Đảm bảo không âm kho trên từng lô hàng."
                ),
            )

    # 1. Validation FEFO Override & Note Ràng Buộc
    prod_items_map: Dict[int, List[Dict[str, Any]]] = {}
    for it in data.items:
        pid = it.get_product_id()
        prod_items_map.setdefault(pid, []).append({
            "lot_number": it.get_lot_number(),
            "actual_qty": it.get_actual_qty(),
            "override_reason": it.get_override_reason(),
        })

    for pid, sel_items in prod_items_map.items():
        total_qty = sum(item["actual_qty"] for item in sel_items)
        suggested_lots = get_fefo_lot_suggestions(db, pid, warehouse_id, total_qty)
        override = is_fefo_override(suggested_lots, sel_items)
        if override:
            has_reason = bool(data.get_override_reason() and data.get_override_reason().strip())
            if not has_reason:
                has_reason = any(bool(item["override_reason"] and item["override_reason"].strip()) for item in sel_items)
            if not has_reason:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Thủ kho chọn lô khác lô gợi ý FEFO bắt buộc phải nhập lý do/ghi chú giải trình (reason/note).",
                )

    # 2. Thực hiện trừ tồn kho từng lô và tạo phiếu xuất kho
    effective_override_reason = data.get_override_reason()
    dispatch = Dispatch(
        order_id=order.id,
        pick_list_id=pick_list.id if pick_list else None,
        status="SHIPPED",
        override_reason=effective_override_reason,
    )
    db.add(dispatch)
    db.flush()

    created_items = []
    for it in data.items:
        pid = it.get_product_id()
        lot_no = it.get_lot_number()
        actual_qty = it.get_actual_qty()
        item_reason = it.get_override_reason() or effective_override_reason

        # Trừ tồn kho lô (Chống âm kho)
        deduct_lot_inventory(db, warehouse_id, pid, lot_no, actual_qty)

        # Cập nhật số lượng đã giao trên OrderItem
        for oi in order.items:
            if oi.product_id == pid:
                oi.quantity_delivered = (oi.quantity_delivered or 0) + int(actual_qty)
                break

        di = DispatchItem(
            dispatch_id=dispatch.id,
            product_id=pid,
            lot_number=lot_no,
            actual_qty=actual_qty,
            override_reason=item_reason,
        )
        db.add(di)
        created_items.append(di)

    if pick_list:
        pick_list.status = "COMPLETED"

    all_delivered = True
    for oi in order.items:
        if (oi.quantity_delivered or 0) < oi.quantity:
            all_delivered = False
            break
    if all_delivered:
        order.status = OrderStatus.COMPLETED

    db.commit()
    db.refresh(dispatch)

    return {
        "success": True,
        "code": 200,
        "message": "Phiếu xuất kho đã được tạo và trừ tồn lô thành công",
        "data": {
            "dispatchId": dispatch.id,
            "orderId": order.id,
            "pickListId": dispatch.pick_list_id,
            "status": dispatch.status,
            "overrideReason": dispatch.override_reason,
            "items": [
                {
                    "id": di.id,
                    "productId": di.product_id,
                    "lotNumber": di.lot_number,
                    "actualQty": di.actual_qty,
                    "overrideReason": di.override_reason,
                }
                for di in created_items
            ],
        },
    }


# Đăng ký các endpoints trên router (/api/v1/warehouse) và compat_router (/warehouse)
router.add_api_route("/pick-lists", handle_create_pick_list, methods=["POST"])
router.add_api_route("/pick-lists/{id}/suggest-lots", handle_suggest_lots_for_pick_list, methods=["GET"])
router.add_api_route("/suggest-lots", handle_suggest_lots, methods=["GET"])
router.add_api_route("/fefo/suggest", handle_suggest_lots, methods=["GET"])
router.add_api_route("/dispatches", handle_create_dispatch, methods=["POST"])

compat_router.add_api_route("/pick-lists", handle_create_pick_list, methods=["POST"])
compat_router.add_api_route("/pick-lists/{id}/suggest-lots", handle_suggest_lots_for_pick_list, methods=["GET"])
compat_router.add_api_route("/suggest-lots", handle_suggest_lots, methods=["GET"])
compat_router.add_api_route("/fefo/suggest", handle_suggest_lots, methods=["GET"])
compat_router.add_api_route("/dispatches", handle_create_dispatch, methods=["POST"])
