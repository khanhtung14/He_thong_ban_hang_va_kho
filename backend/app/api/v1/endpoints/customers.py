from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.database import get_db
from app.models.models import Customer, Order, RoleCode, User
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_optional_current_user,
    normalize_role,
    require_permissions,
)

router = APIRouter(prefix="/api/v1/customers", tags=["Customers"])


def _coerce_customer_group(value: Any) -> str:
    if value is None:
        return "RETAIL"
    if isinstance(value, str):
        normalized = value.strip().upper()
        choices = {
            "DEALER_LEVEL_1": "DEALER_LEVEL_1",
            "LEVEL_1": "DEALER_LEVEL_1",
            "DEALER_LEVEL_2": "DEALER_LEVEL_2",
            "LEVEL_2": "DEALER_LEVEL_2",
            "RETAIL": "RETAIL",
        }
        return choices.get(normalized, "RETAIL")
    if isinstance(value, int):
        mapping = {1: "DEALER_LEVEL_1", 2: "DEALER_LEVEL_2", 3: "RETAIL"}
        return mapping.get(value, "RETAIL")
    return "RETAIL"


class CustomerCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=150)
    taxCode: Optional[str] = None
    tax_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customerGroupId: Optional[int] = None
    customerGroup: Optional[str] = None
    customer_group: Optional[str] = None
    region: Optional[str] = None
    regionId: Optional[int] = None
    territory_id: Optional[int] = None
    salesRepId: Optional[int] = None
    sales_rep_id: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @field_validator("code", "name")
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip() if value else value

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "taxCode" in normalized and "tax_code" not in normalized:
            normalized["tax_code"] = normalized["taxCode"]
        if "salesRepId" in normalized and "sales_rep_id" not in normalized:
            normalized["sales_rep_id"] = normalized["salesRepId"]
        if "regionId" in normalized and "territory_id" not in normalized:
            normalized["territory_id"] = normalized["regionId"]
        if "customerGroupId" in normalized and "customer_group" not in normalized and "customerGroup" not in normalized:
            normalized["customerGroup"] = _coerce_customer_group(normalized["customerGroupId"])
        return normalized


class CustomerResponse(BaseModel):
    id: int
    code: str
    name: str
    taxCode: Optional[str] = None
    tax_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customerGroup: str = "RETAIL"
    customer_group: str = "RETAIL"
    region: Optional[str] = None
    regionId: Optional[int] = None
    territory_id: Optional[int] = None
    salesRepId: Optional[int] = None
    sales_rep_id: Optional[int] = None
    isActive: bool = True
    is_active: bool = True
    isLocked: bool = False
    is_locked: bool = False
    lockReason: Optional[str] = None
    lock_reason: Optional[str] = None
    createdAt: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("")
