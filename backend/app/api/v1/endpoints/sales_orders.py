"""Sales representative APIs for creating and resuming order drafts."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.models import (
    AccountStatus,
    Customer,
    DeliveryAddress,
    DiscountPolicy,
    DiscountTier,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductUnit,
    Territory,
    User,
)
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles


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


class DeliveryPointView(BaseModel):
    id: int
    customer_id: int
    name: str
    address: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    is_default: bool


class ProductUnitView(BaseModel):
    id: int
    unit_code: str
    unit_name: str
    conversion_factor: float
    is_base_unit: bool


class DiscountTierView(BaseModel):
    minimum_quantity: int
    discount_percent: float


class SalesProductView(BaseModel):
    id: int
    sku: str
    name: str
    sale_price: float
    discount_percent: float
    discount_tiers: list[DiscountTierView]
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


def _sales_account(db: Session, actor: AuthenticatedUser) -> User:
    account = (
        db.query(User)
        .options(selectinload(User.territories))
        .filter(
            User.username == actor.username,
            User.is_active.is_(True),
            User.status == AccountStatus.ACTIVE,
        )
        .first()
    )
    if account is None:
        raise HTTPException(status_code=403, detail="Tài khoản nhân viên kinh doanh không hoạt động.")
    return account


def _assigned_customers(db: Session, account: User):
    territory_ids = [territory.id for territory in account.territories]
    assignment = Customer.sales_rep_id == account.id
    if territory_ids:
        assignment = or_(assignment, Customer.territory_id.in_(territory_ids))
    return db.query(Customer).filter(Customer.is_active.is_(True), assignment)


def _require_customer(db: Session, account: User, customer_id: int) -> Customer:
    customer = _assigned_customers(db, account).filter(Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý trong phạm vi được giao.")
    return customer


def _discount_tiers(db: Session, product: Product) -> list[DiscountTier]:
    targets = [
        and_(
            or_(DiscountPolicy.target_type == "PRODUCT", DiscountPolicy.target_type == "SKU"),
            or_(DiscountPolicy.target_id == str(product.id), DiscountPolicy.target_id == product.sku),
        )
    ]
    if product.category_id is not None:
        targets.append(
            and_(
                DiscountPolicy.target_type == "CATEGORY",
                DiscountPolicy.target_id == str(product.category_id),
            )
        )
    policy_ids = select(DiscountPolicy.id).where(or_(*targets))
    return (
        db.query(DiscountTier)
        .filter(DiscountTier.policy_id.in_(policy_ids))
        .order_by(DiscountTier.min_quantity)
        .all()
    )


def _discount_for_quantity(tiers: list[DiscountTier], quantity: int) -> Decimal:
    eligible = [tier for tier in tiers if tier.min_qty <= quantity]
    return Decimal(str(max(eligible, key=lambda tier: tier.min_qty).discount_percent)) if eligible else Decimal("0")


def _money(value: float | Decimal) -> float:
    return float(Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP))


def _draft_view(db: Session, order: Order) -> DraftView:
    point = (
        db.get(DeliveryAddress, order.delivery_address_id)
        if order.delivery_address_id is not None
        else None
    )
    return DraftView(
        id=order.id,
        order_code=order.order_code,
        customer_id=order.customer_id,
        customer_name=order.customer.name,
        delivery_point_id=order.delivery_address_id,
        delivery_point_name=point.receiver_name if point else None,
        delivery_address=point.address if point else None,
        desired_delivery_date=order.desired_delivery_date,
        status=order.status,
        subtotal_amount=_money(order.subtotal_amount),
        discount_amount=_money(order.discount_amount),
        total_amount=_money(order.total_amount),
        note=order.note,
        updated_at=order.updated_at,
        items=[
            DraftItemView(
                id=item.id,
                product_id=item.product_id,
                sku=item.sku or "",
                product_name=item.product_name or "",
                unit_id=item.unit_id,
                unit_code=item.unit_name,
                unit_name=item.unit_name,
                conversion_factor=item.conversion_factor,
                quantity=item.quantity,
                unit_price=_money(item.unit_price),
                discount_percent=item.discount_percent,
                line_subtotal=_money(item.line_subtotal),
                discount_amount=_money(item.discount_amount),
                line_total=_money(item.line_total),
            )
            for item in order.items
        ],
    )


def _load_owned_draft(db: Session, account: User, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(selectinload(Order.customer), selectinload(Order.items))
        .filter(
            Order.id == order_id,
            Order.created_by_id == account.id,
            Order.status == OrderStatus.DRAFT,
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn nháp trong phạm vi của bạn.")
    return order


def _delivery_point(db: Session, customer_id: int, point_id: int) -> DeliveryAddress:
    point = db.query(DeliveryAddress).filter(
        DeliveryAddress.id == point_id,
        DeliveryAddress.customer_id == customer_id,
    ).first()
    if point is None:
        raise HTTPException(status_code=400, detail="Điểm giao không thuộc đại lý.")
    return point


def _build_items(
    db: Session, requested: list[DraftItemInput]
) -> tuple[list[OrderItem], Decimal, Decimal]:
    product_ids = {row.product_id for row in requested}
    products = {
        product.id: product
        for product in db.query(Product)
        .options(selectinload(Product.units))
        .filter(Product.id.in_(product_ids), Product.status == "ACTIVE")
        .all()
    } if product_ids else {}
    unit_ids = {row.unit_id for row in requested}
    units = {
        unit.id: unit
        for unit in db.query(ProductUnit).filter(ProductUnit.id.in_(unit_ids)).all()
    } if unit_ids else {}

    items: list[OrderItem] = []
    subtotal = Decimal("0")
    discounts = Decimal("0")
    for row in requested:
        product = products.get(row.product_id)
        unit = units.get(row.unit_id)
        if product is None or unit is None or unit.product_id != row.product_id:
            raise HTTPException(status_code=400, detail="Sản phẩm hoặc đơn vị tính không hợp lệ.")
        factor = Decimal(str(unit.conversion_rate))
        price = (Decimal(str(product.base_price)) * factor).quantize(MONEY, rounding=ROUND_HALF_UP)
        line_subtotal = (price * row.quantity).quantize(MONEY, rounding=ROUND_HALF_UP)
        discount_percent = _discount_for_quantity(_discount_tiers(db, product), row.quantity)
        discount_amount = (line_subtotal * discount_percent / Decimal("100")).quantize(
            MONEY, rounding=ROUND_HALF_UP
        )
        line_total = line_subtotal - discount_amount
        items.append(
            OrderItem(
                product_id=product.id,
                sku=product.sku,
                product_name=product.name,
                unit_id=unit.id,
                unit_name=unit.unit_name,
                conversion_factor=float(factor),
                quantity=row.quantity,
                unit_price=float(price),
                discount_percent=float(discount_percent),
                line_subtotal=float(line_subtotal),
                discount_amount=float(discount_amount),
                line_total=float(line_total),
            )
        )
        subtotal += line_subtotal
        discounts += discount_amount
    return items, subtotal.quantize(MONEY), discounts.quantize(MONEY)


def _save_draft(
    db: Session, account: User, payload: DraftInput, order: Optional[Order] = None
) -> Order:
    customer = _require_customer(db, account, payload.customer_id)
    if customer.is_locked and order is None:
        raise HTTPException(status_code=400, detail="Đại lý đang bị khóa giao dịch, không thể tạo đơn mới.")
    point = _delivery_point(db, customer.id, payload.delivery_point_id)
    items, subtotal, discounts = _build_items(db, payload.items)
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
    order.delivery_address_id = point.id
    order.desired_delivery_date = payload.desired_delivery_date
    order.note = payload.note.strip() if payload.note else None
    order.subtotal_amount = float(subtotal)
    order.discount_amount = float(discounts)
    order.total_amount = float(subtotal - discounts)
    order.items.extend(items)
    db.commit()
    return _load_owned_draft(db, account, order.id)


@router.get("/customers", response_model=List[SalesCustomerView])
def list_assigned_customers(
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    return [
        SalesCustomerView(
            id=customer.id,
            code=customer.code,
            name=customer.name,
            is_locked=customer.is_locked,
            lock_reason=customer.lock_reason,
        )
        for customer in _assigned_customers(db, account).order_by(Customer.name).all()
    ]


@router.get("/delivery-points", response_model=List[DeliveryPointView])
def list_delivery_points(
    customer_id: int = Query(gt=0),
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    customer = _require_customer(db, account, customer_id)
    points = db.query(DeliveryAddress).filter(
        DeliveryAddress.customer_id == customer_id
    ).order_by(DeliveryAddress.is_default.desc(), DeliveryAddress.receiver_name).all()
    if not points:
        default_point = DeliveryAddress(
            customer_id=customer.id,
            receiver_name=customer.name or "Điểm giao chính",
            address=customer.address or f"Cửa hàng {customer.name}",
            phone=customer.phone,
            is_default=True,
        )
        db.add(default_point)
        db.commit()
        db.refresh(default_point)
        points = [default_point]
    return [
        DeliveryPointView(
            id=point.id,
            customer_id=point.customer_id,
            name=point.receiver_name,
            address=point.address,
            contact_name=point.receiver_name,
            contact_phone=point.phone,
            is_default=point.is_default,
        )
        for point in points
    ]


@router.get("/products", response_model=List[SalesProductView])
def search_sales_products(
    search: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    _actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    query = db.query(Product).options(selectinload(Product.units)).filter(Product.status == "ACTIVE")
    keyword = search.strip()
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(or_(Product.sku.ilike(pattern), Product.name.ilike(pattern)))
    products = query.order_by(Product.sku).limit(50).all()
    response = []
    for product in products:
        active_units = [unit for unit in product.units]
        if not active_units:
            base_unit_name = product.base_unit or "Cái"
            unit = ProductUnit(
                product_id=product.id,
                unit_name=base_unit_name,
                conversion_rate=1.0,
                is_base_unit=True,
            )
            db.add(unit)
            db.commit()
            db.refresh(unit)
            active_units = [unit]
        base_units = [unit for unit in active_units if unit.is_base_unit]
        units = active_units if len(base_units) == 1 and base_units[0].conversion_rate == 1 else active_units
        tiers = _discount_tiers(db, product)
        response.append(
            SalesProductView(
                id=product.id,
                sku=product.sku,
                name=product.name,
                sale_price=product.base_price,
                discount_percent=float(_discount_for_quantity(tiers, 1)),
                discount_tiers=[
                    DiscountTierView(
                        minimum_quantity=tier.min_qty,
                        discount_percent=tier.discount_percent,
                    )
                    for tier in tiers
                ],
                units=[
                    ProductUnitView(
                        id=unit.id,
                        unit_code=unit.unit_name,
                        unit_name=unit.unit_name,
                        conversion_factor=unit.conversion_rate,
                        is_base_unit=unit.is_base_unit,
                    )
                    for unit in units
                ],
            )
        )
    return response


@router.get("/drafts", response_model=List[DraftView])
def list_sales_drafts(
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    drafts = (
        db.query(Order)
        .options(selectinload(Order.customer), selectinload(Order.items))
        .filter(
            Order.created_by_id == account.id,
            Order.status == OrderStatus.DRAFT,
            Order.delivery_address_id.is_not(None),
            Order.desired_delivery_date.is_not(None),
        )
        .order_by(Order.updated_at.desc(), Order.id.desc())
        .all()
    )
    return [_draft_view(db, order) for order in drafts]


@router.post("/drafts", response_model=DraftView, status_code=status.HTTP_201_CREATED)
def create_sales_draft(
    payload: DraftInput,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    return _draft_view(db, _save_draft(db, _sales_account(db, actor), payload))


@router.get("/drafts/{order_id}", response_model=DraftView)
def get_sales_draft(
    order_id: int,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    return _draft_view(db, _load_owned_draft(db, account, order_id))


@router.put("/drafts/{order_id}", response_model=DraftView)
def update_sales_draft(
    order_id: int,
    payload: DraftInput,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Rep")),
):
    account = _sales_account(db, actor)
    order = _load_owned_draft(db, account, order_id)
    return _draft_view(db, _save_draft(db, account, payload, order))
