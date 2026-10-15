"""Pydantic schemas for Reorder feature (SCRUM-28)."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ReorderPreviewRequest(BaseModel):
    order_id: Optional[int] = Field(None, description="Mã ID đơn hàng cũ cần xem trước đặt lại")


class ReorderItemPreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int = Field(..., description="ID sản phẩm")
    sku: str = Field(..., description="Mã SKU sản phẩm")
    product_name: str = Field(..., description="Tên sản phẩm")
    unit_id: Optional[int] = Field(None, description="ID đơn vị tính")
    unit_name: Optional[str] = Field(None, description="Tên đơn vị tính")
    quantity: int = Field(gt=0, description="Số lượng từ đơn hàng cũ")
    old_unit_price: float = Field(ge=0, description="Đơn giá cũ trong lịch sử đơn hàng")
    new_unit_price: float = Field(ge=0, description="Đơn giá mới hiện hành áp dụng theo PriceLists")
    floor_price: Optional[float] = Field(None, description="Giá sàn hiện hành")
    price_list_id: Optional[int] = Field(None, description="ID bảng giá đang áp dụng")
    price_list_code: Optional[str] = Field(None, description="Mã bảng giá đang áp dụng")
    total_price: float = Field(ge=0, description="Thành tiền mới = quantity * new_unit_price")
    is_active: bool = Field(True, description="Trạng thái còn kinh doanh của sản phẩm")


class ReorderDiscontinuedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: Optional[int] = Field(None, description="ID sản phẩm (nếu có)")
    sku: str = Field(..., description="Mã SKU sản phẩm đã ngừng kinh doanh")
    product_name: str = Field(..., description="Tên sản phẩm")
    old_unit_price: float = Field(0.0, description="Đơn giá cũ")
    quantity: int = Field(1, description="Số lượng trong đơn cũ")
    reason: str = Field("Sản phẩm đã ngừng kinh doanh", description="Lý do loại bỏ khỏi đơn hàng mới")


class ReorderPreviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: int = Field(..., description="ID đơn hàng cũ")
    order_code: str = Field(..., description="Mã đơn hàng cũ")
    customer_id: int = Field(..., description="ID khách hàng/đại lý")
    customer_name: Optional[str] = Field(None, description="Tên đại lý")
    customer_group: Optional[str] = Field(None, description="Nhóm đại lý áp dụng bảng giá")
    available_items: List[ReorderItemPreview] = Field(
        default_factory=list,
        description="Danh sách các mặt hàng còn hoạt động kèm giá mới hiện hành",
    )
    discontinued_items: List[ReorderDiscontinuedItem] = Field(
        default_factory=list,
        description="Danh sách các mặt hàng đã ngừng kinh doanh được tự động loại bỏ",
    )
    has_discontinued_items: bool = Field(False, description="Cờ cảnh báo có mặt hàng ngừng kinh doanh")
    warning_message: Optional[str] = Field(None, description="Thông điệp cảnh báo người dùng")
    total_estimated_amount: float = Field(
        default=0.0,
        description="Tổng tiền ước tính dựa trên các mặt hàng hợp lệ và giá mới",
    )


class ReorderCreateItem(BaseModel):
    product_id: Optional[int] = Field(None, description="ID sản phẩm")
    sku: str = Field(..., min_length=1, description="Mã SKU sản phẩm")
    product_name: Optional[str] = Field(None, description="Tên sản phẩm")
    unit_id: Optional[int] = Field(None, description="ID đơn vị tính")
    quantity: int = Field(..., gt=0, description="Số lượng đặt lại, phải lớn hơn 0")
    unit_price: Optional[float] = Field(None, ge=0, description="Đơn giá (tùy chọn, hệ thống tự động xác thực)")


class ReorderCreateRequest(BaseModel):
    original_order_id: int = Field(..., description="ID đơn hàng gốc cần đặt lại")
    items: List[ReorderCreateItem] = Field(..., min_length=1, description="Danh sách các mặt hàng được chọn đặt lại")
    note: Optional[str] = Field(None, max_length=500, description="Ghi chú đơn hàng mới")


class ReorderCreateResponse(BaseModel):
    success: bool = True
    code: int = 201
    message: str = "Đặt lại đơn hàng thành công"
    order_id: int
    order_code: str
    customer_id: int
    customer_name: Optional[str] = None
    status: str
    total_amount: float
    items_count: int
    original_order_id: int
    original_order_code: str
    warning_message: Optional[str] = None
