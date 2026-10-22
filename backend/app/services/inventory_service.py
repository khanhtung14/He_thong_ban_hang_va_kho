"""Inventory and stock reservation service with Pessimistic Locking (SCRUM-10).

Formulas:
    Tồn khả dụng (available_qty) = Tồn thực tế (physical_qty) - Tồn đang giữ chỗ (reserved_qty)

Concurrency & Race Condition Protection:
    - Pessimistic locking (SELECT ... FOR UPDATE) on the inventory record ensures atomic stock verification
      and reservation.
    - An in-process lock also prevents race conditions in SQLite where SELECT ... FOR UPDATE is simulated.
    - Prevents negative inventory under all concurrent order placement scenarios.
"""
from __future__ import annotations

import threading
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any, List
from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.models import Customer, Inventory, Order, OrderItem, OrderStatus, Product, Warehouse, Territory
from app.api.v1.endpoints.products import MOCK_PRODUCTS

_inventory_lock = threading.RLock()


def calculate_available_qty(physical_qty: float, reserved_qty: float) -> float:
    """Công thức nghiệp vụ SCRUM-10:
    Tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ cho đơn khác.
    """
    return float(physical_qty - reserved_qty)


def get_customer_serving_warehouse(
    db: Session,
    customer_id: int,
    requested_warehouse_id: Optional[int] = None,
) -> Warehouse:
    """Xác định kho phục vụ cho đại lý:
    1. requested_warehouse_id được truyền tường minh
    2. customer.warehouse_id được gán trực tiếp
    3. customer.territory_id hoặc customer.region
    4. Kho active đầu tiên trong hệ thống (default fallback)
    """
    if requested_warehouse_id:
        wh = db.query(Warehouse).filter(Warehouse.id == requested_warehouse_id, Warehouse.is_active == True).first()
        if wh:
            return wh

    customer = db.get(Customer, customer_id)
    if customer:
        if getattr(customer, "warehouse_id", None):
            wh = db.query(Warehouse).filter(Warehouse.id == customer.warehouse_id, Warehouse.is_active == True).first()
            if wh:
                return wh

        # Phân tích theo khu vực / territory
        region_str = (customer.region or "").lower()
        if customer.territory_id:
            territory = db.get(Territory, customer.territory_id)
            if territory:
                region_str = f"{region_str} {territory.name.lower()} {territory.code.lower()}"

        if any(keyword in region_str for keyword in ["hà nội", "miền bắc", "long biên", "tt-mb", "hn"]):
            wh = db.query(Warehouse).filter(Warehouse.code.ilike("%HN%"), Warehouse.is_active == True).first()
            if wh:
                return wh
        elif any(keyword in region_str for keyword in ["hồ chí minh", "tp.hcm", "hcm", "miền nam", "tân thuận", "tt-mn"]):
            wh = db.query(Warehouse).filter(Warehouse.code.ilike("%HCM%"), Warehouse.is_active == True).first()
            if wh:
                return wh

    # Fallback kho active đầu tiên
    wh = db.query(Warehouse).filter(Warehouse.is_active == True).order_by(Warehouse.id.asc()).first()
    if not wh:
        # Nếu chưa có kho nào trong DB, tạo kho mặc định
        wh = Warehouse(
            code="WH-DEFAULT",
            name="Kho Tổng Mặc Định",
            is_active=True,
        )
        db.add(wh)
        db.commit()
        db.refresh(wh)
    return wh


def get_available_stock_info(
    db: Session,
    sku: str,
    warehouse_id: int,
    for_update: bool = False,
) -> Dict[str, Any]:
    """Lấy thông tin tồn kho cho SKU tại kho chỉ định."""
    clean_sku = sku.strip().upper()
    product = db.query(Product).filter(func.upper(Product.sku) == clean_sku).first()

    inv = None
    if product:
        query = db.query(Inventory).filter(
            Inventory.product_id == product.id,
            Inventory.warehouse_id == warehouse_id,
        )
        if for_update:
            try:
                query = query.with_for_update()
            except Exception:
                pass
        inv = query.first()

    warehouse = db.get(Warehouse, warehouse_id)
    wh_name = warehouse.name if warehouse else f"Kho #{warehouse_id}"

    if inv is not None:
        avail = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
        inv.available_qty = avail
        return {
            "sku": clean_sku,
            "product_id": product.id if product else None,
            "product_name": product.name if product else None,
            "warehouse_id": warehouse_id,
            "warehouse_name": wh_name,
            "physical_qty": inv.physical_qty,
            "reserved_qty": inv.reserved_qty,
            "available_qty": avail,
            "physical_quantity": inv.physical_qty,
            "reserved_quantity": inv.reserved_qty,
            "available_quantity": avail,
            "inventory_record": inv,
        }

    # Fallback cho mock data khi chưa seed inventory table
    mock_p = MOCK_PRODUCTS.get(clean_sku)
    mock_avail = float(mock_p.get("stock_available", 0.0)) if mock_p else 0.0
    return {
        "sku": clean_sku,
        "product_id": product.id if product else None,
        "product_name": product.name if product else (mock_p.get("name") if mock_p else clean_sku),
        "warehouse_id": warehouse_id,
        "warehouse_name": wh_name,
        "physical_qty": mock_avail,
        "reserved_qty": 0.0,
        "available_qty": mock_avail,
        "physical_quantity": mock_avail,
        "reserved_quantity": 0.0,
        "available_quantity": mock_avail,
        "inventory_record": None,
    }


