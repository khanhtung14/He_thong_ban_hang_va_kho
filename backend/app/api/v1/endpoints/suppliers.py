"""Supplier Catalog Management endpoints (SCRUM-79).

Yêu cầu chi tiết:
1. REST API endpoints đầy đủ (CRUD):
   - GET /api/v1/suppliers: Danh sách nhà cung cấp (hỗ trợ phân trang, tìm kiếm, lọc theo trạng thái).
   - GET /api/v1/suppliers/{id}: Chi tiết nhà cung cấp.
   - POST /api/v1/suppliers: Thêm mới nhà cung cấp (kiểm tra mã duy nhất).
   - PUT /api/v1/suppliers/{id}: Cập nhật thông tin nhà cung cấp.
   - PATCH /api/v1/suppliers/{id}/status: Chuyển đổi trạng thái hoạt động (ngừng giao dịch).
   - DELETE /api/v1/suppliers/{id}: Xóa nhà cung cấp.
2. Ràng buộc nghiệp vụ:
   - Nếu nhà cung cấp đã có phiếu nhập kho liên quan (WarehouseReceipt),
     tuyệt đối không cho phép xóa (trả về HTTP 400 kèm thông báo rõ ràng),
     mà bắt buộc phải chuyển sang trạng thái "ngừng giao dịch" (is_active = False).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import RoleCode, Supplier, WarehouseReceipt
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    require_roles,
)
from app.schemas.supplier import (
    PaginationInfo,
    SupplierCreate,
    SupplierListResponse,
    SupplierResponse,
    SupplierSingleResponse,
    SupplierStatusUpdate,
    SupplierUpdate,
)

router = APIRouter(prefix="/api/v1/suppliers", tags=["Suppliers (SCRUM-79)"])
compat_router = APIRouter(prefix="/suppliers", tags=["Suppliers Compatibility"])


def _to_supplier_response(supplier: Supplier, receipts_count: int = 0) -> SupplierResponse:
    """Helper map SQLAlchemy model to Pydantic schema."""
    return SupplierResponse(
        id=supplier.id,
        code=supplier.code,
        name=supplier.name,
        tax_code=supplier.tax_code,
        contact_person=supplier.contact_person,
        payment_terms=supplier.payment_terms,
        is_active=supplier.is_active,
        phone=supplier.phone,
        address=supplier.address,
        status=supplier.status or ("ACTIVE" if supplier.is_active else "INACTIVE"),
        receipts_count=receipts_count,
        created_at=supplier.created_at,
        updated_at=supplier.updated_at,
    )


@router.get("", response_model=SupplierListResponse)
@compat_router.get("", response_model=SupplierListResponse)
def list_suppliers(
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã, tên, MST, người liên hệ"),
    is_active: Optional[bool] = Query(None, description="Lọc theo trạng thái hoạt động"),
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    limit: int = Query(20, ge=1, le=100, description="Số bản ghi mỗi trang"),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.SALES_MANAGER,
        )
    ),
):
    """Lấy danh sách nhà cung cấp (có phân trang và tìm kiếm)."""
    query = db.query(Supplier)

    if search:
        search_kw = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Supplier.code.ilike(search_kw),
                Supplier.name.ilike(search_kw),
                Supplier.tax_code.ilike(search_kw),
                Supplier.contact_person.ilike(search_kw),
                Supplier.phone.ilike(search_kw),
            )
        )

    if is_active is not None:
        query = query.filter(Supplier.is_active == is_active)

    total_records = query.count()
    total_pages = max(1, math.ceil(total_records / limit))
    suppliers = (
        query.order_by(Supplier.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    supplier_ids = [s.id for s in suppliers]
    counts_map: Dict[int, int] = {}
    if supplier_ids:
        receipt_counts = (
            db.query(WarehouseReceipt.supplier_id, func.count(WarehouseReceipt.id))
            .filter(WarehouseReceipt.supplier_id.in_(supplier_ids))
            .group_by(WarehouseReceipt.supplier_id)
            .all()
        )
        counts_map = {row[0]: row[1] for row in receipt_counts}

    data = [_to_supplier_response(s, counts_map.get(s.id, 0)) for s in suppliers]

    return SupplierListResponse(
        success=True,
        code=status.HTTP_200_OK,
        message="Lấy danh sách nhà cung cấp thành công",
        data=data,
        pagination=PaginationInfo(
            page=page,
            limit=limit,
            total_records=total_records,
            total_pages=total_pages,
        ),
    )


@router.get("/{supplier_id}", response_model=SupplierSingleResponse)
@compat_router.get("/{supplier_id}", response_model=SupplierSingleResponse)
def get_supplier_detail(
    supplier_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.SALES_MANAGER,
        )
    ),
):
    """Xem thông tin chi tiết một nhà cung cấp."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp có ID {supplier_id}.",
        )

    receipt_count = (
        db.query(func.count(WarehouseReceipt.id))
        .filter(WarehouseReceipt.supplier_id == supplier.id)
        .scalar()
        or 0
    )

    return SupplierSingleResponse(
        success=True,
        code=status.HTTP_200_OK,
        message="Lấy thông tin nhà cung cấp thành công",
        data=_to_supplier_response(supplier, receipt_count),
    )


