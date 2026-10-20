"""Batch and Expiry Date Tracking Business Service.

Acceptance Criteria:
1. Có thể bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU).
2. Quản lý thông tin mỗi lô bao gồm: Số lô, ngày sản xuất, hạn sử dụng và số lượng tồn còn lại.
3. Cảnh báo các lô sắp hết hạn theo một ngưỡng thời gian có thể khai báo/cấu hình được.
4. Chặn xuất kho đối với lô đã quá hạn sử dụng. Chỉ cho phép xuất nếu có sự xác nhận "ghi đè" (override)
   từ tài khoản cấp Quản lý kho và bắt buộc phải ghi kèm lý do.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import (
    BatchOverrideLog,
    Inventory,
    InventoryStock,
    Product,
    ProductBatch,
    Warehouse,
)
from app.schemas.batch import (
    OutboundDispatchCreate,
    ProductBatchCreate,
    ProductBatchUpdate,
)


def toggle_product_batch_management(
    db: Session,
    product_id: int,
    is_batch_managed: bool,
) -> Product:
    """AC 1: Bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU)."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có ID {product_id}.",
        )

    product.is_batch_managed = is_batch_managed
    product.manage_by_lot = is_batch_managed
    db.commit()
    db.refresh(product)
    return product


def create_batch(
    db: Session,
    payload: ProductBatchCreate,
) -> ProductBatch:
    """AC 2: Tạo mới thông tin một lô hàng."""
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có ID {payload.product_id}.",
        )

    clean_batch_number = payload.batch_number.strip().upper()
    existing = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == payload.product_id,
            ProductBatch.batch_number == clean_batch_number,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Số lô '{clean_batch_number}' đã tồn tại cho sản phẩm này.",
        )

    if payload.mfg_date and payload.exp_date < payload.mfg_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hạn sử dụng (HSD) không được trước ngày sản xuất (NSX).",
        )

    batch = ProductBatch(
        product_id=payload.product_id,
        batch_number=clean_batch_number,
        mfg_date=payload.mfg_date,
        exp_date=payload.exp_date,
        remaining_quantity=payload.remaining_quantity,
        warehouse_id=payload.warehouse_id,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def update_batch(
    db: Session,
    batch_id: int,
    payload: ProductBatchUpdate,
) -> ProductBatch:
    """AC 2: Cập nhật thông tin lô hàng."""
    batch = db.get(ProductBatch, batch_id)
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy lô hàng với ID {batch_id}.",
        )

    if payload.batch_number is not None:
        batch.batch_number = payload.batch_number.strip().upper()
    if payload.mfg_date is not None:
        batch.mfg_date = payload.mfg_date
    if payload.exp_date is not None:
        batch.exp_date = payload.exp_date
    if payload.remaining_quantity is not None:
        batch.remaining_quantity = payload.remaining_quantity
    if payload.warehouse_id is not None:
        batch.warehouse_id = payload.warehouse_id

    if batch.mfg_date and batch.exp_date < batch.mfg_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hạn sử dụng (HSD) không được trước ngày sản xuất (NSX).",
        )

    db.commit()
    db.refresh(batch)
    return batch


