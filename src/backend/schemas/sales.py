"""Schemas for SCRUM-11: Lịch sử mua hàng của đại lý dành cho Nhân viên kinh doanh (Sales).

Mọi import trong file này bắt đầu bằng src.backend.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PurchaseHistoryItemResponse(BaseModel):
    """Mặt hàng trong lịch sử mua hàng 90 ngày của đại lý."""
    model_config = ConfigDict(from_attributes=True)

    product_id: int = Field(..., description="ID sản phẩm")
    product_name: str = Field(..., description="Tên sản phẩm")
    total_quantity: int = Field(..., description="Tổng số lượng đã mua trong 90 ngày")
    average_quantity: float = Field(..., description="Số lượng mua bình quân mỗi lần")


class LastOrderItemResponse(BaseModel):
    """Thông tin 1 dòng sản phẩm từ đơn hàng thành công gần nhất."""
    model_config = ConfigDict(from_attributes=True)

    product_id: int = Field(..., description="ID sản phẩm")
    product_name: str = Field(..., description="Tên sản phẩm")
    quantity: int = Field(..., description="Số lượng mua lần trước")
    unit_price: float = Field(..., description="Đơn giá lần mua trước")


class LastOrderGroupResponse(BaseModel):
    """Danh sách các sản phẩm từ đơn đặt hàng thành công mới nhất của đại lý."""
    model_config = ConfigDict(from_attributes=True)

    order_id: Optional[int] = Field(None, description="Mã ID đơn hàng gần nhất")
    order_code: Optional[str] = Field(None, description="Mã code đơn hàng gần nhất")
    items: List[LastOrderItemResponse] = Field(
        default_factory=list,
        description="Danh sách các mặt hàng của đơn gần nhất"
    )
