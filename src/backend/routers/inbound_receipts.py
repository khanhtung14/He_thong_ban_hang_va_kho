"""Inbound Receipts API router for SCRUM-30."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import RoleCode
from src.backend.models.inbound_receipt import ReceiptStatus
from src.backend.rbac import AuthenticatedUser, require_roles
from src.backend.schemas.inbound_receipt import (
    InboundReceiptCreate,
    InboundReceiptListResponse,
    InboundReceiptResponse,
    InboundReceiptUpdate,
)
from src.backend.services import inbound_receipt_service

router = APIRouter(
    prefix="/api/v1/inbound-receipts",
    tags=["Inbound Receipts (SCRUM-30)"],
)

# Compatibility router without prefix if needed
compat_router = APIRouter(
    prefix="/inbound-receipts",
    tags=["Inbound Receipts Compat (SCRUM-30)"],
)


@router.get("/options", response_model=Dict[str, Any])
@compat_router.get("/options", response_model=Dict[str, Any])
def get_receipt_form_options(
    warehouse_id: Optional[int] = Query(None, description="Lọc vị trí theo kho"),
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
    """Lấy danh mục dữ liệu phục vụ tạo phiếu nhập: Nhà cung cấp, Kho, Sản phẩm, Vị trí lưu kho."""
    return inbound_receipt_service.get_receipt_form_options(db, warehouse_id=warehouse_id)


@router.get("", response_model=InboundReceiptListResponse)
@compat_router.get("", response_model=InboundReceiptListResponse)
def list_inbound_receipts(
    status: Optional[ReceiptStatus] = Query(None, description="Lọc theo trạng thái phiếu"),
    warehouse_id: Optional[int] = Query(None, description="Lọc theo ID kho"),
    supplier_id: Optional[int] = Query(None, description="Lọc theo ID nhà cung cấp"),
    search: Optional[str] = Query(None, description="Tìm kiếm mã phiếu, tên/mã NCC hoặc ghi chú"),
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    page_size: int = Query(20, ge=1, le=100, description="Số lượng trên một trang"),
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
    """Lấy danh sách phiếu nhập kho phân trang."""
    items, total = inbound_receipt_service.list_receipts(
        db,
        status=status,
        warehouse_id=warehouse_id,
        supplier_id=supplier_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    return InboundReceiptListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=InboundReceiptResponse, status_code=status.HTTP_201_CREATED)
@compat_router.post("", response_model=InboundReceiptResponse, status_code=status.HTTP_201_CREATED)
def create_inbound_receipt(
    payload: InboundReceiptCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Tạo mới phiếu nhập kho ở trạng thái Nháp (DRAFT)."""
    try:
        user_id = getattr(user, "id", None)
        return inbound_receipt_service.create_receipt(db, payload, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi tạo phiếu nhập: {str(e)}",
        )


@router.get("/{id}", response_model=InboundReceiptResponse)
@compat_router.get("/{id}", response_model=InboundReceiptResponse)
def get_inbound_receipt(
    id: int,
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
    """Xem chi tiết một phiếu nhập kho."""
    try:
        return inbound_receipt_service.get_receipt_response_by_id(db, id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{id}", response_model=InboundReceiptResponse)
@compat_router.put("/{id}", response_model=InboundReceiptResponse)
def update_inbound_receipt(
    id: int,
    payload: InboundReceiptUpdate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Cập nhật thông tin phiếu nhập kho (chỉ áp dụng cho phiếu DRAFT)."""
    try:
        return inbound_receipt_service.update_receipt(db, id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{id}/complete", response_model=InboundReceiptResponse)
@compat_router.post("/{id}/complete", response_model=InboundReceiptResponse)
def complete_inbound_receipt(
    id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """
    LOGIC CỐT LÕI: Hoàn tất phiếu nhập kho.
    Hệ thống chuyển trạng thái sang COMPLETED và tự động cộng dồn số lượng vào bảng tồn kho thực tế.
    """
    try:
        return inbound_receipt_service.complete_receipt(db, id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{id}/cancel", response_model=InboundReceiptResponse)
@compat_router.post("/{id}/cancel", response_model=InboundReceiptResponse)
def cancel_inbound_receipt(
    id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ADMIN,
        )
    ),
):
    """Hủy phiếu nhập kho (chỉ áp dụng cho phiếu chưa hoàn tất)."""
    try:
        return inbound_receipt_service.cancel_receipt(db, id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
