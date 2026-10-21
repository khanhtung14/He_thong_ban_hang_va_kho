"""APIs for S4-04 & SCRUM-11: Xem lịch sử mua hàng 3 tháng và thêm nhanh vào đơn mới.

Endpoints:
- GET /api/v1/dealers/{dealer_id}/purchase-history
- GET /api/v1/sales/dealers/{dealer_id}/purchase-history (compat)
- GET /api/v1/dealers/{dealer_id}/last-order
- GET /api/v1/sales/dealers/{dealer_id}/last-order (compat)
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Customer, Order, OrderItem, Product, OrderStatus, RoleCode, User, Inventory
from app.api.v1.endpoints.rbac import AuthenticatedUser, get_current_user, normalize_role
from app.services.inventory_service import get_customer_serving_warehouse, get_available_stock_info

router = APIRouter(tags=["Dealer Purchase History"])

VALID_ORDER_STATUSES = [
    OrderStatus.APPROVED,
    OrderStatus.APPROVED.value,
    OrderStatus.COMPLETED,
    OrderStatus.COMPLETED.value,
    OrderStatus.PROCESSING,
    OrderStatus.PROCESSING.value,
    "DELIVERED",
]


class DealerPurchaseHistoryItem(BaseModel):
    product_id: int
    sku: str
    product_name: str
    unit: str = "Cái"
    total_orders_count: int = 1
    total_quantity: float = 0.0
    avg_quantity: float = 0.0
    average_quantity: float = 0.0
    last_price: float = 0.0
    last_ordered_at: Optional[str] = None
    available_quantity: float = 0.0


class LastOrderItem(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float = 0.0


class LastOrderGroup(BaseModel):
    order_id: Optional[int] = None
    order_code: Optional[str] = None
    items: List[LastOrderItem] = Field(default_factory=list)


def check_dealer_access(dealer_id: int, current_user: AuthenticatedUser, db: Session) -> Customer:
    """Kiểm tra đại lý tồn tại và NVKD có quyền truy cập đại lý này không.

    Nếu không thuộc quyền quản lý, trả về lỗi 403 Forbidden:
    'Bạn không có quyền xem thông tin của đại lý này'
    """
    dealer = db.get(Customer, dealer_id)
    if not dealer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý có ID: {dealer_id}."
        )

    role_norm = normalize_role(current_user.role) or current_user.role or ""
    role_upper = str(role_norm).upper().replace(" ", "_")
    if role_upper in ["ADMIN", "SALES_MANAGER"]:
        return dealer

    user_id = current_user.id
    if user_id is None:
        user_record = db.query(User).filter(User.username == current_user.username).first()
        if user_record:
            user_id = user_record.id

    assigned_sales_id = dealer.sales_rep_id or dealer.assigned_sales_id
    if assigned_sales_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin của đại lý này",
        )

    return dealer


def _get_purchase_history_data(dealer_id: int, current_user: AuthenticatedUser, db: Session) -> List[DealerPurchaseHistoryItem]:
    dealer = check_dealer_access(dealer_id, current_user, db)

    cutoff_time = datetime.now(timezone.utc) - timedelta(days=90)

    orders = (
        db.query(Order)
        .filter(
            Order.customer_id == dealer_id,
            Order.status.in_(VALID_ORDER_STATUSES),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )

    recent_orders: List[tuple[Order, datetime]] = []
    for o in orders:
        raw_time: Any = o.created_at
        o_time: Optional[datetime] = None
        if isinstance(raw_time, str):
            try:
                o_time = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
            except Exception:
                o_time = None
        elif isinstance(raw_time, datetime):
            o_time = raw_time

        if o_time is not None:
            if o_time.tzinfo is None:
                o_time = o_time.replace(tzinfo=timezone.utc)
            if o_time >= cutoff_time:
                recent_orders.append((o, o_time))
        else:
            recent_orders.append((o, datetime.now(timezone.utc)))

    serving_wh = get_customer_serving_warehouse(db, dealer.id)
    wh_id = serving_wh.id if serving_wh else None

    product_data: Dict[Any, Dict[str, Any]] = {}

    for o, o_time in recent_orders:
        products_in_order: Dict[Any, float] = defaultdict(float)
        line_info_in_order: Dict[Any, Dict[str, Any]] = {}

        for item in o.items:
            prod_id = item.product_id
            sku = (item.sku or "").strip().upper()
            p_key = prod_id if prod_id else (sku or item.product_name)
            if not p_key:
                continue

            products_in_order[p_key] += float(item.quantity or 0)
            if p_key not in line_info_in_order:
                line_info_in_order[p_key] = {
                    "product_id": prod_id,
                    "sku": sku,
                    "product_name": item.product_name,
                    "unit": item.unit_name,
                    "unit_price": float(item.unit_price or 0.0),
                }

        for p_key, order_qty in products_in_order.items():
            info = line_info_in_order[p_key]
            if p_key not in product_data:
                product_data[p_key] = {
                    "product_id": info["product_id"] or 0,
                    "sku": info["sku"],
                    "product_name": info["product_name"] or "",
                    "unit": info["unit"] or "",
                    "quantities": [order_qty],
                    "last_price": info["unit_price"],
                    "last_ordered_at": o_time.strftime("%d/%m/%Y") if o_time else None,
                }
            else:
                product_data[p_key]["quantities"].append(order_qty)

    results: List[DealerPurchaseHistoryItem] = []
    for p_key, data in product_data.items():
        prod_id = data["product_id"]
        sku_str = data["sku"]

        p_obj: Optional[Product] = None
        if prod_id:
            p_obj = db.get(Product, prod_id)
        elif sku_str:
            p_obj = db.query(Product).filter(func.upper(Product.sku) == sku_str.upper()).first()

        if p_obj:
            if not sku_str:
                sku_str = p_obj.sku
                data["sku"] = sku_str
            if not data["product_name"]:
                data["product_name"] = p_obj.name
            if not data["unit"]:
                data["unit"] = p_obj.base_unit or "Cái"
            if not data["product_id"]:
                data["product_id"] = p_obj.id

        if not data["unit"]:
            data["unit"] = "Cái"
        if not data["product_name"]:
            data["product_name"] = sku_str or f"Sản phẩm #{prod_id}"

        # Tính tồn kho khả dụng tại kho phục vụ đại lý
        available_qty = 0.0
        if sku_str and wh_id:
            stock_info = get_available_stock_info(db, sku_str, wh_id)
            available_qty = float(stock_info.get("available_qty", 0.0))
        elif data["product_id"] and wh_id:
            inv = db.query(Inventory).filter(
                Inventory.product_id == data["product_id"],
                Inventory.warehouse_id == wh_id,
            ).first()
            if inv:
                available_qty = float(inv.calculated_available_qty)

        qtys = data["quantities"]
        total_orders_count = len(qtys)
        total_quantity = sum(qtys)
        avg_qty = round(total_quantity / total_orders_count, 1) if total_orders_count > 0 else 0.0

        results.append(
            DealerPurchaseHistoryItem(
                product_id=data["product_id"],
                sku=sku_str,
                product_name=data["product_name"],
                unit=data["unit"],
                total_orders_count=total_orders_count,
                total_quantity=total_quantity,
                avg_quantity=avg_qty,
                average_quantity=avg_qty,
                last_price=data["last_price"],
                last_ordered_at=data["last_ordered_at"],
                available_quantity=available_qty,
            )
        )

    # Sắp xếp theo tần suất mua giảm dần (số lần xuất hiện, sau đó tổng số lượng)
    results.sort(key=lambda x: (x.total_orders_count, x.total_quantity), reverse=True)
    return results


def _get_last_order_data(dealer_id: int, current_user: AuthenticatedUser, db: Session) -> LastOrderGroup:
    check_dealer_access(dealer_id, current_user, db)

    last_order = (
        db.query(Order)
        .filter(
            Order.customer_id == dealer_id,
            Order.status.in_(VALID_ORDER_STATUSES),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .first()
    )

    if not last_order:
        return LastOrderGroup(items=[])

    items_resp: List[LastOrderItem] = []
    for item in last_order.items:
        p_name = item.product_name
        if not p_name and item.product_id:
            prod = db.get(Product, item.product_id)
            if prod:
                p_name = prod.name
        if not p_name:
            p_name = item.sku or f"Sản phẩm #{item.product_id or item.id}"

        items_resp.append(
            LastOrderItem(
                product_id=item.product_id or 0,
                product_name=p_name,
                quantity=item.quantity,
                unit_price=float(item.unit_price or 0.0),
            )
        )

    return LastOrderGroup(
        order_id=last_order.id,
        order_code=last_order.order_code,
        items=items_resp,
    )


# --- ROUTE REGISTRATIONS ---
@router.get("/api/v1/dealers/{dealer_id}/purchase-history", response_model=List[DealerPurchaseHistoryItem])
def get_dealers_purchase_history(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[DealerPurchaseHistoryItem]:
    return _get_purchase_history_data(dealer_id, current_user, db)


@router.get("/api/v1/sales/dealers/{dealer_id}/purchase-history", response_model=List[DealerPurchaseHistoryItem])
def get_sales_dealers_purchase_history(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[DealerPurchaseHistoryItem]:
    return _get_purchase_history_data(dealer_id, current_user, db)


@router.get("/api/v1/dealers/{dealer_id}/last-order", response_model=LastOrderGroup)
def get_dealers_last_order(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> LastOrderGroup:
    return _get_last_order_data(dealer_id, current_user, db)


@router.get("/api/v1/sales/dealers/{dealer_id}/last-order", response_model=LastOrderGroup)
def get_sales_dealers_last_order(
    dealer_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> LastOrderGroup:
    return _get_last_order_data(dealer_id, current_user, db)
