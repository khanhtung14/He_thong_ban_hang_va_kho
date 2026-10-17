from datetime import date, datetime, time, timedelta
from html import escape
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import (
    Customer,
    Dispatch,
    DispatchItem,
    Invoice,
    InvoicePayment,
    Order,
    OrderItem,
    Product,
    RoleCode,
    User,
)
from app.api.v1.endpoints.rbac import AuthenticatedUser, get_current_user, normalize_role, require_permissions

router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])
customer_debt_router = APIRouter(prefix="/api/v1", tags=["Customer debts"])

class InvoiceCreate(BaseModel):
    dispatch_id: int = Field(alias="dispatchId", gt=0)
    invoice_date: date = Field(alias="invoiceDate")
    payment_term_days: int = Field(alias="paymentTermDays", ge=0)

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class InvoiceView(BaseModel):
    id: int
    dispatch_id: Optional[int] = None
    customer_id: int
    invoice_date: Optional[datetime] = None
    due_date: Optional[date] = None
    payment_term_days: int
    total_amount: float
    amount_paid: float
    amount_due: float
    status: str


class InvoiceListResponse(BaseModel):
    success: bool
    code: int
    data: List[InvoiceView]


class CustomerDebtResponse(BaseModel):
    customer_id: int
    customer_name: str
    current_debt: float
    credit_limit: float
    remaining_credit_limit: float
    invoices: List[InvoiceView]


def _dispatch_invoice_total(
    db: Session,
    dispatch: Dispatch,
    order: Order,
) -> tuple[float, list[dict[str, Any]]]:
    dispatch_items = (
        db.query(DispatchItem)
        .filter(DispatchItem.dispatch_id == dispatch.id)
        .all()
    )
    order_items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == order.id)
        .all()
    )
    if not dispatch_items:
        raise HTTPException(
            status_code=422,
            detail="Không thể phát hành hóa đơn vì phiếu xuất không có số lượng giao thực tế.",
        )
    if not any(float(item.actual_qty or 0.0) > 0 for item in dispatch_items):
        raise HTTPException(
            status_code=422,
            detail="Không thể phát hành hóa đơn khi chưa giao sản phẩm nào.",
        )

    order_lines_by_product: dict[int, list[OrderItem]] = {}
    for item in order_items:
        if item.product_id is not None:
            order_lines_by_product.setdefault(item.product_id, []).append(item)

    dispatched_by_product: dict[int, float] = {}
    for item in dispatch_items:
        quantity = float(item.actual_qty or 0.0)
        if quantity < 0:
            raise HTTPException(status_code=422, detail="Số lượng giao thực tế không hợp lệ.")
        dispatched_by_product[item.product_id] = (
            dispatched_by_product.get(item.product_id, 0.0) + quantity
        )

    lines: list[dict[str, Any]] = []
    grand_total = 0.0
    for product_id, dispatched_quantity in dispatched_by_product.items():
        matching_order_lines = order_lines_by_product.get(product_id, [])
        ordered_base_quantity = sum(
            float(item.quantity or 0) * max(float(item.conversion_factor or 1), 0)
            for item in matching_order_lines
        )
        if not matching_order_lines or ordered_base_quantity <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"Không tìm thấy dòng đơn hàng hợp lệ cho sản phẩm #{product_id}.",
            )
        if dispatched_quantity > ordered_base_quantity + 1e-6:
            raise HTTPException(
                status_code=422,
                detail=f"Số lượng giao sản phẩm #{product_id} vượt quá số lượng đặt.",
            )

        ordered_net_amount = 0.0
        for item in matching_order_lines:
            if item.line_total:
                line_amount = float(item.line_total)
            elif item.line_subtotal:
                line_amount = float(item.line_subtotal) - float(item.discount_amount or 0)
            else:
                line_amount = (
                    float(item.quantity or 0)
                    * float(item.unit_price or 0)
                    * (1 - float(item.discount_percent or 0) / 100)
                )
            ordered_net_amount += max(line_amount, 0)
        line_amount = round(
            dispatched_quantity * ordered_net_amount / ordered_base_quantity,
            2,
        )
        product = db.get(Product, product_id)
        lines.append(
            {
                "product_id": product_id,
                "sku": product.sku if product else f"#{product_id}",
                "product_name": product.name if product else f"Sản phẩm #{product_id}",
                "quantity": dispatched_quantity,
                "amount": line_amount,
            }
        )
        grand_total += line_amount

    return round(grand_total, 2), lines


