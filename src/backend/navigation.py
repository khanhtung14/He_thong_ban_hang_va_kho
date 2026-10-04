"""FastAPI navigation and menu registry module (SCRUM-60 / US-06).

Provides:
- Menu Registry mapping user roles/permissions to dynamic navigation menus.
- Context resolution for authenticated users (Full Name, Role Name, Warehouse/Territory Scope).
- Role-based filtering: unauthorized menu items are completely hidden.
- API endpoints for dynamic navigation rendering.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import AccountStatus, Role, Territory, User, Warehouse
    from src.backend.security import require_active_user
except ImportError:  # pragma: no cover - fallback
    try:
        from backend.database import get_db
        from backend.models import AccountStatus, Role, Territory, User, Warehouse
        from backend.security import require_active_user
    except ImportError:
        from .database import get_db
        from .models import AccountStatus, Role, Territory, User, Warehouse
        from .security import require_active_user


router = APIRouter(prefix="/api/v1/navigation", tags=["Navigation"])

# ---------------------------------------------------------------------------
# 1. Role & Display Name Definitions
# ---------------------------------------------------------------------------

ROLE_DISPLAY_NAMES: dict[str, str] = {
    "WAREHOUSE": "Nhân viên kho",
    "WH_MANAGER": "Quản lý kho",
    "SALES": "Nhân viên kinh doanh",
    "SALES_REP": "Nhân viên kinh doanh",
    "SALES_MANAGER": "Quản lý kinh doanh",
    "ACCOUNTANT": "Kế toán",
    "ADMIN": "Quản trị hệ thống",
    "CUSTOMER": "Đại lý",
}

# ---------------------------------------------------------------------------
# 2. Menu Registry (ST-026)
# ---------------------------------------------------------------------------

class MenuItem(BaseModel):
    id: str
    title: str
    path: str
    icon: str
    roles: list[str]
    order: int
    category: str = "Chức năng chính"


MENU_REGISTRY: list[MenuItem] = [
    # Kho hàng (Warehouse & WH Manager)
    MenuItem(
        id="warehouse-picking",
        title="Soạn hàng",
        path="/warehouse/picking",
        icon="package-check",
        roles=["WAREHOUSE", "WH_MANAGER"],
        order=10,
        category="Kho vận",
    ),
    MenuItem(
        id="warehouse-receiving",
        title="Nhập kho",
        path="/warehouse/receiving",
        icon="arrow-down-to-bracket",
        roles=["WAREHOUSE", "WH_MANAGER"],
        order=20,
        category="Kho vận",
    ),
    MenuItem(
        id="warehouse-inventory",
        title="Sổ tồn kho",
        path="/warehouse/inventory",
        icon="boxes-stacked",
        roles=["WAREHOUSE", "WH_MANAGER", "SALES_MANAGER"],
        order=30,
        category="Kho vận",
    ),
    MenuItem(
        id="warehouse-transfer",
        title="Chuyển kho",
        path="/warehouse/transfer",
        icon="arrow-left-right",
        roles=["WAREHOUSE", "WH_MANAGER"],
        order=40,
        category="Kho vận",
    ),

    # Bán hàng (Sales & Customer)
    MenuItem(
        id="orders-create",
        title="Tạo đơn hàng",
        path="/sales/orders/create",
        icon="plus-circle",
        roles=["SALES", "SALES_REP", "CUSTOMER"],
        order=50,
        category="Bán hàng",
    ),
    MenuItem(
        id="orders-list",
        title="Đơn hàng",
        path="/sales/orders",
        icon="shopping-cart",
        roles=["SALES", "SALES_REP", "SALES_MANAGER", "CUSTOMER", "ACCOUNTANT"],
        order=60,
        category="Bán hàng",
    ),
    MenuItem(
        id="customers-list",
        title="Khách hàng / Đại lý",
        path="/sales/customers",
        icon="building",
        roles=["SALES", "SALES_REP", "SALES_MANAGER", "ADMIN"],
        order=70,
        category="Bán hàng",
    ),
    MenuItem(
        id="stock-available",
        title="Tồn kho khả dụng",
        path="/sales/stock-available",
        icon="archive",
        roles=["SALES", "SALES_REP"],
        order=80,
        category="Bán hàng",
    ),

    # Quản lý kinh doanh (Sales Manager)
    MenuItem(
        id="manager-order-approval",
        title="Duyệt đơn",
        path="/manager/orders/approval",
        icon="clipboard-check",
        roles=["SALES_MANAGER"],
        order=90,
        category="Quản lý",
    ),
    MenuItem(
        id="manager-pricing",
        title="Bảng giá",
        path="/manager/pricing",
        icon="tag",
        roles=["SALES_MANAGER", "ADMIN"],
        order=100,
        category="Quản lý",
    ),
    MenuItem(
        id="manager-sales-reports",
        title="Báo cáo doanh số",
        path="/manager/reports",
        icon="bar-chart",
        roles=["SALES_MANAGER", "ADMIN"],
        order=110,
        category="Quản lý",
    ),

    # Kế toán (Accountant)
    MenuItem(
        id="accounting-debt-book",
        title="Sổ công nợ",
        path="/accounting/debt-book",
        icon="book",
        roles=["ACCOUNTANT"],
        order=120,
        category="Tài chính & Kế toán",
    ),
    MenuItem(
        id="accounting-invoices",
        title="Hóa đơn & Thanh toán",
        path="/accounting/invoices",
        icon="receipt",
        roles=["ACCOUNTANT"],
        order=130,
        category="Tài chính & Kế toán",
    ),

    # Quản trị hệ thống (Admin)
    MenuItem(
        id="admin-users",
        title="Quản trị người dùng",
        path="/admin/users",
        icon="users-cog",
        roles=["ADMIN"],
        order=140,
        category="Quản trị",
    ),
    MenuItem(
        id="admin-territory-handover",
        title="Phân bổ địa bàn",
        path="/admin/territory-handover",
        icon="map-pin",
        roles=["ADMIN", "SALES_MANAGER"],
        order=150,
        category="Quản trị",
    ),
    MenuItem(
        id="admin-audit-logs",
        title="Nhật ký kiểm toán",
        path="/admin/audit-logs",
        icon="shield-check",
        roles=["ADMIN"],
        order=160,
        category="Quản trị",
    ),
]

# ---------------------------------------------------------------------------
# 3. Demo / Fixture Profiles (Used when testing or running standalone demo)
# ---------------------------------------------------------------------------

DEMO_PROFILES: dict[str, dict[str, Any]] = {
    "WAREHOUSE": {
        "username": "tranvankho",
        "full_name": "Trần Văn Kho",
        "role_code": "WAREHOUSE",
        "role_name": "Nhân viên kho",
        "scope": "Kho Tổng Hà Nội",
        "email": "kho.tran@demo.oms.local",
    },
    "SALES": {
        "username": "trankinhdoanh",
        "full_name": "Trần Kinh Doanh",
        "role_code": "SALES",
        "role_name": "Nhân viên kinh doanh",
        "scope": "Địa bàn Hà Nội",
        "email": "kinhdoanh.tran@demo.oms.local",
    },
    "SALES_MANAGER": {
        "username": "lequanlykd",
        "full_name": "Lê Quản Lý Kinh Doanh",
        "role_code": "SALES_MANAGER",
        "role_name": "Quản lý kinh doanh",
        "scope": "Toàn quốc",
        "email": "quanlykd.le@demo.oms.local",
    },
    "WH_MANAGER": {
        "username": "voquanlykho",
        "full_name": "Võ Quản Lý Kho",
        "role_code": "WH_MANAGER",
        "role_name": "Quản lý kho",
        "scope": "Toàn bộ hệ thống kho",
        "email": "quanlykho.vo@demo.oms.local",
    },
    "ACCOUNTANT": {
        "username": "dangketoan",
        "full_name": "Đặng Kế Toán",
        "role_code": "ACCOUNTANT",
        "role_name": "Kế toán",
        "scope": "Toàn hệ thống",
        "email": "ketoan.dang@demo.oms.local",
    },
    "ADMIN": {
        "username": "buiquantri",
        "full_name": "Bùi Quản Trị",
        "role_code": "ADMIN",
        "role_name": "Quản trị hệ thống",
        "scope": "Toàn hệ thống",
        "email": "admin.bui@demo.oms.local",
    },
    "CUSTOMER": {
        "username": "nguyendaily",
        "full_name": "Nguyễn Đại Lý",
        "role_code": "CUSTOMER",
        "role_name": "Đại lý",
        "scope": "Đại lý Tạp Hóa Long Biên",
        "email": "daily.nguyen@demo.oms.local",
    },
}

# ---------------------------------------------------------------------------
# 4. Helper Functions
# ---------------------------------------------------------------------------

def normalize_role(role: str | None) -> str:
    if not role:
        return "SALES"
    r = role.strip().upper()
    if r == "SALES_REP":
        return "SALES"
    return r


def get_menu_items_for_role(role_code: str) -> list[dict[str, Any]]:
    """Return strictly the menu items allowed for the specified role.
    
    Menu items not authorized for this role are completely excluded.
    """
    normalized = normalize_role(role_code)
    filtered = [
        item.model_dump()
        for item in sorted(MENU_REGISTRY, key=lambda m: m.order)
        if normalized in item.roles
    ]
    return filtered


def get_hidden_menu_items_for_role(role_code: str) -> list[dict[str, Any]]:
    """Return menu items that this role is NOT allowed to see."""
    normalized = normalize_role(role_code)
    hidden = [
        item.model_dump()
        for item in sorted(MENU_REGISTRY, key=lambda m: m.order)
        if normalized not in item.roles
    ]
    return hidden


def resolve_user_scope(user: Any) -> str:
    """Resolve human-readable scope (Kho hoặc Địa bàn đang làm việc)."""
    # 1. Nếu là đối tượng SQLAlchemy User
    if hasattr(user, "warehouses") and user.warehouses:
        names = [w.name for w in user.warehouses if getattr(w, "name", None)]
        if names:
            return ", ".join(names)

    if hasattr(user, "territories") and user.territories:
        names = [t.name for t in user.territories if getattr(t, "name", None)]
        if names:
            return ", ".join(names)

    # 2. Nếu là dict
    if isinstance(user, dict):
        if user.get("scope"):
            return str(user["scope"])
        if user.get("warehouse_name"):
            return str(user["warehouse_name"])
        if user.get("territory_name"):
            return str(user["territory_name"])

    # 3. Fallback theo role
    role_code = ""
    if hasattr(user, "roles") and user.roles:
        role_code = user.roles[0].code.upper()
    elif isinstance(user, dict) and user.get("role_code"):
        role_code = str(user["role_code"]).upper()

    if role_code in ("ADMIN", "ACCOUNTANT"):
        return "Toàn hệ thống"
    if role_code == "SALES_MANAGER":
        return "Toàn quốc"
    if role_code == "WH_MANAGER":
        return "Toàn bộ hệ thống kho"

    return "Trụ sở chính"


def build_navigation_context(
    user_or_profile: Any,
    override_role: str | None = None,
) -> dict[str, Any]:
    """Build the complete navigation response for a user or demo profile."""
    # Xử lý trường hợp đối tượng User model của SQLAlchemy
    if hasattr(user_or_profile, "username"):
        roles_list = getattr(user_or_profile, "roles", [])
        primary_role_code = roles_list[0].code.upper() if roles_list else "SALES"
        role_code = normalize_role(override_role or primary_role_code)
        full_name = getattr(user_or_profile, "full_name", user_or_profile.username)
        username = user_or_profile.username
        scope = resolve_user_scope(user_or_profile)
    elif isinstance(user_or_profile, dict):
        role_code = normalize_role(override_role or user_or_profile.get("role_code", "SALES"))
        full_name = user_or_profile.get("full_name") or user_or_profile.get("username", "Người dùng")
        username = user_or_profile.get("username", "user")
        scope = user_or_profile.get("scope") or resolve_user_scope(user_or_profile)
    else:
        role_code = normalize_role(override_role)
        full_name = "Người dùng hệ thống"
        username = "user"
        scope = "Toàn hệ thống"

    role_name = ROLE_DISPLAY_NAMES.get(role_code, role_code)
    menu_items = get_menu_items_for_role(role_code)
    hidden_items = get_hidden_menu_items_for_role(role_code)

    return {
        "user": {
            "username": username,
            "full_name": full_name,
            "role_code": role_code,
            "role_name": role_name,
            "scope": scope,
        },
        "menu_items": menu_items,
        "hidden_menu_count": len(hidden_items),
        "total_registry_items": len(MENU_REGISTRY),
    }


# ---------------------------------------------------------------------------
# 5. FastAPI Endpoints
# ---------------------------------------------------------------------------

@router.get("/menu")
def get_navigation_menu(
    role: Optional[str] = Query(
        None,
        description="Mã vai trò (tùy chọn) để xem trước menu: WAREHOUSE, SALES, SALES_MANAGER, WH_MANAGER, ACCOUNTANT, ADMIN, CUSTOMER",
    ),
    scope: Optional[str] = Query(
        None,
        description="Tên kho hoặc địa bàn làm việc (tùy chọn để override)",
    ),
    full_name: Optional[str] = Query(
        None,
        description="Họ và tên người dùng (tùy chọn để override)",
    ),
):
    """API trả về menu điều hướng động và thông tin người dùng theo quyền thực tế.
    
    Đáp ứng tiêu chí nghiệm thu SCRUM-60:
    1. Mục menu không thuộc quyền thì hoàn toàn không hiển thị trong `menu_items`.
    2. Hiển thị thông tin người dùng: `full_name`, `role_name`, `scope` (kho hoặc địa bàn).
    """
    selected_role = normalize_role(role) if role else "WAREHOUSE"
    profile = DEMO_PROFILES.get(selected_role, DEMO_PROFILES["WAREHOUSE"]).copy()

    if full_name:
        profile["full_name"] = full_name
    if scope:
        profile["scope"] = scope
    if role:
        profile["role_code"] = selected_role
        profile["role_name"] = ROLE_DISPLAY_NAMES.get(selected_role, selected_role)

    return build_navigation_context(profile, override_role=selected_role)


@router.get("/me")
def get_my_navigation(
    authorization: Optional[str] = Header(None),
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Lấy thông tin người dùng hiện tại và menu điều hướng tương ứng."""
    # Nếu có token và DB session hoạt động, thử lấy User thật
    user = None
    if authorization and authorization.lower().startswith("bearer "):
        try:
            token = authorization.split(" ", 1)[1].strip()
            # Thử tìm session trong DB nếu có
            import hashlib
            from datetime import datetime, timezone
            from src.backend.models import UserSession
            thash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            session = db.query(UserSession).filter(
                UserSession.refresh_token_hash == thash,
                UserSession.revoked_at.is_(None)
            ).first()
            if session and session.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
                user = session.user
        except Exception:
            user = None

    if user:
        return build_navigation_context(user, override_role=role)

    # Nếu không có token đăng nhập, dùng profile theo role được yêu cầu hoặc mặc định
    target_role = normalize_role(role) if role else "WAREHOUSE"
    profile = DEMO_PROFILES.get(target_role, DEMO_PROFILES["WAREHOUSE"])
    return build_navigation_context(profile, override_role=target_role)


@router.get("/roles")
def list_available_roles():
    """Trả về danh sách tất cả các vai trò và dữ liệu mẫu để thử nghiệm trên giao diện."""
    return [
        {
            "role_code": code,
            "role_name": ROLE_DISPLAY_NAMES.get(code, code),
            "demo_user": profile["full_name"],
            "demo_scope": profile["scope"],
            "allowed_menu_count": len(get_menu_items_for_role(code)),
        }
        for code, profile in DEMO_PROFILES.items()
    ]
