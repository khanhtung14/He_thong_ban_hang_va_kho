"""Debt reminders and receipt download endpoints for SCRUM-54/55."""

from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions, require_roles
from app.core.database import get_db
from app.models.models import Customer, DebtReminderLog, Invoice, Payment
from app.services.email_service import email_service


legacy_router = APIRouter()
router = APIRouter(prefix="/api/v1", tags=["Debt Management"])


class SendReminderRequest(BaseModel):
    customer_id: int = Field(validation_alias=AliasChoices("customerId", "customer_id"))
    invoice_id: int = Field(validation_alias=AliasChoices("invoiceId", "invoice_id"))


def _due_date(invoice: Invoice) -> date:
    invoice_date = invoice.invoice_date.date() if invoice.invoice_date else date.today()
    return invoice_date + timedelta(days=max(0, invoice.payment_term_days or 0))


def _reminder_message(invoice: Invoice, customer: Customer) -> str:
    due_date = _due_date(invoice)
    days_left = (due_date - date.today()).days
    state = "QUÁ HẠN" if days_left < 0 else f"CÒN {days_left} NGÀY"
    return f"Hóa đơn #{invoice.id} của đại lý {customer.name} đến hạn {due_date.isoformat()} ({state})."


def process_due_reminder(
    db: Session,
    customer_id: Optional[int] = None,
    invoice_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    query = db.query(Invoice).filter(Invoice.status != "PAID")
    if customer_id is not None:
        query = query.filter(Invoice.customer_id == customer_id)
    if invoice_id is not None:
        query = query.filter(Invoice.id == invoice_id)

    today = date.today()
    results: list[dict[str, Any]] = []
    for invoice in query.all():
        due_date = _due_date(invoice)
        if (due_date - today).days > 3:
            continue
        customer = db.get(Customer, invoice.customer_id)
        if not customer:
            continue
        if db.query(DebtReminderLog).filter_by(invoice_id=invoice.id, reminder_date=today).first():
            continue

        message = _reminder_message(invoice, customer)
        email_sent = email_service.send_notification_email(
            customer.email,
            "[OMS] Nhắc hạn thanh toán công nợ",
            message,
        ) if customer.email else False
        log = DebtReminderLog(
            invoice_id=invoice.id,
            customer_id=customer.id,
            reminder_date=today,
            message=message,
            email_sent=email_sent,
            in_app_sent=True,
        )
        db.add(log)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            continue
        results.append({
            "invoiceId": invoice.id,
            "customerId": customer.id,
            "message": message,
            "emailSent": email_sent,
            "inAppSent": True,
        })
    db.commit()
    return results


@router.post("/debts/send-reminder")
def send_reminder(
    data: SendReminderRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    invoice = db.get(Invoice, data.invoice_id)
    if not invoice or invoice.customer_id != data.customer_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn thuộc đại lý.")
    notifications = process_due_reminder(db, data.customer_id, data.invoice_id)
    return {
        "success": True,
        "code": 200,
        "message": "Đã gửi nhắc thanh toán." if notifications else "Hóa đơn đã được nhắc trong ngày hoặc chưa đến hạn.",
        "data": {"notifications": notifications},
    }


@router.get("/payments/{payment_id}/receipt-pdf")
def receipt_pdf(
    payment_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permissions("payment:record")),
):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Không tìm thấy khoản thu.")
    customer = db.get(Customer, payment.customer_id)
    customer_name = customer.name if customer else f"Đại lý #{payment.customer_id}"
    receiver = payment.receiver_name or "Kế toán công nợ"
    lines = [
        "PHIẾU THU CÔNG NỢ",
        f"Mã phiếu thu: PT-{payment.id:06d}",
        f"Đại lý: {customer_name}",
        f"Số tiền: {payment.amount:,.0f} VND",
        f"Hình thức: {payment.payment_method}",
        f"Người thu: {receiver}",
        f"Ngày thu: {payment.payment_date:%Y-%m-%d}",
    ]
    # Minimal standards-compliant PDF with a text stream; no extra package is required.
    content = "BT /F1 14 Tf 72 760 Td " + " Tm 0 -24 Td ".join(
        f"({line.replace('(', '[').replace(')', ']')}) Tj" for line in lines
    ) + " ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content.encode('latin-1', errors='replace'))} >>\nstream\n{content}\nendstream".encode("latin-1", errors="replace"),
    ]
    pdf = BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{index} 0 obj\n".encode())
        pdf.write(obj)
        pdf.write(b"\nendobj\n")
    xref = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.write(f"{offset:010d} 00000 n \n".encode())
    pdf.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return Response(
        content=pdf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=PhieuThu_{payment.id:06d}.pdf"},
    )


# Existing demo routes are retained for compatibility with older clients.
@legacy_router.get("/receipts/{receipt_id}/pdf")
def legacy_receipt(receipt_id: str):
    return Response(f"Legacy receipt {receipt_id}".encode(), media_type="text/plain")


@legacy_router.post("/reminders/run-daily-job")
def legacy_daily_job(db: Session = Depends(get_db)):
    return {"status": "success", "notifications": process_due_reminder(db)}


async def daily_reminder_scheduler(stop_event):
    """Run the reminder task once per day while the API process is alive."""
    import asyncio
    from app.core.database import SessionLocal

    while not stop_event.is_set():
        with SessionLocal() as db:
            process_due_reminder(db)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=86400)
        except asyncio.TimeoutError:
            continue


@legacy_router.post("/adjustments/credit-note")
def legacy_credit_note():
    raise HTTPException(status_code=410, detail="Dùng POST /api/v1/returns/{id}/credit-note.")
