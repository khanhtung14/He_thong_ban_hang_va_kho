"""Endpoints for Batch and Expiry Date Tracking (Theo dõi lô và hạn sử dụng của hàng hoá).

Routes:
- GET /api/v1/inventory/batches: Danh sách lô hàng kèm cảnh báo hạn sử dụng.
- POST /api/v1/inventory/batches: Tạo mới lô hàng cho sản phẩm.
- PUT /api/v1/inventory/batches/{id}: Cập nhật thông tin lô hàng.
- PATCH /api/v1/products/{id}/batch-management: Bật/tắt tính năng quản lý lô theo từng SKU.
- POST /api/v1/inventory/outbound: Xuất kho kiểm tra lô và chặn quá hạn (hỗ trợ Quản lý ghi đè kèm lý do).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.batch import (
    OutboundDispatchCreate,
    ProductBatchCreate,
    ProductBatchToggleRequest,
    ProductBatchUpdate,
)
from app.services.batch_service import (
    create_batch,
    get_batches_with_expiry_analysis,
    process_outbound_dispatch,
    toggle_product_batch_management,
    update_batch,
)
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_current_user,
    normalize_role,
)

router = APIRouter(prefix="/api/v1/inventory", tags=["Batches & Expiry"])
compat_router = APIRouter(prefix="/api/inventory", tags=["Batches & Expiry (Compat)"])
products_batch_router = APIRouter(prefix="/api/v1/products", tags=["Product Batch Config"])
products_batch_compat_router = APIRouter(prefix="/api/products", tags=["Product Batch Config (Compat)"])


def handle_get_batches(
    product_id: Optional[int] = Query(None, alias="productId", description="Lọc theo ID sản phẩm"),
    warehouse_id: Optional[int] = Query(None, alias="warehouseId", description="Lọc theo ID kho"),
    warning_days: int = Query(30, alias="warningDays", ge=1, le=365, description="Ngưỡng cảnh báo sắp hết hạn (số ngày)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Lọc theo: EXPIRED, EXPIRING_SOON, ACTIVE, ALL"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Lấy danh sách lô hàng kèm trạng thái cảnh báo hạn dùng."""
    batches = get_batches_with_expiry_analysis(
        db=db,
        product_id=product_id,
        warehouse_id=warehouse_id,
        warning_days=warning_days,
        status_filter=status_filter,
    )
    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách lô hàng thành công.",
        "warningDays": warning_days,
        "data": batches,
    }


def handle_create_batch(
    payload: ProductBatchCreate,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Tạo mới một lô hàng cho sản phẩm."""
    batch = create_batch(db=db, payload=payload)
    return {
        "success": True,
        "code": 201,
        "message": f"Tạo mới lô hàng '{batch.batch_number}' thành công.",
        "data": {
            "id": batch.id,
            "productId": batch.product_id,
            "batchNumber": batch.batch_number,
            "mfgDate": batch.mfg_date.isoformat() if batch.mfg_date else None,
            "expDate": batch.exp_date.isoformat() if batch.exp_date else None,
            "remainingQuantity": batch.remaining_quantity,
            "warehouseId": batch.warehouse_id,
        },
    }


def handle_update_batch(
    batch_id: int,
    payload: ProductBatchUpdate,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Cập nhật thông tin lô hàng."""
    batch = update_batch(db=db, batch_id=batch_id, payload=payload)
    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật lô hàng '{batch.batch_number}' thành công.",
        "data": {
            "id": batch.id,
            "productId": batch.product_id,
            "batchNumber": batch.batch_number,
            "mfgDate": batch.mfg_date.isoformat() if batch.mfg_date else None,
            "expDate": batch.exp_date.isoformat() if batch.exp_date else None,
            "remainingQuantity": batch.remaining_quantity,
            "warehouseId": batch.warehouse_id,
        },
    }


def handle_toggle_batch_management(
    product_id: int,
    payload: ProductBatchToggleRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """AC 1: Bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU)."""
    product = toggle_product_batch_management(
        db=db,
        product_id=product_id,
        is_batch_managed=payload.is_batch_managed,
    )
    status_label = "BẬT" if product.is_batch_managed else "TẮT"
    return {
        "success": True,
        "code": 200,
        "message": f"Đã {status_label} tính năng quản lý theo lô cho sản phẩm '{product.name}' ({product.sku}).",
        "data": {
            "id": product.id,
            "sku": product.sku,
            "name": product.name,
            "isBatchManaged": product.is_batch_managed,
            "is_batch_managed": product.is_batch_managed,
            "manageByLot": product.manage_by_lot,
            "manage_by_lot": product.manage_by_lot,
        },
    }


def handle_outbound_dispatch(
    payload: OutboundDispatchCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """AC 4: Xuất kho có kiểm tra ràng buộc lô và hạn sử dụng:
    - Nếu SKU có quản lý lô: Bắt buộc chọn lô.
    - Nếu lô quá hạn: Chặn xuất và yêu cầu xác nhận ghi đè kèm lý do.
    - Nếu có cờ override_expired và override_reason từ Quản lý: Cho phép xuất và lưu log.
    """
    user_role: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None

    # Trích xuất user từ header / context nếu có
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            from app.api.v1.endpoints.rbac import decode_access_token
            token = auth_header.replace("Bearer ", "").strip()
            decoded = decode_access_token(token)
            if decoded:
                user_role = decoded.get("role") or decoded.get("role_code")
                username = decoded.get("sub") or decoded.get("username")
                user_id = decoded.get("user_id") or decoded.get("id")
        except Exception:
            pass

    result = process_outbound_dispatch(
        db=db,
        payload=payload,
        user_role=user_role,
        user_id=user_id,
        username=username,
    )
    return {
        "success": True,
        "code": 200,
        "message": "Xuất kho thành công.",
        "data": result,
    }


# Đăng ký routes cho router (/api/v1/inventory)
router.add_api_route("/batches", handle_get_batches, methods=["GET"])
router.add_api_route("/batches", handle_create_batch, methods=["POST"], status_code=status.HTTP_201_CREATED)
router.add_api_route("/batches/{batch_id}", handle_update_batch, methods=["PUT"])
router.add_api_route("/outbound", handle_outbound_dispatch, methods=["POST"])

# Đăng ký routes cho compat_router (/api/inventory)
compat_router.add_api_route("/batches", handle_get_batches, methods=["GET"])
compat_router.add_api_route("/batches", handle_create_batch, methods=["POST"], status_code=status.HTTP_201_CREATED)
compat_router.add_api_route("/batches/{batch_id}", handle_update_batch, methods=["PUT"])
compat_router.add_api_route("/outbound", handle_outbound_dispatch, methods=["POST"])

# Đăng ký routes cấu hình SKU (/api/v1/products/{id}/batch-management)
products_batch_router.add_api_route(
    "/{product_id}/batch-management",
    handle_toggle_batch_management,
    methods=["PATCH"],
    operation_id="toggle_sku_batch_management",
)
products_batch_router.add_api_route(
    "/{product_id}/batch-management",
    handle_toggle_batch_management,
    methods=["PUT"],
    include_in_schema=False,
)
products_batch_compat_router.add_api_route(
    "/{product_id}/batch-management",
    handle_toggle_batch_management,
    methods=["PATCH", "PUT"],
    include_in_schema=False,
)
