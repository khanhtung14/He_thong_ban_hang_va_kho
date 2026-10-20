"""Internal Transfer Service (Quản lý luân chuyển hàng hóa nội bộ).

Acceptance Criteria:
1. Hàng đang chuyển đi phải được ghi nhận là "đang trên đường" (IN_TRANSIT),
   tuyệt đối CHƯA ĐƯỢC cộng số lượng vào tồn kho của kho đến.
2. Kho đến phải có hành động "Xác nhận nhận đủ hàng" thì tồn kho ở kho đến mới được cộng.
3. Khi kho đến nhận hàng, nếu có chênh lệch số lượng so với lúc gửi,
   hệ thống bắt buộc người dùng phải nhập "Lý do chênh lệch".
"""
from __future__ import annotations

from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import (
    InternalTransfer,
    InternalTransferDetail,
    Inventory,
    InventoryStock,
    Product,
    Warehouse,
)
from app.schemas.internal_transfer import (
    InternalTransferCreate,
    InternalTransferConfirmRequest,
)


def create_internal_transfer(
    db: Session,
    payload: InternalTransferCreate,
) -> InternalTransfer:
    """Tạo phiếu chuyển kho nội bộ:
    - Trừ tồn kho tại kho xuất phát (Kho gửi).
    - Tạo phiếu chuyển với trạng thái IN_TRANSIT.
    - Tuyệt đối CHƯA ĐƯỢC cộng tồn kho cho kho đến.
    """
    if payload.from_warehouse_id == payload.to_warehouse_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kho gửi và kho nhận không được trùng nhau.",
        )

    from_wh = db.get(Warehouse, payload.from_warehouse_id)
    if not from_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kho gửi với ID {payload.from_warehouse_id}.",
        )

    to_wh = db.get(Warehouse, payload.to_warehouse_id)
    if not to_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kho nhận với ID {payload.to_warehouse_id}.",
        )

    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách mặt hàng luân chuyển không được để trống.",
        )

    # 1. Kiểm tra tính hợp lệ của sản phẩm và tồn kho tại kho gửi
    for item in payload.items:
        if item.quantity_sent <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng gửi cho sản phẩm ID {item.product_id} phải lớn hơn 0.",
            )

        prod = db.get(Product, item.product_id)
        if not prod:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy sản phẩm với ID {item.product_id}.",
            )

        inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == item.product_id,
                Inventory.warehouse_id == payload.from_warehouse_id,
            )
            .first()
        )

        available_qty = inv.available_qty if inv else 0.0
        physical_qty = inv.physical_qty if inv else 0.0

        if available_qty < item.quantity_sent or physical_qty < item.quantity_sent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Kho gửi '{from_wh.name}' không đủ tồn kho khả dụng cho sản phẩm '{prod.name}' "
                    f"(SKU: {prod.sku}). Tồn khả dụng hiện tại: {available_qty}, yêu cầu gửi: {item.quantity_sent}."
                ),
            )

    # 2. Trừ tồn kho tại kho xuất phát (Kho gửi)
    for item in payload.items:
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == item.product_id,
                Inventory.warehouse_id == payload.from_warehouse_id,
            )
            .first()
        )
        if inv:
            inv.physical_qty = max(0.0, inv.physical_qty - item.quantity_sent)
            inv.available_qty = max(0.0, inv.physical_qty - inv.reserved_qty)

        stock = (
            db.query(InventoryStock)
            .filter(
                InventoryStock.product_id == item.product_id,
                InventoryStock.warehouse_id == payload.from_warehouse_id,
            )
            .first()
        )
        if stock:
            stock.base_quantity = max(0.0, stock.base_quantity - item.quantity_sent)

    # 3. Tạo record InternalTransfer với trạng thái IN_TRANSIT
    # LƯU Ý AC 1: Tuyệt đối CHƯA ĐƯỢC cộng số lượng vào tồn kho của kho đến.
    transfer = InternalTransfer(
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        status="IN_TRANSIT",
    )
    db.add(transfer)
    db.flush()

    for item in payload.items:
        detail = InternalTransferDetail(
            transfer_id=transfer.id,
            product_id=item.product_id,
            quantity_sent=item.quantity_sent,
            quantity_received=None,
            discrepancy_reason=None,
        )
        db.add(detail)

    db.commit()
    db.refresh(transfer)
    return transfer


