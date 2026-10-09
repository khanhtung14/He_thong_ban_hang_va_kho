import os

INVOICES_CONTENT = """from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import Invoice, Dispatch
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])

class InvoiceCreate(BaseModel):
    dispatch_id: int
    invoice_date: str
    payment_term_days: int

@router.get("")
def list_invoices(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("invoice:manage")),
):
    query = select(Invoice)
    if customer_id:
        query = query.where(Invoice.customer_id == customer_id)
    if status:
        query = query.where(Invoice.status == status)
    items = db.execute(query).scalars().all()
    # Simple dict conversion for now
    data = []
    for it in items:
        data.append({
            "id": it.id,
            "dispatch_id": it.dispatch_id,
            "customer_id": it.customer_id,
            "invoice_date": it.invoice_date.isoformat() if it.invoice_date else None,
            "payment_term_days": it.payment_term_days,
            "total_amount": it.total_amount,
            "status": it.status
        })
    return {"success": True, "code": 200, "data": data}

@router.post("/from-dispatch")
def create_invoice_from_dispatch(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("invoice:manage")),
):
    dispatch = db.get(Dispatch, data.dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
        
    invoice = Invoice(
        dispatch_id=data.dispatch_id,
        customer_id=1, # Just mock customer_id for now or get from order
        payment_term_days=data.payment_term_days,
        total_amount=0,
        status="UNPAID"
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return {"success": True, "code": 201, "message": "Created", "data": {"id": invoice.id}}
"""

PAYMENTS_CONTENT = """from datetime import date
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
"""

RETURNS_CONTENT = """from datetime import date
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
"""

def write_file(filename, content):
    with open(f"backend/app/api/v1/endpoints/{filename}", "w", encoding="utf-8") as f:
        f.write(content)

write_file("invoices.py", INVOICES_CONTENT)
write_file("payments.py", PAYMENTS_CONTENT)
write_file("returns.py", RETURNS_CONTENT)
