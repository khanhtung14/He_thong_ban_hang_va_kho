"""Business logic and database service for Internal Warehouse Transfers."""

from datetime import datetime, timezone
import random
import string
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import (
    InternalTransfer,
    InternalTransferItem,
    Warehouse,
    Product,
    Inventory,
    InventoryStock,
    InventoryTransaction,
)
from app.schemas.internal_transfer import (
    InternalTransferCreate,
    InternalTransferConfirm,
)


def generate_transfer_code(db: Session) -> str:
    """Generate a unique transfer code with format TRF-YYYYMMDD-XXXX."""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    for _ in range(20):
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        code = f"TRF-{date_str}-{suffix}"
        if not db.query(InternalTransfer).filter(InternalTransfer.transfer_code == code).first():
            return code
    return f"TRF-{date_str}-{int(datetime.now().timestamp())}"


def format_transfer_response(transfer: InternalTransfer) -> Dict[str, Any]:
    """Format InternalTransfer model to dictionary response."""
    items_data = []
    for item in transfer.items:
        prod = item.product
        items_data.append({
            "id": item.id,
            "transfer_id": item.transfer_id,
            "product_id": item.product_id,
            "product_name": prod.name if prod else f"Sản phẩm #{item.product_id}",
            "product_sku": prod.sku if prod else f"SKU-{item.product_id}",
            "unit": (prod.base_unit if (prod and prod.base_unit) else "Đơn vị cơ sở"),
            "sent_quantity": item.sent_quantity,
            "received_quantity": item.received_quantity,
            "discrepancy_reason": item.discrepancy_reason,
            # CamelCase compatibility
            "transferId": item.transfer_id,
            "productId": item.product_id,
            "productName": prod.name if prod else f"Sản phẩm #{item.product_id}",
            "productSku": prod.sku if prod else f"SKU-{item.product_id}",
            "sentQuantity": item.sent_quantity,
            "receivedQuantity": item.received_quantity,
            "discrepancyReason": item.discrepancy_reason,
        })

    return {
        "id": transfer.id,
        "transfer_code": transfer.transfer_code,
        "transferCode": transfer.transfer_code,
        "from_warehouse_id": transfer.from_warehouse_id,
        "fromWarehouseId": transfer.from_warehouse_id,
        "from_warehouse_name": transfer.from_warehouse.name if transfer.from_warehouse else f"Kho #{transfer.from_warehouse_id}",
        "fromWarehouseName": transfer.from_warehouse.name if transfer.from_warehouse else f"Kho #{transfer.from_warehouse_id}",
        "to_warehouse_id": transfer.to_warehouse_id,
        "toWarehouseId": transfer.to_warehouse_id,
        "to_warehouse_name": transfer.to_warehouse.name if transfer.to_warehouse else f"Kho #{transfer.to_warehouse_id}",
        "toWarehouseName": transfer.to_warehouse.name if transfer.to_warehouse else f"Kho #{transfer.to_warehouse_id}",
        "status": transfer.status,
        "created_by": transfer.created_by,
        "createdBy": transfer.created_by,
        "confirmed_by": transfer.confirmed_by,
        "confirmedBy": transfer.confirmed_by,
        "created_at": transfer.created_at.isoformat() if transfer.created_at else None,
        "createdAt": transfer.created_at.isoformat() if transfer.created_at else None,
        "confirmed_at": transfer.confirmed_at.isoformat() if transfer.confirmed_at else None,
        "confirmedAt": transfer.confirmed_at.isoformat() if transfer.confirmed_at else None,
        "items": items_data,
    }


