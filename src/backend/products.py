"""Product Catalog Management API (SCRUM-75).

User Story:
Là Quản lý kinh doanh, tôi muốn quản lý danh mục sản phẩm, để cả công ty gọi tên
và mã hàng giống nhau thay vì mỗi người một kiểu.

Acceptance Criteria:
1. Khai báo mã SKU, tên, nhóm hàng, đơn vị tính cơ sở, quy cách đóng gói, giá vốn, ảnh, trạng thái.
2. Mã SKU là duy nhất (không phân biệt chữ hoa, chữ thường).
3. Giá vốn chỉ Quản lý kinh doanh xem và sửa được (và Admin toàn quyền).
4. Sản phẩm đã phát sinh giao dịch thì không xoá được, chỉ ngừng kinh doanh.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import (
        Base,
        Product,
        ProductCategory,
        ProductStatus,
        ProductTransaction,
        User,
    )
    from src.backend.security import (
        can_view_cost_price,
        require_active_user,
        require_sales_manager_or_admin,
    )
except ImportError:  # pragma: no cover
    from .database import get_db
    from .models import (
        Base,
        Product,
        ProductCategory,
        ProductStatus,
        ProductTransaction,
        User,
    )
    from .security import (
        can_view_cost_price,
        require_active_user,
        require_sales_manager_or_admin,
    )

router = APIRouter(prefix="/api/v1/products", tags=["Product Catalog (SCRUM-75)"])


# =====================================================================
# Database Table and Initial Seed Setup
# =====================================================================

def ensure_product_tables(db: Session) -> None:
    """Ensure product tables exist and populate default seed data if empty."""
    bind = db.get_bind()
    ProductCategory.__table__.create(bind=bind, checkfirst=True)
    Product.__table__.create(bind=bind, checkfirst=True)
    ProductTransaction.__table__.create(bind=bind, checkfirst=True)

    # Seed initial categories if empty
    cat_count = db.query(ProductCategory).count()
    if cat_count == 0:
        seed_categories = [
            ProductCategory(id=1, code="CAT-BEV", name="Nước giải khát có gas", description="Các loại nước ngọt giải khát có gas"),
            ProductCategory(id=2, code="CAT-BEER", name="Bia & Đồ uống có cồn", description="Các dòng bia lon, bia chai"),
            ProductCategory(id=3, code="CAT-ENERGY", name="Nước tăng lực", description="Nước tăng lực hồi phục sinh lực"),
            ProductCategory(id=4, code="CAT-COFFEE", name="Cà phê & Trà", description="Cà phê lon đóng sẵn và trà đóng chai"),
            ProductCategory(id=5, code="CAT-SNACK", name="Bánh kẹo & Thực phẩm khô", description="Bánh gạo, snack ăn vặt"),
        ]
        db.add_all(seed_categories)
        db.commit()

    # Seed initial products if empty
    prod_count = db.query(Product).count()
    if prod_count == 0:
        seed_products = [
            Product(
                id=1,
                sku="SKU-RB-250",
                name="Nước tăng lực Red Bull 250ml",
                category_id=3,
                category_name="Nước tăng lực",
                base_unit="Lon",
                packaging_spec="Thùng 24 lon",
                cost_price=350000.0,
                sale_price=480000.0,
                image_url="https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=400",
                status="ACTIVE",
                has_transactions=True,
                description="Nước tăng lực Red Bull lon vàng nhập khẩu chính hãng.",
            ),
            Product(
                id=2,
                sku="SKU-HN-330",
                name="Bia Heineken Sleek 330ml",
                category_id=2,
                category_name="Bia & Đồ uống có cồn",
                base_unit="Lon",
                packaging_spec="Thùng 24 lon",
                cost_price=380000.0,
                sale_price=450000.0,
                image_url="https://images.unsplash.com/photo-1608270191599-524f2b57e753?w=400",
                status="ACTIVE",
                has_transactions=True,
                description="Bia Heineken Silver cao cấp lon cao Sleek can 330ml.",
            ),
            Product(
                id=3,
                sku="SKU-CC-320",
                name="Nước ngọt Coca-Cola Sleek 320ml",
                category_id=1,
                category_name="Nước giải khát có gas",
                base_unit="Lon",
                packaging_spec="Thùng 24 lon",
                cost_price=190000.0,
                sale_price=245000.0,
                image_url="https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400",
                status="ACTIVE",
                has_transactions=False,
                description="Nước ngọt Coca Cola vị nguyên bản lon Sleek 320ml.",
            ),
            Product(
                id=4,
                sku="SKU-CF-235",
                name="Cà phê lon Highlands 235ml",
                category_id=4,
                category_name="Cà phê & Trà",
                base_unit="Lon",
                packaging_spec="Thùng 24 lon",
                cost_price=180000.0,
                sale_price=240000.0,
                image_url="https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400",
                status="ACTIVE",
                has_transactions=False,
                description="Cà phê sữa lon Highlands lon cao 235ml.",
            ),
            Product(
                id=5,
                sku="SKU-OO-150",
                name="Bánh gạo One One vị ngọt 150g",
                category_id=5,
                category_name="Bánh kẹo & Thực phẩm khô",
                base_unit="Gói",
                packaging_spec="Thùng 20 gói",
                cost_price=220000.0,
                sale_price=280000.0,
                image_url="https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=400",
                status="INACTIVE",
                has_transactions=True,
                description="Bánh gạo One One vị ngọt dịu truyền thống gói 150g.",
            ),
        ]
        db.add_all(seed_products)
        db.commit()

        # Seed sample transaction for product 1
        sample_txn = ProductTransaction(
            product_id=1,
            sku="SKU-RB-250",
            transaction_type="ORDER",
            reference_code="ORD-2026-001",
            quantity=50,
            unit="Thùng 24 lon",
            note="Đơn hàng sỉ đại lý miền Bắc",
        )
        db.add(sample_txn)
        db.commit()


# =====================================================================
# Request & Response Pydantic Schemas
# =====================================================================

class CreateProductRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(..., min_length=1, max_length=50, description="Mã SKU (duy nhất, không rỗng)")
    name: str = Field(..., min_length=1, max_length=255, description="Tên sản phẩm")
    category_id: Optional[int] = Field(None, description="ID nhóm hàng")
    category_name: Optional[str] = Field(None, max_length=150, description="Tên nhóm hàng")
    base_unit: str = Field(..., min_length=1, max_length=50, description="Đơn vị tính cơ sở (Lon, Chai, Gói...)")
    packaging_spec: Optional[str] = Field(None, max_length=100, description="Quy cách đóng gói (Thùng 24 lon...)")
    cost_price: float = Field(default=0.0, ge=0, description="Giá vốn (VND) - Chỉ Quản lý kinh doanh xem và sửa")
    sale_price: Optional[float] = Field(default=0.0, ge=0, description="Giá bán tham chiếu (VND)")
    image_url: Optional[str] = Field(None, max_length=500, description="URL ảnh sản phẩm")
    status: str = Field(default="ACTIVE", description="Trạng thái: ACTIVE (Đang kinh doanh), INACTIVE (Ngừng kinh doanh)")
    description: Optional[str] = Field(None, max_length=2000, description="Mô tả sản phẩm")

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Mã SKU không được để trống.")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Tên sản phẩm không được để trống.")
        return cleaned

    @field_validator("base_unit")
    @classmethod
    def validate_base_unit(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Đơn vị tính cơ sở không được để trống.")
        return cleaned

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if cleaned not in ("ACTIVE", "INACTIVE"):
            raise ValueError("Trạng thái phải là 'ACTIVE' (Đang kinh doanh) hoặc 'INACTIVE' (Ngừng kinh doanh).")
        return cleaned


class UpdateProductRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    category_id: Optional[int] = None
    category_name: Optional[str] = Field(None, max_length=150)
    base_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    packaging_spec: Optional[str] = Field(None, max_length=100)
    cost_price: Optional[float] = Field(None, ge=0)
    sale_price: Optional[float] = Field(None, ge=0)
    image_url: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = None
    description: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Tên sản phẩm không được để trống.")
            return cleaned
        return v

    @field_validator("base_unit")
    @classmethod
    def validate_base_unit(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Đơn vị tính cơ sở không được để trống.")
            return cleaned
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if cleaned not in ("ACTIVE", "INACTIVE"):
                raise ValueError("Trạng thái phải là 'ACTIVE' hoặc 'INACTIVE'.")
            return cleaned
        return v


class UpdateProductStatusRequest(BaseModel):
    status: str = Field(..., description="Trạng thái mới: 'ACTIVE' hoặc 'INACTIVE'")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if cleaned not in ("ACTIVE", "INACTIVE"):
            raise ValueError("Trạng thái phải là 'ACTIVE' hoặc 'INACTIVE'.")
        return cleaned


class SimulateTransactionRequest(BaseModel):
    transaction_type: str = Field(default="ORDER", description="ORDER, RECEIPT, DELIVERY")
    reference_code: str = Field(default="TXN-TEST-001")
    quantity: int = Field(default=10, ge=1)
    unit: str = Field(default="Thùng 24 lon")
    note: Optional[str] = None


# =====================================================================
# Serializer Helper
# =====================================================================

def serialize_product(product: Product, user: User | None) -> dict[str, Any]:
    """Serialize product and enforce financial confidentiality (Rule 3)."""
    show_financials = can_view_cost_price(user)

    status_str = str(product.status).upper()
    status_label = "Đang kinh doanh" if status_str == "ACTIVE" else "Ngừng kinh doanh"

    # Category name resolution
    cat_name = product.category_name
    if not cat_name and product.category:
        cat_name = product.category.name

    data: dict[str, Any] = {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category_id": product.category_id,
        "category_name": cat_name,
        "base_unit": product.base_unit,
        "packaging_spec": product.packaging_spec,
        "sale_price": float(product.sale_price) if product.sale_price is not None else 0.0,
        "image_url": product.image_url,
        "status": status_str,
        "status_label": status_label,
        "has_transactions": bool(product.has_transactions),
        "description": product.description,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }

    # SENSITIVE FINANCIAL DATA: Cost price is only exposed to Sales Manager and Admin
    if show_financials:
        data["cost_price"] = float(product.cost_price) if product.cost_price is not None else 0.0
    else:
        data["cost_price"] = None

    return data


# =====================================================================
# API Endpoints
# =====================================================================

@router.get("", summary="Lấy danh sách sản phẩm")
def list_products(
    search: Optional[str] = Query(None, description="Tìm theo mã SKU hoặc tên sản phẩm"),
    category_id: Optional[int] = Query(None, description="Lọc theo ID nhóm hàng"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: ACTIVE hoặc INACTIVE"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> dict[str, Any]:
    """Get list of products with filters.

    Confidentiality rule:
    - Sales Manager & Admin: cost_price is visible.
    - Other roles (Sales rep, Warehouse, Accountant, Dealer): cost_price is masked/None.
    """
    ensure_product_tables(db)

    query = db.query(Product)

    if search:
        search_clean = search.strip()
        search_pattern = f"%{search_clean}%"
        query = query.filter(
            or_(
                Product.sku.ilike(search_pattern),
                Product.name.ilike(search_pattern),
            )
        )

    if category_id is not None:
        query = query.filter(Product.category_id == category_id)

    if status:
        status_clean = status.strip().upper()
        query = query.filter(func.upper(Product.status) == status_clean)

    total_count = query.count()
    products = query.order_by(Product.id.asc()).offset(skip).limit(limit).all()

    items = [serialize_product(p, user) for p in products]

    return {
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "can_view_cost_price": can_view_cost_price(user),
        "items": items,
    }


@router.get("/{sku}", summary="Lấy thông tin chi tiết một sản phẩm theo mã SKU")
def get_product_by_sku(
    sku: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> dict[str, Any]:
    """Get single product details by SKU."""
    ensure_product_tables(db)

    sku_clean = sku.strip()
    product = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    return serialize_product(product, user)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Tạo mới sản phẩm")
def create_product(
    payload: CreateProductRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_sales_manager_or_admin),
) -> dict[str, Any]:
    """Create a new product.

    AC 1: Khai báo SKU, tên, nhóm hàng, đơn vị tính cơ sở, quy cách đóng gói, giá vốn, ảnh, trạng thái.
    AC 2: Mã SKU là duy nhất.
    AC 3: Giá vốn chỉ Quản lý kinh doanh xem và sửa được.
    """
    ensure_product_tables(db)

    sku_clean = payload.sku.strip().upper()

    # Rule 2: SKU uniqueness validation
    existing = db.query(Product).filter(func.upper(Product.sku) == sku_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã SKU '{sku_clean}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác.",
        )

    # Category validation / name lookup
    cat_name = payload.category_name
    if payload.category_id is not None:
        cat = db.query(ProductCategory).filter_by(id=payload.category_id).first()
        if cat:
            cat_name = cat.name

    new_product = Product(
        sku=sku_clean,
        name=payload.name.strip(),
        category_id=payload.category_id,
        category_name=cat_name,
        base_unit=payload.base_unit.strip(),
        packaging_spec=payload.packaging_spec.strip() if payload.packaging_spec else None,
        cost_price=payload.cost_price,
        sale_price=payload.sale_price if payload.sale_price is not None else 0.0,
        image_url=payload.image_url.strip() if payload.image_url else None,
        status=payload.status.strip().upper(),
        has_transactions=False,
        description=payload.description.strip() if payload.description else None,
    )

    try:
        db.add(new_product)
        db.commit()
        db.refresh(new_product)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi lưu trữ sản phẩm: {exc}",
        ) from exc

    return {
        "message": f"Khai báo sản phẩm '{new_product.name}' (SKU: {new_product.sku}) thành công.",
        "product": serialize_product(new_product, user),
    }


@router.put("/{sku}", summary="Cập nhật thông tin sản phẩm")
def update_product(
    sku: str,
    payload: UpdateProductRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_sales_manager_or_admin),
) -> dict[str, Any]:
    """Update product information.

    Restricted to Sales Manager & Admin.
    """
    ensure_product_tables(db)

    sku_clean = sku.strip()
    product = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    if payload.name is not None:
        product.name = payload.name.strip()

    if payload.category_id is not None:
        product.category_id = payload.category_id
        cat = db.query(ProductCategory).filter_by(id=payload.category_id).first()
        if cat:
            product.category_name = cat.name

    if payload.category_name is not None:
        product.category_name = payload.category_name.strip()

    if payload.base_unit is not None:
        product.base_unit = payload.base_unit.strip()

    if payload.packaging_spec is not None:
        product.packaging_spec = payload.packaging_spec.strip()

    if payload.cost_price is not None:
        product.cost_price = payload.cost_price

    if payload.sale_price is not None:
        product.sale_price = payload.sale_price

    if payload.image_url is not None:
        product.image_url = payload.image_url.strip()

    if payload.status is not None:
        product.status = payload.status.strip().upper()

    if payload.description is not None:
        product.description = payload.description.strip()

    try:
        db.commit()
        db.refresh(product)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi cập nhật sản phẩm: {exc}",
        ) from exc

    return {
        "message": f"Cập nhật sản phẩm '{product.sku}' thành công.",
        "product": serialize_product(product, user),
    }


@router.patch("/{sku}/status", summary="Thay đổi trạng thái kinh doanh của sản phẩm")
def change_product_status(
    sku: str,
    payload: UpdateProductStatusRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_sales_manager_or_admin),
) -> dict[str, Any]:
    """Change product status between ACTIVE and INACTIVE (Ngừng kinh doanh)."""
    ensure_product_tables(db)

    sku_clean = sku.strip()
    product = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    product.status = payload.status
    db.commit()
    db.refresh(product)

    label = "Đang kinh doanh" if product.status == "ACTIVE" else "Ngừng kinh doanh"
    return {
        "message": f"Chuyển trạng thái sản phẩm '{product.sku}' sang '{label}' thành công.",
        "sku": product.sku,
        "status": product.status,
        "status_label": label,
    }


@router.delete("/{sku}", summary="Xóa sản phẩm khỏi danh mục")
def delete_product(
    sku: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_sales_manager_or_admin),
) -> dict[str, Any]:
    """Delete a product.

    AC 4: Sản phẩm đã phát sinh giao dịch thì không xoá được, chỉ ngừng kinh doanh.
    """
    ensure_product_tables(db)

    sku_clean = sku.strip()
    product = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    # AC 4: Check if the product has incurred any business transactions
    has_txn = product.has_transactions
    if not has_txn:
        # Check transaction table
        txn_count = db.query(ProductTransaction).filter_by(product_id=product.id).count()
        if txn_count > 0:
            has_txn = True

    if has_txn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Sản phẩm '{product.sku}' đã phát sinh giao dịch trong hệ thống, "
                "không thể xóa mà chỉ có thể chuyển sang trạng thái ngừng kinh doanh."
            ),
        )

    # Not had any transactions -> Allow safe deletion
    deleted_sku = product.sku
    deleted_name = product.name
    try:
        db.delete(product)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi xóa sản phẩm: {exc}",
        ) from exc

    return {
        "success": True,
        "message": f"Xóa sản phẩm '{deleted_name}' (SKU: {deleted_sku}) thành công.",
        "sku": deleted_sku,
    }


@router.post("/{sku}/simulate-transaction", summary="Ghi nhận giao dịch mẫu cho sản phẩm (Hỗ trợ kiểm thử)")
def simulate_product_transaction(
    sku: str,
    payload: SimulateTransactionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_sales_manager_or_admin),
) -> dict[str, Any]:
    """Helper endpoint to record a transaction on a product (demonstrating AC 4)."""
    ensure_product_tables(db)

    sku_clean = sku.strip()
    product = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    txn = ProductTransaction(
        product_id=product.id,
        sku=product.sku,
        transaction_type=payload.transaction_type,
        reference_code=payload.reference_code,
        quantity=payload.quantity,
        unit=payload.unit,
        note=payload.note,
    )
    product.has_transactions = True

    db.add(txn)
    db.commit()
    db.refresh(txn)

    return {
        "message": f"Đã ghi nhận giao dịch cho sản phẩm '{product.sku}'. Sản phẩm này hiện không thể xóa.",
        "transaction_id": txn.id,
        "sku": product.sku,
        "has_transactions": True,
    }


@router.get("/meta/categories", summary="Danh sách nhóm hàng hỗ trợ chọn lựa")
def list_categories_for_select(
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> list[dict[str, Any]]:
    """List available categories for dropdowns."""
    ensure_product_tables(db)
    categories = db.query(ProductCategory).order_by(ProductCategory.id.asc()).all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "description": c.description,
        }
        for c in categories
    ]
