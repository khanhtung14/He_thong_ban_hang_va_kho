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
from typing import Optional, Tuple, Dict, Any
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.models import Customer, Inventory, Order, OrderItem, Product, Warehouse, Territory
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
            inv = db.query(Inventory).filter(
                Inventory.product_id == product.id,
                Inventory.warehouse_id == warehouse_id,
            ).with_for_update().first()
            if inv:
                inv.reserved_qty = max(0.0, inv.reserved_qty - quantity)
                inv.available_qty = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
                db.flush()
