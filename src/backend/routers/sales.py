"""Router cho tính năng SCRUM-11: Lịch sử mua hàng của đại lý dành cho Sales.

LƯU Ý QUAN TRỌNG:
Tất cả các import bắt buộc sử dụng tiền tố `src.backend.` để đảm bảo tương thích tuyệt đối.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import Customer, Order, OrderItem, Product, OrderStatus, RoleCode
from src.backend.rbac import AuthenticatedUser, get_current_user
from src.backend.schemas.sales import (
    PurchaseHistoryItemResponse,
    LastOrderItemResponse,
    LastOrderGroupResponse,
)

router = APIRouter(prefix="/api/v1/sales/dealers", tags=["Sales Dealer History"])

# Các trạng thái được tính là đơn hàng thành công
SUCCESSFUL_STATUSES = [
    OrderStatus.COMPLETED,
    OrderStatus.COMPLETED.value,
    OrderStatus.APPROVED,
    OrderStatus.APPROVED.value,
    OrderStatus.PROCESSING,
    OrderStatus.PROCESSING.value,
]


def check_dealer_access(dealer_id: int, current_user: AuthenticatedUser, db: Session) -> Customer:
    """Kiểm tra đại lý tồn tại và nhân viên kinh doanh có quyền truy cập đại lý này không.

    BẢO MẬT BẮT BUỘC: Nhân viên Sales chỉ được xem đại lý được phân công quản lý.
    Nếu không thuộc quyền quản lý, lập tức raise lỗi 403 Forbidden.
    """
    dealer = db.get(Customer, dealer_id)
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý có ID: {dealer_id}."
        )

    # Quản trị viên (Admin) và Trưởng phòng kinh doanh (Sales Manager) được phép xem tất cả
    role_norm = str(current_user.role or "").upper().replace(" ", "_")
    if role_norm in ["ADMIN", "SALES_MANAGER"]:
        return dealer

    # Nhân viên kinh doanh (Sales Rep): Phải được phân công quản lý đại lý này
    assigned_sales_id = dealer.sales_rep_id or dealer.assigned_sales_id
    if assigned_sales_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập thông tin của đại lý này do không được phân công quản lý.",
        )

    return dealer


@router.get("/{dealer_id}/purchase-history", response_model=List[PurchaseHistoryItemResponse])
def get_dealer_purchase_history(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[PurchaseHistoryItemResponse]:
    """Lấy danh sách mặt hàng đại lý đã mua trong 90 ngày qua kèm tổng số lượng và số lượng bình quân."""
    check_dealer_access(dealer_id, current_user, db)

    # Mốc thời gian 90 ngày gần nhất
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=90)

    # Truy vấn các đơn hàng thành công trong 90 ngày
    orders = (
        db.query(Order)
        .filter(
            Order.customer_id == dealer_id,
            Order.status.in_(SUCCESSFUL_STATUSES),
        )
        .all()
    )

    # Lọc đơn trong 90 ngày (hỗ trợ cả aware và naive datetime trong SQLite)
    recent_orders: List[Order] = []
    for o in orders:
        if o.created_at:
            o_time = o.created_at
            if o_time.tzinfo is None:
                o_time = o_time.replace(tzinfo=timezone.utc)
            if o_time >= cutoff_time:
                recent_orders.append(o)
        else:
            recent_orders.append(o)

    # Nhóm (group by) theo sản phẩm để tính total_quantity và average_quantity
    product_stats: Dict[int, Dict[str, Any]] = defaultdict(lambda: {"name": "", "quantities": []})

    for o in recent_orders:
        order_product_qtys: Dict[int, int] = defaultdict(int)
        for item in o.items:
            pid = item.product_id or item.id
            order_product_qtys[pid] += item.quantity
            if not product_stats[pid]["name"]:
                p_name = item.product_name
                if not p_name and item.product_id:
                    prod = db.get(Product, item.product_id)
                    if prod:
                        p_name = prod.name
                if not p_name:
                    p_name = f"Sản phẩm #{pid}"
                product_stats[pid]["name"] = p_name

        for pid, qty in order_product_qtys.items():
            product_stats[pid]["quantities"].append(qty)

    results: List[PurchaseHistoryItemResponse] = []
    for pid, data in product_stats.items():
        quantities = data["quantities"]
        total_qty = sum(quantities)
        count_orders = len(quantities)
        avg_qty = round(total_qty / count_orders, 2) if count_orders > 0 else 0.0

        results.append(
            PurchaseHistoryItemResponse(
                product_id=pid,
                product_name=data["name"],
                total_quantity=total_qty,
                average_quantity=avg_qty,
            )
        )

    # Sắp xếp sản phẩm được mua nhiều nhất lên trước
    results.sort(key=lambda x: x.total_quantity, reverse=True)
    return results


@router.get("/{dealer_id}/last-order", response_model=LastOrderGroupResponse)
def get_dealer_last_order(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> LastOrderGroupResponse:
    """Lấy danh sách các mặt hàng từ đơn đặt hàng thành công mới nhất của đại lý."""
    check_dealer_access(dealer_id, current_user, db)

    last_order = (
        db.query(Order)
        .filter(
            Order.customer_id == dealer_id,
            Order.status.in_(SUCCESSFUL_STATUSES),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .first()
    )

    if not last_order:
        return LastOrderGroupResponse(items=[])

    items_resp: List[LastOrderItemResponse] = []
    for item in last_order.items:
        p_name = item.product_name
        if not p_name and item.product_id:
            prod = db.get(Product, item.product_id)
            if prod:
                p_name = prod.name
        if not p_name:
            p_name = f"Sản phẩm #{item.product_id or item.id}"

        items_resp.append(
            LastOrderItemResponse(
                product_id=item.product_id or 0,
                product_name=p_name,
                quantity=item.quantity,
                unit_price=item.unit_price or 0.0,
            )
        )

    return LastOrderGroupResponse(
        order_id=last_order.id,
        order_code=last_order.order_code,
        items=items_resp,
    )
