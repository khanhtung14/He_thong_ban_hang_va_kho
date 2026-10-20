"""Pydantic schemas for Inbound Receipt (SCRUM-30)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.backend.models.inbound_receipt import ReceiptStatus


# --- Inbound Receipt Detail Schemas ---

class InboundReceiptDetailBase(BaseModel):
    product_id: int = Field(..., description="ID sản phẩm")
    batch_lot: str = Field(..., min_length=1, max_length=100, description="Mã lô hàng")
    quantity: int = Field(..., gt=0, description="Số lượng nhập (lớn hơn 0)")
    storage_location_id: Optional[int] = Field(None, description="ID vị trí lưu kho (Khu/Kệ)")


class InboundReceiptDetailCreate(InboundReceiptDetailBase):
    pass


class InboundReceiptDetailResponse(InboundReceiptDetailBase):
    id: int
    receipt_id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    storage_location_name: Optional[str] = None
    storage_location_code: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# --- Inbound Receipt Header Schemas ---

class InboundReceiptBase(BaseModel):
    supplier_id: int = Field(..., description="ID nhà cung cấp")
    warehouse_id: int = Field(..., description="ID kho hàng nhận")
    notes: Optional[str] = Field(None, description="Ghi chú phiếu nhập")


class InboundReceiptCreate(InboundReceiptBase):
    code: Optional[str] = Field(None, max_length=50, description="Mã phiếu nhập (nếu để trống hệ thống sẽ tự sinh)")
    details: List[InboundReceiptDetailCreate] = Field(..., min_length=1, description="Danh sách chi tiết hàng nhập")


class InboundReceiptUpdate(BaseModel):
    supplier_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    notes: Optional[str] = None
    details: Optional[List[InboundReceiptDetailCreate]] = None


class InboundReceiptResponse(InboundReceiptBase):
    id: int
    code: str
    status: ReceiptStatus
    created_by: Optional[int] = None
    creator_name: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None
    warehouse_name: Optional[str] = None
    warehouse_code: Optional[str] = None
    total_quantity: int = 0
    details: List[InboundReceiptDetailResponse] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class InboundReceiptListResponse(BaseModel):
    items: List[InboundReceiptResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
