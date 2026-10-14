"""Discount Policy Endpoints & Calculation Engine (Story S3-01).

Implements quantity-based volume tiered discounts (Chiết khấu theo sản lượng bậc thang)
for SKUs and Categories with Best-Price optimization for customers.
"""
from __future__ import annotations

import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.models import Category, DiscountPolicy, DiscountTier, Product, RoleCode
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_optional_current_user,
    normalize_role,
    require_roles,
)
from app.api.v1.endpoints.products import MOCK_PRODUCTS

router = APIRouter(prefix="/api/v1/discounts", tags=["Discount Policies (S3-01)"])
compat_router = APIRouter(prefix="/api/v1/discount-policies", tags=["Discount Policies (Compat)"])


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
            if "minQuantity" in data and "min_quantity" not in data and "minQty" not in data:
                data["min_quantity"] = data["minQuantity"]
            if "maxQuantity" in data and "max_quantity" not in data and "maxQty" not in data:
                data["max_quantity"] = data["maxQuantity"]
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
    id: int
    policy_id: int
    min_quantity: int
    max_quantity: Optional[int] = None
    discount_value: float

    model_config = ConfigDict(from_attributes=True)


class DiscountPolicyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    target_type: str = Field(default="SKU", alias="scope")  # 'SKU' | 'CATEGORY'
    target_id: Union[str, int] = Field(alias="targetId")
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
            if "target_id" in data:
                data["target_id"] = str(data["target_id"]).strip()
            elif "targetId" in data:
                data["target_id"] = str(data["targetId"]).strip()
        return data


class DiscountPolicyUpdate(BaseModel):
    name: Optional[str] = None
    target_type: Optional[str] = Field(default=None, alias="scope")
    target_id: Optional[Union[str, int]] = Field(default=None, alias="targetId")
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
            if "target_id" in data and data["target_id"] is not None:
                data["target_id"] = str(data["target_id"]).strip()
            elif "targetId" in data and data["targetId"] is not None:
                data["target_id"] = str(data["targetId"]).strip()
        return data


class DiscountPolicyResponse(BaseModel):
    id: int
    name: str
    target_type: str
    target_id: str
    target_name: Optional[str] = None
    discount_type: str
    is_active: bool
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

