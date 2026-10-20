"""Payment collection, accountant confirmation, and cash reconciliation endpoints (SCRUM-45)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_current_user,
    normalize_role,
    require_permissions,
    PERM_PAYMENT_RECORD,
    PERM_DEBT_RECONCILE,
)
from app.core.database import get_db
from app.models.models import Customer, CustomerDebt, Invoice, InvoicePayment, Payment, User

router = APIRouter(prefix="/api/v1/payments", tags=["Payments"])
compat_router = APIRouter(prefix="/payments", tags=["Payments Compat"])


class PaymentCreate(BaseModel):
    customerId: Optional[int] = Field(None, alias="customerId")
    customer_id: Optional[int] = Field(None, alias="customer_id")
    salesId: Optional[int] = Field(None, alias="salesId")
    sales_id: Optional[int] = Field(None, alias="sales_id")
    amount: float = Field(..., gt=0, description="Số tiền thu")
    paymentMethod: Optional[str] = Field(None, alias="paymentMethod")
    payment_method: Optional[str] = Field(None, alias="payment_method")
    paymentDate: Optional[str] = Field(None, alias="paymentDate")
    payment_date: Optional[str] = Field(None, alias="payment_date")
    invoiceIds: Optional[List[int]] = Field(default=None, alias="invoiceIds")
    invoice_ids: Optional[List[int]] = Field(default=None, alias="invoice_ids")
    receiptImage: Optional[str] = Field(None, alias="receiptImage")
    receipt_image: Optional[str] = Field(None, alias="receipt_image")
    note: Optional[str] = None

    def get_customer_id(self) -> int:
        val = self.customerId if self.customerId is not None else self.customer_id
        if not val or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã khách hàng / đại lý (customerId) là bắt buộc.",
            )
        return val

    def get_sales_id(self, fallback: Optional[int] = None) -> Optional[int]:
        val = self.salesId if self.salesId is not None else self.sales_id
        return val or fallback

    def get_payment_method(self) -> str:
        return self.paymentMethod or self.payment_method or "CASH"

    def get_payment_date(self) -> datetime:
        raw = self.paymentDate or self.payment_date
        if raw:
            try:
                if "T" in raw:
                    return datetime.fromisoformat(raw.replace("Z", "+00:00"))
                d = datetime.strptime(raw.strip(), "%Y-%m-%d")
                return d
            except Exception:
                pass
        return datetime.now()

    def get_invoice_ids(self) -> List[int]:
        return self.invoiceIds or self.invoice_ids or []

    def get_receipt_image(self) -> Optional[str]:
        return self.receiptImage or self.receipt_image


class PaymentConfirmRequest(BaseModel):
    confirmationNote: Optional[str] = Field(None, alias="confirmationNote")
    confirmation_note: Optional[str] = Field(None, alias="confirmation_note")
    note: Optional[str] = None

    def get_note(self) -> Optional[str]:
        return self.confirmationNote or self.confirmation_note or self.note


class PaymentRejectRequest(BaseModel):
    reason: Optional[str] = None
    note: Optional[str] = None


def _format_payment(p: Payment) -> Dict[str, Any]:
    cust = p.customer
    sales = p.sales_rep
    confirmer = p.confirmed_by
    return {
        "id": p.id,
        "customerId": p.customer_id,
        "customerName": cust.name if cust else "",
        "salesId": p.sales_id,
        "salesName": sales.full_name or sales.username if sales else "",
        "amount": p.amount,
        "paymentMethod": p.payment_method,
        "paymentDate": p.payment_date.strftime("%Y-%m-%d") if p.payment_date else None,
        "receiptImage": p.receipt_image,
        "status": p.status,
        "note": p.note,
        "confirmedById": p.confirmed_by_id,
        "confirmedByName": (confirmer.full_name or confirmer.username) if confirmer else None,
        "confirmedAt": p.confirmed_at.isoformat() if p.confirmed_at else None,
        "confirmationNote": p.confirmation_note,
    }


# -------------------------------------------------------------
# Handlers
# -------------------------------------------------------------

def handle_create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Ghi nhận khoản thu tại cửa hàng/đại lý theo tuyến kèm ảnh biên lai (SCRUM-45)."""
    role = normalize_role(user.role)
    if role not in {"Sales Rep", "Sales", "Accountant", "Admin"} and not user.has_permission(PERM_PAYMENT_RECORD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền lập phiếu thu tiền.",
        )

    customer_id = data.get_customer_id()
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy khách hàng / đại lý #{customer_id}.",
        )

    # Xác định nhân viên thu tiền
    sales_id = data.get_sales_id(fallback=user.id)
    if sales_id:
        sales_user = db.query(User).filter(User.id == sales_id).first()
        if not sales_user and data.sales_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhân viên thu tiền #{sales_id} không tồn tại trên hệ thống.",
            )

    payment = Payment(
        customer_id=customer.id,
        sales_id=sales_id,
        amount=data.amount,
        payment_method=data.get_payment_method(),
        payment_date=data.get_payment_date(),
        receipt_image=data.get_receipt_image(),
        status="PENDING_SUBMISSION",
        note=data.note,
    )
    db.add(payment)
    db.flush()

    # Liên kết hóa đơn nếu có
    for inv_id in data.get_invoice_ids():
        inv = db.query(Invoice).filter(Invoice.id == inv_id).first()
        if inv:
            ip = InvoicePayment(
                invoice_id=inv.id,
                payment_id=payment.id,
                amount_applied=data.amount,
            )
            db.add(ip)

    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "code": 201,
        "message": "Ghi nhận phiếu thu thành công, đang chờ nộp về công ty",
        "data": _format_payment(payment),
    }


