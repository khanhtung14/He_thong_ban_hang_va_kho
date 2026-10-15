"""Delivery Address endpoints for SCRUM-20:
Khai báo và quản lý nhiều điểm giao hàng cho một đại lý (EP-03 / S3-04).

Yêu cầu nghiệp vụ:
1. Mỗi điểm giao có địa chỉ, người nhận, số điện thoại, ghi chú đường đi.
2. Một điểm được đặt làm mặc định.
3. Đơn hàng chọn điểm giao trong danh sách của đúng đại lý đó.
4. Bảo đảm toàn vẹn dữ liệu: khi xóa điểm mặc định, tự động chuyển mặc định cho điểm còn lại;
   chặn truy cập hoặc chỉnh sửa điểm giao hàng của đại lý khác.
"""
from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Customer, DeliveryAddress, RoleCode
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_current_user,
    normalize_role,
    require_roles,
)

PHONE_REGEX = re.compile(r"^0[1235789]\d{8,9}$")

router = APIRouter(prefix="/api/v1/customers", tags=["Delivery Addresses (SCRUM-20)"])


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class DeliveryAddressCreate(BaseModel):
    receiver_name: str = Field(..., min_length=1, max_length=150, alias="receiverName", description="Tên người nhận")
    phone: str = Field(..., description="Số điện thoại người nhận (10 chữ số)")
    address: str = Field(..., min_length=1, description="Địa chỉ giao hàng")
    is_default: bool = Field(default=False, alias="isDefault", description="Đặt làm điểm giao hàng mặc định")
    note: Optional[str] = Field(default=None, description="Ghi chú đường đi / chỉ dẫn giao hàng")

    model_config = ConfigDict(populate_by_name=True)


class DeliveryAddressUpdate(BaseModel):
    receiver_name: Optional[str] = Field(None, min_length=1, max_length=150, alias="receiverName", description="Tên người nhận")
    phone: Optional[str] = Field(None, description="Số điện thoại người nhận")
    address: Optional[str] = Field(None, min_length=1, description="Địa chỉ giao hàng")
    is_default: Optional[bool] = Field(None, alias="isDefault", description="Đặt làm điểm giao hàng mặc định")
    note: Optional[str] = Field(None, description="Ghi chú đường đi")

    model_config = ConfigDict(populate_by_name=True)


class DeliveryAddressResponse(BaseModel):
    id: int
    customer_id: int
    receiver_name: str
    phone: str
    address: str
    is_default: bool
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


def _validate_customer_access(customer: Customer, user: AuthenticatedUser) -> None:
    """Kiểm tra quyền truy cập dữ liệu đại lý theo vai trò."""
    norm_role = normalize_role(user.role)
    if norm_role == RoleCode.CUSTOMER.value:
        # Đại lý chỉ được xem và sửa dữ liệu của chính mình
        if customer.code != user.username and str(customer.id) != getattr(user, "username", ""):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập thông tin của đại lý khác.",
            )


# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------

@router.get("/{customer_id}/delivery-addresses", response_model=List[DeliveryAddressResponse])
def list_delivery_addresses(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.SALES_REP,
            RoleCode.SALES_MANAGER,
            RoleCode.ADMIN,
            RoleCode.WAREHOUSE,
            RoleCode.WH_MANAGER,
            RoleCode.ACCOUNTANT,
            RoleCode.CUSTOMER,
        )
    ),
):
    """Lấy danh sách các điểm giao hàng của một đại lý (S3-04)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với ID {customer_id}!",
        )

    _validate_customer_access(customer, user)

    addresses = (
        db.query(DeliveryAddress)
        .filter(DeliveryAddress.customer_id == customer_id)
        .order_by(DeliveryAddress.is_default.desc(), DeliveryAddress.id.asc())
        .all()
    )
    return [DeliveryAddressResponse.model_validate(a) for a in addresses]


@router.post("/{customer_id}/delivery-addresses", response_model=DeliveryAddressResponse, status_code=status.HTTP_201_CREATED)
def create_delivery_address(
    customer_id: int,
    payload: DeliveryAddressCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.SALES_REP,
            RoleCode.SALES_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.CUSTOMER,
        )
    ),
):
    """Khai báo thêm điểm giao hàng mới cho đại lý (S3-04)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với ID {customer_id}!",
        )

    _validate_customer_access(customer, user)

    # 1. Kiểm tra tính hợp lệ của dữ liệu
    clean_receiver = payload.receiver_name.strip()
    if not clean_receiver:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên người nhận không được để trống.")

    clean_phone = payload.phone.strip()
    if not PHONE_REGEX.match(clean_phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số điện thoại người nhận không hợp lệ. Phải gồm 10-11 chữ số bắt đầu bằng đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02).",
        )

    clean_address = payload.address.strip()
    if not clean_address:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Địa chỉ giao hàng không được để trống.")

    # 2. Xử lý logic điểm mặc định
    existing_count = db.query(DeliveryAddress).filter(DeliveryAddress.customer_id == customer_id).count()
    make_default = payload.is_default or (existing_count == 0)

    if make_default:
        db.query(DeliveryAddress).filter(DeliveryAddress.customer_id == customer_id).update({"is_default": False})

    new_addr = DeliveryAddress(
        customer_id=customer_id,
        receiver_name=clean_receiver,
        phone=clean_phone,
        address=clean_address,
        is_default=make_default,
        note=payload.note.strip() if payload.note else None,
    )
    db.add(new_addr)
    db.commit()
    db.refresh(new_addr)

    return DeliveryAddressResponse.model_validate(new_addr)


