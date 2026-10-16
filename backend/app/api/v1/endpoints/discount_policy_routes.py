"""Discount Policy Endpoints & Calculation Engine (Story S3-01).

Implements quantity-based volume tiered discounts (Chiết khấu theo sản lượng bậc thang)
for SKUs and Categories with Best-Price optimization for customers.
"""
from __future__ import annotations

import random
import string
import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.models.models import Category, DiscountPolicy, DiscountTier, Product, RoleCode, User
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_optional_current_user,
    normalize_role,
    require_roles,
)
from app.api.v1.endpoints.products import MOCK_PRODUCTS

router = APIRouter(prefix="/api/v1/discounts", tags=["Discount Policies (S3-01)"])
compat_router = APIRouter(prefix="/api/v1/discount-policies", tags=["Discount Policies (Compat)"])


def generate_discount_code(db: Session) -> str:
    """Generate unique discount code in format CK-YYYYMMDD-XXXX."""
    today_str = datetime.now().strftime("%Y%m%d")
    prefix = f"CK-{today_str}-"
    for _ in range(20):
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
        candidate = f"{prefix}{suffix}"
        if not db.query(DiscountPolicy).filter(DiscountPolicy.code == candidate).first():
            return candidate
    return f"{prefix}{uuid.uuid4().hex[:4].upper()}"


# ---------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------

class DiscountTierInput(BaseModel):
    min_quantity: int = Field(ge=1, default=1, alias="minQty")
    max_quantity: Optional[int] = Field(default=None, alias="maxQty")
    discount_value: float = Field(ge=0.0, default=0.0, alias="discountValue")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_tier_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "discountPercent" in data and "discount_value" not in data and "discountValue" not in data:
                data["discount_value"] = data["discountPercent"]
            elif "discount_percent" in data and "discount_value" not in data and "discountValue" not in data:
                data["discount_value"] = data["discount_percent"]
            if "minQuantity" in data and "min_quantity" not in data and "minQty" not in data:
                data["min_quantity"] = data["minQuantity"]
            elif "min_qty" in data and "min_quantity" not in data and "minQty" not in data:
                data["min_quantity"] = data["min_qty"]
            if "maxQuantity" in data and "max_quantity" not in data and "maxQty" not in data:
                data["max_quantity"] = data["maxQuantity"]
            elif "max_qty" in data and "max_quantity" not in data and "maxQty" not in data:
                data["max_quantity"] = data["max_qty"]
            # Convert empty string "" or whitespace to None
            if "max_quantity" in data and (data["max_quantity"] == "" or str(data["max_quantity"]).strip() == ""):
                data["max_quantity"] = None
            if "maxQuantity" in data and (data["maxQuantity"] == "" or str(data["maxQuantity"]).strip() == ""):
                data["maxQuantity"] = None
        return data

    @model_validator(mode="after")
    def validate_quantities(self) -> "DiscountTierInput":
        if self.max_quantity is not None and self.max_quantity < self.min_quantity:
            raise ValueError(f"Số lượng tối đa ({self.max_quantity}) không được nhỏ hơn số lượng tối thiểu ({self.min_quantity}).")
        return self


