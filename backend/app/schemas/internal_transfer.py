"""Pydantic schemas for Internal Transfers (Quản lý luân chuyển hàng hóa nội bộ)."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class InternalTransferStatus(str, Enum):
    IN_TRANSIT = "IN_TRANSIT"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class InternalTransferItemCreate(BaseModel):
    product_id: int = Field(..., alias="productId", gt=0, description="ID của sản phẩm cần chuyển")
    quantity_sent: float = Field(..., alias="quantitySent", gt=0, description="Số lượng gửi đi")

    model_config = ConfigDict(populate_by_name=True)


class InternalTransferCreate(BaseModel):
    from_warehouse_id: int = Field(..., alias="fromWarehouseId", gt=0, description="ID kho xuất phát")
    to_warehouse_id: int = Field(..., alias="toWarehouseId", gt=0, description="ID kho đích đến")
    items: List[InternalTransferItemCreate] = Field(..., min_length=1, description="Danh sách mặt hàng cần luân chuyển")

    model_config = ConfigDict(populate_by_name=True)


class InternalTransferItemConfirm(BaseModel):
    detail_id: Optional[int] = Field(None, alias="detailId", description="ID dòng chi tiết chuyển kho")
    product_id: Optional[int] = Field(None, alias="productId", description="ID sản phẩm")
    quantity_received: float = Field(..., alias="quantityReceived", ge=0, description="Số lượng thực nhận tại kho đến")
    discrepancy_reason: Optional[str] = Field(None, alias="discrepancyReason", description="Lý do chênh lệch nếu số nhận khác số gửi")

    model_config = ConfigDict(populate_by_name=True)


class InternalTransferConfirmRequest(BaseModel):
    items: List[InternalTransferItemConfirm] = Field(..., min_length=1, description="Danh sách xác nhận nhận hàng")

    model_config = ConfigDict(populate_by_name=True)


class InternalTransferDetailResponse(BaseModel):
    id: int
    transfer_id: int
    product_id: int
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    quantity_sent: float
    quantity_received: Optional[float] = None
    discrepancy_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class InternalTransferResponse(BaseModel):
    id: int
    from_warehouse_id: int
    from_warehouse_name: Optional[str] = None
    to_warehouse_id: int
    to_warehouse_name: Optional[str] = None
    status: str
    created_at: datetime
    details: List[InternalTransferDetailResponse] = []

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
