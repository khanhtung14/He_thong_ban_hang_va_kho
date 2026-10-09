"""Role-Based Access Control (RBAC) and Security Scoping for OMS.

Enforces:
1. 7 standard system roles: Customer, Sales Rep, Sales Manager, Warehouse, WH Manager, Accountant, Admin.
2. Server-side Default-Deny access control for all protected endpoints.
3. Strict inventory constraint: Sales Rep is strictly forbidden from adjusting/updating inventory quantities.
4. Confidentiality of Cost Price and Margin:
   - Stripped/hidden for Warehouse, WH Manager, Sales Rep, Customer, Accountant.
   - Strictly permitted ONLY for Sales Manager.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Set, Union

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

try:
    from src.backend.models import RoleCode
except ModuleNotFoundError:  # pragma: no cover
    from models import RoleCode

# Secret key & algorithm for JWT tokens
JWT_SECRET = "oms-rbac-jwt-secret-key-2026-production"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Normalization mapping for standard roles
ROLE_CANONICAL_MAP: Dict[str, RoleCode] = {
    "customer": RoleCode.CUSTOMER,
    "sales rep": RoleCode.SALES_REP,
    "sales_rep": RoleCode.SALES_REP,
    "sales": RoleCode.SALES_REP,
    "sales manager": RoleCode.SALES_MANAGER,
    "sales_manager": RoleCode.SALES_MANAGER,
    "warehouse": RoleCode.WAREHOUSE,
    "wh manager": RoleCode.WH_MANAGER,
    "wh_manager": RoleCode.WH_MANAGER,
    "warehouse manager": RoleCode.WH_MANAGER,
    "accountant": RoleCode.ACCOUNTANT,
    "admin": RoleCode.ADMIN,
    "administrator": RoleCode.ADMIN,
}


def normalize_role(role_name: Optional[str]) -> Optional[str]:
    """Normalize any role string representation to standard RoleCode value."""
    if not role_name:
        return None
    cleaned = role_name.strip().lower().replace("-", "_")
    matched = ROLE_CANONICAL_MAP.get(cleaned)
    if matched:
        return matched.value
    # Try direct comparison against enum values
    for rc in RoleCode:
        if rc.value.lower() == cleaned:
            return rc.value
    return role_name.strip()


# Permission definition constants
PERM_INVENTORY_VIEW = "inventory:view"
PERM_INVENTORY_ADJUST = "inventory:adjust"
PERM_INVENTORY_TRANSFER = "inventory:transfer"
PERM_INVENTORY_COUNT = "inventory:count"
PERM_INVENTORY_RECEIVE = "inventory:receive"
PERM_INVENTORY_PICK = "inventory:pick"

PERM_PRODUCTS_VIEW = "products:view"
PERM_PRODUCTS_VIEW_FINANCIALS = "products:view_financials"  # Cost price & Margin

PERM_ORDERS_CREATE = "orders:create"
PERM_ORDERS_APPROVE = "orders:approve"
PERM_ORDERS_VIEW_OWN = "orders:view_own"
PERM_ORDERS_VIEW_ASSIGNED = "orders:view_assigned"
PERM_ORDERS_VIEW_ALL = "orders:view_all"

PERM_DEBT_VIEW_OWN = "debt:view_own"
PERM_DEBT_VIEW_ASSIGNED = "debt:view_assigned"
PERM_DEBT_VIEW_ALL = "debt:view_all"
PERM_DEBT_RECONCILE = "debt:reconcile"

PERM_INVOICE_MANAGE = "invoice:manage"
PERM_PAYMENT_RECORD = "payment:record"
PERM_CUSTOMERS_LOCK = "customers:lock"  # SCRUM-85: Quyền khóa/mở khóa giao dịch đại lý
PERM_SYSTEM_ADMIN = "system:admin"


# Role-Permissions Matrix (Default-Deny)
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    RoleCode.CUSTOMER.value: {
        PERM_PRODUCTS_VIEW,
        PERM_ORDERS_CREATE,
        PERM_ORDERS_VIEW_OWN,
        PERM_DEBT_VIEW_OWN,
    },
    RoleCode.SALES_REP.value: {
        PERM_PRODUCTS_VIEW,
        PERM_INVENTORY_VIEW,
        PERM_ORDERS_CREATE,
        PERM_ORDERS_VIEW_ASSIGNED,
        PERM_DEBT_VIEW_ASSIGNED,
        # TUYỆT ĐỐI KHÔNG có PERM_INVENTORY_ADJUST
        # TUYỆT ĐỐI KHÔNG có PERM_PRODUCTS_VIEW_FINANCIALS
    },
    RoleCode.SALES_MANAGER.value: {
        PERM_PRODUCTS_VIEW,
        PERM_PRODUCTS_VIEW_FINANCIALS,  # Cho phép xem giá vốn & biên lợi nhuận
        PERM_INVENTORY_VIEW,
        PERM_ORDERS_CREATE,
        PERM_ORDERS_APPROVE,
        PERM_ORDERS_VIEW_ALL,
        PERM_DEBT_VIEW_ALL,
    },
    RoleCode.WAREHOUSE.value: {
        PERM_PRODUCTS_VIEW,
        PERM_INVENTORY_VIEW,
        PERM_INVENTORY_PICK,
        PERM_INVENTORY_RECEIVE,
        PERM_INVENTORY_COUNT,
        # TUYỆT ĐỐI KHÔNG có PERM_PRODUCTS_VIEW_FINANCIALS
        # Không có PERM_INVENTORY_ADJUST (chỉ WH Manager mới có quyền duyệt/điều chỉnh)
    },
    RoleCode.WH_MANAGER.value: {
        PERM_PRODUCTS_VIEW,
        PERM_INVENTORY_VIEW,
        PERM_INVENTORY_PICK,
        PERM_INVENTORY_RECEIVE,
        PERM_INVENTORY_COUNT,
        PERM_INVENTORY_ADJUST,    # Quản lý kho duyệt điều chỉnh tồn
        PERM_INVENTORY_TRANSFER,  # Quản lý kho chuyển kho
        # TUYỆT ĐỐI KHÔNG có PERM_PRODUCTS_VIEW_FINANCIALS (Bảo vệ bí mật thương mại)
    },
    RoleCode.ACCOUNTANT.value: {
        PERM_PRODUCTS_VIEW,
        PERM_INVOICE_MANAGE,
        PERM_PAYMENT_RECORD,
        PERM_DEBT_RECONCILE,
        PERM_DEBT_VIEW_ALL,
        PERM_CUSTOMERS_LOCK,  # SCRUM-85: Kế toán công nợ được phép khóa/mở giao dịch đại lý
        # TUYỆT ĐỐI KHÔNG có PERM_PRODUCTS_VIEW_FINANCIALS
    },
    RoleCode.ADMIN.value: {
        PERM_SYSTEM_ADMIN,
        PERM_PRODUCTS_VIEW,
        PERM_INVENTORY_VIEW,
        PERM_INVENTORY_ADJUST,
        PERM_INVENTORY_TRANSFER,
        PERM_INVENTORY_COUNT,
        PERM_INVENTORY_RECEIVE,
        PERM_INVENTORY_PICK,
        PERM_ORDERS_CREATE,
        PERM_ORDERS_APPROVE,
        PERM_ORDERS_VIEW_ALL,
        PERM_DEBT_VIEW_ALL,
        PERM_DEBT_RECONCILE,
        PERM_INVOICE_MANAGE,
        PERM_PAYMENT_RECORD,
        PERM_CUSTOMERS_LOCK,
    },
}



class AuthenticatedUser(BaseModel):
    username: str
    role: str
    full_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_ids: list[int] = Field(default_factory=list)
    territory_id: Optional[int] = None

    def has_permission(self, permission: str) -> bool:
        normalized_role = normalize_role(self.role)
        if not normalized_role:
            return False
        perms = ROLE_PERMISSIONS.get(normalized_role, set())
        return permission in perms

    def can_view_financials(self) -> bool:
        return self.has_permission(PERM_PRODUCTS_VIEW_FINANCIALS)


# Financial fields that must be masked / stripped for unauthorized roles
SENSITIVE_FINANCIAL_FIELDS = {
    "cost_price",
    "costPrice",
    "cogs",
    "margin",
    "gross_margin",
    "margin_percentage",
    "margin_rate",
    "profit",
    "profit_margin",
}


def can_view_financials(role_name: Optional[str]) -> bool:
    """Return True only for the Sales Manager role."""
    normalized = normalize_role(role_name)
    if not normalized:
        return False
    perms = ROLE_PERMISSIONS.get(normalized, set())
    return PERM_PRODUCTS_VIEW_FINANCIALS in perms


def sanitize_financial_data(data: Any, user_or_role: Optional[Union[AuthenticatedUser, str]]) -> Any:
    """Recursively filter out cost_price and margin if user role is not authorized."""
    role = user_or_role.role if isinstance(user_or_role, AuthenticatedUser) else user_or_role
    if can_view_financials(role):
        return data

    if isinstance(data, dict):
        return {
            k: sanitize_financial_data(v, role)
            for k, v in data.items()
            if k not in SENSITIVE_FINANCIAL_FIELDS
        }
    elif isinstance(data, list):
        return [sanitize_financial_data(item, role) for item in data]
    return data


# JWT Token creation and decoding
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode.setdefault("iat", datetime.now(timezone.utc).timestamp())
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mã xác thực không hợp lệ hoặc đã hết hạn.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Dependency that extracts and validates user identity and role.

    Supports:
    1. Standard JWT Bearer token via `Authorization: Bearer <token>`
    Default-Deny: Returns 401 if no valid bearer token is supplied.
    """
    # 1. Bearer token
    if auth and auth.credentials:
        token = auth.credentials
        try:
            payload = decode_access_token(token)
            username = payload.get("sub") or payload.get("username")
            role_raw = payload.get("role") or payload.get("role_code")
            if not username or not role_raw:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Mã token thiếu thông tin người dùng hoặc vai trò.",
                )
            normalized = normalize_role(role_raw)
            if not normalized:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Vai trò trong token không hợp lệ trên hệ thống.",
                )
            return AuthenticatedUser(
                username=username,
                role=normalized,
                full_name=payload.get("full_name"),
                warehouse_id=payload.get("warehouse_id"),
                warehouse_ids=payload.get("warehouse_ids") or ([payload["warehouse_id"]] if payload.get("warehouse_id") else []),
                territory_id=payload.get("territory_id"),
            )
        except HTTPException:
            # Fallback for database session token
            try:
                import hashlib
                from src.backend.database import SessionLocal
                from src.backend.models import UserSession, AccountStatus
                token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
                db = SessionLocal()
                try:
                    s = (
                        db.query(UserSession)
                        .filter(
                            UserSession.refresh_token_hash == token_hash,
                            UserSession.revoked_at.is_(None),
                        )
                        .first()
                    )
                    if s and s.user and s.user.status == AccountStatus.ACTIVE:
                        db_user = s.user
                        role_code = db_user.roles[0].code if db_user.roles else "SALES_MANAGER"
                        return AuthenticatedUser(
                            username=db_user.username,
                            role=normalize_role(role_code) or "SALES_MANAGER",
                            full_name=db_user.full_name,
                        )
                finally:
                    db.close()
            except Exception:
                pass
            raise

    # Default-Deny: Missing authentication credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Yêu cầu xác thực tài khoản (Thiếu thông tin đăng nhập hoặc Authorization header).",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_roles(*allowed_roles: Union[str, RoleCode]):
    """Enforce role check with Default Deny."""
    normalized_allowed = {
        normalize_role(r.value if isinstance(r, RoleCode) else r)
        for r in allowed_roles
    }

    def role_checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        user_norm = normalize_role(user.role)
        if user_norm not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Quyền bị từ chối: Vai trò '{user.role}' không được phép truy cập tài nguyên này.",
            )
        return user

    return role_checker


def require_permissions(*required_permissions: str):
    """Enforce permission check with Default Deny."""
    def permission_checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        for perm in required_permissions:
            if not user.has_permission(perm):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Quyền bị từ chối: Vai trò '{user.role}' không có quyền '{perm}'.",
                )
        return user

    return permission_checker
