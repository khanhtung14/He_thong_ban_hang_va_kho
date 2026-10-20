"""FEFO (First Expired, First Out) batch suggestion and dispatch service (SCRUM-43).

Business rules:
1. Gợi ý lô theo FEFO (First Expired, First Out):
   - Mặc định hệ thống tự động gợi ý lô (batch/lot) có hạn sử dụng gần nhất (sắp hết hạn nhất)
     và còn đủ số lượng khả dụng.
   - Nếu một lô không đủ số lượng yêu cầu, gợi ý theo thứ tự ưu tiên hạn sử dụng tăng dần
     cho đến khi gom đủ số lượng.
2. Thủ kho chọn lô khác (Override lô gợi ý):
   - Cho phép Thủ kho chủ động chọn lô khác lô được gợi ý.
   - Bắt buộc phải nhập lý do/ghi chú giải trình (reason/note) nếu chọn khác lô gợi ý.
   - Báo lỗi nếu để trống lý do.
3. Trừ tồn kho theo đúng lô:
   - Khi hoàn tất xuất kho, hệ thống thực hiện trừ chính xác số lượng tồn của đúng lô (batch/lot).
   - Đảm bảo tính nhất quán dữ liệu, chống âm kho trên từng lô hàng.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.models import (
    Inventory,
    InventoryLot,
    InventoryStock,
    InventoryTransaction,
    Order,
    OrderItem,
    PickList,
    Product,
    ProductUnit,
)


def get_fefo_lot_suggestions(
    db: Session,
    product_id: int,
    warehouse_id: Optional[int],
    required_qty: float,
) -> List[Dict[str, Any]]:
    """Gợi ý danh sách lô xuất kho theo quy tắc FEFO (Hạn dùng gần nhất xuất trước).
    
    - Ưu tiên lô có exp_date nhỏ nhất (sắp hết hạn nhất).
    - Các lô có exp_date là None xếp sau cùng.
    - Nếu một lô không đủ số lượng yêu cầu, lấy tiếp lô có hạn tăng dần cho đến khi gom đủ.
    """
    if required_qty <= 0:
        return []

    query = db.query(InventoryLot).filter(
        InventoryLot.product_id == product_id,
        InventoryLot.quantity > 0,
    )
    if warehouse_id is not None:
        query = query.filter(InventoryLot.warehouse_id == warehouse_id)

    # Sắp xếp theo exp_date ASC (nulls last), sau đó id ASC
    lots = query.order_by(
        case((InventoryLot.exp_date.is_(None), 1), else_=0),
        InventoryLot.exp_date.asc(),
        InventoryLot.id.asc(),
    ).all()

    suggestions: List[Dict[str, Any]] = []
    remaining_qty = float(required_qty)

    for lot in lots:
        avail = float(lot.quantity)
        if avail <= 0:
            continue
        take_qty = min(remaining_qty, avail)
        suggestions.append({
            "lot_id": lot.id,
            "lot_number": lot.lot_number,
            "product_id": lot.product_id,
            "warehouse_id": lot.warehouse_id,
            "mfg_date": lot.mfg_date.isoformat() if lot.mfg_date else None,
            "exp_date": lot.exp_date.isoformat() if lot.exp_date else None,
            "available_qty": avail,
            "suggested_qty": take_qty,
        })
        remaining_qty -= take_qty
        if remaining_qty <= 0:
            break

    return suggestions


def is_fefo_override(
    suggested_lots: List[Dict[str, Any]],
    selected_items: List[Dict[str, Any]],
) -> bool:
    """Kiểm tra xem thủ kho có chọn khác so với danh sách lô được FEFO gợi ý hay không.
    
    Returns:
        True nếu thủ kho chọn lô khác hoặc phân bổ số lượng khác với gợi ý mặc định FEFO.
    """
    suggested_map: Dict[str, float] = {}
    for item in suggested_lots:
        lot_no = str(item.get("lot_number") or "").strip()
        qty = float(item.get("suggested_qty", 0.0))
        suggested_map[lot_no] = suggested_map.get(lot_no, 0.0) + qty

    selected_map: Dict[str, float] = {}
    for item in selected_items:
        lot_no = str(item.get("lot_number") or item.get("lotNumber") or "").strip()
        qty = float(item.get("actual_qty") or item.get("actualQty") or item.get("quantity") or 0.0)
        selected_map[lot_no] = selected_map.get(lot_no, 0.0) + qty

    if set(suggested_map.keys()) != set(selected_map.keys()):
        return True

    for lot_no, sug_qty in suggested_map.items():
        sel_qty = selected_map.get(lot_no, 0.0)
        if abs(sug_qty - sel_qty) > 1e-4:
            return True

    return False


def validate_fefo_selection(
    db: Session,
    product_id: int,
    warehouse_id: Optional[int],
    required_qty: float,
    selected_items: List[Dict[str, Any]],
    override_reason: Optional[str],
) -> Tuple[bool, Optional[str]]:
    """Xác thực ràng buộc khi thủ kho chọn lô khác lô gợi ý FEFO.
    
    - Nếu chọn khác lô FEFO mặc định, bắt buộc phải có lý do (reason/note).
    - Nếu không nhập lý do, trả về False kèm thông báo lỗi chi tiết.
    """
    suggested = get_fefo_lot_suggestions(db, product_id, warehouse_id, required_qty)
    override = is_fefo_override(suggested, selected_items)
    if override:
        reason_clean = (override_reason or "").strip()
        if not reason_clean:
            return (
                False,
                "Thủ kho chọn lô khác lô gợi ý FEFO bắt buộc phải nhập lý do/ghi chú giải trình (reason/note).",
            )
    return True, None


def deduct_lot_inventory(
    db: Session,
    warehouse_id: int,
    product_id: int,
    lot_number: str,
    actual_qty: float,
) -> InventoryLot:
    """Thực hiện trừ chính xác số lượng tồn của đúng lô được chọn và trừ tồn kho tổng.
    
    - Chống âm kho: Kiểm tra số lượng xuất không được vượt quá số lượng khả dụng của lô.
    - Cập nhật tồn vật lý và tồn giữ chỗ của kho.
    """
    clean_lot = lot_number.strip()
    lot = (
        db.query(InventoryLot)
        .filter(
            InventoryLot.product_id == product_id,
            InventoryLot.warehouse_id == warehouse_id,
            InventoryLot.lot_number == clean_lot,
        )
        .with_for_update()
        .first()
    )

    if not lot:
        # Fallback thử tìm theo lot_number và product_id nếu warehouse_id không khớp
        lot = (
            db.query(InventoryLot)
            .filter(
                InventoryLot.product_id == product_id,
                InventoryLot.lot_number == clean_lot,
            )
            .with_for_update()
            .first()
        )

    if not lot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lô hàng '{clean_lot}' không tồn tại trong kho cho sản phẩm #{product_id}.",
        )

    if lot.quantity < actual_qty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Số lượng xuất ({actual_qty}) vượt quá tồn kho khả dụng của lô '{clean_lot}' "
                f"(tồn hiện tại: {lot.quantity}). Đảm bảo không âm kho trên từng lô hàng."
            ),
        )

    # Trừ tồn kho của chính lô đó
    lot.quantity = round(lot.quantity - actual_qty, 4)

    # Cập nhật bảng tổng Inventory
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == product_id,
            Inventory.warehouse_id == warehouse_id,
        )
        .with_for_update()
        .first()
    )
    if inv:
        inv.physical_qty = max(0.0, round(inv.physical_qty - actual_qty, 4))
        inv.reserved_qty = max(0.0, round(inv.reserved_qty - actual_qty, 4))
        inv.available_qty = max(0.0, round(inv.physical_qty - inv.reserved_qty, 4))

    # Cập nhật InventoryStock nếu có
    stock = (
        db.query(InventoryStock)
        .filter(
            InventoryStock.product_id == product_id,
            InventoryStock.warehouse_id == warehouse_id,
        )
        .with_for_update()
        .first()
    )
    if stock:
        stock.base_quantity = max(0.0, round(stock.base_quantity - actual_qty, 4))

    return lot