def confirm_internal_transfer(
    db: Session,
    transfer_id: int,
    payload: InternalTransferConfirmRequest,
) -> InternalTransfer:
    """Xác nhận nhận hàng tại kho đến:
    - Kiểm tra trạng thái IN_TRANSIT.
    - So sánh số lượng thực nhận so với số lượng gửi.
    - Nếu có chênh lệch mà không có lý do -> Báo lỗi HTTP 400.
    - Nếu hợp lệ -> Cập nhật trạng thái COMPLETED và cộng tồn kho cho kho đến.
    """
    transfer = (
        db.query(InternalTransfer)
        .filter(InternalTransfer.id == transfer_id)
        .first()
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu luân chuyển nội bộ với ID {transfer_id}.",
        )

    if transfer.status != "IN_TRANSIT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Phiếu luân chuyển không ở trạng thái đang chuyển (IN_TRANSIT). Trạng thái hiện tại: {transfer.status}.",
        )

    details_by_id = {d.id: d for d in transfer.details}
    details_by_prod_id = {d.product_id: d for d in transfer.details}

    # 1. Validation kiểm tra chênh lệch và lý do
    matched_details: List[tuple[InternalTransferDetail, float, Optional[str]]] = []

    for item in payload.items:
        detail = None
        if item.detail_id and item.detail_id in details_by_id:
            detail = details_by_id[item.detail_id]
        elif item.product_id and item.product_id in details_by_prod_id:
            detail = details_by_prod_id[item.product_id]

        if not detail:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mặt hàng xác nhận (detail_id={item.detail_id}, product_id={item.product_id}) không thuộc phiếu luân chuyển này.",
            )

        if item.quantity_received < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số lượng thực nhận không được âm.",
            )

        # AC 3: Nếu có chênh lệch số lượng so với lúc gửi, bắt buộc nhập 'Lý do chênh lệch'
        has_discrepancy = float(item.quantity_received) != float(detail.quantity_sent)
        reason = (item.discrepancy_reason or "").strip()

        if has_discrepancy and not reason:
            prod_name = detail.product.name if detail.product else f"ID {detail.product_id}"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Phát hiện chênh lệch số lượng thực nhận ({item.quantity_received}) "
                    f"so với số lượng gửi ({detail.quantity_sent}) đối với sản phẩm '{prod_name}'. "
                    f"Bắt buộc phải nhập 'Lý do chênh lệch'."
                ),
            )

        matched_details.append((detail, item.quantity_received, reason if has_discrepancy else (reason or None)))

    # 2. Cập nhật chi tiết phiếu và cộng tồn kho cho kho đến (AC 2)
    for detail, qty_recv, reason in matched_details:
        detail.quantity_received = qty_recv
        detail.discrepancy_reason = reason

        # Cộng tồn kho cho kho đến
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == detail.product_id,
                Inventory.warehouse_id == transfer.to_warehouse_id,
            )
            .first()
        )
        if not inv:
            inv = Inventory(
                product_id=detail.product_id,
                warehouse_id=transfer.to_warehouse_id,
                physical_qty=qty_recv,
                reserved_qty=0.0,
                available_qty=qty_recv,
            )
            db.add(inv)
        else:
            inv.physical_qty += qty_recv
            inv.available_qty = max(0.0, inv.physical_qty - inv.reserved_qty)

        # Cập nhật bảng InventoryStock
        stock = (
            db.query(InventoryStock)
            .filter(
                InventoryStock.product_id == detail.product_id,
                InventoryStock.warehouse_id == transfer.to_warehouse_id,
            )
            .first()
        )
        if stock:
            stock.base_quantity += qty_recv
        else:
            stock = InventoryStock(
                product_id=detail.product_id,
                warehouse_id=transfer.to_warehouse_id,
                base_quantity=qty_recv,
            )
            db.add(stock)

    transfer.status = "COMPLETED"
    db.commit()
    db.refresh(transfer)
    return transfer


def get_internal_transfers(
    db: Session,
    status_filter: Optional[str] = None,
    warehouse_id: Optional[int] = None,
) -> List[InternalTransfer]:
    """Lấy danh sách phiếu luân chuyển nội bộ có lọc theo trạng thái và kho."""
    query = db.query(InternalTransfer)
    if status_filter:
        query = query.filter(InternalTransfer.status == status_filter.strip().upper())
    if warehouse_id:
        query = query.filter(
            (InternalTransfer.from_warehouse_id == warehouse_id)
            | (InternalTransfer.to_warehouse_id == warehouse_id)
        )
    return query.order_by(InternalTransfer.id.desc()).all()


def get_internal_transfer_by_id(
    db: Session,
    transfer_id: int,
) -> Optional[InternalTransfer]:
    """Lấy thông tin chi tiết một phiếu luân chuyển nội bộ."""
    return (
        db.query(InternalTransfer)
        .filter(InternalTransfer.id == transfer_id)
        .first()
    )