def handle_confirm_payment(
    id: int,
    data: Optional[PaymentConfirmRequest] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Kế toán xác nhận nhận tiền nộp về công ty và đối trừ công nợ (SCRUM-45).
    
    Ràng buộc phân quyền:
    - Chỉ Kế toán (Role Accountant / Admin) mới có quyền duyệt xác nhận nộp tiền.
    - Nhân viên kinh doanh (Sales Rep) bị CHẶN 403 Forbidden.
    """
    role = normalize_role(user.role)
    if role not in {"Accountant", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán hoặc Quản trị viên mới có quyền xác nhận nộp tiền về công ty.",
        )

    payment = db.query(Payment).filter(Payment.id == id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu thu #{id}.",
        )

    if payment.status == "CONFIRMED":
        return {
            "success": True,
            "code": 200,
            "message": "Phiếu thu này đã được kế toán xác nhận trước đó",
            "data": _format_payment(payment),
        }

    confirmation_note = data.get_note() if data else None
    payment.status = "CONFIRMED"
    payment.confirmed_by_id = user.id
    payment.confirmed_at = datetime.now()
    if confirmation_note:
        payment.confirmation_note = confirmation_note

    # Đối trừ công nợ đại lý
    customer = db.query(Customer).filter(Customer.id == payment.customer_id).first()
    if customer:
        customer.current_debt = max(0.0, float(customer.current_debt or 0.0) - float(payment.amount))

    debt_rec = db.query(CustomerDebt).filter(CustomerDebt.customer_id == payment.customer_id).first()
    if debt_rec:
        debt_rec.total_debt = max(0.0, float(debt_rec.total_debt or 0.0) - float(payment.amount))

    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "code": 200,
        "message": "Kế toán đã xác nhận nhận tiền thành công",
        "data": _format_payment(payment),
    }


def handle_reject_payment(
    id: int,
    data: Optional[PaymentRejectRequest] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Kế toán từ chối phiếu nộp tiền nếu có sai sót."""
    role = normalize_role(user.role)
    if role not in {"Accountant", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán hoặc Quản trị viên mới có quyền từ chối phiếu thu.",
        )

    payment = db.query(Payment).filter(Payment.id == id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu thu #{id}.",
        )

    payment.status = "REJECTED"
    if data and (data.reason or data.note):
        payment.confirmation_note = data.reason or data.note
    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "code": 200,
        "message": "Đã từ chối phiếu nộp tiền",
        "data": _format_payment(payment),
    }