class DiscountTierResponse(BaseModel):
    id: Optional[int] = None
    policy_id: Optional[int] = None
    discount_id: Optional[int] = None
    min_qty: Optional[int] = None
    min_quantity: int = 1
    max_quantity: Optional[int] = None
    discount_percent: Optional[float] = None
    discount_value: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class DiscountPolicyCreate(BaseModel):
    code: Optional[str] = None
    name: str = Field(min_length=1, max_length=255)
    scope: Optional[str] = None
    target_type: str = Field(default="SKU", alias="scope")  # 'SKU' | 'CATEGORY'
    target_id: Optional[Union[str, int]] = Field(default=None, alias="targetId")
    product_id: Optional[int] = Field(default=None, alias="productId")
    created_by_user_id: Optional[int] = Field(default=None, alias="createdByUserId")
    start_date: Optional[Union[datetime, str]] = Field(default=None, alias="startDate")
    end_date: Optional[Union[datetime, str]] = Field(default=None, alias="endDate")
    discount_type: str = Field(default="PERCENTAGE", alias="discountType")  # 'PERCENTAGE' | 'FIXED_AMOUNT'
    is_active: bool = Field(default=True, alias="isActive")
    tiers: List[DiscountTierInput] = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_policy_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "targetType" in data and "target_type" not in data and "scope" not in data:
                data["target_type"] = data["targetType"]
            if "scope" in data and "target_type" not in data:
                data["target_type"] = data["scope"]
            if "target_type" in data and "scope" not in data:
                data["scope"] = data["target_type"]
            if "target_id" in data and data["target_id"] is not None:
                data["target_id"] = str(data["target_id"]).strip()
            elif "targetId" in data and data["targetId"] is not None:
                data["target_id"] = str(data["targetId"]).strip()
            if "productId" in data and "product_id" not in data:
                data["product_id"] = data["productId"]
            if "createdByUserId" in data and "created_by_user_id" not in data:
                data["created_by_user_id"] = data["createdByUserId"]
            if "startDate" in data and "start_date" not in data:
                data["start_date"] = data["startDate"]
            if "endDate" in data and "end_date" not in data:
                data["end_date"] = data["endDate"]
        return data


class DiscountPolicyUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    scope: Optional[str] = None
    target_type: Optional[str] = Field(default=None, alias="scope")
    target_id: Optional[Union[str, int]] = Field(default=None, alias="targetId")
    product_id: Optional[int] = Field(default=None, alias="productId")
    created_by_user_id: Optional[int] = Field(default=None, alias="createdByUserId")
    start_date: Optional[Union[datetime, str]] = Field(default=None, alias="startDate")
    end_date: Optional[Union[datetime, str]] = Field(default=None, alias="endDate")
    discount_type: Optional[str] = Field(default=None, alias="discountType")
    is_active: Optional[bool] = Field(default=None, alias="isActive")
    tiers: Optional[List[DiscountTierInput]] = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_update_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "targetType" in data and "target_type" not in data and "scope" not in data:
                data["target_type"] = data["targetType"]
            if "scope" in data and "target_type" not in data:
                data["target_type"] = data["scope"]
            if "target_type" in data and "scope" not in data:
                data["scope"] = data["target_type"]
            if "target_id" in data and data["target_id"] is not None:
                data["target_id"] = str(data["target_id"]).strip()
            elif "targetId" in data and data["targetId"] is not None:
                data["target_id"] = str(data["targetId"]).strip()
            if "productId" in data and "product_id" not in data:
                data["product_id"] = data["productId"]
            if "createdByUserId" in data and "created_by_user_id" not in data:
                data["created_by_user_id"] = data["createdByUserId"]
            if "startDate" in data and "start_date" not in data:
                data["start_date"] = data["startDate"]
            if "endDate" in data and "end_date" not in data:
                data["end_date"] = data["endDate"]
        return data


class DiscountPolicyResponse(BaseModel):
    id: int
    code: Optional[str] = None
    name: str
    scope: Optional[str] = None
    target_type: str = "SKU"
    applied_to_type: Optional[str] = "SKU"
    target_id: Optional[str] = ""
    applied_to_id: Optional[str] = ""
    product_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    target_name: Optional[str] = ""
    discount_type: str = "PERCENTAGE"
    is_active: bool = True
    created_at: Optional[datetime] = None
    tiers: List[DiscountTierResponse] = []

    model_config = ConfigDict(from_attributes=True)


class CalculateDiscountRequest(BaseModel):
    sku: str
    quantity: int = Field(ge=1, default=1)
    base_price: Optional[float] = Field(default=None, ge=0.0)


# ---------------------------------------------------------------------
# Target Helper Functions
# ---------------------------------------------------------------------

