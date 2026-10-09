"""Products endpoints with RBAC enforcement."""

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Product, Category, ProductUnit
from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW,
    PERM_PRODUCTS_MANAGE,
    AuthenticatedUser,
    require_permissions,
    sanitize_financial_data,
)

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


@router.get("")
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


@router.get("/{id}")
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

