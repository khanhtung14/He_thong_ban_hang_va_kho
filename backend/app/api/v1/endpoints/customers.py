from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Customer
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/customers", tags=["Customers"])

class CustomerCreate(BaseModel):
    pass # TODO: define schema

@router.get("")
def list_customers(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    items = db.query(Customer).all()
    return {"success": True, "code": 200, "data": [item.__dict__ for item in items]}

@router.post("")
def create_customers(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    return {"success": True, "code": 201, "message": "Created"}
