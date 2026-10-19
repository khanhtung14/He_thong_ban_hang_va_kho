from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import Payment, Invoice, InvoicePayment, CustomerDebt, Customer
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions
from app.api.v1.endpoints.debt_limit import evaluate_customer_debt_status

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])

class PaymentCreate(BaseModel):
    customer_id: int
    amount: float
    payment_method: str
    payment_date: str
    invoice_ids: List[int] = []
    receipt_image: Optional[str] = None


@router.post("", status_code=status.HTTP_201_CREATED)
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

    # SCRUM-42: Giảm công nợ hiện tại và chạy lại tác vụ đánh giá công nợ sau mỗi lần ghi nhận thu tiền
    customer = db.get(Customer, data.customer_id)
    if customer:
        customer.current_debt = max(0.0, float(customer.current_debt or 0.0) - float(data.amount))
        db.flush()
        evaluate_customer_debt_status(db, customer.id)

    db.commit()
    db.refresh(payment)
    return {"success": True, "code": 201, "message": "Payment recorded", "data": {"id": payment.id}}
