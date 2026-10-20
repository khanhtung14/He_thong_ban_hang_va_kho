"""API Endpoints for Internal Transfers (Quản lý luân chuyển hàng hóa nội bộ).

Endpoints:
- POST /api/internal-transfers: Tạo phiếu chuyển kho nội bộ.
- POST /api/internal-transfers/{id}/confirm: Xác nhận nhận hàng tại kho đến.
- GET /api/internal-transfers: Danh sách phiếu luân chuyển (lọc theo kho, trạng thái).
- GET /api/internal-transfers/{id}: Chi tiết phiếu luân chuyển.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import InternalTransfer
from app.schemas.internal_transfer import (
    InternalTransferCreate,
    InternalTransferConfirmRequest,
)
from app.services.internal_transfer_service import (
    create_internal_transfer,
    confirm_internal_transfer,
    get_internal_transfers,
    get_internal_transfer_by_id,
)

router = APIRouter(prefix="/api/internal-transfers", tags=["Internal Transfers"])
compat_router = APIRouter(prefix="/api/v1/internal-transfers", tags=["Internal Transfers (v1)"])


def _format_transfer(t: InternalTransfer) -> Dict[str, Any]:
    return {
        "id": t.id,
        "from_warehouse_id": t.from_warehouse_id,
        "fromWarehouseId": t.from_warehouse_id,
        "from_warehouse_name": t.from_warehouse.name if t.from_warehouse else None,
        "fromWarehouseName": t.from_warehouse.name if t.from_warehouse else None,
        "to_warehouse_id": t.to_warehouse_id,
        "toWarehouseId": t.to_warehouse_id,
        "to_warehouse_name": t.to_warehouse.name if t.to_warehouse else None,
        "toWarehouseName": t.to_warehouse.name if t.to_warehouse else None,
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "details": [
            {
                "id": d.id,
                "transfer_id": d.transfer_id,
                "transferId": d.transfer_id,
                "product_id": d.product_id,
                "productId": d.product_id,
                "product_sku": d.product.sku if d.product else None,
                "productSku": d.product.sku if d.product else None,
                "product_name": d.product.name if d.product else None,
                "productName": d.product.name if d.product else None,
                "quantity_sent": d.quantity_sent,
                "quantitySent": d.quantity_sent,
                "quantity_received": d.quantity_received,
                "quantityReceived": d.quantity_received,
                "discrepancy_reason": d.discrepancy_reason,
                "discrepancyReason": d.discrepancy_reason,
            }
            for d in (t.details or [])
        ],
    }


def handle_create_transfer(
    payload: InternalTransferCreate,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Tạo phiếu chuyển kho nội bộ.
    - Trừ tồn kho tại kho xuất phát.
    - Trạng thái phiếu là IN_TRANSIT.
    - Tuyệt đối chưa cộng tồn kho cho kho đến.
    """
    transfer = create_internal_transfer(db=db, payload=payload)
    return {
        "success": True,
        "code": status.HTTP_201_CREATED,
        "message": "Tạo phiếu luân chuyển nội bộ thành công. Hàng đang trong trạng thái vận chuyển.",
        "data": _format_transfer(transfer),
    }


def handle_confirm_transfer(
    id: int,
    payload: InternalTransferConfirmRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Kho đến xác nhận nhận hàng.
    - Kiểm tra số lượng thực nhận so với số gửi.
    - Bắt buộc có lý do chênh lệch nếu số nhận khác số gửi.
    - Chuyển trạng thái COMPLETED và cộng tồn kho cho kho đến.
    """
    transfer = confirm_internal_transfer(db=db, transfer_id=id, payload=payload)
    return {
        "success": True,
        "code": status.HTTP_200_OK,
        "message": "Xác nhận nhận hàng chuyển kho thành công. Đã cập nhật tồn kho kho đến.",
        "data": _format_transfer(transfer),
    }


def handle_get_transfers(
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái: IN_TRANSIT, COMPLETED, CANCELLED"),
    warehouse_id: Optional[int] = Query(None, alias="warehouse_id", description="Lọc theo kho gửi hoặc nhận"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Lấy danh sách phiếu luân chuyển nội bộ."""
    transfers = get_internal_transfers(db=db, status_filter=status_filter, warehouse_id=warehouse_id)
    return {
        "success": True,
        "code": status.HTTP_200_OK,
        "message": "Lấy danh sách phiếu luân chuyển thành công.",
        "data": [_format_transfer(t) for t in transfers],
    }


def handle_get_transfer_detail(
    id: int,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Xem chi tiết một phiếu luân chuyển nội bộ."""
    transfer = get_internal_transfer_by_id(db=db, transfer_id=id)
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu luân chuyển với ID {id}.",
        )
    return {
        "success": True,
        "code": status.HTTP_200_OK,
        "message": "Lấy chi tiết phiếu luân chuyển thành công.",
        "data": _format_transfer(transfer),
    }


# Register routes for router (/api/internal-transfers)
router.add_api_route("", handle_create_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED)
router.add_api_route("/", handle_create_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, include_in_schema=False)
router.add_api_route("/{id}/confirm", handle_confirm_transfer, methods=["POST"])
router.add_api_route("", handle_get_transfers, methods=["GET"])
router.add_api_route("/", handle_get_transfers, methods=["GET"], include_in_schema=False)
router.add_api_route("/{id}", handle_get_transfer_detail, methods=["GET"])

# Register routes for compat_router (/api/v1/internal-transfers)
compat_router.add_api_route("", handle_create_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED)
compat_router.add_api_route("/", handle_create_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, include_in_schema=False)
compat_router.add_api_route("/{id}/confirm", handle_confirm_transfer, methods=["POST"])
compat_router.add_api_route("", handle_get_transfers, methods=["GET"])
compat_router.add_api_route("/", handle_get_transfers, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}", handle_get_transfer_detail, methods=["GET"])
