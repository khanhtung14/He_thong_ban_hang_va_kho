from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import ReturnOrder, ReturnOrderItem
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/returns", tags=["Returns"])

class ReturnItem(BaseModel):
    product_id: int
    unit_id: int
    lot_number: str
    quantity: float

class ReturnCreate(BaseModel):
    invoice_id: int
    warehouse_id: int
    return_date: str
    reason: str
    items: List[ReturnItem]

@router.post("")
def create_return(
    data: ReturnCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("inventory:view")),
):
    ret = ReturnOrder(
        invoice_id=data.invoice_id,
        warehouse_id=data.warehouse_id,
        reason=data.reason,
        status="PENDING"
    )
    db.add(ret)
    db.commit()
    db.refresh(ret)
    return {"success": True, "code": 201, "message": "Return order created", "data": {"id": ret.id}}