def _resolve_user_record(db: Session, user: AuthenticatedUser) -> Optional[User]:
    if user.id is not None:
        account = db.get(User, user.id)
        if account is not None:
            return account
    return (
        db.query(User)
        .filter(func.lower(User.username) == user.username.strip().lower())
        .first()
    )


def _customer_for_portal_user(db: Session, user: AuthenticatedUser) -> Customer:
    account = _resolve_user_record(db, user)
    email = account.email if account else user.username
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đại lý chưa được liên kết với email hồ sơ đại lý.",
        )

    matches = (
        db.query(Customer)
        .filter(func.lower(Customer.email) == email.strip().lower())
        .limit(2)
        .all()
    )
    if len(matches) != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không tìm thấy hồ sơ đại lý duy nhất được liên kết với tài khoản này.",
        )
    return matches[0]


def _invoice_amounts(
    db: Session,
    invoices: List[Invoice],
) -> dict[int, tuple[float, float, str]]:
    if not invoices:
        return {}

    paid_rows = db.execute(
        select(
            InvoicePayment.invoice_id,
            func.coalesce(func.sum(InvoicePayment.amount_applied), 0.0),
        )
        .where(InvoicePayment.invoice_id.in_([invoice.id for invoice in invoices]))
        .group_by(InvoicePayment.invoice_id)
    ).all()
    paid_by_invoice = {invoice_id: float(amount or 0.0) for invoice_id, amount in paid_rows}

    amounts = {}
    for invoice in invoices:
        total = max(float(invoice.total_amount or 0.0), 0.0)
        if (invoice.status or "").upper() == "PAID":
            paid = total
        else:
            paid = min(max(paid_by_invoice.get(invoice.id, 0.0), 0.0), total)
        due = max(total - paid, 0.0)
        invoice_status = "PAID" if due == 0 else ("PARTIAL" if paid > 0 else "UNPAID")
        amounts[invoice.id] = (paid, due, invoice_status)
    return amounts


def _serialize_invoices(db: Session, invoices: List[Invoice]) -> List[dict[str, Any]]:
    amounts = _invoice_amounts(db, invoices)
    result = []
    for invoice in invoices:
        paid, due, invoice_status = amounts[invoice.id]
        due_date = (
            invoice.invoice_date.date() + timedelta(days=invoice.payment_term_days or 0)
            if invoice.invoice_date
            else None
        )
        result.append(
            {
                "id": invoice.id,
                "dispatch_id": invoice.dispatch_id,
                "customer_id": invoice.customer_id,
                "invoice_date": invoice.invoice_date,
                "due_date": due_date,
                "payment_term_days": invoice.payment_term_days or 0,
                "total_amount": float(invoice.total_amount or 0.0),
                "amount_paid": paid,
                "amount_due": due,
                "status": invoice_status,
            }
        )
    return result


def _assert_customer_access(
    db: Session,
    customer_id: int,
    user: AuthenticatedUser,
) -> None:
    role = normalize_role(user.role)
    if role == RoleCode.CUSTOMER.value:
        customer = _customer_for_portal_user(db, user)
        if customer.id != customer_id:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem công nợ đại lý này.")
        return

    if role == RoleCode.SALES_REP.value:
        account = _resolve_user_record(db, user)
        sales_rep_id = account.id if account else user.id
        customer = db.get(Customer, customer_id)
        if customer is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")
        if sales_rep_id is None or sales_rep_id not in {
            customer.sales_rep_id,
            customer.assigned_sales_id,
        }:
            raise HTTPException(status_code=403, detail="Bạn không phụ trách đại lý này.")
        return

    raise HTTPException(status_code=403, detail="Vai trò không được phép xem công nợ đại lý.")


def _invoice_for_user(db: Session, invoice_id: int, user: AuthenticatedUser) -> Invoice:
    role = normalize_role(user.role)
    if role not in {
        RoleCode.CUSTOMER.value,
        RoleCode.SALES_REP.value,
        RoleCode.ACCOUNTANT.value,
        RoleCode.ADMIN.value,
    }:
        raise HTTPException(status_code=403, detail="Vai trò không được phép xem hóa đơn.")

    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn.")

    if role == RoleCode.CUSTOMER.value:
        customer = _customer_for_portal_user(db, user)
        if invoice.customer_id != customer.id:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem hóa đơn này.")
    elif role == RoleCode.SALES_REP.value:
        _assert_customer_access(db, invoice.customer_id, user)
    return invoice


