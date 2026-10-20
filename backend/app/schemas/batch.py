"""Pydantic schemas for Batch and Expiry Date Tracking (Theo dõi lô và hạn sử dụng)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ProductBatchCreate(BaseModel):
    product_id: int = Field(..., alias="productId", gt=0, description="ID sản phẩm")
    batch_number: str = Field(..., alias="batchNumber", min_length=1, max_length=100, description="Số lô sản xuất")
    mfg_date: Optional[date] = Field(None, alias="mfgDate", description="Ngày sản xuất (NSX)")
    exp_date: date = Field(..., alias="expDate", description="Hạn sử dụng (HSD)")
    remaining_quantity: float = Field(0.0, alias="remainingQuantity", ge=0, description="Số lượng tồn trong lô")
    warehouse_id: Optional[int] = Field(None, alias="warehouseId", description="Kho lưu trữ lô")

    model_config = ConfigDict(populate_by_name=True)


class ProductBatchUpdate(BaseModel):
    batch_number: Optional[str] = Field(None, alias="batchNumber", min_length=1, max_length=100)
    mfg_date: Optional[date] = Field(None, alias="mfgDate")
    exp_date: Optional[date] = Field(None, alias="expDate")
    remaining_quantity: Optional[float] = Field(None, alias="remainingQuantity", ge=0)
    warehouse_id: Optional[int] = Field(None, alias="warehouseId")

    model_config = ConfigDict(populate_by_name=True)


class ProductBatchResponse(BaseModel):
    id: int
    product_id: int
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: str
    mfg_date: Optional[date] = None
    exp_date: date
    remaining_quantity: float
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    days_until_expiry: int
    is_expired: bool
    is_expiring_soon: bool
    status: str

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProductBatchToggleRequest(BaseModel):
    is_batch_managed: bool = Field(..., alias="isBatchManaged", description="Bật hoặc tắt tính năng quản lý theo lô")

    model_config = ConfigDict(populate_by_name=True)


class OutboundDispatchCreate(BaseModel):
    product_id: int = Field(..., alias="productId", gt=0, description="ID sản phẩm cần xuất")
    warehouse_id: int = Field(..., alias="warehouseId", gt=0, description="ID kho xuất hàng")
    quantity: float = Field(..., gt=0, description="Số lượng xuất")
    batch_id: Optional[int] = Field(None, alias="batchId", description="ID lô hàng (bắt buộc nếu SKU quản lý theo lô)")
    batch_number: Optional[str] = Field(None, alias="batchNumber", description="Số lô hàng")
    override_expired: bool = Field(False, alias="overrideExpired", description="Xác nhận ghi đè xuất lô quá hạn")
    override_reason: Optional[str] = Field(None, alias="overrideReason", description="Lý do ghi đè nếu xuất lô quá hạn")
    note: Optional[str] = Field(None, description="Ghi chú xuất kho")

    model_config = ConfigDict(populate_by_name=True)