def _resolve_target_name(target_type: Optional[str], target_id: Optional[str], db: Session) -> str:
    """Resolve human-readable name for target SKU or Category."""
    if not target_id:
        return ""
    t_id = str(target_id).strip()
    if not t_id:
        return ""
    t_type = str(target_type or "SKU").strip().upper()

    if t_type == "SKU":
        # Check DB
        product = db.query(Product).filter(
            (func.upper(Product.sku) == t_id.upper())
            | (Product.id == int(t_id) if t_id.isdigit() else False)
        ).first()
        if product:
            return product.name
        # Check MOCK_PRODUCTS
        mock_p = MOCK_PRODUCTS.get(t_id.upper()) or MOCK_PRODUCTS.get(t_id)
        if mock_p:
            return mock_p.get("name", t_id)
        return t_id
    elif t_type == "CATEGORY":
        if t_id.isdigit():
            cat = db.query(Category).filter(Category.id == int(t_id)).first()
            if cat:
                return cat.name
        cat = db.query(Category).filter(
            (func.upper(Category.code) == t_id.upper())
            | (func.upper(Category.name) == t_id.upper())
        ).first()
        if cat:
            return cat.name
        return f"Nhóm hàng #{t_id}"
    return t_id


def _validate_target_exists(target_type: str, target_id: str, db: Session) -> str:
    """Validate target exists and return canonical target_id string."""
    t_type = target_type.strip().upper()
    t_id = target_id.strip()

    if t_type not in ("SKU", "CATEGORY"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loại đối tượng áp dụng '{target_type}' không hợp lệ. Chỉ chấp nhận 'SKU' hoặc 'CATEGORY'.",
        )

    if t_type == "SKU":
        prod = db.query(Product).filter(
            (func.upper(Product.sku) == t_id.upper())
            | (Product.id == int(t_id) if t_id.isdigit() else False)
        ).first()
        if prod:
            return prod.sku
        if t_id.upper() in [k.upper() for k in MOCK_PRODUCTS.keys()]:
            return t_id.upper()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{t_id}' không tồn tại trong hệ thống.",
        )
    elif t_type == "CATEGORY":
        cat = None
        if t_id.isdigit():
            cat = db.query(Category).filter(Category.id == int(t_id)).first()
        if not cat:
            cat = db.query(Category).filter(
                (func.upper(Category.code) == t_id.upper())
                | (func.upper(Category.name) == t_id.upper())
            ).first()
        if not cat and "(" in t_id and t_id.endswith(")"):
            # Extract code from 'Tên nhóm (MÃ)'
            code_inside = t_id[t_id.rfind("(") + 1 : -1].strip()
            name_part = t_id[: t_id.rfind("(")].strip()
            cat = db.query(Category).filter(
                (func.upper(Category.code) == code_inside.upper())
                | (func.upper(Category.name) == name_part.upper())
            ).first()
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nhóm hàng với ID hoặc mã '{t_id}' không tồn tại trong hệ thống.",
            )
        return str(cat.id)

    return t_id


def _validate_tiers(discount_type: str, tiers: List[DiscountTierInput]):
    d_type = discount_type.strip().upper()
    if d_type not in ("PERCENTAGE", "FIXED_AMOUNT"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Loại chiết khấu '{discount_type}' không hợp lệ. Chỉ chấp nhận 'PERCENTAGE' hoặc 'FIXED_AMOUNT'.",
        )

    for i, t in enumerate(tiers):
        if d_type == "PERCENTAGE" and t.discount_value > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bậc #{i+1}: Mức chiết khấu phần trăm ({t.discount_value}%) không được vượt quá 100%.",
            )


# ---------------------------------------------------------------------
# Calculation Engine: Best Discount for Customer
# ---------------------------------------------------------------------

