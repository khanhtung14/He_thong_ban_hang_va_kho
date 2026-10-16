"""SQLAlchemy models for the OMS domain, updated with all Epics."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    Index,
    JSON,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    Float,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, synonym


class Base(DeclarativeBase):
    pass


class AccountStatus(str, Enum):
    ACTIVE = "ACTIVE"
    LOCKED = "LOCKED"
    DISABLED = "DISABLED"
    PENDING_ACTIVATION = "PENDING_ACTIVATION"


class RoleCode(str, Enum):
    CUSTOMER = "Customer"
    SALES_REP = "Sales Rep"
    SALES_MANAGER = "Sales Manager"
    WAREHOUSE = "Warehouse"
    WH_MANAGER = "WH Manager"
    ACCOUNTANT = "Accountant"
    ADMIN = "Admin"

ROLE_DEFINITIONS: Dict[RoleCode, Dict[str, str]] = {
    RoleCode.CUSTOMER: {
        "name": "Đại lý",
        "description": "Tự đặt hàng, theo dõi trạng thái đơn và công nợ của mình.",
    },
    RoleCode.SALES_REP: {
        "name": "Nhân viên kinh doanh",
        "description": "Gõ đơn tại cửa hàng, xem tồn khả dụng, theo dõi công nợ khách mình phụ trách, thu tiền theo tuyến.",
    },
    RoleCode.SALES_MANAGER: {
        "name": "Quản lý kinh doanh",
        "description": "Phụ trách toàn bộ hoạt động bán hàng, duyệt đơn vượt hạn mức/dưới giá sàn, phân công địa bàn, theo dõi doanh số và biên lợi nhuận.",
    },
    RoleCode.WAREHOUSE: {
        "name": "Nhân viên kho",
        "description": "Soạn hàng theo lô, ghi nhận nhập kho, kiểm kê.",
    },
    RoleCode.WH_MANAGER: {
        "name": "Quản lý kho",
        "description": "Duyệt điều chỉnh tồn, chuyển kho, chốt kiểm kê, theo dõi tồn tối thiểu và hạn sử dụng.",
    },
    RoleCode.ACCOUNTANT: {
        "name": "Kế toán công nợ",
        "description": "Phát hành hóa đơn, ghi nhận thanh toán, đối chiếu công nợ với đại lý.",
    },
    RoleCode.ADMIN: {
        "name": "Quản trị hệ thống",
        "description": "Quản lý tài khoản, vai trò, danh mục dùng chung, xem nhật ký hệ thống.",
    },
}

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="RESTRICT"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

user_warehouses = Table(
    "user_warehouses",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("warehouse_id", ForeignKey("warehouses.id", ondelete="CASCADE"), primary_key=True),
)

user_territories = Table(
    "user_territories",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("territory_id", ForeignKey("territories.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("phone", name="uq_users_phone"),
        Index("ix_users_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[AccountStatus] = mapped_column(
        SqlEnum(AccountStatus, native_enum=False, length=20),
        default=AccountStatus.ACTIVE,
        nullable=False,
    )
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    roles: Mapped[List["Role"]] = relationship(secondary=user_roles, back_populates="users")
    warehouses: Mapped[List["Warehouse"]] = relationship(secondary=user_warehouses)
    territories: Mapped[List["Territory"]] = relationship(secondary=user_territories)
    sessions: Mapped[List["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


def seed_default_roles(db):
    canonical_roles = [
        {"code": "ADMIN", "name": "Quản trị hệ thống", "description": "Người vận hành ứng dụng, toàn quyền hệ thống"},
        {"code": "SALES_REP", "name": "Nhân viên kinh doanh", "description": "Người đi thị trường, chăm sóc đại lý"},
        {"code": "SALES_MANAGER", "name": "Quản lý kinh doanh", "description": "Phụ trách toàn bộ hoạt động bán hàng"},
        {"code": "WAREHOUSE", "name": "Nhân viên kho", "description": "Thủ kho, người soạn và xuất hàng"},
        {"code": "WH_MANAGER", "name": "Quản lý kho", "description": "Phụ trách toàn bộ kho hàng"},
        {"code": "ACCOUNTANT", "name": "Kế toán công nợ", "description": "Người theo dõi thu tiền và công nợ"},
        {"code": "CUSTOMER", "name": "Đại lý", "description": "Cửa hàng hoặc đại lý mua sỉ"},
    ]
    for r in canonical_roles:
        existing = db.query(Role).filter((Role.code == r["code"]) | (Role.name == r["name"])).first()
        if not existing:
            role_obj = Role(code=r["code"], name=r["name"], description=r["description"])
            db.add(role_obj)
    db.commit()


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    users: Mapped[List[User]] = relationship(secondary=user_roles, back_populates="roles")
    permissions: Mapped[List["Permission"]] = relationship(secondary=role_permissions, back_populates="roles")


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    roles: Mapped[List[Role]] = relationship(secondary=role_permissions, back_populates="permissions")


class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Territory(Base):
    __tablename__ = "territories"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("territories.id", ondelete="SET NULL"))


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (Index("ix_user_sessions_user_expiry", "user_id", "expires_at"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user: Mapped[User] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_password_reset_tokens_user_expiry", "user_id", "expires_at"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccountAuditLog(Base):
    __tablename__ = "account_audit_logs"
    __table_args__ = (Index("ix_account_audit_logs_user_created", "user_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BusinessAuditLog(Base):
    __tablename__ = "business_audit_logs"
    __table_args__ = (
        Index("ix_business_audit_logs_actor_created", "actor_user_id", "happened_at"),
        Index("ix_business_audit_logs_entity_created", "entity_type", "happened_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    actor_name: Mapped[str] = mapped_column(String(150), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    before_value: Mapped[Optional[Any]] = mapped_column(JSON)
    after_value: Mapped[Optional[Any]] = mapped_column(JSON)
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


# --- EP-02: Sản phẩm & Bảng giá ---
class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    description: Mapped[Optional[str]] = mapped_column(Text)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    base_unit: Mapped[str] = mapped_column(String(20), nullable=False)
    manage_by_lot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    min_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    base_price: Mapped[float] = mapped_column(Float, default=0.0)
    cost_price: Mapped[float] = mapped_column(Float, default=0.0)
    image_url: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    
    category: Mapped[Optional["Category"]] = relationship()
    units: Mapped[List["ProductUnit"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    price_history: Mapped[List["ProductPriceHistory"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="desc(ProductPriceHistory.effective_date)",
    )


class ProductPriceHistory(Base):
    __tablename__ = "product_price_history"
    __table_args__ = (
        Index("ix_product_price_history_product_date", "product_id", "effective_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    old_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    new_price: Mapped[float] = mapped_column(Float, nullable=False)
    changed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    effective_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    product: Mapped[Optional["Product"]] = relationship(back_populates="price_history")

    def __init__(self, **kwargs):
        if "note" in kwargs and "reason" not in kwargs:
            kwargs["reason"] = kwargs["note"]
        elif "reason" in kwargs and "note" not in kwargs:
            kwargs["note"] = kwargs["reason"]
        super().__init__(**kwargs)

    @property
    def changed_at(self) -> datetime:
        return self.effective_date


@event.listens_for(ProductPriceHistory, "before_update")
def _prevent_price_history_update(mapper, connection, target):
    raise ValueError("Lịch sử thay đổi giá là nhật ký kiểm toán bất biến (Audit Log), không thể chỉnh sửa.")


@event.listens_for(ProductPriceHistory, "before_delete")
def _prevent_price_history_delete(mapper, connection, target):
    raise ValueError("Lịch sử thay đổi giá là nhật ký kiểm toán bất biến (Audit Log), không thể xóa.")


@event.listens_for(Product.base_price, "set")
def _product_base_price_set_listener(target, value, oldvalue, initiator):
    from sqlalchemy.orm.attributes import NEVER_SET, NO_VALUE

    if getattr(target, "_suppress_auto_price_history", False):
        return
    if oldvalue not in (NO_VALUE, NEVER_SET) and oldvalue is not None:
        try:
            float_old = float(oldvalue)
            float_new = float(value)
        except (TypeError, ValueError):
            return
        if float_old != float_new:
            hist = ProductPriceHistory(
                product_id=target.id if target.id is not None else None,
                old_price=float_old,
                new_price=float_new,
                changed_by="System",
                note="Cập nhật giá bán sản phẩm",
                reason="Cập nhật giá bán sản phẩm",
            )
            target.price_history.append(hist)


class ProductUnit(Base):
    __tablename__ = "product_units"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    unit_name: Mapped[str] = mapped_column(String(50), nullable=False)
    conversion_rate: Mapped[float] = mapped_column(Float, nullable=False)
    barcode: Mapped[Optional[str]] = mapped_column(String(100))
    is_base_unit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    product: Mapped[Product] = relationship(back_populates="units")


class DiscountPolicy(Base):
    __tablename__ = "discount_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(30), default="SKU", nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), default="SKU", nullable=False)  # 'SKU' | 'CATEGORY'
    target_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # SKU or Category ID
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    discount_type: Mapped[str] = mapped_column(String(20), default="PERCENTAGE", nullable=False)  # 'PERCENTAGE' | 'FIXED_AMOUNT'
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tiers: Mapped[list["DiscountTier"]] = relationship(
        back_populates="policy",
        cascade="all, delete-orphan",
        order_by="DiscountTier.min_quantity",
        foreign_keys="[DiscountTier.policy_id]",
    )


class DiscountTier(Base):
    __tablename__ = "discount_tiers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("discount_policies.id", ondelete="CASCADE"), nullable=False)
    discount_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    discount_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    policy: Mapped["DiscountPolicy"] = relationship(
        back_populates="tiers",
        foreign_keys="[DiscountTier.policy_id]",
    )


# --- EP-03: Đại lý & Hạn mức công nợ ---
class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("code", name="uq_customers_code"),
        UniqueConstraint("phone", name="uq_customers_phone"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    tax_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sales_rep_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assigned_sales_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    territory_id: Mapped[Optional[int]] = mapped_column(ForeignKey("territories.id", ondelete="SET NULL"))
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_group: Mapped[str] = mapped_column(String(30), default="RETAIL", server_default="RETAIL", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lock_reason: Mapped[Optional[str]] = mapped_column(String(255))
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    locked_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # NEW FIELDS: Credit limit & Debt control (SCRUM-21)
    credit_limit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_due_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    max_debt_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    current_debt: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    warning_threshold_percent: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    warning_threshold: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)

    max_debt_amount = synonym("credit_limit")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    orders: Mapped[List["Order"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    delivery_addresses: Mapped[List["DeliveryAddress"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    sales_rep: Mapped[Optional["User"]] = relationship(foreign_keys=[sales_rep_id])
    debt_limit_histories: Mapped[List["CreditLimitLog"]] = relationship(
        "CreditLimitLog",
        back_populates="customer",
        cascade="all, delete-orphan",
        order_by="desc(CreditLimitLog.id)",
    )
    credit_limit_logs: Mapped[List["CreditLimitLog"]] = relationship(
        "CreditLimitLog",
        overlaps="debt_limit_histories,customer",
    )


class HandoverHistory(Base):
    __tablename__ = "handover_history"
    __table_args__ = (
        Index("ix_handover_history_from_user", "from_user_id"),
        Index("ix_handover_history_to_user", "to_user_id"),
        Index("ix_handover_history_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    transferred_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    customer_ids: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    customer_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    from_user: Mapped[Optional["User"]] = relationship(foreign_keys=[from_user_id])
    to_user: Mapped[Optional["User"]] = relationship(foreign_keys=[to_user_id])
    transferred_by: Mapped[Optional["User"]] = relationship(foreign_keys=[transferred_by_id])


class CreditLimitLog(Base):
    """Lịch sử thay đổi hạn mức công nợ (SCRUM-21 credit_limit_logs)."""
    __tablename__ = "credit_limit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    old_credit_limit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    new_credit_limit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    old_max_debt_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    new_max_debt_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    changed_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_by_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), server_default=func.now(), index=True)

    customer: Mapped["Customer"] = relationship(
        "Customer", back_populates="credit_limit_logs", foreign_keys=[customer_id]
    )

    # Synonyms for test_debt_limit and backward compatibility
    agency_id = synonym("customer_id")
    old_limit = synonym("old_credit_limit")
    new_limit = synonym("new_credit_limit")
    old_debt_days = synonym("old_max_debt_days")
    new_debt_days = synonym("new_max_debt_days")
    created_by = synonym("changed_by_name")
    changed_by = synonym("changed_by_name")

    def __init__(self, **kwargs):
        if "agency_id" in kwargs and "customer_id" not in kwargs:
            kwargs["customer_id"] = kwargs.pop("agency_id")
        if "old_limit" in kwargs and "old_credit_limit" not in kwargs:
            kwargs["old_credit_limit"] = kwargs.pop("old_limit")
        if "new_limit" in kwargs and "new_credit_limit" not in kwargs:
            kwargs["new_credit_limit"] = kwargs.pop("new_limit")
        if "old_debt_days" in kwargs and "old_max_debt_days" not in kwargs:
            kwargs["old_max_debt_days"] = kwargs.pop("old_debt_days")
        if "new_debt_days" in kwargs and "new_max_debt_days" not in kwargs:
            kwargs["new_max_debt_days"] = kwargs.pop("new_debt_days")
        if "changed_by" in kwargs and "changed_by_name" not in kwargs:
            kwargs["changed_by_name"] = kwargs.pop("changed_by")
        if "created_by" in kwargs and "changed_by_name" not in kwargs:
            kwargs["changed_by_name"] = kwargs.pop("created_by")
        super().__init__(**kwargs)


# Aliases cho các nghiệp vụ tương thích
DebtLimitHistory = CreditLimitLog
Agency = Customer



class DeliveryAddress(Base):
    __tablename__ = "delivery_addresses"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    receiver_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="delivery_addresses")


class CustomerHandoverHistory(Base):
    __tablename__ = "customer_handover_history"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    from_sales_rep_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    to_sales_rep_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    transferred_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship(foreign_keys=[customer_id])
    from_sales_rep: Mapped[Optional["User"]] = relationship(foreign_keys=[from_sales_rep_id])
    to_sales_rep: Mapped["User"] = relationship(foreign_keys=[to_sales_rep_id])
    transferred_by: Mapped[Optional["User"]] = relationship(foreign_keys=[transferred_by_id])


class PriceList(Base):
    __tablename__ = "price_lists"
    __table_args__ = (
        UniqueConstraint("code", "version", name="uq_price_lists_code_version"),
        Index("ix_price_lists_segment_period", "customer_group", "start_date", "end_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    customer_group: Mapped[str] = mapped_column(String(30), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[List["PriceListItem"]] = relationship(back_populates="price_list", cascade="all, delete-orphan")


class PriceListItem(Base):
    __tablename__ = "price_list_items"
    __table_args__ = (
        UniqueConstraint("price_list_id", "sku", name="uq_price_list_items_list_sku"),
        UniqueConstraint("price_list_id", "product_id", name="uq_price_list_items_list_prod"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    price_list_id: Mapped[int] = mapped_column(ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False)
    sku: Mapped[str] = mapped_column(String(80), nullable=False, default="", index=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=True)
    sale_price: Mapped[float] = mapped_column(Float, nullable=False)
    floor_price: Mapped[float] = mapped_column(Float, nullable=False)
    price_list: Mapped[PriceList] = relationship(back_populates="items")


# --- EP-04: Đặt hàng & Duyệt đơn ---
class OrderStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    delivery_address_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("delivery_addresses.id", ondelete="SET NULL"), nullable=True
    )
    desired_delivery_date: Mapped[Optional[date]] = mapped_column(Date)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[OrderStatus] = mapped_column(
        SqlEnum(OrderStatus, native_enum=False, length=30),
        default=OrderStatus.DRAFT,
        nullable=False,
    )
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    subtotal_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    approval_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped[Customer] = relationship(back_populates="orders")
    delivery_address: Mapped[Optional[DeliveryAddress]] = relationship()
    items: Mapped[List["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=True)
    sku: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    product_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("product_units.id", ondelete="SET NULL"))
    unit_name: Mapped[Optional[str]] = mapped_column(String(50))
    conversion_factor: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    line_subtotal: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    line_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    floor_price: Mapped[Optional[float]] = mapped_column(Float)
    price_list_id: Mapped[Optional[int]] = mapped_column(ForeignKey("price_lists.id", ondelete="SET NULL"))
    
    order: Mapped[Order] = relationship(back_populates="items")


# --- EP-05: Kho, Tồn kho & Điều chuyển ---
class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    tax_code: Mapped[Optional[str]] = mapped_column(String(50))
    contact_person: Mapped[Optional[str]] = mapped_column(String(100))
    payment_terms: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    receipts: Mapped[List["WarehouseReceipt"]] = relationship("WarehouseReceipt", back_populates="supplier")


class Inventory(Base):
    __tablename__ = "inventory"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    physical_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    reserved_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    available_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class InventoryLot(Base):
    __tablename__ = "inventory_lots"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lot_number: Mapped[str] = mapped_column(String(100), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    mfg_date: Mapped[Optional[date]] = mapped_column(Date)
    exp_date: Mapped[Optional[date]] = mapped_column(Date)
    quantity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(3), nullable=False)
    unit_name: Mapped[str] = mapped_column(String(100), nullable=False)
    input_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    conversion_rate_snapshot: Mapped[float] = mapped_column(Float, nullable=False)
    base_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )


class InventoryStock(Base):
    __tablename__ = "inventory_stock"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_inventory_stock_product_warehouse"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)
    warehouse_id: Mapped[int] = mapped_column(Integer, nullable=False)
    base_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WarehouseReceipt(Base):
    __tablename__ = "warehouse_receipts"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    supplier_id: Mapped[Optional[int]] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"))
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    receipt_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(30), default="COMPLETED")

    supplier: Mapped[Optional["Supplier"]] = relationship("Supplier", back_populates="receipts")


class WarehouseReceiptItem(Base):
    __tablename__ = "warehouse_receipt_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("warehouse_receipts.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    lot_number: Mapped[Optional[str]] = mapped_column(String(100))
    quantity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)


class WarehouseTransfer(Base):
    __tablename__ = "warehouse_transfers"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    from_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    to_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(30), default="PENDING")


class WarehouseTransferItem(Base):
    __tablename__ = "warehouse_transfer_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    transfer_id: Mapped[int] = mapped_column(ForeignKey("warehouse_transfers.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    lot_number: Mapped[Optional[str]] = mapped_column(String(100))
    quantity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class WarehouseAudit(Base):
    __tablename__ = "warehouse_audits"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    audit_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(30), default="DRAFT")


class WarehouseAuditItem(Base):
    __tablename__ = "warehouse_audit_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    audit_id: Mapped[int] = mapped_column(ForeignKey("warehouse_audits.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    system_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    actual_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


# --- EP-06: Xuất kho, Giao hàng & Chứng từ ---
class PickList(Base):
    __tablename__ = "pick_lists"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")


class Dispatch(Base):
    __tablename__ = "dispatches"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    pick_list_id: Mapped[Optional[int]] = mapped_column(ForeignKey("pick_lists.id", ondelete="SET NULL"))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="SHIPPED")


class DispatchItem(Base):
    __tablename__ = "dispatch_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    lot_number: Mapped[Optional[str]] = mapped_column(String(100))
    actual_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class DeliveryTrip(Base):
    __tablename__ = "delivery_trips"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    driver_name: Mapped[str] = mapped_column(String(150), nullable=False)
    vehicle_number: Mapped[str] = mapped_column(String(50), nullable=False)
    route_name: Mapped[Optional[str]] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(String(30), default="IN_PROGRESS")


class DeliveryTripDispatch(Base):
    __tablename__ = "delivery_trip_dispatches"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("delivery_trips.id", ondelete="CASCADE"), nullable=False)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id", ondelete="CASCADE"), nullable=False)


# --- EP-07: Hóa đơn, Công nợ & Thanh toán ---
class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    dispatch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("dispatches.id", ondelete="SET NULL"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    invoice_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    payment_term_days: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="UNPAID") # UNPAID, PARTIAL, PAID


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    amount_applied: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class CustomerDebt(Base):
    __tablename__ = "customer_debts"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    total_debt: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# --- EP-08 & EP-09: Trả hàng, Điều chỉnh & Báo cáo ---
class ReturnOrder(Base):
    __tablename__ = "return_orders"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[Text] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")


class ReturnOrderItem(Base):
    __tablename__ = "return_order_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    return_id: Mapped[int] = mapped_column(ForeignKey("return_orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class CreditNote(Base):
    __tablename__ = "credit_notes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    return_id: Mapped[Optional[int]] = mapped_column(ForeignKey("return_orders.id", ondelete="SET NULL"))
    note: Mapped[Text] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class InventoryAdjustment(Base):
    __tablename__ = "inventory_adjustments"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[Text] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")


class InventoryAdjustmentItem(Base):
    __tablename__ = "inventory_adjustment_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    adjustment_id: Mapped[int] = mapped_column(ForeignKey("inventory_adjustments.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    lot_number: Mapped[Optional[str]] = mapped_column(String(100))
    adjust_qty: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class SalesTarget(Base):
    __tablename__ = "sales_targets"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sales_rep_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    target_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
