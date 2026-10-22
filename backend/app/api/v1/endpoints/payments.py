from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import Payment, Invoice, InvoicePayment, CustomerDebt, Customer
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])

class PaymentCreate(BaseModel):
    customer_id: int = Field(validation_alias=AliasChoices("customerId", "customer_id"))
    amount: float
    payment_method: str = Field(validation_alias=AliasChoices("paymentMethod", "payment_method"))
    payment_date: str = Field(validation_alias=AliasChoices("paymentDate", "payment_date"))
    invoice_ids: List[int] = Field(validation_alias=AliasChoices("invoiceIds", "invoice_ids"))
    receipt_image: Optional[str] = Field(None, validation_alias=AliasChoices("receiptImage", "receipt_image"))

@router.post("")
def create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    payment = Payment(
        customer_id=data.customer_id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_date=date.fromisoformat(data.payment_date),
        receiver_name=user.username,
    )
    db.add(payment)
    db.flush()
    remaining = data.amount
    for invoice_id in data.invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if not invoice or invoice.customer_id != data.customer_id:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy hóa đơn #{invoice_id}.")
        already_paid = sum(
            float(row.amount_applied or 0)
            for row in db.query(InvoicePayment).filter(InvoicePayment.invoice_id == invoice.id).all()
        )
        invoice_remaining = max(0.0, float(invoice.total_amount or 0) - already_paid)
        applied = min(remaining, invoice_remaining)
        if applied <= 0:
            continue
        db.add(InvoicePayment(invoice_id=invoice.id, payment_id=payment.id, amount_applied=applied))
        remaining -= applied
        invoice.status = "PAID" if applied >= invoice_remaining else "PARTIAL"
        if remaining <= 0:
            break
    debt = db.query(CustomerDebt).filter(CustomerDebt.customer_id == data.customer_id).first()
    if debt:
        debt.total_debt = max(0.0, debt.total_debt - data.amount)
    else:
        debt = CustomerDebt(customer_id=data.customer_id, total_debt=0.0)
        db.add(debt)
    customer = db.get(Customer, data.customer_id)
    if customer:
        customer.current_debt = max(0.0, customer.current_debt - data.amount)
    db.commit()
    db.refresh(payment)

    # SCRUM-42: Đánh giá lại rủi ro tín dụng sau mỗi lần ghi nhận thu tiền thành công
    credit_eval_data = None
    if customer:
        try:
            from app.services.credit_risk_service import CreditRiskService
            eval_result = CreditRiskService.apply_evaluation(db, customer, commit=True)
            credit_eval_data = eval_result.to_dict()
        except Exception:
            pass

    response_data: dict[str, Any] = {
        "id": payment.id,
        "receiptNumber": f"PT-{payment.id:06d}",
    }
    if credit_eval_data:
        response_data["creditEvaluation"] = credit_eval_data
        response_data["isCreditFlagged"] = credit_eval_data.get("isFlagged", False)
        response_data["creditFlagReason"] = credit_eval_data.get("breachSummary")
        response_data["isLocked"] = credit_eval_data.get("isLocked", False)

    return {
        "success": True,
        "code": 201,
        "message": "Payment recorded",
        "data": response_data,
    }
