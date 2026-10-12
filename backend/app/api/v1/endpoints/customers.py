from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Customer, RoleCode, User
from app.api.v1.endpoints.rbac import AuthenticatedUser, get_optional_current_user, normalize_role

router = APIRouter(prefix="/api/v1/customers", tags=["Customers"])

class CustomerCreate(BaseModel):
    code: str
    name: str
    region: Optional[str] = None
    sales_rep_id: Optional[int] = None

@router.get("")
def list_customers(
    sales_rep_id: Optional[int] = Query(None),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
):
    query = select(Customer)
    if region:
        query = query.where(Customer.region == region.strip())
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
    return {
        "success": True,
        "code": 200,
        "data": [
            {
                "id": item.id,
                "code": item.code,
                "name": item.name,
                "sales_rep_id": item.sales_rep_id,
                "region": item.region,
                "customer_group": item.customer_group,
                "is_active": item.is_active,
                "is_locked": item.is_locked,
            }
            for item in items
        ],
    }

@router.post("")
def create_customers(
    data: CustomerCreate,
    db: Session = Depends(get_db),
):
    customer = Customer(
        code=data.code,
        name=data.name,
        region=data.region,
        sales_rep_id=data.sales_rep_id,
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return {"success": True, "code": 201, "message": "Created", "data": {"id": customer.id, "code": customer.code}}
