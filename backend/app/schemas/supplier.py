"""Pydantic schemas for Supplier Management (SCRUM-79).

Hỗ trợ đồng thời cả snake_case (theo đúng yêu cầu User & Pytest)
và camelCase (theo chuẩn API_SPECIFICATION & Frontend React).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_validator


class BaseDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
    )


class SupplierBase(BaseDTO):
    code: str = Field(..., min_length=1, max_length=50, description="Mã nhà cung cấp")
    name: str = Field(..., min_length=1, max_length=150, description="Tên nhà cung cấp")
    tax_code: Optional[str] = Field(
        None,
        max_length=50,
        description="Mã số thuế",
        validation_alias=AliasChoices("tax_code", "taxCode"),
    )
    contact_person: Optional[str] = Field(
        None,
        max_length=100,
        description="Người liên hệ",
        validation_alias=AliasChoices("contact_person", "contactPerson"),
    )
    payment_terms: Optional[str] = Field(
        None,
        max_length=100,
        description="Điều khoản thanh toán",
        validation_alias=AliasChoices("payment_terms", "paymentTerms"),
    )
    is_active: bool = Field(
        True,
        description="Trạng thái hoạt động",
        validation_alias=AliasChoices("is_active", "isActive"),
    )
    phone: Optional[str] = Field(None, max_length=20, description="Số điện thoại")
    address: Optional[str] = Field(None, description="Địa chỉ")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Mã nhà cung cấp không được để trống.")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tên nhà cung cấp không được để trống.")
        return v


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseDTO):
    code: Optional[str] = Field(None, min_length=1, max_length=50, description="Mã nhà cung cấp")
    name: Optional[str] = Field(None, min_length=1, max_length=150, description="Tên nhà cung cấp")
    tax_code: Optional[str] = Field(
        None,
        max_length=50,
        description="Mã số thuế",
        validation_alias=AliasChoices("tax_code", "taxCode"),
    )
    contact_person: Optional[str] = Field(
        None,
        max_length=100,
        description="Người liên hệ",
        validation_alias=AliasChoices("contact_person", "contactPerson"),
    )
    payment_terms: Optional[str] = Field(
        None,
        max_length=100,
        description="Điều khoản thanh toán",
        validation_alias=AliasChoices("payment_terms", "paymentTerms"),
    )
    is_active: Optional[bool] = Field(
        None,
        description="Trạng thái hoạt động",
        validation_alias=AliasChoices("is_active", "isActive"),
    )
    phone: Optional[str] = Field(None, max_length=20, description="Số điện thoại")
    address: Optional[str] = Field(None, description="Địa chỉ")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Mã nhà cung cấp không được để trống.")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Tên nhà cung cấp không được để trống.")
        return v


class SupplierStatusUpdate(BaseDTO):
    is_active: bool = Field(
        ...,
        description="Trạng thái hoạt động mới (True = Hoạt động, False = Ngừng giao dịch)",
        validation_alias=AliasChoices("is_active", "isActive"),
    )


class SupplierResponse(SupplierBase):
    id: int
    status: Optional[str] = "ACTIVE"
    receipts_count: int = Field(0, description="Số lượng phiếu nhập kho liên quan")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Hỗ trợ thuộc tính camelCase cho Frontend
    @computed_field
    @property
    def taxCode(self) -> Optional[str]:
        return self.tax_code

    @computed_field
    @property
    def contactPerson(self) -> Optional[str]:
        return self.contact_person

    @computed_field
    @property
    def paymentTerms(self) -> Optional[str]:
        return self.payment_terms

    @computed_field
    @property
    def isActive(self) -> bool:
        return self.is_active

    @computed_field
    @property
    def receiptsCount(self) -> int:
        return self.receipts_count


class PaginationInfo(BaseDTO):
    page: int
    limit: int
    total_records: int
    total_pages: int

    @computed_field
    @property
    def totalRecords(self) -> int:
        return self.total_records

    @computed_field
    @property
    def totalPages(self) -> int:
        return self.total_pages


class SupplierListResponse(BaseDTO):
    success: bool = True
    code: int = 200
    message: str = "Thao tác thành công"
    data: List[SupplierResponse]
    pagination: PaginationInfo


class SupplierSingleResponse(BaseDTO):
    success: bool = True
    code: int = 200
    message: str = "Thao tác thành công"
    data: SupplierResponse