def create_internal_transfer(
    db: Session,
    data: InternalTransferCreate,
    current_username: Optional[str] = None,
) -> Dict[str, Any]:
    """Tạo phiếu chuyển kho nội bộ ở trạng thái PENDING.
    
    1. Kiểm tra kho đi và kho đến khác nhau.
    2. Kiểm tra kho đi và kho đến tồn tại và đang hoạt động.
    3. Kiểm tra danh sách sản phẩm.
    4. Kiểm tra tồn kho tại kho xuất và trừ tồn kho tạm thời (đưa vào luân chuyển).
    5. Tạo phiếu trạng thái PENDING.
    """
    if data.from_warehouse_id == data.to_warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kho xuất và kho nhận không được trùng nhau.",
        )

    from_wh = db.query(Warehouse).filter(Warehouse.id == data.from_warehouse_id, Warehouse.is_active == True).first()
    if not from_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kho xuất hàng không tồn tại hoặc đã ngừng hoạt động.",
        )

    to_wh = db.query(Warehouse).filter(Warehouse.id == data.to_warehouse_id, Warehouse.is_active == True).first()
    if not to_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kho nhận hàng không tồn tại hoặc đã ngừng hoạt động.",
        )

    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách sản phẩm chuyển kho không được để trống.",
        )

    transfer_code = (data.transfer_code or "").strip().upper()
    if transfer_code:
        existing = db.query(InternalTransfer).filter(InternalTransfer.transfer_code == transfer_code).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã phiếu chuyển '{transfer_code}' đã tồn tại trong hệ thống.",
            )
    else:
        transfer_code = generate_transfer_code(db)

    # Kiểm tra tồn kho từng sản phẩm và trừ kho tạm thời tại kho xuất
    items_to_create = []
    for item_data in data.items:
        if item_data.sent_quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng gửi phải lớn hơn 0.",
            )

        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm có ID {item_data.product_id}.",
            )

        # Kiểm tra tồn kho khả dụng tại kho xuất
        inv = db.query(Inventory).filter(
            Inventory.product_id == item_data.product_id,
            Inventory.warehouse_id == data.from_warehouse_id,
        ).first()

        stock = db.query(InventoryStock).filter(
            InventoryStock.product_id == item_data.product_id,
            InventoryStock.warehouse_id == data.from_warehouse_id,
        ).first()

        curr_available = 0.0
        if inv is not None:
            curr_available = float(inv.available_qty)
        elif stock is not None:
            curr_available = float(stock.base_quantity)

        if curr_available < item_data.sent_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sản phẩm '{product.name}' (SKU: {product.sku}) không đủ tồn kho tại kho xuất '{from_wh.name}'. "
                    f"Tồn khả dụng hiện tại: {curr_available}, số lượng yêu cầu chuyển: {item_data.sent_quantity}."
                ),
            )

        # Trừ kho tạm thời tại kho xuất (giảm available_qty và physical_qty để đưa vào luân chuyển)
        if inv is not None:
            inv.available_qty -= item_data.sent_quantity
            inv.physical_qty -= item_data.sent_quantity
        else:
            # Tạo bản ghi inventory nếu chưa có
            inv = Inventory(
                product_id=item_data.product_id,
                warehouse_id=data.from_warehouse_id,
                physical_qty=curr_available - item_data.sent_quantity,
                reserved_qty=0.0,
                available_qty=curr_available - item_data.sent_quantity,
            )
            db.add(inv)

        if stock is not None:
            stock.base_quantity -= item_data.sent_quantity
        else:
            stock = InventoryStock(
                product_id=item_data.product_id,
                warehouse_id=data.from_warehouse_id,
                base_quantity=curr_available - item_data.sent_quantity,
            )
            db.add(stock)

        # Ghi nhận giao dịch xuất chuyển kho nội bộ
        db.add(
            InventoryTransaction(
                product_id=item_data.product_id,
                warehouse_id=data.from_warehouse_id,
                transaction_type="OUT",
                unit_name=product.base_unit or "Đơn vị cơ sở",
                input_quantity=item_data.sent_quantity,
                conversion_rate_snapshot=1.0,
                base_quantity=item_data.sent_quantity,
            )
        )

        items_to_create.append(
            InternalTransferItem(
                product_id=item_data.product_id,
                sent_quantity=item_data.sent_quantity,
                received_quantity=None,
                discrepancy_reason=None,
            )
        )

    transfer = InternalTransfer(
        transfer_code=transfer_code,
        from_warehouse_id=data.from_warehouse_id,
        to_warehouse_id=data.to_warehouse_id,
        status="PENDING",
        created_by=current_username or "Hệ thống",
        created_at=datetime.now(timezone.utc),
        items=items_to_create,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    return format_transfer_response(transfer)


def confirm_internal_transfer(
    db: Session,
    transfer_id: int,
    data: InternalTransferConfirm,
    current_username: Optional[str] = None,
) -> Dict[str, Any]:
    """Xác nhận nhận hàng chuyển kho tại kho đến.
    
    1. Kiểm tra phiếu tồn tại và ở trạng thái PENDING.
    2. Nhập received_quantity cho từng sản phẩm.
    3. BẮT BUỘC có discrepancy_reason nếu sent_quantity != received_quantity (nếu trống trả về 400).
    4. Cộng tồn kho chính thức cho kho đến (to_warehouse_id).
    5. Cập nhật trạng thái phiếu thành COMPLETED.
    """
    transfer = db.query(InternalTransfer).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với ID {transfer_id}.",
        )

    if transfer.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiếu chuyển kho '{transfer.transfer_code}' đang ở trạng thái {transfer.status}, không thể xác nhận.",
        )

    if not data.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách sản phẩm xác nhận nhận hàng không được để trống.",
        )

    # Tạo map tra cứu từ payload theo item_id hoặc product_id
    payload_by_item_id = {item.item_id: item for item in data.items if item.item_id is not None}
    payload_by_product_id = {item.product_id: item for item in data.items if item.product_id is not None}

    for item in transfer.items:
        conf = payload_by_item_id.get(item.id) or payload_by_product_id.get(item.product_id)
        if not conf:
            prod_name = item.product.name if item.product else f"ID {item.product_id}"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Thiếu thông tin nhận hàng cho sản phẩm '{prod_name}'.",
            )

        if conf.received_quantity < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng thực nhận của sản phẩm ID {item.product_id} không được là số âm.",
            )

        # --- NGHIỆP VỤ BẮT BUỘC: Kiểm tra chênh lệch số lượng ---
        differs = round(float(conf.received_quantity), 4) != round(float(item.sent_quantity), 4)
        if differs:
            reason = (conf.discrepancy_reason or "").strip()
            if not reason:
                prod_label = item.product.name if item.product else f"ID {item.product_id}"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Bắt buộc nhập lý do chênh lệch cho sản phẩm '{prod_label}' "
                        f"khi số lượng thực nhận ({conf.received_quantity}) khác số lượng gửi ({item.sent_quantity})."
                    ),
                )
            item.discrepancy_reason = reason
        else:
            item.discrepancy_reason = (conf.discrepancy_reason or "").strip() or None

        item.received_quantity = conf.received_quantity

        # Cộng tồn kho chính thức cho kho đến (to_warehouse_id)
        if item.received_quantity > 0:
            # 1. Cập nhật bảng Inventory
            inv_to = db.query(Inventory).filter(
                Inventory.product_id == item.product_id,
                Inventory.warehouse_id == transfer.to_warehouse_id,
            ).first()

            if not inv_to:
                inv_to = Inventory(
                    product_id=item.product_id,
                    warehouse_id=transfer.to_warehouse_id,
                    physical_qty=item.received_quantity,
                    reserved_qty=0.0,
                    available_qty=item.received_quantity,
                )
                db.add(inv_to)
            else:
                inv_to.physical_qty += item.received_quantity
                inv_to.available_qty += item.received_quantity

            # 2. Cập nhật bảng InventoryStock
            stock_to = db.query(InventoryStock).filter(
                InventoryStock.product_id == item.product_id,
                InventoryStock.warehouse_id == transfer.to_warehouse_id,
            ).first()

            if not stock_to:
                stock_to = InventoryStock(
                    product_id=item.product_id,
                    warehouse_id=transfer.to_warehouse_id,
                    base_quantity=item.received_quantity,
                )
                db.add(stock_to)
            else:
                stock_to.base_quantity += item.received_quantity

            # 3. Ghi nhận giao dịch nhập chuyển kho nội bộ (IN)
            prod = item.product or db.query(Product).filter(Product.id == item.product_id).first()
            db.add(
                InventoryTransaction(
                    product_id=item.product_id,
                    warehouse_id=transfer.to_warehouse_id,
                    transaction_type="IN",
                    unit_name=(prod.base_unit if (prod and prod.base_unit) else "Đơn vị cơ sở"),
                    input_quantity=item.received_quantity,
                    conversion_rate_snapshot=1.0,
                    base_quantity=item.received_quantity,
                )
            )

    transfer.status = "COMPLETED"
    transfer.confirmed_by = (data.confirmed_by or "").strip() or current_username or "Thủ kho nhận"
    transfer.confirmed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(transfer)

    return format_transfer_response(transfer)