def reserve_stock_atomic(
    db: Session,
    sku: str,
    warehouse_id: int,
    quantity: int,
) -> Tuple[bool, float, float, Dict[str, Any]]:
    """Thực hiện kiểm tra và giữ chỗ tồn kho nguyên tử (Atomic Reservation)
    bằng cơ chế Pessimistic Locking (SELECT ... FOR UPDATE).
    
    Returns:
        (success: bool, available_qty: float, max_allowed_qty: float, info: dict)
    """
    clean_sku = sku.strip().upper()

    with _inventory_lock:
        info = get_available_stock_info(db, clean_sku, warehouse_id, for_update=True)
        avail = info["available_qty"]
        max_allowed = max(0.0, avail)

        if quantity > avail:
            return False, avail, max_allowed, info

        inv: Optional[Inventory] = info["inventory_record"]
        if inv is not None:
            inv.reserved_qty += quantity
            inv.available_qty = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
            db.flush()
            new_avail = inv.available_qty
        else:
            new_avail = max(0.0, avail - quantity)

        info["available_qty"] = new_avail
        return True, avail, max_allowed, info


def release_reserved_stock(
    db: Session,
    sku: str,
    warehouse_id: int,
    quantity: int,
) -> None:
    """Giải phóng tồn giữ chỗ khi đơn hàng bị hủy hoặc từ chối."""
    clean_sku = sku.strip().upper()
    with _inventory_lock:
        product = db.query(Product).filter(func.upper(Product.sku) == clean_sku).first()
        if product:
            query = db.query(Inventory).filter(
                Inventory.product_id == product.id,
                Inventory.warehouse_id == warehouse_id,
            )
            try:
                query = query.with_for_update()
            except Exception:
                pass
            inv = query.first()
            if inv:
                inv.reserved_qty = max(0.0, inv.reserved_qty - quantity)
                inv.available_qty = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
                db.flush()


def reserve_order_stock_transactional(
    db: Session,
    order: Order,
    hold_hours: Optional[int] = None,
) -> None:
    """Giữ chỗ tồn kho cho toàn bộ đơn hàng trong cùng một giao dịch nguyên tử (SCRUM-32).

    Quy tắc nghiệp vụ:
    - Nếu đơn đã giữ chỗ trước đó (is_stock_reserved=True), không giữ chỗ lặp (idempotent),
      nhưng vẫn cập nhật approved_at và tính toán reservation_expires_at nếu chưa có.
    - Nhóm số lượng theo SKU để kiểm tra và giữ chỗ chính xác ngay cả khi đơn có nhiều dòng cùng SKU.
    - Sắp xếp SKU để lock order ổn định, chống deadlock.
    - Kiểm tra tồn khả dụng của TẤT CẢ các sản phẩm trước (Pessimistic check).
    - Nếu bất kỳ sản phẩm nào thiếu hàng hoặc xảy ra lỗi: hủy toàn bộ (rollback), không có sản phẩm nào bị giữ chỗ dở dang.
    - Nếu đủ hàng: tăng reserved_qty, giảm available_qty tương ứng, ghi nhận is_stock_reserved=True.
    - Xác định thời hạn reservation_expires_at: nếu hold_hours được truyền hoặc cấu hình qua env ORDER_RESERVATION_HOLD_HOURS thì tính toán, mặc định không tự động hết hạn theo yêu cầu người dùng.
    """
    now_utc = datetime.now(timezone.utc)
    env_hours = os.getenv("ORDER_RESERVATION_HOLD_HOURS")
    effective_hours = hold_hours if hold_hours is not None else (int(env_hours) if env_hours and env_hours.isdigit() else None)

    if getattr(order, "is_stock_reserved", False):
        if not order.approved_at:
            order.approved_at = now_utc
        if not order.reservation_expires_at and effective_hours is not None and effective_hours > 0:
            order.reservation_expires_at = now_utc + timedelta(hours=effective_hours)
        db.flush()
        return

    wh_id = getattr(order, "warehouse_id", None) or 1
    items_to_reserve = [it for it in (order.items or []) if it.sku and (it.quantity or 0) > 0]
    if not items_to_reserve:
        order.is_stock_reserved = True
        if not order.approved_at:
            order.approved_at = now_utc
        db.flush()
        return

    # Tổng hợp số lượng theo SKU để chống race condition và hỗ trợ đơn hàng có nhiều dòng trùng SKU
    sku_totals: Dict[str, int] = {}
    sku_display_names: Dict[str, str] = {}
    for it in items_to_reserve:
        sku = (it.sku or "").strip().upper()
        sku_totals[sku] = sku_totals.get(sku, 0) + int(it.quantity)
        if sku not in sku_display_names and it.product_name:
            sku_display_names[sku] = it.product_name

    # Sắp xếp SKU theo thứ tự từ điển để đảm bảo lock order nhất quán, chống deadlock
    sorted_skus = sorted(sku_totals.keys())

    with _inventory_lock:
        # Bước 1: Kiểm tra trước tính sẵn sàng của tất cả các SKU (Pessimistic check)
        insufficient_items = []
        for sku in sorted_skus:
            total_needed = sku_totals[sku]
            info = get_available_stock_info(db, sku, wh_id, for_update=True)
            avail = info["available_qty"]
            if total_needed > avail:
                prod_name = sku_display_names.get(sku) or info.get("product_name") or sku
                insufficient_items.append({
                    "sku": sku,
                    "product_name": prod_name,
                    "requested": total_needed,
                    "available": max(0, int(avail)),
                })

        if insufficient_items:
            db.rollback()
            details_str = ", ".join(
                [f"{it['product_name']} ({it['sku']}): cần {it['requested']}, chỉ còn {it['available']}"
                 for it in insufficient_items]
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể duyệt đơn: Tồn khả dụng không đủ để giữ chỗ cho ({details_str}). Toàn bộ giao dịch đã được hoàn lại."
            )

        # Bước 2: Thực hiện giữ chỗ nguyên tử theo từng SKU
        try:
            for sku in sorted_skus:
                total_needed = sku_totals[sku]
                success, avail, max_allowed, _ = reserve_stock_atomic(db, sku, wh_id, total_needed)
                if not success:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Lỗi khi giữ chỗ cho sản phẩm {sku}."
                    )
        except Exception as exc:
            # Rollback transaction ở cấp database, tuyệt đối không dùng thao tác bù trừ thủ công
            db.rollback()
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi trong giao dịch giữ chỗ tồn kho: {str(exc)}. Đã hoàn lại toàn bộ."
            )

        order.is_stock_reserved = True
        order.approved_at = now_utc

        if effective_hours is not None and effective_hours > 0:
            order.reservation_expires_at = now_utc + timedelta(hours=effective_hours)
        else:
            order.reservation_expires_at = None

        db.flush()