@router.get("")
def list_invoices(
    customerId: Optional[int] = Query(default=None),
    customer_id: Optional[int] = Query(default=None, include_in_schema=False),
    status: Optional[str] = None,
    fromDate: Optional[date] = Query(default=None),
    toDate: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> InvoiceListResponse:
    role = normalize_role(user.role)
    allowed_roles = {
        RoleCode.ACCOUNTANT.value,
        RoleCode.ADMIN.value,
        RoleCode.SALES_REP.value,
        RoleCode.CUSTOMER.value,
    }
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Vai trò không được phép xem hóa đơn.")

    requested_customer_id = customerId if customerId is not None else customer_id
    if customerId is not None and customer_id is not None and customerId != customer_id:
        raise HTTPException(status_code=422, detail="customerId không khớp customer_id.")

    query = select(Invoice)
    if role == RoleCode.CUSTOMER.value:
        customer = _customer_for_portal_user(db, user)
        if requested_customer_id is not None and requested_customer_id != customer.id:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem hóa đơn đại lý này.")
        query = query.where(Invoice.customer_id == customer.id)
    elif role == RoleCode.SALES_REP.value:
        account = _resolve_user_record(db, user)
        sales_rep_id = account.id if account else user.id
        if sales_rep_id is None:
            raise HTTPException(status_code=403, detail="Không xác định được nhân viên phụ trách.")
        query = query.join(Customer, Customer.id == Invoice.customer_id).where(
            (Customer.sales_rep_id == sales_rep_id)
            | (Customer.assigned_sales_id == sales_rep_id)
        )
        if requested_customer_id is not None:
            _assert_customer_access(db, requested_customer_id, user)
            query = query.where(Invoice.customer_id == requested_customer_id)
    elif requested_customer_id is not None:
        query = query.where(Invoice.customer_id == requested_customer_id)
    if fromDate:
        query = query.where(func.date(Invoice.invoice_date) >= fromDate.isoformat())
    if toDate:
        query = query.where(func.date(Invoice.invoice_date) <= toDate.isoformat())
    items = db.execute(query.order_by(Invoice.invoice_date.desc(), Invoice.id.desc())).scalars().all()
    serialized = _serialize_invoices(db, items)
    if status:
        serialized = [
            invoice
            for invoice in serialized
            if invoice["status"].lower() == status.strip().lower()
        ]
    return InvoiceListResponse(success=True, code=200, data=serialized)


@customer_debt_router.get("/customers/me/debts", response_model=CustomerDebtResponse)
def get_my_debts(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("debt:view_own")),
) -> CustomerDebtResponse:
    if normalize_role(user.role) != RoleCode.CUSTOMER.value:
        raise HTTPException(status_code=403, detail="Chỉ đại lý mới được xem bảng công nợ của chính mình.")
    customer = _customer_for_portal_user(db, user)
    invoices = (
        db.execute(
            select(Invoice)
            .where(Invoice.customer_id == customer.id)
            .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
        )
        .scalars()
        .all()
    )
    serialized = _serialize_invoices(db, invoices)
    open_invoices = [invoice for invoice in serialized if invoice["amount_due"] > 0]
    current_debt = sum(invoice["amount_due"] for invoice in open_invoices)
    credit_limit = max(float(customer.credit_limit or 0.0), 0.0)
    return CustomerDebtResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        current_debt=current_debt,
        credit_limit=credit_limit,
        remaining_credit_limit=max(credit_limit - current_debt, 0.0),
        invoices=open_invoices,
    )