def list_customers(
    keyword: Optional[str] = None,
    sales_rep_id: Optional[int] = Query(default=None, alias="salesRepId"),
    region: Optional[str] = Query(default=None),
    region_id: Optional[int] = Query(default=None, alias="regionId"),
    customer_group: Optional[str] = Query(default=None, alias="customerGroup"),
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    query = select(Customer)
    if keyword:
        kw = f"%{keyword.strip()}%"
        query = query.where((Customer.code.ilike(kw)) | (Customer.name.ilike(kw)))
    if region:
        query = query.where(Customer.region == region.strip())
    if region_id is not None:
        query = query.where(Customer.territory_id == region_id)
    if customer_group is not None:
        query = query.where(Customer.customer_group == _coerce_customer_group(customer_group))

    if user:
        norm_role = normalize_role(user.role)
        if norm_role == RoleCode.SALES_REP.value:
            rep_id = user.id
            if rep_id is None:
                db_user = db.execute(select(User).where(User.username == user.username)).scalar_one_or_none()
                if db_user:
                    rep_id = db_user.id
            if rep_id is not None:
                query = query.where(Customer.sales_rep_id == rep_id)
            else:
                query = query.where(Customer.sales_rep_id == -1)
        elif sales_rep_id is not None:
            query = query.where(Customer.sales_rep_id == sales_rep_id)
    elif sales_rep_id is not None:
        query = query.where(Customer.sales_rep_id == sales_rep_id)

    items = db.execute(query.order_by(Customer.id.asc())).scalars().all()
    data = []
    for item in items:
        data.append({
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "taxCode": item.tax_code,
            "tax_code": item.tax_code,
            "phone": item.phone,
            "email": item.email,
            "address": item.address,
            "customerGroup": item.customer_group,
            "customer_group": item.customer_group,
            "region": item.region,
            "regionId": item.territory_id,
            "territory_id": item.territory_id,
            "salesRepId": item.sales_rep_id,
            "sales_rep_id": item.sales_rep_id,
            "isActive": item.is_active,
            "is_active": item.is_active,
            "isLocked": item.is_locked,
            "is_locked": item.is_locked,
            "lockReason": item.lock_reason,
            "lock_reason": item.lock_reason,
            "createdAt": item.created_at,
        })
    return {"success": True, "code": 200, "message": "Thành công", "data": data}


@router.get("/{customer_id}")
def get_customer_detail(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý")
    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": {
            "id": customer.id,
            "code": customer.code,
            "name": customer.name,
            "taxCode": customer.tax_code,
            "tax_code": customer.tax_code,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "customerGroup": customer.customer_group,
            "customer_group": customer.customer_group,
            "region": customer.region,
            "regionId": customer.territory_id,
            "territory_id": customer.territory_id,
            "salesRepId": customer.sales_rep_id,
            "sales_rep_id": customer.sales_rep_id,
            "isActive": customer.is_active,
            "is_active": customer.is_active,
            "isLocked": customer.is_locked,
            "is_locked": customer.is_locked,
            "lockReason": customer.lock_reason,
            "lock_reason": customer.lock_reason,
            "createdAt": customer.created_at,
            "currentDebt": 0,
            "creditLimit": getattr(customer, "credit_limit", 0),
            "maxDueDays": getattr(customer, "max_due_days", 0),
        },
    }


@router.post("")
def create_customers(
    data: CustomerCreate,
    db: Session = Depends(get_db),
):
    code = data.code.strip()
    if db.query(Customer).filter(Customer.code == code).first():
        raise HTTPException(status_code=400, detail="Mã đại lý đã tồn tại")
    tax_code_val = data.tax_code or data.taxCode
    if tax_code_val and db.query(Customer).filter(Customer.tax_code == tax_code_val.strip()).first():
        raise HTTPException(status_code=400, detail="Mã số thuế đã tồn tại")

    sales_rep = data.sales_rep_id if data.sales_rep_id is not None else data.salesRepId
    region_id_val = data.territory_id if data.territory_id is not None else data.regionId
    group_val = data.customer_group or data.customerGroup or data.customerGroupId

    customer = Customer(
        code=code,
        name=data.name.strip(),
        tax_code=tax_code_val.strip() if tax_code_val else None,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip() if data.email else None,
        address=data.address.strip() if data.address else None,
        region=data.region.strip() if data.region else None,
        sales_rep_id=sales_rep,
        territory_id=region_id_val,
        customer_group=_coerce_customer_group(group_val),
        is_active=True,
        is_locked=False,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return {
        "success": True,
        "code": 201,
        "message": "Thành công",
        "data": {
            "id": customer.id,
            "code": customer.code,
            "name": customer.name,
            "taxCode": customer.tax_code,
            "tax_code": customer.tax_code,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "customerGroup": customer.customer_group,
            "customer_group": customer.customer_group,
            "region": customer.region,
            "regionId": customer.territory_id,
            "territory_id": customer.territory_id,
            "salesRepId": customer.sales_rep_id,
            "sales_rep_id": customer.sales_rep_id,
            "isActive": customer.is_active,
            "is_active": customer.is_active,
            "isLocked": customer.is_locked,
            "is_locked": customer.is_locked,
            "lockReason": customer.lock_reason,
            "lock_reason": customer.lock_reason,
            "createdAt": customer.created_at,
        },
    }
