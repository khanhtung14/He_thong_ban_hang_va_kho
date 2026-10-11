"""Customer and Order endpoints for SCRUM-85:
Khóa hoặc mở giao dịch với đại lý cho Kế toán công nợ.

Yêu cầu nghiệp vụ:
1. Thêm trường is_locked (Boolean) và lock_reason (String) vào đại lý.
2. API cho phép kế toán khóa đại lý (bắt buộc nhập lý do) và mở khóa đại lý.
3. Chặn tạo đơn hàng mới khi đại lý đang bị khóa (is_locked == True) và báo lỗi.
4. Cảnh báo đối với các đơn hàng dở dang (DRAFT, PENDING, PROCESSING) của đại lý đang bị khóa.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import selectinload
from sqlalchemy import func, select
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import Customer, Order, OrderItem, OrderStatus, User
    from app.api.v1.endpoints.price_lists import CustomerGroup, resolve_effective_price
    from app.api.v1.endpoints.rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        require_permissions,
        require_roles,
    )
except ImportError:  # pragma: no cover
    from app.core.database import get_db
    from app.models.models import Customer, Order, OrderItem, OrderStatus, User
    from app.api.v1.endpoints.price_lists import CustomerGroup, resolve_effective_price
    from app.api.v1.endpoints.rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        require_permissions,
        require_roles,
    )

from app.api.v1.endpoints.products import MOCK_PRODUCTS

router = APIRouter(prefix="/api/v1", tags=["Customers & Orders (SCRUM-85)"])


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class CustomerLockRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255, description="Lý do khóa đại lý (bắt buộc)")


class CustomerResponse(BaseModel):
    id: int
    code: str
    name: str
    sales_rep_id: Optional[int] = None
    territory_id: Optional[int] = None
    customer_group: str = "RETAIL"
    is_active: bool
    is_locked: bool
    lock_reason: Optional[str] = None
    locked_at: Optional[datetime] = None
    locked_by_id: Optional[int] = None
    pending_orders_count: int = 0  # Số đơn hàng dở dang
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=150)
    sales_rep_id: Optional[int] = None
    territory_id: Optional[int] = None
    customer_group: CustomerGroup = CustomerGroup.RETAIL


class CustomerPricingGroupRequest(BaseModel):
    customer_group: CustomerGroup


class OrderItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    product_name: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(default=1, gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)


class OrderCreateRequest(BaseModel):
    customer_id: int = Field(..., description="ID của đại lý đặt hàng")
    items: List[OrderItemCreate] = Field(default_factory=list, min_length=1, description="Danh sách sản phẩm trong đơn")
    note: Optional[str] = None


class OrderItemResponse(BaseModel):
    id: int
    sku: str
    product_name: str
    quantity: int
    unit_price: float
    floor_price: Optional[int] = None
    price_list_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    order_code: str
    customer_id: int
    customer_name: Optional[str] = None
    status: OrderStatus
    total_amount: float
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    
    # SCRUM-85 Warning fields
    has_warning: bool = False
    warning_message: Optional[str] = None
    approval_reason: Optional[str] = None
    items: List[OrderItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

INCOMPLETE_STATUSES = {OrderStatus.DRAFT, OrderStatus.PENDING_APPROVAL, OrderStatus.PROCESSING, OrderStatus.PROCESSING}


def _check_and_build_warning(order: Order, customer: Optional[Customer]) -> tuple[bool, Optional[str]]:
    """Kiểm tra và trả về cờ cảnh báo nếu đơn hàng đang dở dang và đại lý bị khóa."""
    if customer and customer.is_locked and order.status in INCOMPLETE_STATUSES:
        return (
            True,
            f"CẢNH BÁO: Đại lý '{customer.name}' ({customer.code}) hiện đang bị KHÓA GIAO DỊCH! "
            f"Lý do: {customer.lock_reason or 'Không có lý do'}. Cần lưu ý khi tiếp tục xử lý đơn dở dang này."
        )
    return (False, None)


# ---------------------------------------------------------
# Customer Endpoints (SCRUM-85)
# ---------------------------------------------------------

@router.get("/customers", response_model=List[CustomerResponse])
def list_customers(
    is_locked: Optional[bool] = Query(None, description="Lọc theo trạng thái khóa"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã hoặc tên"),
    db: Session = Depends(get_db),
):
    """Lấy danh sách đại lý cùng trạng thái khóa và số lượng đơn dở dang."""
    query = select(Customer)
    if is_locked is not None:
        query = query.where(Customer.is_locked == is_locked)
    if search:
        kw = f"%{search.strip()}%"
        query = query.where((Customer.code.ilike(kw)) | (Customer.name.ilike(kw)))

    customers = db.execute(query.order_by(Customer.id.asc())).scalars().all()
    results = []
    for c in customers:
        pending_count = (
            db.query(func.count(Order.id))
            .filter(Order.customer_id == c.id, Order.status.in_(INCOMPLETE_STATUSES))
            .scalar()
            or 0
        )
        res = CustomerResponse.model_validate(c)
        res.pending_orders_count = pending_count
        results.append(res)

    return results


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreateRequest,
    db: Session = Depends(get_db),
):
    """Tạo mới đại lý."""
    existing = db.execute(select(Customer).where(Customer.code == payload.code.strip())).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Mã đại lý đã tồn tại!")

    customer = Customer(
        code=payload.code.strip(),
        name=payload.name.strip(),
        sales_rep_id=payload.sales_rep_id,
        territory_id=payload.territory_id,
        customer_group=payload.customer_group.value,
        is_active=True,
        is_locked=False,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = 0
    return res


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Lấy thông tin chi tiết một đại lý."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


@router.patch("/customers/{customer_id}/pricing-group", response_model=CustomerResponse)
def update_customer_pricing_group(
    customer_id: int,
    payload: CustomerPricingGroupRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")
    customer.customer_group = payload.customer_group.value
    db.commit()
    db.refresh(customer)
    pending_count = db.query(func.count(Order.id)).filter(
        Order.customer_id == customer.id,
        Order.status.in_(INCOMPLETE_STATUSES),
    ).scalar() or 0
    response = CustomerResponse.model_validate(customer)
    response.pending_orders_count = pending_count
    return response


@router.post("/customers/{customer_id}/lock", response_model=CustomerResponse)
def lock_customer(
    customer_id: int,
    payload: CustomerLockRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Khóa giao dịch với đại lý (SCRUM-85).
    
    Yêu cầu nghiệp vụ:
    - Kế toán công nợ / Quản trị viên thực hiện.
    - BẮT BUỘC nhập lý do khóa (`reason` không được để trống).
    - Đại lý sau khi bị khóa sẽ không được phép tạo bất kỳ đơn hàng mới nào.
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do khóa đại lý!",
        )

    # Tìm user record thực tế nếu có
    actor_user = db.query(User).filter(User.username == user.username).first()

    customer.is_locked = True
    customer.lock_reason = clean_reason
    customer.locked_at = datetime.now(timezone.utc)
    customer.locked_by_id = actor_user.id if actor_user else None

    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


@router.post("/customers/{customer_id}/unlock", response_model=CustomerResponse)
def unlock_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Mở khóa giao dịch với đại lý (SCRUM-85)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    customer.is_locked = False
    customer.lock_reason = None
    customer.locked_at = None
    customer.locked_by_id = None

    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


# ---------------------------------------------------------
# Order Endpoints (SCRUM-85)
# ---------------------------------------------------------

@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Tạo mới đơn hàng (SCRUM-85).
    
    Quy tắc nghiệp vụ:
    - Kiểm tra xem đại lý có tồn tại và đang bị khóa hay không.
    - NẾU ĐẠI LÝ BỊ KHÓA (`is_locked == True`):
      -> CHẶN TẠO ĐƠN NGAY LẬP TỨC!
      -> Trả về HTTP 400 Bad Request kèm lý do khóa chi tiết.
    """
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý tương ứng!")

    # SCRUM-85 Validation Check: Chặn đại lý bị khóa
    if customer.is_locked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Đại lý '{customer.name}' ({customer.code}) đã bị khóa giao dịch, "
                f"không thể tạo đơn hàng mới! Lý do: {customer.lock_reason or 'Không xác định'}."
            ),
        )

    # Sinh mã đơn tự động
    count_today = db.query(func.count(Order.id)).scalar() or 0
    order_code = f"ORD-{datetime.now().strftime('%Y%m%d')}-{count_today + 1:04d}"

    is_customer_account = user.role.strip().lower() in {"customer", "đại lý"}
    resolved_items: list[dict[str, Any]] = []
    approval_lines: list[str] = []
    for requested in payload.items:
        sku = requested.sku.strip().upper()
        product = MOCK_PRODUCTS.get(sku)
        effective = resolve_effective_price(db, sku, customer.customer_group)
        if effective is None and customer.customer_group in {
            CustomerGroup.LEVEL_1.value,
            CustomerGroup.LEVEL_2.value,
        }:
            raise HTTPException(
                status_code=409,
                detail=f"Chưa có bảng giá đang hiệu lực cho {customer.customer_group} và SKU {sku}.",
            )
        if effective is None and product is None:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy SKU {sku} trong danh mục sản phẩm.")

        base_price = effective["sale_price"] if effective else product["sale_price"]
        floor_price = effective["floor_price"] if effective else None
        actual_price = base_price if is_customer_account or requested.unit_price is None else requested.unit_price
        if floor_price is not None and actual_price < floor_price:
            approval_lines.append(f"{sku}: {actual_price} dưới giá sàn {floor_price}")
        resolved_items.append({
            "sku": sku,
            "product_name": requested.product_name,
            "quantity": requested.quantity,
            "unit_price": actual_price,
            "floor_price": floor_price,
            "price_list_id": effective["price_list_id"] if effective else None,
        })

    total_amount = sum(item["quantity"] * item["unit_price"] for item in resolved_items)

    actor_user = db.query(User).filter(User.username == user.username).first()

    new_order = Order(
        order_code=order_code,
        customer_id=customer.id,
        created_by_id=actor_user.id if actor_user else None,
        status=OrderStatus.PENDING if approval_lines else OrderStatus.DRAFT,
        total_amount=total_amount,
        note=payload.note,
        approval_reason="; ".join(approval_lines) if approval_lines else None,
    )
    db.add(new_order)
    db.flush()

    for it in resolved_items:
        db.add(OrderItem(
            order_id=new_order.id,
            sku=it["sku"],
            product_name=it["product_name"],
            quantity=it["quantity"],
            unit_price=it["unit_price"],
            floor_price=it["floor_price"],
            price_list_id=it["price_list_id"],
        ))

    db.commit()
    db.refresh(new_order)

    res = OrderResponse.model_validate(new_order)
    res.customer_name = customer.name
    res.has_warning = False
    res.warning_message = None
    return res


