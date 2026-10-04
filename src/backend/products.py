"""Products endpoints with RBAC enforcement and sensitive financial data masking."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from src.backend.rbac import (
        PERM_PRODUCTS_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_PRODUCTS_VIEW,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )

router = APIRouter(prefix="/api/v1/products", tags=["Products"])

# Mock products database
MOCK_PRODUCTS: dict[str, dict[str, Any]] = {
    "SKU-001": {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "category": "Nước giải khát",
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
        "sale_price": 240000,
        "cost_price": 180000,
        "margin": "25.0%",
        "stock_available": 85,
        "unit": "Thùng 24 lon",
    },
}


@router.get("")
def list_products(
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products.

    Confidentiality rule:
    - Warehouse and Sales Rep: cost_price and margin are stripped.
    - Sales Manager only: cost_price and margin are present.
    """
    products_list = [p.copy() for p in MOCK_PRODUCTS.values()]
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
