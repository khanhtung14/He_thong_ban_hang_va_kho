from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.database import get_db
from app.models.models import Customer, Order
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/customers", tags=["Customers"])


def _coerce_customer_group(value: Any) -> str:
    if value is None:
        return "RETAIL"
    if isinstance(value, str):
        normalized = value.strip().upper()
        choices = {"DEALER_LEVEL_1": "DEALER_LEVEL_1", "LEVEL_1": "DEALER_LEVEL_1", "DEALER_LEVEL_2": "DEALER_LEVEL_2", "LEVEL_2": "DEALER_LEVEL_2", "RETAIL": "RETAIL"}
        return choices.get(normalized, "RETAIL")
    if isinstance(value, int):
        mapping = {1: "DEALER_LEVEL_1", 2: "DEALER_LEVEL_2", 3: "RETAIL"}
        return mapping.get(value, "RETAIL")
    return "RETAIL"


class CustomerCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=150)
    taxCode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customerGroupId: Optional[int] = None
    customerGroup: Optional[str] = None
    regionId: Optional[int] = None
    salesRepId: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @field_validator("code", "name")
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "taxCode" in normalized and "taxCode" not in normalized:
            normalized["taxCode"] = normalized["taxCode"]
        if "customerGroupId" in normalized and "customerGroup" not in normalized:
            normalized["customerGroup"] = _coerce_customer_group(normalized["customerGroupId"])
        if "regionId" in normalized and "regionId" not in normalized:
            normalized["regionId"] = normalized["regionId"]
        return normalized


class CustomerResponse(BaseModel):
    id: int
    code: str
    name: str
    taxCode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customerGroup: str = "RETAIL"
    regionId: Optional[int] = None
    salesRepId: Optional[int] = None
    isActive: bool = True
    isLocked: bool = False
    lockReason: Optional[str] = None
    createdAt: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("")
def list_customers(
    keyword: Optional[str] = None,
    region_id: Optional[int] = Query(default=None, alias="regionId"),
    customer_group: Optional[str] = Query(default=None, alias="customerGroup"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    query = db.query(Customer)
    if keyword:
        keyword = keyword.strip()
        query = query.filter((Customer.code.ilike(f"%{keyword}%")) | (Customer.name.ilike(f"%{keyword}%")))
    if region_id is not None:
        query = query.filter(Customer.territory_id == region_id)
    if customer_group is not None:
        query = query.filter(Customer.customer_group == _coerce_customer_group(customer_group))
    items = query.order_by(Customer.id.asc()).all()
    data = []
    for item in items:
        data.append({
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "taxCode": item.tax_code,
            "phone": item.phone,
            "email": item.email,
            "address": item.address,
            "customerGroup": item.customer_group,
            "regionId": item.territory_id,
            "salesRepId": item.sales_rep_id,
            "isActive": item.is_active,
            "isLocked": item.is_locked,
            "lockReason": item.lock_reason,
            "createdAt": item.created_at,
        })
    return {"success": True, "code": 200, "message": "Thành công", "data": data}


@router.get("/{customer_id}")
def get_customer_detail(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
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
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "customerGroup": customer.customer_group,
            "regionId": customer.territory_id,
            "salesRepId": customer.sales_rep_id,
            "isActive": customer.is_active,
            "isLocked": customer.is_locked,
            "lockReason": customer.lock_reason,
            "createdAt": customer.created_at,
            "currentDebt": 0,
            "creditLimit": customer.credit_limit,
            "maxDueDays": customer.max_due_days,
        },
    }


@router.post("")
def create_customers(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    code = data.code.strip()
    if db.query(Customer).filter(Customer.code == code).first():
        raise HTTPException(status_code=400, detail="Mã đại lý đã tồn tại")
    if data.taxCode and db.query(Customer).filter(Customer.tax_code == data.taxCode.strip()).first():
        raise HTTPException(status_code=400, detail="Mã số thuế đã tồn tại")

    customer = Customer(
        code=code,
        name=data.name.strip(),
        tax_code=data.taxCode.strip() if data.taxCode else None,
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip() if data.email else None,
        address=data.address.strip() if data.address else None,
        sales_rep_id=data.salesRepId,
        territory_id=data.regionId,
        customer_group=_coerce_customer_group(data.customerGroup or data.customerGroupId),
        is_active=True,
        is_locked=False,
    )
    db.add(customer)
    db.commit(); db.refresh(customer)
    return {
        "success": True,
        "code": 201,
        "message": "Thành công",
        "data": {
            "id": customer.id,
            "code": customer.code,
            "name": customer.name,
            "taxCode": customer.tax_code,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "customerGroup": customer.customer_group,
            "regionId": customer.territory_id,
            "salesRepId": customer.sales_rep_id,
            "isActive": customer.is_active,
            "isLocked": customer.is_locked,
            "lockReason": customer.lock_reason,
            "createdAt": customer.created_at,
        },
    }
