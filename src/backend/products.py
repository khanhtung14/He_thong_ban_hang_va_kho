"""Products endpoints with RBAC enforcement and sensitive financial data masking."""

from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

try:
    from src.backend.rbac import (
        PERM_PRODUCTS_VIEW,
        PERM_PRODUCTS_UNIT_MANAGE,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )
    from src.backend.database import get_db
    from src.backend.models import ProductUnit
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_PRODUCTS_VIEW,
        PERM_PRODUCTS_UNIT_MANAGE,
        AuthenticatedUser,
        require_permissions,
        sanitize_financial_data,
    )
    from database import get_db
    from models import ProductUnit

router = APIRouter(prefix="/api/v1/products", tags=["Products"])

# Mock products database
MOCK_PRODUCTS: Dict[str, Dict[str, Any]] = {
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


class ProductUnitRequest(BaseModel):
    unit_name: str = Field(min_length=1, max_length=100)
    conversion_rate: float = Field(gt=0, allow_inf_nan=False)
    is_base_unit: bool = False

    @field_validator("unit_name")
    @classmethod
    def clean_unit_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tên đơn vị không được để trống.")
        return value


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


@router.get("/{product_id}/units")
def list_product_units(
    product_id: int = PathParam(gt=0),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List configured conversion units for one product."""
    rows = (
        db.query(ProductUnit)
        .filter(ProductUnit.product_id == product_id)
        .order_by(ProductUnit.is_base_unit.desc(), ProductUnit.unit_name.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "product_id": row.product_id,
            "unit_name": row.unit_name,
            "conversion_rate": row.conversion_rate,
            "is_base_unit": row.is_base_unit,
        }
        for row in rows
    ]


@router.post("/{product_id}/units")
def upsert_product_unit(
    payload: ProductUnitRequest,
    product_id: int = PathParam(gt=0),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_UNIT_MANAGE)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create or update a unit; at most one unit per product can be the base."""
    conversion_rate = 1.0 if payload.is_base_unit else payload.conversion_rate
    try:
        row = (
            db.query(ProductUnit)
            .filter(
                ProductUnit.product_id == product_id,
                ProductUnit.unit_name == payload.unit_name,
            )
            .first()
        )
        if row is None:
            row = ProductUnit(
                product_id=product_id,
                unit_name=payload.unit_name,
                conversion_rate=conversion_rate,
                is_base_unit=payload.is_base_unit,
            )
            db.add(row)
        else:
            row.conversion_rate = conversion_rate
            row.is_base_unit = payload.is_base_unit

        if payload.is_base_unit:
            (
                db.query(ProductUnit)
                .filter(
                    ProductUnit.product_id == product_id,
                    ProductUnit.unit_name != payload.unit_name,
                )
                .update({ProductUnit.is_base_unit: False}, synchronize_session=False)
            )
        db.commit()
        db.refresh(row)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể lưu đơn vị tính sản phẩm.",
        ) from exc

    return {
        "id": row.id,
        "product_id": row.product_id,
        "unit_name": row.unit_name,
        "conversion_rate": row.conversion_rate,
        "is_base_unit": row.is_base_unit,
    }