def get_internal_transfer(db: Session, transfer_id: int) -> Dict[str, Any]:
    """Lấy chi tiết một phiếu chuyển kho nội bộ."""
    transfer = db.query(InternalTransfer).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với ID {transfer_id}.",
        )
    return format_transfer_response(transfer)


def list_internal_transfers(
    db: Session,
    warehouse_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """Lấy danh sách phiếu chuyển kho nội bộ kèm bộ lọc."""
    query = db.query(InternalTransfer)

    if warehouse_id is not None:
        query = query.filter(
            (InternalTransfer.from_warehouse_id == warehouse_id) |
            (InternalTransfer.to_warehouse_id == warehouse_id)
        )

    if status_filter:
        query = query.filter(InternalTransfer.status == status_filter.strip().upper())

    if search:
        kw = f"%{search.strip()}%"
        query = query.filter(InternalTransfer.transfer_code.ilike(kw))

    total = query.count()
    transfers = query.order_by(InternalTransfer.created_at.desc(), InternalTransfer.id.desc()).offset(offset).limit(limit).all()

    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách phiếu chuyển kho thành công",
        "data": [format_transfer_response(t) for t in transfers],
        "total": total,
    }


def cancel_internal_transfer(
    db: Session,
    transfer_id: int,
    current_username: Optional[str] = None,
) -> Dict[str, Any]:
    """Hủy phiếu chuyển kho đang PENDING và hoàn trả tồn kho về kho xuất."""
    transfer = db.query(InternalTransfer).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu chuyển kho với ID {transfer_id}.",
        )

    if transfer.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Chỉ có thể hủy phiếu chuyển kho đang ở trạng thái PENDING. Trạng thái hiện tại: {transfer.status}.",
        )

    # Hoàn trả hàng về kho xuất
    for item in transfer.items:
        inv = db.query(Inventory).filter(
            Inventory.product_id == item.product_id,
            Inventory.warehouse_id == transfer.from_warehouse_id,
        ).first()
        if inv:
            inv.physical_qty += item.sent_quantity
            inv.available_qty += item.sent_quantity

        stock = db.query(InventoryStock).filter(
            InventoryStock.product_id == item.product_id,
            InventoryStock.warehouse_id == transfer.from_warehouse_id,
        ).first()
        if stock:
            stock.base_quantity += item.sent_quantity

        prod = item.product
        db.add(
            InventoryTransaction(
                product_id=item.product_id,
                warehouse_id=transfer.from_warehouse_id,
                transaction_type="IN",
                unit_name=(prod.base_unit if (prod and prod.base_unit) else "Đơn vị cơ sở"),
                input_quantity=item.sent_quantity,
                conversion_rate_snapshot=1.0,
                base_quantity=item.sent_quantity,
            )
        )

    transfer.status = "CANCELLED"
    db.commit()
    db.refresh(transfer)

    return format_transfer_response(transfer)