@router.post("", response_model=SupplierSingleResponse, status_code=status.HTTP_201_CREATED)
@compat_router.post("", response_model=SupplierSingleResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Thêm mới một nhà cung cấp."""
    code_cleaned = payload.code.strip()
    existing = (
        db.query(Supplier)
        .filter(func.lower(Supplier.code) == func.lower(code_cleaned))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã nhà cung cấp '{code_cleaned}' đã tồn tại trong hệ thống.",
        )

    supplier = Supplier(
        code=code_cleaned,
        name=payload.name.strip(),
        tax_code=payload.tax_code.strip() if payload.tax_code else None,
        contact_person=payload.contact_person.strip() if payload.contact_person else None,
        payment_terms=payload.payment_terms.strip() if payload.payment_terms else None,
        is_active=payload.is_active,
        phone=payload.phone.strip() if payload.phone else None,
        address=payload.address.strip() if payload.address else None,
        status="ACTIVE" if payload.is_active else "INACTIVE",
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    return SupplierSingleResponse(
        success=True,
        code=status.HTTP_201_CREATED,
        message="Thêm mới nhà cung cấp thành công.",
        data=_to_supplier_response(supplier, receipts_count=0),
    )


@router.put("/{supplier_id}", response_model=SupplierSingleResponse)
@compat_router.put("/{supplier_id}", response_model=SupplierSingleResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Cập nhật thông tin chi tiết nhà cung cấp."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp có ID {supplier_id}.",
        )

    if payload.code is not None:
        new_code = payload.code.strip()
        if new_code.lower() != supplier.code.lower():
            existing = (
                db.query(Supplier)
                .filter(
                    func.lower(Supplier.code) == func.lower(new_code),
                    Supplier.id != supplier.id,
                )
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Mã nhà cung cấp '{new_code}' đã tồn tại trong hệ thống.",
                )
            supplier.code = new_code

    if payload.name is not None:
        supplier.name = payload.name.strip()
    if payload.tax_code is not None:
        supplier.tax_code = payload.tax_code.strip() if payload.tax_code else None
    if payload.contact_person is not None:
        supplier.contact_person = payload.contact_person.strip() if payload.contact_person else None
    if payload.payment_terms is not None:
        supplier.payment_terms = payload.payment_terms.strip() if payload.payment_terms else None
    if payload.phone is not None:
        supplier.phone = payload.phone.strip() if payload.phone else None
    if payload.address is not None:
        supplier.address = payload.address.strip() if payload.address else None
    if payload.is_active is not None:
        supplier.is_active = payload.is_active
        supplier.status = "ACTIVE" if payload.is_active else "INACTIVE"

    db.commit()
    db.refresh(supplier)

    receipt_count = (
        db.query(func.count(WarehouseReceipt.id))
        .filter(WarehouseReceipt.supplier_id == supplier.id)
        .scalar()
        or 0
    )

    return SupplierSingleResponse(
        success=True,
        code=status.HTTP_200_OK,
        message="Cập nhật nhà cung cấp thành công.",
        data=_to_supplier_response(supplier, receipt_count),
    )


@router.patch("/{supplier_id}/status", response_model=SupplierSingleResponse)
@compat_router.patch("/{supplier_id}/status", response_model=SupplierSingleResponse)
def update_supplier_status(
    supplier_id: int,
    payload: SupplierStatusUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Chuyển đổi trạng thái hoạt động / ngừng giao dịch của nhà cung cấp."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp có ID {supplier_id}.",
        )

    supplier.is_active = payload.is_active
    supplier.status = "ACTIVE" if payload.is_active else "INACTIVE"
    db.commit()
    db.refresh(supplier)

    receipt_count = (
        db.query(func.count(WarehouseReceipt.id))
        .filter(WarehouseReceipt.supplier_id == supplier.id)
        .scalar()
        or 0
    )

    status_text = "Hoạt động" if supplier.is_active else "Ngừng giao dịch"
    return SupplierSingleResponse(
        success=True,
        code=status.HTTP_200_OK,
        message=f"Đã chuyển trạng thái nhà cung cấp thành '{status_text}'.",
        data=_to_supplier_response(supplier, receipt_count),
    )


@router.delete("/{supplier_id}")
@compat_router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Xóa nhà cung cấp.
    
    RÀNG BUỘC NGHIỆP VỤ (CRITICAL):
    Nếu nhà cung cấp đã có phiếu nhập kho liên quan (WarehouseReceipt),
    tuyệt đối không cho phép xóa (trả về HTTP 400 kèm thông báo rõ ràng),
    mà bắt buộc phải chuyển sang trạng thái "ngừng giao dịch" (is_active = False).
    """
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhà cung cấp có ID {supplier_id}.",
        )

    # Kiểm tra ràng buộc phiếu nhập kho liên quan
    receipt_count = (
        db.query(func.count(WarehouseReceipt.id))
        .filter(WarehouseReceipt.supplier_id == supplier.id)
        .scalar()
        or 0
    )

    if receipt_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Không thể xóa nhà cung cấp '{supplier.name}' (Mã: {supplier.code}) "
                f"do đã có {receipt_count} phiếu nhập kho liên quan trong hệ thống. "
                f"Bắt buộc phải chuyển sang trạng thái 'Ngừng giao dịch' (is_active = False)."
            ),
        )

    supplier_name = supplier.name
    supplier_code = supplier.code
    db.delete(supplier)
    db.commit()

    return {
        "success": True,
        "code": status.HTTP_200_OK,
        "message": f"Xóa nhà cung cấp '{supplier_name}' (Mã: {supplier_code}) thành công.",
        "data": {"id": supplier_id},
    }
