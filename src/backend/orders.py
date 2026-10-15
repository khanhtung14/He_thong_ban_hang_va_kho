"""API Endpoints cho quản lý và theo dõi đơn hàng (SCRUM-26).

LƯU Ý QUAN TRỌNG:
Toàn bộ import sử dụng tiền tố `src.backend.` để đảm bảo tương thích tuyệt đối.
"""

from __future__ import annotations

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import Customer, Order, OrderItem, Product, OrderStatus
from src.backend.rbac import AuthenticatedUser, get_current_user, require_permissions
from src.backend.schemas.order import (
    OrderItemTrackingResponse,
    OrderTrackingListResponse,
    OrderTrackingDetailResponse,
)

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


class OrderCreate(BaseModel):
    """Schema tạm thời cho tạo đơn hàng cũ."""
    pass


# --- Helper: Xác định Dealer ID từ AuthenticatedUser ---
def get_dealer_id(user: AuthenticatedUser, db: Session) -> int:
    """Xác định ID của Đại lý (Customer) tương ứng với user đang đăng nhập."""
    if getattr(user, "dealer_id", None):
        return int(user.dealer_id)
    if getattr(user, "customer_id", None):
        return int(user.customer_id)

    if user.username:
        cleaned_user = user.username.strip()
        cust = db.query(Customer).filter(Customer.code.ilike(cleaned_user)).first()
        if cust:
            return cust.id
        cust = db.query(Customer).filter(Customer.email.ilike(cleaned_user)).first()
        if cust:
            return cust.id

    if user.id:
        cust = db.query(Customer).filter(Customer.id == user.id).first()
        if cust:
            return cust.id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tài khoản không được liên kết với hồ sơ Đại lý hợp lệ.",
    )


# --- SCRUM-26: Theo dõi trạng thái đơn hàng cho Đại lý ---
@router.get("/my-orders", response_model=List[OrderTrackingListResponse])
def get_my_orders(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[OrderTrackingListResponse]:
    """Lấy danh sách đơn hàng của đại lý đang đăng nhập."""
    dealer_id = get_dealer_id(current_user, db)
    orders = (
        db.query(Order)
        .filter(Order.customer_id == dealer_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    results: List[OrderTrackingListResponse] = []
    for o in orders:
        status_str = o.status.value if hasattr(o.status, "value") else str(o.status)
        results.append(
            OrderTrackingListResponse(
                id=o.id,
                dealer_id=o.customer_id,
                status=status_str,
                expected_delivery_date=o.expected_delivery_date,
                total_amount=o.total_amount or 0.0,
            )
        )
    return results


@router.get("/my-orders/{order_id}", response_model=OrderTrackingDetailResponse)
def get_my_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> OrderTrackingDetailResponse:
    """Lấy chi tiết đơn hàng của đại lý đang đăng nhập, chặn 403 nếu xem đơn của đại lý khác."""
    dealer_id = get_dealer_id(current_user, db)

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Đơn hàng không tồn tại.",
        )

    # BẮT BUỘC: Kiểm tra đơn hàng thuộc về chính đại lý đang đăng nhập
    if order.customer_id != dealer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập đơn hàng của đại lý khác.",
        )

    items_response: List[OrderItemTrackingResponse] = []
    for item in order.items:
        product_name = item.product_name
        if not product_name and item.product_id:
            prod = db.query(Product).filter(Product.id == item.product_id).first()
            if prod:
                product_name = prod.name
        if not product_name:
            product_name = f"Sản phẩm #{item.product_id or item.id}"

        qty_delivered = getattr(item, "quantity_delivered", 0) or 0

        items_response.append(
            OrderItemTrackingResponse(
                product_name=product_name,
                quantity_ordered=item.quantity,
                quantity_delivered=qty_delivered,
                unit_price=item.unit_price or 0.0,
            )
        )

    status_str = order.status.value if hasattr(order.status, "value") else str(order.status)
    return OrderTrackingDetailResponse(
        id=order.id,
        dealer_id=order.customer_id,
        status=status_str,
        expected_delivery_date=order.expected_delivery_date,
        total_amount=order.total_amount or 0.0,
        items=items_response,
    )
