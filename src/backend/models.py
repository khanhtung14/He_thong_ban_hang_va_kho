"""SQLAlchemy models for the OMS account, access-control, and session domain."""

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
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
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
    """Seed the 7 canonical roles defined in Sheet 2 (User Roles) if they do not exist."""
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
    permissions: Mapped[List["Permission"]] = relationship(
        secondary=role_permissions, back_populates="roles"
    )


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
    """Persist a hash of the refresh token; never store a raw bearer token."""

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
    """Append-only record of changes to inventory and receivables data."""

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


class Customer(Base):
    """Customer / Đại lý model in charge of wholesale orders."""
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sales_rep_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    territory_id: Mapped[Optional[int]] = mapped_column(ForeignKey("territories.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PriceList(Base):
    """A customer-segment price list; published versions are immutable."""
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

    items: Mapped[List["PriceListItem"]] = relationship(
        back_populates="price_list", cascade="all, delete-orphan"
    )


class PriceListItem(Base):
    __tablename__ = "price_list_items"
    __table_args__ = (
        UniqueConstraint("price_list_id", "sku", name="uq_price_list_items_list_sku"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    price_list_id: Mapped[int] = mapped_column(ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False)
    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    sale_price: Mapped[int] = mapped_column(Integer, nullable=False)
    floor_price: Mapped[int] = mapped_column(Integer, nullable=False)
    price_list: Mapped[PriceList] = relationship(back_populates="items")

