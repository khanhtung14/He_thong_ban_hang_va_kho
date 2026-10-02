"""Products endpoints with RBAC enforcement, sensitive financial data masking, and category transfer (SCRUM-76)."""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from src.backend.models import RoleCode
    from src.backend.rbac import (
        PERM_PRODUCTS_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )
except ModuleNotFoundError:  # pragma: no cover
    from models import RoleCode
    from rbac import (
        PERM_PRODUCTS_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )

router = APIRouter(prefix="/api/v1/products", tags=["Products"])

class MoveProductCategoryRequest(BaseModel):
    target_category_id: int = Field(gt=0, description="ID nhóm hàng mới cần chuyển đến")

# Initial seed definition for products
DEFAULT_MOCK_PRODUCTS: dict[str, dict[str, Any]] = {
    "SKU-001": {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "category": "Nước tăng lực có gas",
        "category_id": 3,
        "sale_price": 500000,
        "cost_price": 350000,
        "margin": "30.0%",
        "stock_available": 120,
        "unit": "Thùng 24 lon",
    },
    "SKU-002": {
        "sku": "SKU-002",
        "name": "Cà phê lon Highlands 235ml",
        "category": "Cà phê",
        "category_id": None,
        "sale_price": 240000,
        "cost_price": 180000,
        "margin": "25.0%",
        "stock_available": 85,
        "unit": "Thùng 24 lon",
    },
}

# Mutable mock products database
MOCK_PRODUCTS: dict[str, dict[str, Any]] = {k: v.copy() for k, v in DEFAULT_MOCK_PRODUCTS.items()}


def reset_mock_products() -> None:
    """Reset products dictionary to initial seed state."""
    global MOCK_PRODUCTS
    MOCK_PRODUCTS.clear()
    for k, v in DEFAULT_MOCK_PRODUCTS.items():
        MOCK_PRODUCTS[k] = v.copy()


@router.get("")
def list_products(
    category_id: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products.

    Supports optional category_id query filtering:
    - None: returns all products (backward-compatible)
    - int: returns only products belonging to category_id
    """
    products_list = [p.copy() for p in MOCK_PRODUCTS.values()]
    if category_id is not None:
        products_list = [p for p in products_list if p.get("category_id") == category_id]
    return sanitize_financial_data(products_list, user)


@router.get("/{sku}")
def get_product_detail(
    sku: str,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get product detail by SKU.

    Confidentiality rule:
    - Warehouse and Sales Rep: cost_price and margin are stripped.
    - Sales Manager only: cost_price and margin are present.
    """
    product = MOCK_PRODUCTS.get(sku.upper()) or MOCK_PRODUCTS.get(sku)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Sản phẩm '{sku}' không tồn tại.")

    sanitized = sanitize_financial_data(product.copy(), user)
    return sanitized


@router.patch("/{sku}/category")
def move_product_category(
    sku: str,
    payload: MoveProductCategoryRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Move a single product to a new target category (AC 2).

    Restricted to Sales Manager and Admin roles.
    """
    if user.role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền chuyển nhóm hàng sản phẩm.",
        )

    product = MOCK_PRODUCTS.get(sku.upper()) or MOCK_PRODUCTS.get(sku)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    try:
        from src.backend.product_categories import get_category_by_id
    except ModuleNotFoundError:  # pragma: no cover
        from product_categories import get_category_by_id

    target_cat = get_category_by_id(payload.target_category_id)
    if not target_cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nhóm hàng đích với ID '{payload.target_category_id}' không tồn tại.",
        )

    old_category_id = product.get("category_id")
    old_category_name = product.get("category")

    product["category_id"] = target_cat["id"]
    product["category"] = target_cat["name"]

    return {
        "message": f"Chuyển sản phẩm '{sku}' sang nhóm '{target_cat['name']}' thành công.",
        "sku": product["sku"],
        "name": product["name"],
        "old_category_id": old_category_id,
        "old_category_name": old_category_name,
        "new_category_id": target_cat["id"],
        "new_category_name": target_cat["name"],
    }
