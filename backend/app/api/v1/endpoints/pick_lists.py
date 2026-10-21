"""API endpoints for Pick List and Batch Picking (EP-06 / SCRUM-36 / SCRUM-40)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.pick_list import (
    PendingOrderResponse,
    PickListCreateRequest,
    PickListExecuteRequest,
    PickListResponse,
)
from app.services import pick_list_service

router = APIRouter(prefix="/api/pick-lists", tags=["Pick Lists"])
compat_v1_router = APIRouter(prefix="/api/v1/pick-lists", tags=["Pick Lists (v1)"])
warehouse_pick_router = APIRouter(prefix="/api/v1/warehouse/pick-lists", tags=["Pick Lists (warehouse)"])


@router.get("/pending-orders", response_model=List[PendingOrderResponse])
@compat_v1_router.get("/pending-orders", response_model=List[PendingOrderResponse])
@warehouse_pick_router.get("/pending-orders", response_model=List[PendingOrderResponse])
def get_pending_approved_orders(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    db: Session = Depends(get_db),
):
    """Lấy danh sách các đơn hàng đã duyệt (APPROVED) để gom thành phiếu soạn hàng (Batch Picking)."""
    return pick_list_service.get_pending_approved_orders(db, warehouse_id=warehouse_id)


@router.post("", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
@compat_v1_router.post("", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
@compat_v1_router.post("/", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
@warehouse_pick_router.post("", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
@warehouse_pick_router.post("/", response_model=PickListResponse, status_code=status.HTTP_201_CREATED)
def create_pick_list(
    payload: PickListCreateRequest,
    db: Session = Depends(get_db),
):
    """Tạo phiếu soạn hàng gộp từ nhiều đơn hàng (Batch Picking).
    
    - Gom nhóm các mặt hàng trùng lặp và tính tổng required_qty.
    - Ghép vị trí lưu trữ (WarehouseLocation) và sắp xếp theo lộ trình tối ưu (pick_sequence ASC).
    """
    return pick_list_service.create_batch_pick_list(db, payload)


@router.put("/{pick_list_id}/execute", response_model=PickListResponse)
@compat_v1_router.put("/{pick_list_id}/execute", response_model=PickListResponse)
@warehouse_pick_router.put("/{pick_list_id}/execute", response_model=PickListResponse)
def execute_pick_list(
    pick_list_id: int,
    payload: PickListExecuteRequest,
    db: Session = Depends(get_db),
):
    """Cập nhật tiến độ soạn hàng thực tế.
    
    - Validate nghiêm ngặt: Nếu actual_qty < required_qty mà thiếu missing_reason -> Báo lỗi 400.
    """
    return pick_list_service.execute_pick_list(db, pick_list_id, payload)


@router.get("", response_model=List[PickListResponse])
@router.get("/", response_model=List[PickListResponse])
@compat_v1_router.get("", response_model=List[PickListResponse])
@compat_v1_router.get("/", response_model=List[PickListResponse])
@warehouse_pick_router.get("", response_model=List[PickListResponse])
@warehouse_pick_router.get("/", response_model=List[PickListResponse])
def list_pick_lists(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    db: Session = Depends(get_db),
):
    """Lấy danh sách các phiếu soạn hàng."""
    return pick_list_service.list_pick_lists(
        db, warehouse_id=warehouse_id, status_filter=status
    )


@router.get("/{pick_list_id}", response_model=PickListResponse)
@compat_v1_router.get("/{pick_list_id}", response_model=PickListResponse)
@warehouse_pick_router.get("/{pick_list_id}", response_model=PickListResponse)
def get_pick_list_detail(
    pick_list_id: int,
    db: Session = Depends(get_db),
):
    """Lấy chi tiết phiếu soạn hàng và danh sách mặt hàng sắp xếp theo vị trí tối ưu."""
    return pick_list_service.get_pick_list_by_id(db, pick_list_id)