@router.get("/orders", response_model=List[OrderResponse])
def list_orders(
    customer_id: Optional[int] = None,
    order_status: Optional[OrderStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """Danh sách đơn hàng kèm cờ cảnh báo nếu đại lý đang bị khóa (SCRUM-85)."""
    query = select(Order)
    if customer_id:
        query = query.where(Order.customer_id == customer_id)
    if order_status:
        query = query.where(Order.status == order_status)

    orders = db.execute(query.order_by(Order.id.desc())).scalars().all()
    results = []
    for ord in orders:
        cust = db.get(Customer, ord.customer_id)
        has_warn, warn_msg = _check_and_build_warning(ord, cust)

        resp = OrderResponse.model_validate(ord)
        resp.customer_name = cust.name if cust else None
        resp.has_warning = has_warn
        resp.warning_message = warn_msg
        results.append(resp)

    return results


@router.get("/orders/pending-approval", response_model=List[OrderResponse])
def list_orders_pending_approval(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    orders = db.execute(
        select(Order).options(selectinload(Order.items))
        .where(Order.status.in_([OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL]), Order.approval_reason.is_not(None))
        .order_by(Order.id.desc())
    ).scalars().all()
    results = []
    for order in orders:
        customer = db.get(Customer, order.customer_id)
        response = OrderResponse.model_validate(order)
        response.customer_name = customer.name if customer else None
        results.append(response)
    return results


@router.post("/orders/{order_id}/approve", response_model=OrderResponse)
def approve_below_floor_order(
    order_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    order = db.execute(select(Order).options(selectinload(Order.items)).where(Order.id == order_id)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng.")
    if order.status not in (OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL) or not order.approval_reason:
        raise HTTPException(status_code=409, detail="Đơn hàng không ở trạng thái chờ duyệt giá sàn.")
    order.status = OrderStatus.APPROVED
    db.commit()
    customer = db.get(Customer, order.customer_id)
    response = OrderResponse.model_validate(order)
    response.customer_name = customer.name if customer else None
    return response


class RejectOrderRequest(BaseModel):
    reason: str = Field(default="Không được phê duyệt", max_length=500)


@router.post("/orders/{order_id}/reject", response_model=OrderResponse)
def reject_below_floor_order(
    order_id: int,
    payload: RejectOrderRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    order = db.execute(select(Order).options(selectinload(Order.items)).where(Order.id == order_id)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng.")
    if order.status not in (OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL) or not order.approval_reason:
        raise HTTPException(status_code=409, detail="Đơn hàng không ở trạng thái chờ duyệt giá sàn.")
    order.status = OrderStatus.CANCELLED
    order.approval_reason = f"{order.approval_reason}; Từ chối: {payload.reason.strip()}"
    db.commit()
    customer = db.get(Customer, order.customer_id)
    response = OrderResponse.model_validate(order)
    response.customer_name = customer.name if customer else None
    return response


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order_detail(order_id: int, db: Session = Depends(get_db)):
    """Xem chi tiết đơn hàng kèm cảnh báo nếu đại lý đang bị khóa (SCRUM-85)."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    customer = db.get(Customer, order.customer_id)
    has_warn, warn_msg = _check_and_build_warning(order, customer)

    resp = OrderResponse.model_validate(order)
    resp.customer_name = customer.name if customer else None
    resp.has_warning = has_warn
    resp.warning_message = warn_msg
    return resp


@router.put("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    new_status: OrderStatus,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Cập nhật trạng thái đơn hàng dở dang.
    
    Theo SCRUM-85: Đơn đang dở của đại lý bị khóa VẪN XỬ LÝ TIẾP ĐƯỢC nhưng có cảnh báo.
    """
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    order.status = new_status
    db.commit()
    db.refresh(order)

    customer = db.get(Customer, order.customer_id)
    has_warn, warn_msg = _check_and_build_warning(order, customer)

    resp = OrderResponse.model_validate(order)
    resp.customer_name = customer.name if customer else None
    resp.has_warning = has_warn
    resp.warning_message = warn_msg
    return resp
