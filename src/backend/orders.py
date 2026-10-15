"""Orders endpoints including Reorder feature (SCRUM-28)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from src.backend.database import get_db
from src.backend.models import (
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductUnit,
    User,
)
from src.backend.price_lists import resolve_effective_price
from src.backend.rbac import (
    AuthenticatedUser,
    get_optional_current_user,
    require_permissions,
)
from src.backend.schemas.reorder import (
    ReorderCreateItem,
    ReorderCreateRequest,
    ReorderDiscontinuedItem,
    ReorderItemPreview,
    ReorderPreviewResponse,
)

router = APIRouter(prefix="/api/v1/orders", tags=["Orders"])


class OrderCreate(BaseModel):
    pass  # TODO: define schema


@router.get("")
def list_orders(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    items = db.query(Order).all()
    return {"success": True, "code": 200, "data": [item.__dict__ for item in items]}


@router.post("")
def create_orders(
    data: OrderCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    return {"success": True, "code": 201, "message": "Created"}


@router.get("/{order_id}/reorder-preview", response_model=ReorderPreviewResponse)
def get_reorder_preview(
    order_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    """SCRUM-28: Lấy danh sách mặt hàng của đơn cũ để xem trước khi đặt lại.
    
    Quy tắc nghiệp vụ:
    1. Kiểm tra từng mặt hàng đối chiếu với bảng Products hiện tại.
    2. Mặt hàng đã ngừng kinh doanh (is_active=False hoặc status != 'ACTIVE') 
       phải tự động loại khỏi đơn mới và đưa vào danh sách cảnh báo (discontinued_items).
    3. Cập nhật đơn giá mới nhất của các mặt hàng hợp lệ theo bảng giá hiện hành (PriceLists).
    """
    order = db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{order_id}!",
        )

    customer = db.get(Customer, order.customer_id)
    customer_group = customer.customer_group if customer else "RETAIL"

    available_items: List[ReorderItemPreview] = []
    discontinued_items: List[ReorderDiscontinuedItem] = []

    for item in order.items:
        # Tra cứu sản phẩm trong DB
        product = None
        if item.product_id:
            product = db.get(Product, item.product_id)
        if not product and item.sku:
            product = db.query(Product).filter(Product.sku == item.sku.strip().upper()).first()

        # Kiểm tra trạng thái ngừng kinh doanh
        is_discontinued = False
        reason = "Sản phẩm đã ngừng kinh doanh"
        if not product:
            is_discontinued = True
            reason = "Sản phẩm không còn tồn tại trong hệ thống"
        elif (product.status or "").upper() != "ACTIVE" or getattr(product, "is_active", True) is False:
            is_discontinued = True
            reason = f"Sản phẩm đã ngừng kinh doanh (trạng thái: {product.status})"

        if is_discontinued:
            discontinued_items.append(
                ReorderDiscontinuedItem(
                    product_id=product.id if product else item.product_id,
                    sku=item.sku or (product.sku if product else "UNKNOWN"),
                    product_name=product.name if product else (item.product_name or "Sản phẩm đã xóa"),
                    old_unit_price=float(item.unit_price or 0.0),
                    quantity=item.quantity,
                    reason=reason,
                )
            )
            continue

        # Sản phẩm còn kinh doanh: Cập nhật giá theo bảng giá hiện hành (PriceLists)
        effective = resolve_effective_price(db, product.sku, customer_group)
        if effective:
            new_price = float(effective["sale_price"])
            floor_price = float(effective["floor_price"])
            price_list_id = effective.get("price_list_id")
            price_list_code = effective.get("code") or effective.get("price_list_code")
        else:
            # Fallback sang base_price của sản phẩm nếu chưa có trong PriceList
            new_price = float(product.base_price) if product.base_price is not None else float(item.unit_price or 0.0)
            floor_price = None
            price_list_id = None
            price_list_code = None

        # Đơn vị tính
        unit_name = None
        if item.unit_id:
            pu = db.get(ProductUnit, item.unit_id)
            if pu:
                unit_name = pu.unit_name
        if not unit_name and product.base_unit:
            unit_name = product.base_unit

        total_line = round(new_price * item.quantity, 2)
        available_items.append(
            ReorderItemPreview(
                product_id=product.id,
                sku=product.sku,
                product_name=product.name,
                unit_id=item.unit_id,
                unit_name=unit_name,
                quantity=item.quantity,
                old_unit_price=float(item.unit_price or 0.0),
                new_unit_price=new_price,
                floor_price=floor_price,
                price_list_id=price_list_id,
                price_list_code=price_list_code,
                total_price=total_line,
                is_active=True,
            )
        )

    has_discontinued = len(discontinued_items) > 0
    warning_message = None
    if has_discontinued:
        disc_names = ", ".join([f"'{d.product_name}' ({d.sku})" for d in discontinued_items])
        warning_message = (
            f"Có {len(discontinued_items)} mặt hàng đã ngừng kinh doanh và được tự động loại bỏ "
            f"khỏi đơn đặt lại: {disc_names}."
        )

    total_est = round(sum(it.total_price for it in available_items), 2)

    return ReorderPreviewResponse(
        order_id=order.id,
        order_code=order.order_code,
        customer_id=order.customer_id,
        customer_name=customer.name if customer else None,
        customer_group=customer_group,
        available_items=available_items,
        discontinued_items=discontinued_items,
        has_discontinued_items=has_discontinued,
        warning_message=warning_message,
        total_estimated_amount=total_est,
    )


@router.post("/reorder", status_code=status.HTTP_201_CREATED)
def create_reorder(
    payload: ReorderCreateRequest,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    """SCRUM-28: Tạo đơn hàng mới từ đơn hàng cũ (Reorder).
    
    Quy tắc nghiệp vụ:
    1. Kiểm tra đơn hàng gốc và đại lý.
    2. Chặn đặt hàng nếu đại lý đang bị khóa giao dịch (SCRUM-85).
    3. Tự động loại bỏ bất kỳ mặt hàng nào đã ngừng kinh doanh (is_active=False hoặc status != 'ACTIVE').
    4. Cập nhật đơn giá tất cả mặt hàng theo bảng giá hiện hành (PriceLists).
    5. Tính toán tổng tiền dựa trên giá mới và lưu đơn hàng mới vào bảng Orders và OrderItems.
    """
    orig_order = db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == payload.original_order_id)
    ).scalar_one_or_none()
    if not orig_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng gốc #{payload.original_order_id}!",
        )

    customer = db.get(Customer, orig_order.customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đại lý của đơn hàng gốc!",
        )

    # SCRUM-85: Chặn nếu đại lý bị khóa giao dịch
    if getattr(customer, "is_locked", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Đại lý '{customer.name}' ({customer.code}) đã bị khóa giao dịch, "
                f"không thể đặt lại đơn hàng! Lý do: {customer.lock_reason or 'Không xác định'}."
            ),
        )

    customer_group = customer.customer_group or "RETAIL"

    # Lọc các mặt hàng hợp lệ (còn kinh doanh) và tính giá mới theo bảng giá hiện hành
    final_items: List[dict[str, Any]] = []
    skipped_items: List[str] = []

    for req_item in payload.items:
        sku = req_item.sku.strip().upper()
        product = None
        if req_item.product_id:
            product = db.get(Product, req_item.product_id)
        if not product and sku:
            product = db.query(Product).filter(Product.sku == sku).first()

        # Kiểm tra ngừng kinh doanh
        if not product or (product.status or "").upper() != "ACTIVE" or getattr(product, "is_active", True) is False:
            skipped_items.append(sku)
            continue

        # Cập nhật giá theo bảng giá hiện hành
        effective = resolve_effective_price(db, product.sku, customer_group)
        if effective:
            new_price = float(effective["sale_price"])
            floor_price = float(effective["floor_price"])
            price_list_id = effective.get("price_list_id")
        else:
            new_price = float(product.base_price) if product.base_price is not None else 0.0
            floor_price = None
            price_list_id = None

        final_items.append({
            "product_id": product.id,
            "sku": product.sku,
            "product_name": product.name,
            "unit_id": req_item.unit_id,
            "quantity": req_item.quantity,
            "unit_price": new_price,
            "floor_price": floor_price,
            "price_list_id": price_list_id,
        })

    if not final_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không có mặt hàng hợp lệ nào để đặt lại đơn hàng. Tất cả mặt hàng được chọn đã ngừng kinh doanh hoặc không tồn tại.",
        )

    # Sinh mã đơn hàng mới
    date_str = datetime.now().strftime("%Y%m%d")
    count_today = db.query(func.count(Order.id)).scalar() or 0
    new_order_code = f"ORD-{date_str}-{count_today + 1:04d}"
    attempt = 1
    while db.query(Order).filter(Order.order_code == new_order_code).first() is not None:
        count_today += 1
        new_order_code = f"ORD-{date_str}-{count_today + 1:04d}"
        attempt += 1
        if attempt > 100:
            import uuid
            new_order_code = f"ORD-{date_str}-{uuid.uuid4().hex[:4].upper()}"
            break

    total_amount = round(sum(it["quantity"] * it["unit_price"] for it in final_items), 2)

    actor_id = None
    if user and user.username:
        actor_user = db.query(User).filter(User.username == user.username).first()
        if actor_user:
            actor_id = actor_user.id
    if actor_id is None:
        actor_id = orig_order.created_by_id

    new_order = Order(
        order_code=new_order_code,
        customer_id=customer.id,
        created_by_id=actor_id,
        status=OrderStatus.DRAFT,
        total_amount=total_amount,
        note=payload.note or f"Đặt lại từ đơn hàng #{orig_order.order_code}",
    )
    db.add(new_order)
    db.flush()

    for item_data in final_items:
        db.add(
            OrderItem(
                order_id=new_order.id,
                product_id=item_data["product_id"],
                sku=item_data["sku"],
                product_name=item_data["product_name"],
                unit_id=item_data["unit_id"],
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
                floor_price=item_data["floor_price"],
                price_list_id=item_data["price_list_id"],
            )
        )

    db.commit()
    db.refresh(new_order)

    warning_msg = None
    if skipped_items:
        warning_msg = f"Các sản phẩm đã ngừng kinh doanh được tự động bỏ qua: {', '.join(skipped_items)}."

    order_status_str = new_order.status.value if hasattr(new_order.status, "value") else str(new_order.status)
    data_dict = {
        "id": new_order.id,
        "order_id": new_order.id,
        "order_code": new_order.order_code,
        "customer_id": new_order.customer_id,
        "customer_name": customer.name,
        "status": order_status_str,
        "total_amount": new_order.total_amount,
        "items_count": len(final_items),
        "original_order_id": orig_order.id,
        "original_order_code": orig_order.order_code,
        "warning_message": warning_msg,
    }

    return {
        "success": True,
        "code": 201,
        "message": f"Đặt lại đơn hàng thành công từ đơn #{orig_order.order_code}!",
        "order_id": new_order.id,
        "order_code": new_order.order_code,
        "customer_id": new_order.customer_id,
        "customer_name": customer.name,
        "status": order_status_str,
        "total_amount": new_order.total_amount,
        "items_count": len(final_items),
        "original_order_id": orig_order.id,
        "original_order_code": orig_order.order_code,
        "warning_message": warning_msg,
        "data": data_dict,
    }


@router.get("/{order_id}")
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    """Lấy thông tin chi tiết một đơn hàng theo order_id."""
    order = db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{order_id}!",
        )

    customer = db.get(Customer, order.customer_id)
    return {
        "success": True,
        "code": 200,
        "data": {
            "id": order.id,
            "order_id": order.id,
            "order_code": order.order_code,
            "customer_id": order.customer_id,
            "customer_name": customer.name if customer else None,
            "customer_code": customer.code if customer else None,
            "status": order.status.value if hasattr(order.status, "value") else str(order.status),
            "total_amount": order.total_amount,
            "note": order.note,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "items": [
                {
                    "id": it.id,
                    "product_id": it.product_id,
                    "sku": it.sku,
                    "product_name": it.product_name,
                    "unit_id": it.unit_id,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "floor_price": it.floor_price,
                    "price_list_id": it.price_list_id,
                    "total_price": round(it.quantity * it.unit_price, 2),
                }
                for it in order.items
            ],
        },
    }