@router.put("/{customer_id}/delivery-addresses/{address_id}", response_model=DeliveryAddressResponse)
def update_delivery_address(
    customer_id: int,
    address_id: int,
    payload: DeliveryAddressUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.SALES_REP,
            RoleCode.SALES_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.CUSTOMER,
        )
    ),
):
    """Cập nhật thông tin điểm giao hàng của đại lý (S3-04)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với ID {customer_id}!",
        )

    _validate_customer_access(customer, user)

    addr = db.get(DeliveryAddress, address_id)
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy điểm giao hàng với ID {address_id}!",
        )

    if addr.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm giao hàng ID {address_id} không thuộc về đại lý ID {customer_id}!",
        )

    if payload.receiver_name is not None:
        clean_receiver = payload.receiver_name.strip()
        if not clean_receiver:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên người nhận không được để trống.")
        addr.receiver_name = clean_receiver

    if payload.phone is not None:
        clean_phone = payload.phone.strip()
        if not PHONE_REGEX.match(clean_phone):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số điện thoại người nhận không hợp lệ. Phải gồm 10-11 chữ số bắt đầu bằng đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02).",
            )
        addr.phone = clean_phone

    if payload.address is not None:
        clean_address = payload.address.strip()
        if not clean_address:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Địa chỉ giao hàng không được để trống.")
        addr.address = clean_address

    if payload.note is not None:
        addr.note = payload.note.strip() if payload.note.strip() else None

    if payload.is_default is True:
        db.query(DeliveryAddress).filter(DeliveryAddress.customer_id == customer_id, DeliveryAddress.id != address_id).update({"is_default": False})
        addr.is_default = True
    elif payload.is_default is False and addr.is_default:
        # Nếu bỏ mặc định nhưng đại lý có nhiều điểm, chọn điểm khác làm mặc định
        other_addr = (
            db.query(DeliveryAddress)
            .filter(DeliveryAddress.customer_id == customer_id, DeliveryAddress.id != address_id)
            .order_by(DeliveryAddress.id.asc())
            .first()
        )
        if other_addr:
            other_addr.is_default = True
            addr.is_default = False
        else:
            # Nếu chỉ có duy nhất 1 điểm thì giữ nguyên mặc định
            addr.is_default = True

    db.commit()
    db.refresh(addr)
    return DeliveryAddressResponse.model_validate(addr)


@router.patch("/{customer_id}/delivery-addresses/{address_id}/default", response_model=DeliveryAddressResponse)
def set_default_delivery_address(
    customer_id: int,
    address_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.SALES_REP,
            RoleCode.SALES_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.CUSTOMER,
        )
    ),
):
    """Đặt một điểm giao hàng làm mặc định cho đại lý (S3-04)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với ID {customer_id}!",
        )

    _validate_customer_access(customer, user)

    addr = db.get(DeliveryAddress, address_id)
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy điểm giao hàng với ID {address_id}!",
        )

    if addr.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm giao hàng ID {address_id} không thuộc về đại lý ID {customer_id}!",
        )

    db.query(DeliveryAddress).filter(DeliveryAddress.customer_id == customer_id).update({"is_default": False})
    addr.is_default = True
    db.commit()
    db.refresh(addr)
    return DeliveryAddressResponse.model_validate(addr)


@router.delete("/{customer_id}/delivery-addresses/{address_id}")
def delete_delivery_address(
    customer_id: int,
    address_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(
        require_roles(
            RoleCode.SALES_REP,
            RoleCode.SALES_MANAGER,
            RoleCode.ADMIN,
            RoleCode.ACCOUNTANT,
            RoleCode.CUSTOMER,
        )
    ),
):
    """Xóa một điểm giao hàng của đại lý.
    Nếu điểm bị xóa đang là mặc định, tự động chuyển mặc định cho điểm còn lại (nếu có).
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý với ID {customer_id}!",
        )

    _validate_customer_access(customer, user)

    addr = db.get(DeliveryAddress, address_id)
    if not addr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy điểm giao hàng với ID {address_id}!",
        )

    if addr.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Điểm giao hàng ID {address_id} không thuộc về đại lý ID {customer_id}!",
        )

    was_default = addr.is_default
    db.delete(addr)
    db.flush()

    if was_default:
        next_addr = (
            db.query(DeliveryAddress)
            .filter(DeliveryAddress.customer_id == customer_id, DeliveryAddress.id != address_id)
            .order_by(DeliveryAddress.id.asc())
            .first()
        )
        if next_addr:
            next_addr.is_default = True

    db.commit()
    return {"success": True, "message": "Đã xóa điểm giao hàng thành công."}