def release_order_stock_transactional(db: Session, order: Order, reason: Optional[str] = None) -> None:
    """Giải phóng toàn bộ tồn đang giữ chỗ của đơn hàng (SCRUM-32)."""
    wh_id = getattr(order, "warehouse_id", None) or 1
    with _inventory_lock:
        if getattr(order, "is_stock_reserved", False):
            # Tổng hợp số lượng tồn cần giải phóng theo SKU
            sku_to_release: Dict[str, int] = {}
            for it in (order.items or []):
                if it.sku and (it.quantity or 0) > 0:
                    delivered = getattr(it, "quantity_delivered", 0) or 0
                    remaining = max(0, int(it.quantity) - int(delivered))
                    if remaining > 0:
                        clean_sku = it.sku.strip().upper()
                        sku_to_release[clean_sku] = sku_to_release.get(clean_sku, 0) + remaining

            for sku, qty in sku_to_release.items():
                release_reserved_stock(db, sku, wh_id, qty)

            order.is_stock_reserved = False
            order.reservation_expires_at = None
            db.flush()


def auto_release_expired_reservations(db: Session) -> List[int]:
    """Quét và tự động giải phóng tồn giữ chỗ cho các đơn hàng đã duyệt quá hạn (SCRUM-32).
    Trả về danh sách order_id đã được giải phóng.
    """
    now = datetime.now(timezone.utc)
    with _inventory_lock:
        expired_orders = (
            db.query(Order)
            .filter(
                Order.status == OrderStatus.APPROVED,
                Order.is_stock_reserved.is_(True),
                Order.reservation_expires_at.is_not(None),
                Order.reservation_expires_at <= now,
            )
            .all()
        )
        released_ids = []
        for order in expired_orders:
            if not getattr(order, "is_stock_reserved", False):
                continue
            has_delivered_items = any((getattr(it, "quantity_delivered", 0) or 0) > 0 for it in (order.items or []))
            release_order_stock_transactional(db, order, reason="EXPIRED")
            if not has_delivered_items:
                # Đơn chưa giao hàng: Hủy tự động khi hết hạn giữ chỗ
                order.status = OrderStatus.CANCELLED
                order.approval_reason = (
                    f"{order.approval_reason or ''}; Hủy tự động do quá hạn giữ chỗ tồn kho"
                ).strip("; ")
            else:
                # Đơn đã giao một phần: Giữ nguyên trạng thái để tiếp tục xử lý công nợ/giao hàng, chỉ giải phóng phần tồn giữ chỗ chưa giao
                order.approval_reason = (
                    f"{order.approval_reason or ''}; Hết hạn giữ chỗ tồn kho cho phần chưa giao"
                ).strip("; ")
            db.add(order)
            released_ids.append(order.id)
        if released_ids:
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise
        return released_ids
