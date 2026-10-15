"""Order schemas for SCRUM-26: Theo dõi trạng thái đơn hàng cho Đại lý.

Mọi import trong file này bắt đầu bằng src.backend.
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class OrderItemTrackingResponse(BaseModel):
    """Dòng sản phẩm trong chi tiết theo dõi đơn hàng."""
    model_config = ConfigDict(from_attributes=True)

    product_name: str = Field(..., description="Tên sản phẩm")
    quantity_ordered: int = Field(..., description="Số lượng đặt")
    quantity_delivered: int = Field(0, description="Số lượng thực tế đã giao")
    unit_price: float = Field(..., description="Đơn giá sản phẩm")


class OrderTrackingListResponse(BaseModel):
    """Thông tin đơn hàng trong danh sách theo dõi của đại lý."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Mã ID đơn hàng")
    dealer_id: int = Field(..., description="Mã ID đại lý")
    status: str = Field(..., description="Trạng thái đơn hàng")
    expected_delivery_date: Optional[date] = Field(None, description="Ngày giao hàng dự kiến")
    total_amount: float = Field(0.0, description="Tổng tiền đơn hàng")


class OrderTrackingDetailResponse(OrderTrackingListResponse):
    """Chi tiết đơn hàng kèm danh sách dòng sản phẩm."""
    items: List[OrderItemTrackingResponse] = Field(default_factory=list, description="Danh sách các sản phẩm")
