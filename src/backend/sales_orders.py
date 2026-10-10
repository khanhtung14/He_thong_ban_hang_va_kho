"""Sales representative catalog and persistent order-draft APIs."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import inspect, or_, select, text
from sqlalchemy.orm import Session, selectinload

try:
    from src.backend.database import engine, get_db
    from src.backend.models import (
        AccountStatus,
        Base,
        CatalogProduct,
        CatalogProductUnit,
        Customer,
        CustomerDeliveryPoint,
        Order,
        OrderItem,
        OrderStatus,
        User,
    )
    from src.backend.rbac import AuthenticatedUser, require_roles
except ImportError:  # pragma: no cover - direct script execution
    from database import engine, get_db
    from models import (
        AccountStatus,
        Base,
        CatalogProduct,
        CatalogProductUnit,
        Customer,
        CustomerDeliveryPoint,
        Order,
        OrderItem,
        OrderStatus,
        User,
    )
    from rbac import AuthenticatedUser, require_roles


router = APIRouter(prefix="/api/v1/sales-orders", tags=["Sales Order Drafts"])
MONEY = Decimal("0.01")


class DraftItemInput(BaseModel):
    product_id: int = Field(gt=0)
    unit_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=1_000_000)


class DraftInput(BaseModel):
    customer_id: int = Field(gt=0)
    delivery_point_id: int = Field(gt=0)
    desired_delivery_date: date
    note: Optional[str] = Field(default=None, max_length=2000)
    items: list[DraftItemInput] = Field(default_factory=list, max_length=100)


class SalesCustomerView(BaseModel):
    id: int
    code: str
    name: str
    is_locked: bool
    lock_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DeliveryPointView(BaseModel):
    id: int
    customer_id: int
    name: str
    address: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    is_default: bool

    model_config = ConfigDict(from_attributes=True)


class ProductUnitView(BaseModel):
    id: int
    unit_code: str
    unit_name: str
    conversion_factor: float
    is_base_unit: bool


class SalesProductView(BaseModel):
    id: int
    sku: str
    name: str
    sale_price: float
    discount_percent: float
    units: list[ProductUnitView]


class DraftItemView(BaseModel):
    id: int
    product_id: Optional[int] = None
    sku: str
    product_name: str
    unit_id: Optional[int] = None
    unit_code: Optional[str] = None
    unit_name: Optional[str] = None
    conversion_factor: float
    quantity: int
    unit_price: float
    discount_percent: float
    line_subtotal: float
    discount_amount: float
    line_total: float


class DraftView(BaseModel):
    id: int
    order_code: str
    customer_id: int
    customer_name: str
    delivery_point_id: Optional[int] = None
    delivery_point_name: Optional[str] = None
    delivery_address: Optional[str] = None
    desired_delivery_date: Optional[date] = None
    status: OrderStatus
    subtotal_amount: float
    discount_amount: float
    total_amount: float
    note: Optional[str] = None
    updated_at: Optional[datetime] = None
    items: list[DraftItemView]

    model_config = ConfigDict(from_attributes=True)


def migrate_sales_order_schema() -> None:
    """Create missing OMS tables and add draft fields to existing order tables."""
    Base.metadata.create_all(bind=engine)
    additions = {
        "orders": {
            "delivery_point_id": "INTEGER NULL",
            "desired_delivery_date": "DATE NULL",
            "subtotal_amount": "NUMERIC(14, 2) NOT NULL DEFAULT 0",
            "discount_amount": "NUMERIC(14, 2) NOT NULL DEFAULT 0",
        },
        "order_items": {
            "product_id": "INTEGER NULL",
            "unit_id": "INTEGER NULL",
            "unit_code": "VARCHAR(40) NULL",
            "unit_name": "VARCHAR(100) NULL",
            "conversion_factor": "NUMERIC(14, 4) NOT NULL DEFAULT 1",
            "discount_percent": "NUMERIC(5, 2) NOT NULL DEFAULT 0",
            "line_subtotal": "NUMERIC(14, 2) NOT NULL DEFAULT 0",
            "discount_amount": "NUMERIC(14, 2) NOT NULL DEFAULT 0",
            "line_total": "NUMERIC(14, 2) NOT NULL DEFAULT 0",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, columns in additions.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
                    )


def _sales_account(db: Session, actor: AuthenticatedUser) -> User:
    account = db.query(User).options(selectinload(User.territories)).filter(
        User.username == actor.username,
        User.is_active.is_(True),
        User.status == AccountStatus.ACTIVE,
    ).first()
    if account is None:
        raise HTTPException(status_code=403, detail="Không tìm thấy hồ sơ nhân viên kinh doanh đang hoạt động.")
    return account


def _assigned_customer_query(db: Session, account: User):
    territory_ids = [territory.id for territory in account.territories]
    assignment_filter = Customer.sales_rep_id == account.id
    if territory_ids:
        assignment_filter = or_(assignment_filter, Customer.territory_id.in_(territory_ids))
    return db.query(Customer).filter(Customer.is_active.is_(True), assignment_filter)


def _require_assigned_customer(db: Session, account: User, customer_id: int) -> Customer:
    customer = _assigned_customer_query(db, account).filter(Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý trong phạm vi được giao.")
    return customer


def _draft_view(order: Order) -> DraftView:
    customer = order.customer
    point = order.delivery_point
    rows = [
        DraftItemView(
            id=item.id,
            product_id=item.product_id,
            sku=item.sku,
            product_name=item.product_name,
            unit_id=item.unit_id,
            unit_code=item.unit_code,
            unit_name=item.unit_name,
            conversion_factor=float(item.conversion_factor),
            quantity=item.quantity,
            unit_price=float(Decimal(item.unit_price).quantize(MONEY)),
            discount_percent=float(Decimal(item.discount_percent)),
            line_subtotal=float(Decimal(item.line_subtotal).quantize(MONEY)),
            discount_amount=float(Decimal(item.discount_amount).quantize(MONEY)),
            line_total=float(Decimal(item.line_total).quantize(MONEY)),
        )
        for item in order.items
    ]
    return DraftView(
        id=order.id,
        order_code=order.order_code,
        customer_id=order.customer_id,
        customer_name=customer.name,
        delivery_point_id=order.delivery_point_id,
        delivery_point_name=point.name if point else None,
        delivery_address=point.address if point else None,
        desired_delivery_date=order.desired_delivery_date,
        status=order.status,
        subtotal_amount=float(Decimal(order.subtotal_amount).quantize(MONEY)),
        discount_amount=float(Decimal(order.discount_amount).quantize(MONEY)),
        total_amount=float(Decimal(str(order.total_amount)).quantize(MONEY)),
        note=order.note,
        updated_at=order.updated_at,
        items=rows,
    )


def _load_owned_draft(db: Session, account: User, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.delivery_point),
            selectinload(Order.items).selectinload(OrderItem.unit),
        )
        .filter(
            Order.id == order_id,
            Order.created_by_id == account.id,
            Order.status == OrderStatus.DRAFT,
            Order.delivery_point_id.is_not(None),
            Order.desired_delivery_date.is_not(None),
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn nháp trong phạm vi của bạn.")
    return order


def _validate_delivery_point(
    db: Session, customer_id: int, delivery_point_id: int
) -> CustomerDeliveryPoint:
    point = db.query(CustomerDeliveryPoint).filter(
        CustomerDeliveryPoint.id == delivery_point_id,
        CustomerDeliveryPoint.customer_id == customer_id,
        CustomerDeliveryPoint.is_active.is_(True),
    ).first()
    if point is None:
        raise HTTPException(status_code=400, detail="Điểm giao không thuộc đại lý hoặc đã ngừng hoạt động.")
    return point


def _build_items(db: Session, requested: list[DraftItemInput]) -> tuple[list[OrderItem], Decimal, Decimal]:
    product_ids = {row.product_id for row in requested}
    products = {
        product.id: product
        for product in db.query(CatalogProduct)
        .options(selectinload(CatalogProduct.units))
        .filter(CatalogProduct.id.in_(product_ids), CatalogProduct.is_active.is_(True))
        .all()
    } if product_ids else {}
    unit_ids = {row.unit_id for row in requested}
    units = {
        unit.id: unit
        for unit in db.query(CatalogProductUnit)
        .filter(CatalogProductUnit.id.in_(unit_ids), CatalogProductUnit.is_active.is_(True))
        .all()
    } if unit_ids else {}

    result: list[OrderItem] = []
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    for row in requested:
        product = products.get(row.product_id)
        unit = units.get(row.unit_id)
        if product is None or unit is None or unit.product_id != row.product_id:
            raise HTTPException(status_code=400, detail="Sản phẩm hoặc đơn vị tính không hợp lệ/đã ngừng bán.")
        base_units = [candidate for candidate in product.units if candidate.is_active and candidate.is_base_unit]
        if len(base_units) != 1 or Decimal(base_units[0].conversion_factor) != Decimal("1"):
            raise HTTPException(status_code=400, detail="Sản phẩm chưa có đúng một đơn vị gốc hợp lệ.")
        factor = Decimal(unit.conversion_factor)
        price = (Decimal(product.sale_price) * factor).quantize(MONEY, rounding=ROUND_HALF_UP)
        line_subtotal = (price * row.quantity).quantize(MONEY, rounding=ROUND_HALF_UP)
        discount_percent = Decimal(product.discount_percent)
        line_discount = (line_subtotal * discount_percent / Decimal("100")).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        line_total = line_subtotal - line_discount
        result.append(OrderItem(
            sku=product.sku,
            product_name=product.name,
            quantity=row.quantity,
            unit_price=price,
            unit_id=unit.id,
            product_id=product.id,
            unit_code=unit.unit_code,
            unit_name=unit.unit_name,
            conversion_factor=factor,
            discount_percent=discount_percent,
            line_subtotal=line_subtotal,
            discount_amount=line_discount,
            line_total=line_total,
        ))
        subtotal += line_subtotal
        discount_total += line_discount
    return result, subtotal.quantize(MONEY), discount_total.quantize(MONEY)


def _save_draft(db: Session, account: User, payload: DraftInput, order: Optional[Order] = None) -> Order:
    customer = _require_assigned_customer(db, account, payload.customer_id)
    if customer.is_locked and order is None:
        raise HTTPException(status_code=400, detail="Đại lý đang bị khóa giao dịch, không thể tạo đơn mới.")
    point = _validate_delivery_point(db, customer.id, payload.delivery_point_id)
    items, subtotal, discount = _build_items(db, payload.items)

    if order is None:
        order = Order(
            order_code=f"ORD-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}",
            customer_id=customer.id,
            created_by_id=account.id,
            status=OrderStatus.DRAFT,
        )
        db.add(order)
    else:
        order.customer_id = customer.id
        order.items.clear()

    order.delivery_point_id = point.id
    order.desired_delivery_date = payload.desired_delivery_date
    order.note = payload.note.strip() if payload.note else None
    order.subtotal_amount = subtotal
    order.discount_amount = discount
    order.total_amount = float(subtotal - discount)
    order.items.extend(items)
    db.commit()
    return _load_owned_draft(db, account, order.id)


@router.get("/customers", response_model=list[SalesCustomerView])
def list_assigned_customers(
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    customers = _assigned_customer_query(db, account).order_by(Customer.name).all()
    return [SalesCustomerView.model_validate(customer) for customer in customers]


@router.get("/delivery-points", response_model=list[DeliveryPointView])
def list_customer_delivery_points(
    customer_id: int = Query(gt=0),
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    _require_assigned_customer(db, account, customer_id)
    points = db.query(CustomerDeliveryPoint).filter(
        CustomerDeliveryPoint.customer_id == customer_id,
        CustomerDeliveryPoint.is_active.is_(True),
    ).order_by(CustomerDeliveryPoint.is_default.desc(), CustomerDeliveryPoint.name).all()
    return [DeliveryPointView.model_validate(point) for point in points]


@router.get("/products", response_model=list[SalesProductView])
def search_sales_products(
    search: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    _actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    query = db.query(CatalogProduct).options(selectinload(CatalogProduct.units)).filter(
        CatalogProduct.is_active.is_(True)
    )
    keyword = search.strip()
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(or_(CatalogProduct.sku.ilike(pattern), CatalogProduct.name.ilike(pattern)))
    products = query.order_by(CatalogProduct.sku).limit(50).all()
    return [SalesProductView(
        id=product.id,
        sku=product.sku,
        name=product.name,
        sale_price=float(product.sale_price),
        discount_percent=float(product.discount_percent),
        units=[ProductUnitView(
            id=unit.id,
            unit_code=unit.unit_code,
            unit_name=unit.unit_name,
            conversion_factor=float(unit.conversion_factor),
            is_base_unit=unit.is_base_unit,
        ) for unit in product.units if unit.is_active]
        if sum(unit.is_active and unit.is_base_unit for unit in product.units) == 1
        else [],
    ) for product in products]


@router.get("/drafts", response_model=list[DraftView])
def list_sales_drafts(
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    drafts = db.query(Order).options(
        selectinload(Order.customer),
        selectinload(Order.delivery_point),
        selectinload(Order.items).selectinload(OrderItem.unit),
    ).filter(
        Order.created_by_id == account.id,
        Order.status == OrderStatus.DRAFT,
        Order.delivery_point_id.is_not(None),
        Order.desired_delivery_date.is_not(None),
    ).order_by(Order.updated_at.desc(), Order.id.desc()).all()
    return [_draft_view(order) for order in drafts]


@router.post("/drafts", response_model=DraftView, status_code=status.HTTP_201_CREATED)
def create_sales_draft(
    payload: DraftInput,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    order = _save_draft(db, account, payload)
    return _draft_view(order)


@router.get("/drafts/{order_id}", response_model=DraftView)
def get_sales_draft(
    order_id: int,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    return _draft_view(_load_owned_draft(db, account, order_id))


@router.put("/drafts/{order_id}", response_model=DraftView)
def update_sales_draft(
    order_id: int,
    payload: DraftInput,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    order = _load_owned_draft(db, account, order_id)
    return _draft_view(_save_draft(db, account, payload, order))