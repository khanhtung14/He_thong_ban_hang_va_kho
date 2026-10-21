"""Pydantic schemas for Pick List and Batch Picking (EP-06 / SCRUM-36 / SCRUM-40)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PickListItemExecuteRequest(BaseModel):
    detail_id: int = Field(..., description="ID của dòng chi tiết phiếu soạn hàng")
    actual_qty: float = Field(..., ge=0, description="Số lượng thực soạn")
    missing_reason: Optional[str] = Field(None, description="Lý do soạn thiếu (bắt buộc khi actual_qty < required_qty)")
    is_completed: bool = Field(True, description="Đánh dấu đã soạn xong dòng này")


class PickListExecuteRequest(BaseModel):
    items: List[PickListItemExecuteRequest] = Field(..., description="Danh sách dòng soạn hàng cần cập nhật")
    note: Optional[str] = Field(None, description="Ghi chú thêm khi kết thúc soạn hàng")


class PickListCreateRequest(BaseModel):
    order_ids: List[int] = Field(..., min_length=1, description="Danh sách ID các đơn hàng cần gộp soạn (Batch Picking)")
    warehouse_id: Optional[int] = Field(None, description="ID kho hàng lấy hàng")
    note: Optional[str] = Field(None, description="Ghi chú phiếu soạn")


class PickListDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pick_list_id: int
    product_id: int
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit_name: Optional[str] = None
    location_id: Optional[int] = None
    location_code: Optional[str] = None
    pick_sequence: int = 1
    required_qty: float
    actual_qty: float = 0.0
    missing_reason: Optional[str] = None
    order_ids: Optional[List[Any]] = None
    is_completed: bool = False
    status: str = "PENDING"


class PickListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    warehouse_id: Optional[int] = None
    order_id: Optional[int] = None
    order_ids: Optional[List[Any]] = None
    status: str
    total_items: int
    total_required_qty: float
    total_actual_qty: float
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    details: List[PickListDetailResponse] = []


class PendingOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_code: str
    customer_id: int
    customer_name: Optional[str] = None
    status: str
    total_amount: float
    total_items: int
    created_at: Optional[datetime] = None
    warehouse_id: Optional[int] = None