def handle_get_reconciliation(
    sales_id: Optional[int] = Query(None, alias="salesId"),
    sales_id_alt: Optional[int] = Query(None, alias="sales_id"),
    staff_id: Optional[int] = Query(None, alias="staffId"),
    staff_id_alt: Optional[int] = Query(None, alias="staff_id"),
    target_date: Optional[str] = Query(None, alias="date"),
    from_date: Optional[str] = Query(None, alias="fromDate"),
    from_date_alt: Optional[str] = Query(None, alias="from_date"),
    to_date: Optional[str] = Query(None, alias="toDate"),
    to_date_alt: Optional[str] = Query(None, alias="to_date"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Bảng đối chiếu tiền thu theo từng nhân viên và từng ngày (SCRUM-45).
    
    Tổng hợp:
    - totalCollected: Tổng tiền đã thu từ khách hàng.
    - totalConfirmed / totalSubmitted: Tổng tiền đã nộp về công ty (được Kế toán xác nhận).
    - totalPending / difference: Số tiền chênh lệch / còn chờ nộp về công ty.
    """
    role = normalize_role(user.role)
    query_sales_id = sales_id or sales_id_alt or staff_id or staff_id_alt

    # Kiểm tra phân quyền: NVKD chỉ được xem bảng đối chiếu của chính mình
    if role in {"Sales Rep", "Sales"}:
        if query_sales_id and query_sales_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nhân viên kinh doanh chỉ được xem bảng đối chiếu tiền thu của chính mình.",
            )
        query_sales_id = user.id
    elif role not in {"Accountant", "Sales Manager", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem bảng đối chiếu tiền thu.",
        )

    query = db.query(Payment)
    if query_sales_id:
        query = query.filter(Payment.sales_id == query_sales_id)

    # Lọc theo ngày
    f_date_str = from_date or from_date_alt
    t_date_str = to_date or to_date_alt

    if target_date:
        d_clean = target_date.strip()
        query = query.filter(func.date(Payment.payment_date) == d_clean)
        f_date_str = d_clean
        t_date_str = d_clean
    else:
        if f_date_str:
            query = query.filter(func.date(Payment.payment_date) >= f_date_str.strip())
        if t_date_str:
            query = query.filter(func.date(Payment.payment_date) <= t_date_str.strip())

    payments = query.order_by(Payment.payment_date.desc(), Payment.id.desc()).all()

    # Tính toán tổng hợp số liệu
    valid_payments = [p for p in payments if p.status != "REJECTED"]
    total_collected = round(sum(p.amount for p in valid_payments), 2)

    confirmed_payments = [p for p in valid_payments if p.status in ("CONFIRMED", "SUBMITTED")]
    total_confirmed = round(sum(p.amount for p in confirmed_payments), 2)

    total_pending = round(total_collected - total_confirmed, 2)

    sales_user = db.query(User).filter(User.id == query_sales_id).first() if query_sales_id else None
    sales_name = (sales_user.full_name or sales_user.username) if sales_user else None

    return {
        "success": True,
        "code": 200,
        "message": "Lấy bảng đối chiếu tiền thu thành công",
        "data": {
            "salesId": query_sales_id,
            "salesName": sales_name,
            "date": target_date,
            "fromDate": f_date_str,
            "toDate": t_date_str,
            "totalCollected": total_collected,
            "totalSubmitted": total_confirmed,
            "totalConfirmed": total_confirmed,
            "totalPending": total_pending,
            "difference": total_pending,
            "count": len(payments),
            "payments": [_format_payment(p) for p in payments],
        },
    }


def handle_list_payments(
    customer_id: Optional[int] = Query(None, alias="customerId"),
    sales_id: Optional[int] = Query(None, alias="salesId"),
    payment_status: Optional[str] = Query(None, alias="status"),
    from_date: Optional[str] = Query(None, alias="fromDate"),
    to_date: Optional[str] = Query(None, alias="toDate"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Danh sách các phiếu thu tiền (có phân trang & lọc)."""
    role = normalize_role(user.role)
    query = db.query(Payment)

    if role in {"Sales Rep", "Sales"}:
        query = query.filter(Payment.sales_id == user.id)
    elif sales_id:
        query = query.filter(Payment.sales_id == sales_id)

    if customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if payment_status:
        query = query.filter(Payment.status == payment_status)
    if from_date:
        query = query.filter(func.date(Payment.payment_date) >= from_date)
    if to_date:
        query = query.filter(func.date(Payment.payment_date) <= to_date)

    total_records = query.count()
    payments = (
        query.order_by(Payment.payment_date.desc(), Payment.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "code": 200,
        "data": [_format_payment(p) for p in payments],
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total_records,
            "totalPages": (total_records + limit - 1) // limit if total_records > 0 else 0,
        },
    }


def handle_get_payment_detail(
    id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    payment = db.query(Payment).filter(Payment.id == id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu thu #{id}.",
        )
    role = normalize_role(user.role)
    if role in {"Sales Rep", "Sales"} and payment.sales_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem phiếu thu của nhân viên khác.",
        )
    return {
        "success": True,
        "code": 200,
        "data": _format_payment(payment),
    }


# -------------------------------------------------------------
# Register Routes on router (/api/v1/payments) and compat_router (/payments)
# -------------------------------------------------------------

router.add_api_route("", handle_create_payment, methods=["POST"], status_code=201)
router.add_api_route("/", handle_create_payment, methods=["POST"], status_code=201, include_in_schema=False)
router.add_api_route("", handle_list_payments, methods=["GET"])
router.add_api_route("/", handle_list_payments, methods=["GET"], include_in_schema=False)
router.add_api_route("/reconciliation", handle_get_reconciliation, methods=["GET"])
router.add_api_route("/{id}", handle_get_payment_detail, methods=["GET"])
router.add_api_route("/{id}/confirm", handle_confirm_payment, methods=["POST"])
router.add_api_route("/{id}/confirm", handle_confirm_payment, methods=["PATCH"], include_in_schema=False)
router.add_api_route("/{id}/reject", handle_reject_payment, methods=["POST"])
router.add_api_route("/{id}/reject", handle_reject_payment, methods=["PATCH"], include_in_schema=False)

compat_router.add_api_route("", handle_create_payment, methods=["POST"], status_code=201, include_in_schema=False)
compat_router.add_api_route("/", handle_create_payment, methods=["POST"], status_code=201, include_in_schema=False)
compat_router.add_api_route("", handle_list_payments, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/", handle_list_payments, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/reconciliation", handle_get_reconciliation, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}", handle_get_payment_detail, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}/confirm", handle_confirm_payment, methods=["POST"], include_in_schema=False)
compat_router.add_api_route("/{id}/confirm", handle_confirm_payment, methods=["PATCH"], include_in_schema=False)
compat_router.add_api_route("/{id}/reject", handle_reject_payment, methods=["POST"], include_in_schema=False)
compat_router.add_api_route("/{id}/reject", handle_reject_payment, methods=["PATCH"], include_in_schema=False)