def get_batches_with_expiry_analysis(
    db: Session,
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    warning_days: int = 30,
    status_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """AC 3: Lấy danh sách lô hàng kèm tính toán trạng thái và cảnh báo hạn dùng."""
    today = date.today()
    query = db.query(ProductBatch)

    if product_id:
        query = query.filter(ProductBatch.product_id == product_id)
    if warehouse_id:
        query = query.filter(ProductBatch.warehouse_id == warehouse_id)

    batches = query.order_by(ProductBatch.exp_date.asc()).all()

    results: List[Dict[str, Any]] = []
    for b in batches:
        days_until_expiry = (b.exp_date - today).days
        is_expired = b.exp_date < today
        is_expiring_soon = (not is_expired) and (days_until_expiry <= warning_days)

        if is_expired:
            b_status = "EXPIRED"
        elif is_expiring_soon:
            b_status = "EXPIRING_SOON"
        else:
            b_status = "ACTIVE"

        if status_filter:
            sf = status_filter.strip().upper()
            if sf != "ALL" and b_status != sf:
                continue

        results.append({
            "id": b.id,
            "product_id": b.product_id,
            "productId": b.product_id,
            "product_sku": b.product.sku if b.product else None,
            "productSku": b.product.sku if b.product else None,
            "product_name": b.product.name if b.product else None,
            "productName": b.product.name if b.product else None,
            "batch_number": b.batch_number,
            "batchNumber": b.batch_number,
            "mfg_date": b.mfg_date.isoformat() if b.mfg_date else None,
            "mfgDate": b.mfg_date.isoformat() if b.mfg_date else None,
            "exp_date": b.exp_date.isoformat() if b.exp_date else None,
            "expDate": b.exp_date.isoformat() if b.exp_date else None,
            "remaining_quantity": b.remaining_quantity,
            "remainingQuantity": b.remaining_quantity,
            "warehouse_id": b.warehouse_id,
            "warehouseId": b.warehouse_id,
            "warehouse_name": b.warehouse.name if b.warehouse else None,
            "warehouseName": b.warehouse.name if b.warehouse else None,
            "days_until_expiry": days_until_expiry,
            "daysUntilExpiry": days_until_expiry,
            "is_expired": is_expired,
            "isExpired": is_expired,
            "is_expiring_soon": is_expiring_soon,
            "isExpiringSoon": is_expiring_soon,
            "status": b_status,
        })

    return results


def process_outbound_dispatch(
    db: Session,
    payload: OutboundDispatchCreate,
    user_role: Optional[str] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    """AC 4: Xuất kho có kiểm tra ràng buộc lô và hạn sử dụng:
    - Nếu SKU có quản lý lô: Bắt buộc phải chọn lô.
    - Nếu lô quá hạn: Bị chặn.
    - Nếu có cờ ghi đè (override_expired) và lý do hợp lệ từ tài khoản Quản lý: Cho phép xuất và lưu log.
    """
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy sản phẩm có ID {payload.product_id}.",
        )

    warehouse = db.get(Warehouse, payload.warehouse_id)
    if not warehouse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kho hàng có ID {payload.warehouse_id}.",
        )

    today = date.today()
    batch: Optional[ProductBatch] = None
    override_applied = False

    # 1. Kiểm tra SKU có quản lý theo lô không
    is_managed = bool(product.is_batch_managed or product.manage_by_lot)
    if is_managed:
        if not payload.batch_id and not payload.batch_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sản phẩm này được cấu hình 'Quản lý theo lô'. Bắt buộc phải chọn lô hàng cụ thể để xuất kho.",
            )

        if payload.batch_id:
            batch = db.get(ProductBatch, payload.batch_id)
        elif payload.batch_number:
            batch = (
                db.query(ProductBatch)
                .filter(
                    ProductBatch.product_id == payload.product_id,
                    ProductBatch.batch_number == payload.batch_number.strip().upper(),
                )
                .first()
            )

        if not batch or batch.product_id != payload.product_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lô hàng được chọn không tồn tại hoặc không thuộc sản phẩm này.",
            )

        # Kiểm tra tồn kho của lô
        if batch.remaining_quantity < payload.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Lô hàng '{batch.batch_number}' chỉ còn {batch.remaining_quantity} trong kho, không đủ xuất số lượng {payload.quantity}.",
            )

        # 2. AC 4: Kiểm tra Hạn sử dụng của lô
        is_expired = batch.exp_date < today
        if is_expired:
            override_reason = (payload.override_reason or "").strip()
            if not payload.override_expired or not override_reason:
                days_overdue = (today - batch.exp_date).days
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "BATCH_EXPIRED",
                        "requires_override": True,
                        "message": (
                            f"Lô hàng '{batch.batch_number}' đã quá hạn sử dụng "
                            f"(HSD: {batch.exp_date.strftime('%d/%m/%Y')}, quá hạn {days_overdue} ngày). "
                            f"Hệ thống chặn xuất kho! Chỉ cho phép xuất nếu có sự xác nhận 'ghi đè' "
                            f"(override) từ tài khoản cấp Quản lý kho và bắt buộc phải ghi kèm lý do."
                        ),
                        "batch_id": batch.id,
                        "batch_number": batch.batch_number,
                        "exp_date": str(batch.exp_date),
                        "days_overdue": days_overdue,
                    },
                )

            # Kiểm tra quyền Quản lý kho nếu có role
            if user_role:
                normalized = user_role.strip()
                allowed_roles = {"WH Manager", "Admin", "Warehouse Manager", "Quản lý kho"}
                if not any(r.lower() in normalized.lower() for r in allowed_roles):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Chỉ tài khoản cấp Quản lý kho (WH Manager / Admin) mới có thẩm quyền ghi đè xuất lô hàng quá hạn.",
                    )

            # Lưu log ghi đè
            override_log = BatchOverrideLog(
                batch_id=batch.id,
                product_id=batch.product_id,
                warehouse_id=payload.warehouse_id,
                quantity=payload.quantity,
                override_reason=override_reason,
                override_by_user_id=user_id,
                override_by_name=username or "Manager",
            )
            db.add(override_log)
            override_applied = True

        # Trừ tồn kho của lô
        batch.remaining_quantity = max(0.0, batch.remaining_quantity - payload.quantity)

    # 3. Trừ tồn kho chung tại kho (Inventory & InventoryStock)
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == payload.product_id,
            Inventory.warehouse_id == payload.warehouse_id,
        )
        .first()
    )
    if inv:
        if inv.physical_qty < payload.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tổng tồn kho thực tế ({inv.physical_qty}) không đủ xuất {payload.quantity}.",
            )
        inv.physical_qty = max(0.0, inv.physical_qty - payload.quantity)
        inv.available_qty = max(0.0, inv.physical_qty - inv.reserved_qty)

    stock = (
        db.query(InventoryStock)
        .filter(
            InventoryStock.product_id == payload.product_id,
            InventoryStock.warehouse_id == payload.warehouse_id,
        )
        .first()
    )
    if stock:
        stock.base_quantity = max(0.0, stock.base_quantity - payload.quantity)

    db.commit()

    return {
        "success": True,
        "product_id": payload.product_id,
        "product_name": product.name,
        "product_sku": product.sku,
        "warehouse_id": payload.warehouse_id,
        "warehouse_name": warehouse.name,
        "quantity_dispatched": payload.quantity,
        "batch_id": batch.id if batch else None,
        "batch_number": batch.batch_number if batch else None,
        "is_batch_managed": is_managed,
        "override_applied": override_applied,
        "override_reason": payload.override_reason if override_applied else None,
        "remaining_batch_quantity": batch.remaining_quantity if batch else None,
        "dispatched_at": datetime.now().isoformat(),
    }
