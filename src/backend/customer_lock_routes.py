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
from sqlalchemy import func, select
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import Customer, Order, OrderItem, OrderStatus, User
    from src.backend.rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        require_permissions,
    )
except ImportError:  # pragma: no cover
    from database import get_db
    from models import Customer, Order, OrderItem, OrderStatus, User
    from rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        require_permissions,
    )

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


class OrderItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    product_name: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(default=1, gt=0)
    unit_price: float = Field(default=0.0, ge=0)


class OrderCreateRequest(BaseModel):
    customer_id: int = Field(..., description="ID của đại lý đặt hàng")
    items: List[OrderItemCreate] = Field(default_factory=list, description="Danh sách sản phẩm trong đơn")
    note: Optional[str] = None


class OrderItemResponse(BaseModel):
    id: int
    sku: str
    product_name: str
    quantity: int
    unit_price: float

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
    items: List[OrderItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

INCOMPLETE_STATUSES = {OrderStatus.DRAFT, OrderStatus.PENDING, OrderStatus.PROCESSING}


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

    total_amount = sum(item.quantity * item.unit_price for item in payload.items)

    actor_user = db.query(User).filter(User.username == user.username).first()

    new_order = Order(
        order_code=order_code,
        customer_id=customer.id,
        created_by_id=actor_user.id if actor_user else None,
        status=OrderStatus.DRAFT,
        total_amount=total_amount,
        note=payload.note,
    )
    db.add(new_order)
    db.flush()

    for it in payload.items:
        db.add(OrderItem(
            order_id=new_order.id,
            sku=it.sku,
            product_name=it.product_name,
            quantity=it.quantity,
            unit_price=it.unit_price,
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
