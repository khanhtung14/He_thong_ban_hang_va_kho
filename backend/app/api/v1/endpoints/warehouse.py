"""Warehouse operations: Receipts, Transfers, Audits, PickLists, Dispatches, and Warehouse/Territory Directory CRUD."""

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    Inventory, Product, Warehouse, InventoryLot,
    Territory, Role
)

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
warehouses_router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PATCH", "PUT"])
warehouses_router.add_api_route("/{warehouse_id}", handle_delete_warehouse, methods=["DELETE"])

router.add_api_route("", handle_get_warehouses, methods=["GET"])
router.add_api_route("/", handle_get_warehouses, methods=["GET"], include_in_schema=False)
router.add_api_route("", handle_create_warehouse, methods=["POST"], status_code=201)
router.add_api_route("/{warehouse_id}", handle_update_warehouse, methods=["PUT"])
router.add_api_route("/{warehouse_id}/status", handle_toggle_warehouse_status, methods=["PATCH", "PUT"])
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
