"""Pydantic schemas for Internal Transfers (Phiếu chuyển kho nội bộ).

Supports both snake_case and camelCase for seamless frontend and API compatibility.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class BaseDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
    )


class InternalTransferItemCreate(BaseDTO):
    product_id: int = Field(
        ...,
        description="ID sản phẩm cần chuyển",
        validation_alias=AliasChoices("product_id", "productId"),
    )
    sent_quantity: float = Field(
        ...,
        gt=0,
        description="Số lượng gửi đi (phải > 0)",
        validation_alias=AliasChoices("sent_quantity", "sentQuantity", "quantity"),
    )

    @field_validator("sent_quantity")
    @classmethod
    def validate_sent_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Số lượng gửi phải lớn hơn 0.")
        return v


class InternalTransferCreate(BaseDTO):
    from_warehouse_id: int = Field(
        ...,
        description="ID kho gửi / xuất hàng",
        validation_alias=AliasChoices("from_warehouse_id", "fromWarehouseId"),
    )
    to_warehouse_id: int = Field(
        ...,
        description="ID kho nhận hàng",
        validation_alias=AliasChoices("to_warehouse_id", "toWarehouseId"),
    )
    transfer_code: Optional[str] = Field(
        None,
        description="Mã phiếu chuyển (tự sinh nếu để trống)",
        validation_alias=AliasChoices("transfer_code", "transferCode"),
    )
    items: List[InternalTransferItemCreate] = Field(
        ...,
        min_length=1,
        description="Danh sách sản phẩm chuyển kho",
    )

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: List[InternalTransferItemCreate]) -> List[InternalTransferItemCreate]:
        if not v:
            raise ValueError("Danh sách sản phẩm chuyển kho không được để trống.")
        return v


class InternalTransferItemConfirm(BaseDTO):
    item_id: Optional[int] = Field(
        None,
        description="ID của InternalTransferItem",
        validation_alias=AliasChoices("item_id", "itemId", "id"),
    )
    product_id: Optional[int] = Field(
        None,
        description="ID sản phẩm (dùng để map nếu không truyền item_id)",
        validation_alias=AliasChoices("product_id", "productId"),
    )
    received_quantity: float = Field(
        ...,
        ge=0,
        description="Số lượng thực nhận tại kho đích (>= 0)",
        validation_alias=AliasChoices("received_quantity", "receivedQuantity"),
    )
    discrepancy_reason: Optional[str] = Field(
        None,
        description="Lý do chênh lệch (BẮT BUỘC nếu received_quantity != sent_quantity)",
        validation_alias=AliasChoices("discrepancy_reason", "discrepancyReason"),
    )

    @field_validator("received_quantity")
    @classmethod
    def validate_received_quantity(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Số lượng thực nhận không được là số âm.")
        return v


class InternalTransferConfirm(BaseDTO):
    confirmed_by: Optional[str] = Field(
        None,
        description="Tên người xác nhận nhận hàng",
        validation_alias=AliasChoices("confirmed_by", "confirmedBy"),
    )
    items: List[InternalTransferItemConfirm] = Field(
        ...,
        min_length=1,
        description="Danh sách sản phẩm kèm số lượng nhận thực tế",
    )


class InternalTransferItemResponse(BaseDTO):
    id: int
    transfer_id: int
    product_id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    unit: Optional[str] = None
    sent_quantity: float
    received_quantity: Optional[float] = None
    discrepancy_reason: Optional[str] = None


class InternalTransferResponse(BaseDTO):
    id: int
    transfer_code: str
    from_warehouse_id: int
    from_warehouse_name: Optional[str] = None
    to_warehouse_id: int
    to_warehouse_name: Optional[str] = None
    status: str  # PENDING / COMPLETED / CANCELLED
    created_by: Optional[str] = None
    confirmed_by: Optional[str] = None
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    items: List[InternalTransferItemResponse] = []


class InternalTransferListResponse(BaseDTO):
    success: bool = True
    code: int = 200
    message: str = "Thành công"
    data: List[InternalTransferResponse] = []
    total: int = 0
