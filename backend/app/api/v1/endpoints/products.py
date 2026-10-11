"""Products endpoints with RBAC enforcement."""

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Product, Category, ProductUnit
from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW,
    PERM_PRODUCTS_MANAGE,
    PERM_PRODUCTS_UNIT_MANAGE,
    AuthenticatedUser,
    require_permissions,
    sanitize_financial_data,
)
from pydantic import BaseModel

class ProductUnitResponse(BaseModel):
    id: int
    unitName: str
    conversionRate: float
    barcode: Optional[str] = None

class ProductBase(BaseModel):
    id: int
    sku: str
    name: str
    categoryId: Optional[int] = None
    baseUnit: str
    manageByLot: bool
    minStock: int
    basePrice: Optional[float] = None
    costPrice: Optional[float] = None
    status: str
    imageUrl: Optional[str] = None
    units: Optional[list[ProductUnitResponse]] = None

class PaginationInfo(BaseModel):
    page: int
    limit: int
    totalRecords: int
    totalPages: int

class ProductListResponse(BaseModel):
    success: bool
    code: int
    message: str
    data: list[ProductBase]
    pagination: PaginationInfo

class ProductDetailResponse(BaseModel):
    success: bool
    code: int
    message: str
    data: ProductBase

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


@router.get("", response_model=ProductListResponse)
def list_products(
    keyword: Optional[str] = None,
    category_id: Optional[int] = Query(None, alias="categoryId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products."""
    query = db.query(Product)
    
    if keyword:
        query = query.filter(
            (Product.name.ilike(f"%{keyword}%")) | (Product.sku.ilike(f"%{keyword}%"))
        )
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if status_filter:
        query = query.filter(Product.status == status_filter)
        
    total_records = query.count()
    products = query.offset((page - 1) * limit).limit(limit).all()
    
    products_list = []
    for p in products:
        p_dict = {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "categoryId": p.category_id,
            "baseUnit": p.base_unit,
            "manageByLot": p.manage_by_lot,
            "minStock": p.min_stock,
            "basePrice": p.base_price,
            "costPrice": p.cost_price,
            "status": p.status,
            "imageUrl": p.image_url,
        }
        products_list.append(p_dict)

    sanitized = sanitize_financial_data(products_list, user)
    
    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": sanitized,
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total_records,
            "totalPages": (total_records + limit - 1) // limit,
        }
    }


@router.post("/{product_id}/units")
def create_product_unit(
    product_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_UNIT_MANAGE)),
) -> Any:
    """Create a conversion unit for a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        product = Product(
            id=product_id,
            sku=f"SKU-{product_id}",
            name=f"Product {product_id}",
            category_id=None,
            base_unit="cái",
            manage_by_lot=False,
            min_stock=0,
            base_price=0.0,
            cost_price=0.0,
            status="ACTIVE",
        )
        db.add(product)
        db.flush()

    unit_name = str(payload.get("unit_name", "")).strip()
    if not unit_name:
        raise HTTPException(status_code=400, detail="Tên đơn vị không được trống")
    conversion_rate = float(payload.get("conversion_rate", 1))
    if conversion_rate <= 0:
        raise HTTPException(status_code=400, detail="Tỷ lệ quy đổi phải > 0")

    existing = db.query(ProductUnit).filter(ProductUnit.product_id == product_id, ProductUnit.unit_name == unit_name).first()
    if existing is None:
        existing = ProductUnit(
            product_id=product_id,
            unit_name=unit_name,
            conversion_rate=conversion_rate,
            barcode=payload.get("barcode"),
        )
        db.add(existing)
    else:
        existing.conversion_rate = conversion_rate
        existing.barcode = payload.get("barcode")
    db.commit()
    db.refresh(existing)
    return {
        "id": existing.id,
        "product_id": product_id,
        "unit_name": existing.unit_name,
        "conversion_rate": existing.conversion_rate,
        "barcode": existing.barcode,
    }


@router.get("/{product_id}/units")
def list_product_units(
    product_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """List units for a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        product = Product(
            id=product_id,
            sku=f"SKU-{product_id}",
            name=f"Product {product_id}",
            category_id=None,
            base_unit="cái",
            manage_by_lot=False,
            min_stock=0,
            base_price=0.0,
            cost_price=0.0,
            status="ACTIVE",
        )
        db.add(product)
        db.commit()

    units = db.query(ProductUnit).filter(ProductUnit.product_id == product_id).all()
    return [{
        "id": u.id,
        "unit_name": u.unit_name,
        "conversion_rate": u.conversion_rate,
        "barcode": u.barcode,
    } for u in units]


@router.get("/{id}", response_model=ProductDetailResponse)
def get_product_detail(
    id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get product detail by ID."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
        
    units = db.query(ProductUnit).filter(ProductUnit.product_id == id).all()
    
    p_dict = {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "categoryId": product.category_id,
        "baseUnit": product.base_unit,
        "manageByLot": product.manage_by_lot,
        "minStock": product.min_stock,
        "basePrice": product.base_price,
        "costPrice": product.cost_price,
        "status": product.status,
        "imageUrl": product.image_url,
        "units": [
            {
                "id": u.id,
                "unitName": u.unit_name,
                "conversionRate": u.conversion_rate,
                "barcode": u.barcode
            } for u in units
        ]
    }
    
    sanitized = sanitize_financial_data(p_dict, user)
    
    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": sanitized
    }