def calculate_best_discount(
    sku: str,
    quantity: int,
    base_price: Optional[float] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Calculate the best volume discount applied to a given SKU and quantity.

    Scans all active policies applicable to SKU or Category of SKU,
    matches the quantity tier, computes actual discount amount, and
    selects the policy that gives the highest total discount to the customer.
    """
    clean_sku = sku.strip().upper()
    qty = max(1, int(quantity))

    # Resolve product and category
    effective_base_price = 0.0
    category_id_str = None
    product_name = clean_sku

    if db is not None:
        product = db.query(Product).filter(func.upper(Product.sku) == clean_sku).first()
        if product:
            product_name = product.name
            effective_base_price = float(product.base_price or 0.0)
            if product.category_id:
                category_id_str = str(product.category_id)

    if not category_id_str and clean_sku in [k.upper() for k in MOCK_PRODUCTS.keys()]:
        mock_p = MOCK_PRODUCTS.get(clean_sku) or MOCK_PRODUCTS.get(sku)
        if mock_p:
            product_name = mock_p.get("name", product_name)
            if effective_base_price <= 0 and mock_p.get("sale_price"):
                effective_base_price = float(mock_p.get("sale_price") or 0.0)
            if mock_p.get("category_id"):
                category_id_str = str(mock_p.get("category_id"))

    if base_price is not None and base_price >= 0:
        effective_base_price = float(base_price)

    # If no db session, return basic default
    if db is None:
        return {
            "sku": clean_sku,
            "product_name": product_name,
            "quantity": qty,
            "base_price": effective_base_price,
            "discount_per_unit": 0.0,
            "discount_amount": 0.0,
            "final_unit_price": effective_base_price,
            "final_total": effective_base_price * qty,
            "policy_id": None,
            "policy_name": None,
            "discount_type": None,
            "discount_value": 0.0,
            "tier_id": None,
        }

    # Query active policies
    query = (
        db.query(DiscountPolicy)
        .options(joinedload(DiscountPolicy.tiers))
        .filter(DiscountPolicy.is_active.is_(True))
    )

    matching_policies: List[DiscountPolicy] = []
    for policy in query.all():
        p_target_type = (policy.target_type or policy.scope or "SKU").strip().upper()
        p_target_id = (policy.target_id or "").strip()

        if p_target_type == "SKU" and p_target_id.upper() == clean_sku:
            matching_policies.append(policy)
        elif p_target_type == "CATEGORY" and category_id_str and p_target_id == category_id_str:
            matching_policies.append(policy)

    best_discount_per_unit = 0.0
    best_policy: Optional[DiscountPolicy] = None
    best_tier: Optional[DiscountTier] = None

    for policy in matching_policies:
        for tier in (policy.tiers or []):
            min_q = getattr(tier, "min_quantity", None) or getattr(tier, "min_qty", 1) or 1
            max_q = getattr(tier, "max_quantity", None)
            val = getattr(tier, "discount_value", None)
            if val is None:
                val = getattr(tier, "discount_percent", 0.0) or 0.0
            if min_q <= qty and (max_q is None or qty <= max_q):
                discount_per_unit = 0.0
                if (policy.discount_type or "PERCENTAGE").strip().upper() == "PERCENTAGE":
                    discount_per_unit = effective_base_price * (val / 100.0)
                else:  # FIXED_AMOUNT
                    discount_per_unit = min(val, effective_base_price)

                if discount_per_unit > best_discount_per_unit:
                    best_discount_per_unit = discount_per_unit
                    best_policy = policy
                    best_tier = tier

    total_discount = round(best_discount_per_unit * qty, 2)
    final_unit_price = max(0.0, round(effective_base_price - best_discount_per_unit, 2))
    final_total = round(final_unit_price * qty, 2)

    return {
        "sku": clean_sku,
        "product_name": product_name,
        "quantity": qty,
        "base_price": effective_base_price,
        "discount_per_unit": round(best_discount_per_unit, 2),
        "discount_amount": total_discount,
        "final_unit_price": final_unit_price,
        "final_total": final_total,
        "policy_id": best_policy.id if best_policy else None,
        "policy_name": best_policy.name if best_policy else None,
        "discount_type": best_policy.discount_type if best_policy else None,
        "discount_value": best_tier.discount_value if best_tier else 0.0,
        "tier_id": best_tier.id if best_tier else None,
    }


# ---------------------------------------------------------------------
# CRUD Endpoints
# ---------------------------------------------------------------------


def _format_policy_dict(p: DiscountPolicy, db: Session) -> Dict[str, Any]:
    target_type = str(p.target_type or p.scope or "SKU").strip().upper()
    target_id = str(p.target_id).strip() if p.target_id is not None else ""
    target_name = _resolve_target_name(target_type, target_id, db) if target_id else (p.name or "")

    tiers_data: List[Dict[str, Any]] = []
    tiers_list = getattr(p, "tiers", None) or []
    for t in tiers_list:
        min_q = getattr(t, "min_quantity", None)
        if min_q is None:
            min_q = getattr(t, "min_qty", 1) or 1
        val = getattr(t, "discount_value", None)
        if val is None:
            val = getattr(t, "discount_percent", 0.0) or 0.0
        tiers_data.append({
            "id": getattr(t, "id", None),
            "policy_id": getattr(t, "policy_id", p.id),
            "discount_id": getattr(t, "discount_id", p.id) or p.id,
            "min_qty": getattr(t, "min_qty", min_q),
            "min_quantity": min_q,
            "max_quantity": getattr(t, "max_quantity", None),
            "discount_percent": getattr(t, "discount_percent", val),
            "discount_value": float(val),
        })

    return {
        "id": p.id,
        "code": p.code or "",
        "name": p.name or "",
        "scope": p.scope or target_type,
        "target_type": target_type,
        "applied_to_type": target_type,
        "target_id": target_id,
        "applied_to_id": target_id,
        "product_id": p.product_id,
        "created_by_user_id": p.created_by_user_id,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "target_name": target_name,
        "discount_type": (p.discount_type or "PERCENTAGE").upper(),
        "is_active": bool(p.is_active),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "tiers": tiers_data,
    }


@router.get("", response_model=Dict[str, Any], summary="Danh sách chính sách chiết khấu")
def list_discount_policies(
    target_type: Optional[str] = Query(None, description="Lọc theo SKU hoặc CATEGORY"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo tên chính sách hoặc đối tượng"),
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    query = (
        select(DiscountPolicy)
        .options(joinedload(DiscountPolicy.tiers))
        .order_by(DiscountPolicy.created_at.desc(), DiscountPolicy.id.desc())
    )

    if target_type:
        query = query.where(DiscountPolicy.target_type == target_type.strip().upper())
    if is_active is not None:
        query = query.where(DiscountPolicy.is_active == is_active)
    if search and search.strip():
        kw = f"%{search.strip().lower()}%"
        query = query.where(
            (func.lower(DiscountPolicy.name).like(kw))
            | (func.lower(DiscountPolicy.target_id).like(kw))
        )

    policies = db.execute(query).scalars().unique().all()
    data = [_format_policy_dict(p, db) for p in policies]

    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách chính sách chiết khấu thành công.",
        "data": data,
        "total": len(data),
    }


@router.get("/{policy_id}", response_model=Dict[str, Any], summary="Chi tiết chính sách chiết khấu")
def get_discount_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    policy = (
        db.query(DiscountPolicy)
        .options(joinedload(DiscountPolicy.tiers))
        .filter(DiscountPolicy.id == policy_id)
        .first()
    )
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
        )

    return {
        "success": True,
        "code": 200,
        "data": _format_policy_dict(policy, db),
    }


@router.post("", status_code=status.HTTP_201_CREATED, summary="Tạo mới chính sách chiết khấu theo sản lượng")
def create_discount_policy(
    payload: DiscountPolicyCreate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    if user:
        role = normalize_role(user.role)
        if role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh (Sales Manager) hoặc Quản trị viên mới có quyền tạo chính sách chiết khấu.",
            )

    try:
        target_type = (payload.target_type or payload.scope or "SKU").strip().upper()
        raw_target_id = str(payload.target_id).strip() if payload.target_id is not None else ""

        canonical_target_id = _validate_target_exists(target_type, raw_target_id, db)
        _validate_tiers(payload.discount_type, payload.tiers)

        # 1. Resolve product_id from SKU or target_id (only when target_type == 'SKU')
        resolved_product_id = payload.product_id
        if target_type == "SKU":
            prod = db.query(Product).filter(
                (func.upper(Product.sku) == raw_target_id.upper())
                | (Product.id == int(raw_target_id) if raw_target_id.isdigit() else False)
                | (func.upper(Product.sku) == canonical_target_id.upper())
            ).first()
            if prod:
                resolved_product_id = prod.id
                canonical_target_id = prod.sku

        # 2. Auto-generate code if missing (e.g. CK-YYYYMMDD-XXXX)
        code = payload.code.strip() if payload.code and payload.code.strip() else generate_discount_code(db)

        # 3. Resolve created_by_user_id from token/session
        created_by_user_id = payload.created_by_user_id
        if not created_by_user_id:
            if user and user.id:
                created_by_user_id = user.id
            elif user and user.username:
                u = db.query(User).filter(User.username == user.username).first()
                if u:
                    created_by_user_id = u.id
            if not created_by_user_id:
                first_u = db.query(User).first()
                if first_u:
                    created_by_user_id = first_u.id

        # 4. Dates: start_date (default now), end_date (default None)
        start_date = payload.start_date
        if not start_date:
            start_date = datetime.now()
        elif isinstance(start_date, str):
            try:
                start_date = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except Exception:
                start_date = datetime.now()

        end_date = payload.end_date
        if isinstance(end_date, str) and end_date.strip():
            try:
                end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except Exception:
                end_date = None

        # Sort tiers by min_quantity
        sorted_tiers = sorted(payload.tiers, key=lambda t: t.min_quantity)

        # Tạo DiscountPolicy trước
        new_policy = DiscountPolicy(
            code=code,
            name=payload.name.strip(),
            scope=target_type,
            target_type=target_type,
            target_id=canonical_target_id,
            product_id=resolved_product_id,
            created_by_user_id=created_by_user_id,
            start_date=start_date,
            end_date=end_date,
            discount_type=payload.discount_type.strip().upper(),
            is_active=payload.is_active,
        )
        db.add(new_policy)
        db.flush()

        # 5. Gán discount_id / policy_id và min_qty / discount_percent cho từng DiscountTier
        for tier_in in sorted_tiers:
            tier = DiscountTier(
                policy_id=new_policy.id,
                discount_id=new_policy.id,
                min_qty=tier_in.min_quantity,
                discount_percent=tier_in.discount_value,
                min_quantity=tier_in.min_quantity,
                max_quantity=tier_in.max_quantity,
                discount_value=tier_in.discount_value,
            )
            db.add(tier)

        # Lưu cả hai vào DB trong cùng một transaction
        db.commit()
        db.refresh(new_policy)

        return {
            "success": True,
            "code": 201,
            "message": f"Tạo chính sách chiết khấu '{new_policy.name}' thành công.",
            "data": _format_policy_dict(new_policy, db),
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{policy_id}", summary="Cập nhật chính sách chiết khấu")
def update_discount_policy(
    policy_id: int,
    payload: DiscountPolicyUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    if user:
        role = normalize_role(user.role)
        if role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh (Sales Manager) hoặc Quản trị viên mới có quyền cập nhật chính sách chiết khấu.",
            )

    try:
        policy = (
            db.query(DiscountPolicy)
            .options(joinedload(DiscountPolicy.tiers))
            .filter(DiscountPolicy.id == policy_id)
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
            )

        if payload.code is not None:
            policy.code = payload.code.strip()
        if payload.name is not None:
            policy.name = payload.name.strip()
        if payload.target_type is not None or payload.target_id is not None:
            t_type = payload.target_type if payload.target_type is not None else policy.target_type
            t_id = str(payload.target_id) if payload.target_id is not None else policy.target_id
            canonical_target_id = _validate_target_exists(t_type, t_id, db)
            policy.target_type = t_type.strip().upper()
            policy.scope = policy.target_type
            policy.target_id = canonical_target_id
            if policy.target_type == "SKU":
                prod = db.query(Product).filter(
                    (func.upper(Product.sku) == str(canonical_target_id).upper())
                    | (Product.id == int(canonical_target_id) if str(canonical_target_id).isdigit() else False)
                ).first()
                if prod:
                    policy.product_id = prod.id
        if payload.product_id is not None:
            policy.product_id = payload.product_id
        if payload.discount_type is not None:
            policy.discount_type = payload.discount_type.strip().upper()
        if payload.is_active is not None:
            policy.is_active = payload.is_active
        if payload.start_date is not None:
            if isinstance(payload.start_date, str):
                try:
                    policy.start_date = datetime.fromisoformat(payload.start_date.replace("Z", "+00:00"))
                except Exception:
                    pass
            else:
                policy.start_date = payload.start_date
        if payload.end_date is not None:
            if isinstance(payload.end_date, str):
                try:
                    policy.end_date = datetime.fromisoformat(payload.end_date.replace("Z", "+00:00"))
                except Exception:
                    pass
            else:
                policy.end_date = payload.end_date

        if payload.tiers is not None:
            _validate_tiers(policy.discount_type, payload.tiers)
            # Delete existing tiers
            db.query(DiscountTier).filter(DiscountTier.policy_id == policy.id).delete()
            sorted_tiers = sorted(payload.tiers, key=lambda t: t.min_quantity)
            for tier_in in sorted_tiers:
                tier = DiscountTier(
                    policy_id=policy.id,
                    discount_id=policy.id,
                    min_qty=tier_in.min_quantity,
                    discount_percent=tier_in.discount_value,
                    min_quantity=tier_in.min_quantity,
                    max_quantity=tier_in.max_quantity,
                    discount_value=tier_in.discount_value,
                )
                db.add(tier)

        db.commit()
        db.refresh(policy)

        return {
            "success": True,
            "code": 200,
            "message": f"Cập nhật chính sách chiết khấu '{policy.name}' thành công.",
            "data": _format_policy_dict(policy, db),
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{policy_id}", summary="Xóa chính sách chiết khấu")
def delete_discount_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    if user:
        role = normalize_role(user.role)
        if role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh (Sales Manager) hoặc Quản trị viên mới có quyền xóa chính sách chiết khấu.",
            )

    policy = db.query(DiscountPolicy).filter(DiscountPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
        )

    name = policy.name
    db.delete(policy)
    db.commit()

    return {
        "success": True,
        "code": 200,
        "message": f"Xóa chính sách chiết khấu '{name}' thành công.",
        "data": {"id": policy_id},
    }


@router.patch("/{policy_id}/toggle-status", summary="Bật/tắt trạng thái hoạt động của chính sách chiết khấu")
def toggle_discount_policy_status(
    policy_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    if user:
        role = normalize_role(user.role)
        if role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh (Sales Manager) hoặc Quản trị viên mới có quyền thay đổi trạng thái chính sách.",
            )

    policy = db.query(DiscountPolicy).filter(DiscountPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
        )

    policy.is_active = not policy.is_active
    db.commit()
    db.refresh(policy)

    status_str = "Kích hoạt" if policy.is_active else "Tạm ngưng"
    return {
        "success": True,
        "code": 200,
        "message": f"Đã chuyển trạng thái chính sách '{policy.name}' sang: {status_str}.",
        "data": {
            "id": policy.id,
            "is_active": policy.is_active,
        },
    }


@router.post("/calculate", summary="Tính toán chiết khấu sản lượng tốt nhất")
def calculate_discount_endpoint(
    payload: CalculateDiscountRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Calculate best discount for given SKU, quantity, and optional base price."""
    result = calculate_best_discount(
        sku=payload.sku,
        quantity=payload.quantity,
        base_price=payload.base_price,
        db=db,
    )
    return {
        "success": True,
        "code": 200,
        "data": result,
    }


# Support compat alias route POST /api/v1/discount-policies (Story S3-01 in API_SPECIFICATION.md)
@compat_router.post("", status_code=status.HTTP_201_CREATED, summary="Alias POST /discount-policies (Story S3-01)")
def create_discount_policy_compat(
    payload: DiscountPolicyCreate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    return create_discount_policy(payload, db, user)
