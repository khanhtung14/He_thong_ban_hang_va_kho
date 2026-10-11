"""SQLAlchemy models for the OMS domain, updated with all Epics."""

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
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
    
    units: Mapped[List["ProductUnit"]] = relationship(back_populates="product", cascade="all, delete-orphan")


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
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    scope: Mapped[str] = mapped_column(String(30), nullable=False) # e.g. 'PRODUCT', 'CATEGORY'
    target_id: Mapped[Optional[int]] = mapped_column(Integer) # ID of product or category


class DiscountTier(Base):
    __tablename__ = "discount_tiers"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("discount_policies.id", ondelete="CASCADE"), nullable=False)
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Float, nullable=False)


# --- EP-03: Đại lý & Hạn mức công nợ ---
class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sales_rep_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    territory_id: Mapped[Optional[int]] = mapped_column(ForeignKey("territories.id", ondelete="SET NULL"))
    customer_group: Mapped[str] = mapped_column(String(30), default="RETAIL", server_default="RETAIL", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lock_reason: Mapped[Optional[str]] = mapped_column(String(255))
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    locked_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    
    # NEW FIELDS: Credit limit
    credit_limit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_due_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warning_threshold_percent: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    orders: Mapped[list["Order"]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class DeliveryAddress(Base):
    __tablename__ = "delivery_addresses"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    receiver_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


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
    __table_args__ = (UniqueConstraint("price_list_id", "sku", name="uq_price_list_items_list_sku"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    price_list_id: Mapped[int] = mapped_column(ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=True)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
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
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[OrderStatus] = mapped_column(
        SqlEnum(OrderStatus, native_enum=False, length=30),
        default=OrderStatus.DRAFT,
        nullable=False,
    )
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    approval_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped[Customer] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), nullable=True)
    sku: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    product_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("product_units.id", ondelete="SET NULL"))
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
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
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


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
