from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import Payment, Invoice, InvoicePayment, CustomerDebt
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])

class PaymentCreate(BaseModel):
    customer_id: int
    amount: float
    payment_method: str
    payment_date: str
    invoice_ids: List[int]
    receipt_image: Optional[str] = None

@router.post("")
def create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    payment = Payment(
        customer_id=data.customer_id,
        amount=data.amount,
        payment_method=data.payment_method
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"success": True, "code": 201, "message": "Payment recorded", "data": {"id": payment.id}}
