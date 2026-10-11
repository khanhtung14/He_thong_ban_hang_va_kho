from datetime import date
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