def _resolve_target_name(target_type: str, target_id: str, db: Session) -> str:
    """Resolve human-readable name for target SKU or Category."""
    if target_type.upper() == "SKU":
        # Check DB
        product = db.query(Product).filter(
            (func.upper(Product.sku) == target_id.upper())
            | (Product.id == int(target_id) if target_id.isdigit() else False)
        ).first()
        if product:
            return product.name
        # Check MOCK_PRODUCTS
        mock_p = MOCK_PRODUCTS.get(target_id.upper()) or MOCK_PRODUCTS.get(target_id)
        if mock_p:
            return mock_p.get("name", target_id)
        return target_id
    elif target_type.upper() == "CATEGORY":
        if target_id.isdigit():
            cat = db.query(Category).filter(Category.id == int(target_id)).first()
            if cat:
                return cat.name
        cat = db.query(Category).filter(
            (func.upper(Category.code) == target_id.upper())
            | (func.upper(Category.name) == target_id.upper())
        ).first()
        if cat:
            return cat.name
        return f"Nhóm hàng #{target_id}"
    return target_id


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
        .options(selectinload(DiscountPolicy.tiers))
        .filter(DiscountPolicy.is_active.is_(True))
    )

    matching_policies: List[DiscountPolicy] = []
    for policy in query.all():
        p_target_type = policy.target_type.upper()
        p_target_id = policy.target_id.strip()

        if p_target_type == "SKU" and p_target_id.upper() == clean_sku:
            matching_policies.append(policy)
        elif p_target_type == "CATEGORY" and category_id_str and p_target_id == category_id_str:
            matching_policies.append(policy)

    best_discount_per_unit = 0.0
    best_policy: Optional[DiscountPolicy] = None
    best_tier: Optional[DiscountTier] = None

    for policy in matching_policies:
        for tier in policy.tiers:
            if tier.min_quantity <= qty and (tier.max_quantity is None or qty <= tier.max_quantity):
                discount_per_unit = 0.0
                if policy.discount_type.upper() == "PERCENTAGE":
                    discount_per_unit = effective_base_price * (tier.discount_value / 100.0)
                else:  # FIXED_AMOUNT
                    discount_per_unit = min(tier.discount_value, effective_base_price)

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
        .options(selectinload(DiscountPolicy.tiers))
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

    policies = db.execute(query).scalars().all()

    data: List[Dict[str, Any]] = []
    for p in policies:
        target_name = _resolve_target_name(p.target_type, p.target_id, db)
        data.append({
            "id": p.id,
            "name": p.name,
            "target_type": p.target_type,
            "target_id": p.target_id,
            "target_name": target_name,
            "discount_type": p.discount_type,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "tiers": [
                {
                    "id": t.id,
                    "policy_id": t.policy_id,
                    "min_quantity": t.min_quantity,
                    "max_quantity": t.max_quantity,
                    "discount_value": t.discount_value,
                }
                for t in p.tiers
            ],
        })

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
        .options(selectinload(DiscountPolicy.tiers))
        .filter(DiscountPolicy.id == policy_id)
        .first()
    )
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
        )

    target_name = _resolve_target_name(policy.target_type, policy.target_id, db)
    return {
        "success": True,
        "code": 200,
        "data": {
            "id": policy.id,
            "name": policy.name,
            "target_type": policy.target_type,
            "target_id": policy.target_id,
            "target_name": target_name,
            "discount_type": policy.discount_type,
            "is_active": policy.is_active,
            "created_at": policy.created_at.isoformat() if policy.created_at else None,
            "tiers": [
                {
                    "id": t.id,
                    "policy_id": t.policy_id,
                    "min_quantity": t.min_quantity,
                    "max_quantity": t.max_quantity,
                    "discount_value": t.discount_value,
                }
                for t in policy.tiers
            ],
        },
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
        canonical_target_id = _validate_target_exists(payload.target_type, str(payload.target_id), db)
        _validate_tiers(payload.discount_type, payload.tiers)

        # Sort tiers by min_quantity
        sorted_tiers = sorted(payload.tiers, key=lambda t: t.min_quantity)

        # Tạo DiscountPolicy trước
        new_policy = DiscountPolicy(
            name=payload.name.strip(),
            target_type=payload.target_type.strip().upper(),
            target_id=canonical_target_id,
            discount_type=payload.discount_type.strip().upper(),
            is_active=payload.is_active,
        )
        db.add(new_policy)
        db.flush()

        # Gán policy.id cho từng DiscountTier
        for tier_in in sorted_tiers:
            tier = DiscountTier(
                policy_id=new_policy.id,
                min_quantity=tier_in.min_quantity,
                max_quantity=tier_in.max_quantity,
                discount_value=tier_in.discount_value,
            )
            db.add(tier)

        # Lưu cả hai vào DB trong cùng một transaction
        db.commit()
        db.refresh(new_policy)

        target_name = _resolve_target_name(new_policy.target_type, new_policy.target_id, db)

        return {
            "success": True,
            "code": 201,
            "message": f"Tạo chính sách chiết khấu '{new_policy.name}' thành công.",
            "data": {
                "id": new_policy.id,
                "name": new_policy.name,
                "target_type": new_policy.target_type,
                "target_id": new_policy.target_id,
                "target_name": target_name,
                "discount_type": new_policy.discount_type,
                "is_active": new_policy.is_active,
                "created_at": new_policy.created_at.isoformat() if new_policy.created_at else None,
                "tiers": [
                    {
                        "id": t.id,
                        "policy_id": t.policy_id,
                        "min_quantity": t.min_quantity,
                        "max_quantity": t.max_quantity,
                        "discount_value": t.discount_value,
                    }
                    for t in new_policy.tiers
                ],
            },
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
            .options(selectinload(DiscountPolicy.tiers))
            .filter(DiscountPolicy.id == policy_id)
            .first()
        )
        if not policy:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy chính sách chiết khấu với ID {policy_id}.",
            )

        if payload.name is not None:
            policy.name = payload.name.strip()
        if payload.target_type is not None or payload.target_id is not None:
            t_type = payload.target_type if payload.target_type is not None else policy.target_type
            t_id = str(payload.target_id) if payload.target_id is not None else policy.target_id
            canonical_target_id = _validate_target_exists(t_type, t_id, db)
            policy.target_type = t_type.strip().upper()
            policy.target_id = canonical_target_id
        if payload.discount_type is not None:
            policy.discount_type = payload.discount_type.strip().upper()
        if payload.is_active is not None:
            policy.is_active = payload.is_active

        if payload.tiers is not None:
            _validate_tiers(policy.discount_type, payload.tiers)
            # Delete existing tiers
            db.query(DiscountTier).filter(DiscountTier.policy_id == policy.id).delete()
            sorted_tiers = sorted(payload.tiers, key=lambda t: t.min_quantity)
            for tier_in in sorted_tiers:
                tier = DiscountTier(
                    policy_id=policy.id,
                    min_quantity=tier_in.min_quantity,
                    max_quantity=tier_in.max_quantity,
                    discount_value=tier_in.discount_value,
                )
                db.add(tier)

        db.commit()
        db.refresh(policy)

        target_name = _resolve_target_name(policy.target_type, policy.target_id, db)
        return {
            "success": True,
            "code": 200,
            "message": f"Cập nhật chính sách chiết khấu '{policy.name}' thành công.",
            "data": {
                "id": policy.id,
                "name": policy.name,
                "target_type": policy.target_type,
                "target_id": policy.target_id,
                "target_name": target_name,
                "discount_type": policy.discount_type,
                "is_active": policy.is_active,
                "created_at": policy.created_at.isoformat() if policy.created_at else None,
                "tiers": [
                    {
                        "id": t.id,
                        "policy_id": t.policy_id,
                        "min_quantity": t.min_quantity,
                        "max_quantity": t.max_quantity,
                        "discount_value": t.discount_value,
                    }
                    for t in policy.tiers
                ],
            },
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
