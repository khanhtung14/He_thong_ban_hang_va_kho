"""FastAPI endpoints for Internal Warehouse Transfers (Chuyển kho nội bộ).

Endpoints:
- POST /api/internal-transfers: Tạo phiếu chuyển kho nội bộ (PENDING)
- PUT /api/internal-transfers/{id}/confirm: Xác nhận nhận hàng chuyển kho (COMPLETED)
- GET /api/internal-transfers: Danh sách phiếu chuyển kho
- GET /api/internal-transfers/{id}: Chi tiết phiếu chuyển kho
- POST /api/internal-transfers/{id}/cancel: Hủy phiếu chuyển kho
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    bearer_scheme,
    get_current_user,
)
from app.schemas.internal_transfer import (
    InternalTransferCreate,
    InternalTransferConfirm,
)
from app.services.internal_transfer_service import (
    create_internal_transfer as svc_create_internal_transfer,
    confirm_internal_transfer as svc_confirm_internal_transfer,
    get_internal_transfer as svc_get_internal_transfer,
    list_internal_transfers as svc_list_internal_transfers,
    cancel_internal_transfer as svc_cancel_internal_transfer,
)

router = APIRouter(prefix="/api/internal-transfers", tags=["Internal Transfers"])
compat_v1_router = APIRouter(prefix="/api/v1/internal-transfers", tags=["Internal Transfers"])


def get_current_user_optional(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[AuthenticatedUser]:
    """Optional user dependency that extracts authenticated user if token present."""
    if not auth or not auth.credentials:
        return None
    try:
        return get_current_user(auth)
    except Exception:
        return None


def get_username(user: Optional[AuthenticatedUser], fallback: str = "Thủ kho") -> str:
    if user:
        return user.full_name or user.username or fallback
    return fallback


# -------------------------------------------------------------
# Handlers (Shared between /api/internal-transfers and /api/v1/internal-transfers)
# -------------------------------------------------------------

def handle_create_internal_transfer(
    payload: InternalTransferCreate,
    user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    username = get_username(user, "Thủ kho gửi")
    transfer = svc_create_internal_transfer(db, payload, username)
    return {
        "success": True,
        "code": 201,
        "message": f"Tạo phiếu chuyển kho '{transfer['transfer_code']}' thành công (trạng thái: PENDING).",
        "data": transfer,
    }


def handle_confirm_internal_transfer(
    id: int,
    payload: InternalTransferConfirm,
    user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    username = get_username(user, "Thủ kho nhận")
    transfer = svc_confirm_internal_transfer(db, id, payload, username)
    return {
        "success": True,
        "code": 200,
        "message": f"Xác nhận nhận hàng cho phiếu '{transfer['transfer_code']}' thành công. Đã cộng tồn kho đích.",
        "data": transfer,
    }


def handle_get_internal_transfer(
    id: int,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    transfer = svc_get_internal_transfer(db, id)
    return {
        "success": True,
        "code": 200,
        "message": "Lấy chi tiết phiếu chuyển kho thành công",
        "data": transfer,
    }


def handle_list_internal_transfers(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho (kho gửi hoặc kho nhận)"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái: PENDING, COMPLETED, CANCELLED"),
    search: Optional[str] = Query(None, description="Tìm theo mã phiếu"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc_list_internal_transfers(
        db=db,
        warehouse_id=warehouse_id,
        status_filter=status,
        search=search,
        limit=limit,
        offset=offset,
    )


def handle_cancel_internal_transfer(
    id: int,
    user: Optional[AuthenticatedUser] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    username = get_username(user, "Người hủy")
    transfer = svc_cancel_internal_transfer(db, id, username)
    return {
        "success": True,
        "code": 200,
        "message": f"Hủy phiếu chuyển kho '{transfer['transfer_code']}' thành công. Đã hoàn trả tồn kho về kho xuất.",
        "data": transfer,
    }


# Register routes for /api/internal-transfers
router.add_api_route("", handle_create_internal_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, operation_id="create_internal_transfer")
router.add_api_route("/", handle_create_internal_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, include_in_schema=False)
router.add_api_route("/{id}/confirm", handle_confirm_internal_transfer, methods=["PUT"], operation_id="confirm_internal_transfer")
router.add_api_route("/{id}/confirm", handle_confirm_internal_transfer, methods=["PATCH"], include_in_schema=False)
router.add_api_route("/{id}/confirm/", handle_confirm_internal_transfer, methods=["PUT", "PATCH"], include_in_schema=False)
router.add_api_route("/{id}", handle_get_internal_transfer, methods=["GET"], operation_id="get_internal_transfer")
router.add_api_route("/{id}/", handle_get_internal_transfer, methods=["GET"], include_in_schema=False)
router.add_api_route("", handle_list_internal_transfers, methods=["GET"], operation_id="list_internal_transfers")
router.add_api_route("/", handle_list_internal_transfers, methods=["GET"], include_in_schema=False)
router.add_api_route("/{id}/cancel", handle_cancel_internal_transfer, methods=["POST"], operation_id="cancel_internal_transfer")
router.add_api_route("/{id}/cancel/", handle_cancel_internal_transfer, methods=["POST"], include_in_schema=False)

# Register routes for /api/v1/internal-transfers (compat router)
compat_v1_router.add_api_route("", handle_create_internal_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, include_in_schema=False)
compat_v1_router.add_api_route("/", handle_create_internal_transfer, methods=["POST"], status_code=status.HTTP_201_CREATED, include_in_schema=False)
compat_v1_router.add_api_route("/{id}/confirm", handle_confirm_internal_transfer, methods=["PUT", "PATCH"], include_in_schema=False)
compat_v1_router.add_api_route("/{id}/confirm/", handle_confirm_internal_transfer, methods=["PUT", "PATCH"], include_in_schema=False)
compat_v1_router.add_api_route("/{id}", handle_get_internal_transfer, methods=["GET"], include_in_schema=False)
compat_v1_router.add_api_route("/{id}/", handle_get_internal_transfer, methods=["GET"], include_in_schema=False)
compat_v1_router.add_api_route("", handle_list_internal_transfers, methods=["GET"], include_in_schema=False)
compat_v1_router.add_api_route("/", handle_list_internal_transfers, methods=["GET"], include_in_schema=False)
compat_v1_router.add_api_route("/{id}/cancel", handle_cancel_internal_transfer, methods=["POST"], include_in_schema=False)
compat_v1_router.add_api_route("/{id}/cancel/", handle_cancel_internal_transfer, methods=["POST"], include_in_schema=False)