@customer_debt_router.get(
    "/customers/{customer_id}/debts",
    response_model=CustomerDebtResponse,
)
def get_customer_debts(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> CustomerDebtResponse:
    if normalize_role(user.role) not in {
        RoleCode.CUSTOMER.value,
        RoleCode.SALES_REP.value,
    }:
        raise HTTPException(status_code=403, detail="Vai trò không được phép xem công nợ đại lý.")
    _assert_customer_access(db, customer_id, user)
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    invoices = (
        db.execute(
            select(Invoice)
            .where(Invoice.customer_id == customer_id)
            .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
        )
        .scalars()
        .all()
    )
    serialized = _serialize_invoices(db, invoices)
    open_invoices = [invoice for invoice in serialized if invoice["amount_due"] > 0]
    current_debt = sum(invoice["amount_due"] for invoice in open_invoices)
    credit_limit = max(float(customer.credit_limit or 0.0), 0.0)
    return CustomerDebtResponse(
        customer_id=customer.id,
        customer_name=customer.name,
        current_debt=current_debt,
        credit_limit=credit_limit,
        remaining_credit_limit=max(credit_limit - current_debt, 0.0),
        invoices=open_invoices,
    )


@router.get("/{invoice_id}/download", response_class=HTMLResponse)
def download_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
) -> HTMLResponse:
    invoice = _invoice_for_user(db, invoice_id, user)
    customer = db.get(Customer, invoice.customer_id)
    serialized = _serialize_invoices(db, [invoice])[0]
    invoice_date = serialized["invoice_date"]
    due_date = serialized["due_date"]
    lines: list[dict[str, Any]] = []
    if invoice.dispatch_id is not None:
        dispatch = db.get(Dispatch, invoice.dispatch_id)
        order = db.get(Order, dispatch.order_id) if dispatch else None
        if dispatch and order and order.customer_id == invoice.customer_id:
            _, lines = _dispatch_invoice_total(db, dispatch, order)
    fields = (
        ("Mã hóa đơn", f"HD-{invoice.id:06d}"),
        ("Đại lý", customer.name if customer else str(invoice.customer_id)),
        ("Ngày phát hành", invoice_date.strftime("%d/%m/%Y") if invoice_date else "—"),
        ("Hạn thanh toán", due_date.strftime("%d/%m/%Y") if due_date else "—"),
        ("Tổng tiền", f'{serialized["total_amount"]:,.0f} VND'),
        ("Đã thanh toán", f'{serialized["amount_paid"]:,.0f} VND'),
        ("Còn phải trả", f'{serialized["amount_due"]:,.0f} VND'),
        ("Trạng thái", serialized["status"]),
    )
    rows = "".join(
        f"<tr><th>{escape(label)}</th><td>{escape(str(value))}</td></tr>"
        for label, value in fields
    )
    line_rows = "".join(
        "<tr>"
        f"<td>{escape(str(line['sku']))} — {escape(str(line['product_name']))}</td>"
        f"<td>{line['quantity']:,.2f}</td>"
        f"<td>{line['amount']:,.0f} VND</td>"
        "</tr>"
        for line in lines
    )
    item_table = (
        "<h2>Chi tiết hàng hóa</h2>"
        "<table><thead><tr><th>Sản phẩm</th><th>Số lượng giao</th><th>Thành tiền</th></tr></thead>"
        f"<tbody>{line_rows}</tbody></table>"
        if lines
        else ""
    )
    content = f"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hóa đơn HD-{invoice.id:06d}</title>
  <style>
    body {{ color: #172033; font: 16px/1.5 Arial, sans-serif; margin: 32px auto; max-width: 760px; padding: 0 24px; }}
    h1 {{ color: #123b67; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border-bottom: 1px solid #dce3ed; padding: 12px; text-align: left; }}
    th {{ width: 35%; }}
    button {{ background: #1677ff; border: 0; border-radius: 6px; color: white; cursor: pointer; font: inherit; margin-top: 24px; padding: 10px 16px; }}
    @media print {{ button {{ display: none; }} body {{ margin: 0; }} }}
  </style>
</head>
<body>
  <h1>Hóa đơn bán hàng</h1>
  <table><tbody>{rows}</tbody></table>
  {item_table}
  <button type="button" onclick="window.print()">In / Lưu hóa đơn PDF</button>
</body>
</html>"""
    return HTMLResponse(
        content=content,
        headers={
            "Content-Disposition": f'inline; filename="invoice-{invoice.id:06d}.html"',
        },
    )

@router.post("/from-dispatch", status_code=status.HTTP_201_CREATED)
def create_invoice_from_dispatch(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("invoice:manage")),
):
    dispatch = db.get(Dispatch, data.dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất kho.")
    if db.query(Invoice.id).filter(Invoice.dispatch_id == dispatch.id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phiếu xuất kho này đã được phát hành hóa đơn.",
        )

    order = db.get(Order, dispatch.order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phiếu xuất kho không liên kết với đơn hàng hợp lệ.",
        )
    customer = db.get(Customer, order.customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Đơn hàng không liên kết với đại lý hợp lệ.",
        )
    total_amount, _ = _dispatch_invoice_total(db, dispatch, order)

    invoice = Invoice(
        dispatch_id=dispatch.id,
        customer_id=customer.id,
        invoice_date=datetime.combine(data.invoice_date, time.min),
        payment_term_days=data.payment_term_days,
        total_amount=total_amount,
        status="UNPAID"
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return {
        "success": True,
        "code": 201,
        "message": "Đã phát hành hóa đơn từ số lượng giao thực tế.",
        "data": {
            "id": invoice.id,
            "dispatch_id": invoice.dispatch_id,
            "customer_id": invoice.customer_id,
            "invoice_date": invoice.invoice_date,
            "payment_term_days": invoice.payment_term_days,
            "total_amount": invoice.total_amount,
            "status": invoice.status,
        },
    }
