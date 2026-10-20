"""Service layer for Inbound Receipt (SCRUM-30)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session, joinedload

from src.backend.models import (
    Inventory,
    InventoryStock,
    InventoryTransaction,
    Product,
    StorageLocation,
    Supplier,
    User,
    Warehouse,
)
from src.backend.models.inbound_receipt import (
    InboundReceipt,
    InboundReceiptDetail,
    LocationInventory,
    ReceiptStatus,
)
from src.backend.schemas.inbound_receipt import (
    InboundReceiptCreate,
    InboundReceiptDetailCreate,
    InboundReceiptDetailResponse,
    InboundReceiptResponse,
    InboundReceiptUpdate,
)


def generate_receipt_code(db: Session) -> str:
    """Generate a unique receipt code, e.g. PNK-20261020-0001."""
    today_str = datetime.now().strftime("%Y%m%d")
    prefix = f"PNK-{today_str}-"
    
    count_today = (
        db.query(func.count(InboundReceipt.id))
        .filter(InboundReceipt.code.like(f"{prefix}%"))
        .scalar()
        or 0
    )
    
    counter = count_today + 1
    new_code = f"{prefix}{counter:04d}"
    
    # Ensure uniqueness in case of race condition or gaps
    while db.query(InboundReceipt.id).filter(InboundReceipt.code == new_code).first() is not None:
        counter += 1
        new_code = f"{prefix}{counter:04d}"
        
    return new_code


def _build_receipt_response(receipt: InboundReceipt) -> InboundReceiptResponse:
    """Helper to convert InboundReceipt ORM object into rich InboundReceiptResponse."""
    details_res: List[InboundReceiptDetailResponse] = []
    total_qty = 0
    
    for d in receipt.details:
        total_qty += d.quantity
        p_name = d.product.name if d.product else None
        p_sku = getattr(d.product, "sku", None) if d.product else None
        loc_name = d.storage_location.name if d.storage_location else None
        loc_code = d.storage_location.code if d.storage_location else None
        
        details_res.append(
            InboundReceiptDetailResponse(
                id=d.id,
                receipt_id=d.receipt_id,
                product_id=d.product_id,
                batch_lot=d.batch_lot,
                quantity=d.quantity,
                storage_location_id=d.storage_location_id,
                product_name=p_name,
                product_sku=p_sku,
                storage_location_name=loc_name,
                storage_location_code=loc_code,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
        
    return InboundReceiptResponse(
        id=receipt.id,
        code=receipt.code,
        status=receipt.status,
        supplier_id=receipt.supplier_id,
        warehouse_id=receipt.warehouse_id,
        created_by=receipt.created_by,
        notes=receipt.notes,
        created_at=receipt.created_at,
        updated_at=receipt.updated_at,
        supplier_name=receipt.supplier.name if receipt.supplier else None,
        supplier_code=receipt.supplier.code if receipt.supplier else None,
        warehouse_name=receipt.warehouse.name if receipt.warehouse else None,
        warehouse_code=receipt.warehouse.code if receipt.warehouse else None,
        creator_name=receipt.creator.full_name if receipt.creator else None,
        total_quantity=total_qty,
        details=details_res,
    )


def list_receipts(
    db: Session,
    status: Optional[ReceiptStatus] = None,
    warehouse_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[InboundReceiptResponse], int]:
    """Retrieve paginated inbound receipts matching filter criteria."""
    query = (
        db.query(InboundReceipt)
        .options(
            joinedload(InboundReceipt.supplier),
            joinedload(InboundReceipt.warehouse),
            joinedload(InboundReceipt.creator),
            joinedload(InboundReceipt.details).joinedload(InboundReceiptDetail.product),
            joinedload(InboundReceipt.details).joinedload(InboundReceiptDetail.storage_location),
        )
    )

    if status:
        query = query.filter(InboundReceipt.status == status)
    if warehouse_id:
        query = query.filter(InboundReceipt.warehouse_id == warehouse_id)
    if supplier_id:
        query = query.filter(InboundReceipt.supplier_id == supplier_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(InboundReceipt.supplier).filter(
            or_(
                InboundReceipt.code.ilike(term),
                InboundReceipt.notes.ilike(term),
                Supplier.name.ilike(term),
                Supplier.code.ilike(term),
            )
        )

    total = query.count()
    offset = max(0, (page - 1) * page_size)
    items = (
        query.order_by(desc(InboundReceipt.created_at), desc(InboundReceipt.id))
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return [_build_receipt_response(item) for item in items], total


def get_receipt_by_id(db: Session, receipt_id: int) -> InboundReceipt:
    """Fetch raw InboundReceipt with relationships loaded or raise ValueError."""
    receipt = (
        db.query(InboundReceipt)
        .options(
            joinedload(InboundReceipt.supplier),
            joinedload(InboundReceipt.warehouse),
            joinedload(InboundReceipt.creator),
            joinedload(InboundReceipt.details).joinedload(InboundReceiptDetail.product),
            joinedload(InboundReceipt.details).joinedload(InboundReceiptDetail.storage_location),
        )
        .filter(InboundReceipt.id == receipt_id)
        .first()
    )
    if not receipt:
        raise ValueError(f"Không tìm thấy phiếu nhập có ID: {receipt_id}")
    return receipt


def get_receipt_response_by_id(db: Session, receipt_id: int) -> InboundReceiptResponse:
    """Fetch InboundReceiptResponse by ID."""
    receipt = get_receipt_by_id(db, receipt_id)
    return _build_receipt_response(receipt)


def create_receipt(
    db: Session, payload: InboundReceiptCreate, user_id: Optional[int] = None
) -> InboundReceiptResponse:
    """Create a new InboundReceipt with details (Transactional)."""
    # 1. Validate supplier
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise ValueError(f"Không tìm thấy Nhà cung cấp có ID: {payload.supplier_id}")
    if hasattr(supplier, "is_active") and not supplier.is_active:
        raise ValueError("Nhà cung cấp đã bị khóa hoặc ngừng hoạt động.")

    # 2. Validate warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        raise ValueError(f"Không tìm thấy Kho hàng có ID: {payload.warehouse_id}")
    if hasattr(warehouse, "is_active") and not warehouse.is_active:
        raise ValueError("Kho hàng đã ngừng hoạt động.")

    # 3. Validate details
    if not payload.details or len(payload.details) == 0:
        raise ValueError("Phiếu nhập kho phải có ít nhất 1 dòng chi tiết sản phẩm.")

    for idx, d in enumerate(payload.details, start=1):
        if d.quantity <= 0:
            raise ValueError(f"Dòng {idx}: Số lượng nhập phải lớn hơn 0.")
        if not d.batch_lot or not d.batch_lot.strip():
            raise ValueError(f"Dòng {idx}: Mã lô hàng không được để trống.")
        
        # Verify product exists
        product = db.query(Product).filter(Product.id == d.product_id).first()
        if not product:
            raise ValueError(f"Dòng {idx}: Không tìm thấy sản phẩm có ID {d.product_id}.")
        
        # Verify storage_location belongs to warehouse
        if d.storage_location_id:
            loc = (
                db.query(StorageLocation)
                .filter(
                    StorageLocation.id == d.storage_location_id,
                    StorageLocation.warehouse_id == payload.warehouse_id,
                )
                .first()
            )
            if not loc:
                raise ValueError(
                    f"Dòng {idx}: Vị trí lưu kho ID {d.storage_location_id} không thuộc kho '{warehouse.name}'."
                )

    # 4. Resolve receipt code
    code = payload.code.strip() if payload.code and payload.code.strip() else generate_receipt_code(db)
    if db.query(InboundReceipt.id).filter(InboundReceipt.code == code).first() is not None:
        raise ValueError(f"Mã phiếu nhập '{code}' đã tồn tại trong hệ thống.")

    # 5. Create InboundReceipt header
    receipt = InboundReceipt(
        code=code,
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        status=ReceiptStatus.DRAFT,
        created_by=user_id,
        notes=payload.notes,
    )
    db.add(receipt)
    db.flush()  # get receipt.id

    # 6. Create details
    for d in payload.details:
        detail = InboundReceiptDetail(
            receipt_id=receipt.id,
            product_id=d.product_id,
            batch_lot=d.batch_lot.strip(),
            quantity=d.quantity,
            storage_location_id=d.storage_location_id,
        )
        db.add(detail)

    db.commit()
    db.refresh(receipt)
    return get_receipt_response_by_id(db, receipt.id)


def update_receipt(
    db: Session, receipt_id: int, payload: InboundReceiptUpdate
) -> InboundReceiptResponse:
    """Update draft receipt details or header."""
    receipt = get_receipt_by_id(db, receipt_id)
    if receipt.status != ReceiptStatus.DRAFT:
        raise ValueError("Chỉ có thể cập nhật phiếu nhập ở trạng thái Nháp (DRAFT).")

    if payload.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise ValueError("Không tìm thấy Nhà cung cấp.")
        receipt.supplier_id = payload.supplier_id

    if payload.warehouse_id is not None:
        warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
        if not warehouse:
            raise ValueError("Không tìm thấy Kho hàng.")
        receipt.warehouse_id = payload.warehouse_id

    if payload.notes is not None:
        receipt.notes = payload.notes

    if payload.details is not None:
        if len(payload.details) == 0:
            raise ValueError("Phiếu nhập kho phải có ít nhất 1 dòng chi tiết sản phẩm.")

        # Remove existing details
        for old_d in list(receipt.details):
            db.delete(old_d)
        db.flush()

        # Add new details
        wh_id = receipt.warehouse_id
        for idx, d in enumerate(payload.details, start=1):
            if d.quantity <= 0:
                raise ValueError(f"Dòng {idx}: Số lượng nhập phải lớn hơn 0.")
            if not d.batch_lot or not d.batch_lot.strip():
                raise ValueError(f"Dòng {idx}: Mã lô hàng không được để trống.")
            
            prod = db.query(Product).filter(Product.id == d.product_id).first()
            if not prod:
                raise ValueError(f"Dòng {idx}: Sản phẩm ID {d.product_id} không tồn tại.")
                
            if d.storage_location_id:
                loc = (
                    db.query(StorageLocation)
                    .filter(
                        StorageLocation.id == d.storage_location_id,
                        StorageLocation.warehouse_id == wh_id,
                    )
                    .first()
                )
                if not loc:
                    raise ValueError(f"Dòng {idx}: Vị trí lưu kho không hợp lệ trong kho đã chọn.")

            db.add(
                InboundReceiptDetail(
                    receipt_id=receipt.id,
                    product_id=d.product_id,
                    batch_lot=d.batch_lot.strip(),
                    quantity=d.quantity,
                    storage_location_id=d.storage_location_id,
                )
            )

    db.commit()
    db.refresh(receipt)
    return get_receipt_response_by_id(db, receipt.id)


def complete_receipt(db: Session, receipt_id: int) -> InboundReceiptResponse:
    """
    LOGIC CỐT LÕI (CORE LOGIC):
    Chuyển trạng thái từ DRAFT sang COMPLETED.
    Hệ thống duyệt qua từng detail và tự động cập nhật (cộng thêm) quantity vào bảng:
    1. `inventories` (LocationInventory) theo product_id, warehouse_id, storage_location_id, batch_lot.
    2. `inventory` (Inventory) tổng thể vật lý và khả dụng theo product_id, warehouse_id.
    3. `inventory_stock` (InventoryStock) và ghi nhật ký `inventory_transactions`.
    """
    receipt = get_receipt_by_id(db, receipt_id)

    if receipt.status == ReceiptStatus.COMPLETED:
        raise ValueError("Phiếu nhập này đã hoàn tất trước đó.")
    if receipt.status == ReceiptStatus.CANCELLED:
        raise ValueError("Không thể hoàn tất phiếu nhập đã bị hủy.")
    if not receipt.details or len(receipt.details) == 0:
        raise ValueError("Phiếu nhập không có chi tiết sản phẩm để hoàn tất nhập kho.")

    wh_id = receipt.warehouse_id

    for detail in receipt.details:
        p_id = detail.product_id
        loc_id = detail.storage_location_id
        b_lot = detail.batch_lot.strip()
        qty = detail.quantity

        # 1. Update/Create Location-level Inventory (table inventories)
        loc_inv_query = db.query(LocationInventory).filter(
            LocationInventory.product_id == p_id,
            LocationInventory.warehouse_id == wh_id,
            LocationInventory.batch_lot == b_lot,
        )
        if loc_id is None:
            loc_inv_query = loc_inv_query.filter(LocationInventory.storage_location_id.is_(None))
        else:
            loc_inv_query = loc_inv_query.filter(LocationInventory.storage_location_id == loc_id)

        loc_inv = loc_inv_query.first()
        if loc_inv:
            loc_inv.quantity += qty
            loc_inv.updated_at = func.now()
        else:
            loc_inv = LocationInventory(
                product_id=p_id,
                warehouse_id=wh_id,
                storage_location_id=loc_id,
                batch_lot=b_lot,
                quantity=qty,
            )
            db.add(loc_inv)

        # 2. Update/Create Aggregate Inventory (table inventory)
        agg_inv = (
            db.query(Inventory)
            .filter(Inventory.product_id == p_id, Inventory.warehouse_id == wh_id)
            .first()
        )
        if agg_inv:
            agg_inv.physical_qty = float(agg_inv.physical_qty + qty)
            agg_inv.available_qty = float(agg_inv.available_qty + qty)
        else:
            agg_inv = Inventory(
                product_id=p_id,
                warehouse_id=wh_id,
                physical_qty=float(qty),
                reserved_qty=0.0,
                available_qty=float(qty),
            )
            db.add(agg_inv)

        # 3. Update/Create InventoryStock (table inventory_stock) if table exists
        try:
            stock = (
                db.query(InventoryStock)
                .filter(InventoryStock.product_id == p_id, InventoryStock.warehouse_id == wh_id)
                .first()
            )
            if stock:
                stock.base_quantity = float(stock.base_quantity + qty)
            else:
                stock = InventoryStock(
                    product_id=p_id,
                    warehouse_id=wh_id,
                    base_quantity=float(qty),
                )
                db.add(stock)
        except Exception:
            pass

        # 4. Record InventoryTransaction (table inventory_transactions)
        try:
            tx = InventoryTransaction(
                product_id=p_id,
                warehouse_id=wh_id,
                transaction_type="IN",
                unit_name="Cái",
                input_quantity=float(qty),
                conversion_rate_snapshot=1.0,
                base_quantity=float(qty),
            )
            db.add(tx)
        except Exception:
            pass

    # Mark receipt status as COMPLETED
    receipt.status = ReceiptStatus.COMPLETED
    receipt.updated_at = func.now()

    db.commit()
    db.refresh(receipt)
    return get_receipt_response_by_id(db, receipt.id)


def cancel_receipt(db: Session, receipt_id: int) -> InboundReceiptResponse:
    """Cancel a draft inbound receipt."""
    receipt = get_receipt_by_id(db, receipt_id)
    if receipt.status == ReceiptStatus.COMPLETED:
        raise ValueError("Không thể hủy phiếu nhập đã hoàn tất.")
    if receipt.status == ReceiptStatus.CANCELLED:
        raise ValueError("Phiếu nhập này đã ở trạng thái đã hủy.")

    receipt.status = ReceiptStatus.CANCELLED
    receipt.updated_at = func.now()

    db.commit()
    db.refresh(receipt)
    return get_receipt_response_by_id(db, receipt.id)


def get_receipt_form_options(db: Session, warehouse_id: Optional[int] = None) -> Dict[str, Any]:
    """Helper method to return dropdown options for creating inbound receipts."""
    # Active suppliers
    suppliers = (
        db.query(Supplier)
        .filter(Supplier.is_active == True)
        .order_by(Supplier.name)
        .all()
    )
    supplier_list = [
        {"id": s.id, "code": s.code, "name": s.name} for s in suppliers
    ]

    # Active warehouses
    warehouses = (
        db.query(Warehouse)
        .filter(Warehouse.is_active == True)
        .order_by(Warehouse.name)
        .all()
    )
    warehouse_list = [
        {"id": w.id, "code": w.code, "name": w.name} for w in warehouses
    ]

    # Active products
    prod_query = db.query(Product)
    if hasattr(Product, "status"):
        prod_query = prod_query.filter(Product.status == "ACTIVE")
    elif hasattr(Product, "is_active"):
        prod_query = prod_query.filter(Product.is_active == True)
    products = prod_query.order_by(Product.name).all()
    product_list = [
        {
            "id": p.id,
            "sku": getattr(p, "sku", None),
            "name": p.name,
            "unit": getattr(p, "unit", "Cái"),
        }
        for p in products
    ]

    # Locations
    loc_query = db.query(StorageLocation).filter(StorageLocation.is_active == True)
    if warehouse_id:
        loc_query = loc_query.filter(StorageLocation.warehouse_id == warehouse_id)
    locations = loc_query.order_by(StorageLocation.code).all()
    location_list = [
        {
            "id": l.id,
            "warehouse_id": l.warehouse_id,
            "code": l.code,
            "name": l.name,
            "level": str(l.level.value) if hasattr(l.level, "value") else str(l.level),
        }
        for l in locations
    ]

    return {
        "suppliers": supplier_list,
        "warehouses": warehouse_list,
        "products": product_list,
        "storage_locations": location_list,
    }
