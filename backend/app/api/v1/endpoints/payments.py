from datetime import date, datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select

from app.core.database import get_db
from app.models.models import (
    Customer,
    Invoice,
    InvoicePayment,
    Payment,
    RoleCode,
    User,
)
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    normalize_role,
    require_permissions,
)

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])

class PaymentCreate(BaseModel):
    customer_id: int = Field(alias="customerId", gt=0)
    amount: float = Field(gt=0, allow_inf_nan=False)
    payment_method: str = Field(alias="paymentMethod", min_length=1, max_length=50)
    payment_date: date = Field(alias="paymentDate")
    invoice_ids: List[int] = Field(alias="invoiceIds", min_length=1)
    receipt_image: Optional[str] = Field(default=None, alias="receiptImage")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    @field_validator("payment_method")
    @classmethod
    def clean_payment_method(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Phương thức thanh toán không được để trống.")
        return value

@router.post("", status_code=status.HTTP_201_CREATED)
def create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    if len(set(data.invoice_ids)) != len(data.invoice_ids):
        raise HTTPException(status_code=422, detail="Danh sách hóa đơn bị trùng.")

    customer = db.get(Customer, data.customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    if normalize_role(user.role) == RoleCode.SALES_REP.value:
        account_id = user.id
        if account_id is None:
            account_id = (
                db.query(User.id)
                .filter(func.lower(User.username) == user.username.strip().lower())
                .scalar()
            )
        if account_id not in {customer.sales_rep_id, customer.assigned_sales_id}:
            raise HTTPException(status_code=403, detail="Bạn không phụ trách đại lý này.")

    invoices = (
        db.execute(
            select(Invoice).where(
                Invoice.customer_id == customer.id,
                Invoice.id.in_(data.invoice_ids),
            )
        )
        .scalars()
        .all()
    )
    invoices_by_id = {invoice.id: invoice for invoice in invoices}
    if len(invoices_by_id) != len(data.invoice_ids):
        raise HTTPException(
            status_code=404,
            detail="Một hoặc nhiều hóa đơn không tồn tại hoặc không thuộc đại lý này.",
        )

    paid_rows = db.execute(
        select(
            InvoicePayment.invoice_id,
            func.coalesce(func.sum(InvoicePayment.amount_applied), 0.0),
        )
        .where(InvoicePayment.invoice_id.in_(data.invoice_ids))
        .group_by(InvoicePayment.invoice_id)
    ).all()
    paid_by_invoice = {
        invoice_id: float(amount or 0.0) for invoice_id, amount in paid_rows
    }
    outstanding_by_id = {}
    for invoice_id in data.invoice_ids:
        invoice = invoices_by_id[invoice_id]
        total = max(float(invoice.total_amount or 0.0), 0.0)
        paid = (
            total
            if (invoice.status or "").upper() == "PAID"
            else min(max(paid_by_invoice.get(invoice_id, 0.0), 0.0), total)
        )
        outstanding_by_id[invoice_id] = max(total - paid, 0.0)

    total_outstanding = sum(outstanding_by_id.values())
    if data.amount > total_outstanding:
        raise HTTPException(
            status_code=422,
            detail="Số tiền thu vượt quá tổng dư nợ của các hóa đơn đã chọn.",
        )

    payment = Payment(
        customer_id=customer.id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_date=datetime.combine(data.payment_date, time.min),
    )
    db.add(payment)
    db.flush()

    remaining_amount = data.amount
    for invoice_id in data.invoice_ids:
        outstanding = outstanding_by_id[invoice_id]
        applied_amount = min(remaining_amount, outstanding)
        if applied_amount <= 0:
            continue
        db.add(
            InvoicePayment(
                invoice_id=invoice_id,
                payment_id=payment.id,
                amount_applied=applied_amount,
            )
        )
        invoice = invoices_by_id[invoice_id]
        paid_after = (
            float(invoice.total_amount or 0.0)
            - outstanding
            + applied_amount
        )
        invoice.status = (
            "PAID"
            if paid_after >= float(invoice.total_amount or 0.0)
            else "PARTIAL"
        )
        remaining_amount -= applied_amount

    db.commit()
    db.refresh(payment)
    return {
        "success": True,
        "code": 201,
        "message": "Đã ghi nhận khoản thu và đối trừ vào hóa đơn.",
        "data": {"id": payment.id},
    }
