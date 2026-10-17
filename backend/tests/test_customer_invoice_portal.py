from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

backend_path = Path(__file__).resolve().parents[1]
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
    Dispatch,
    DispatchItem,
    Invoice,
    InvoicePayment,
    Order,
    OrderItem,
    Payment,
    Product,
    User,
)
from main import app


@pytest.fixture
def invoice_portal_env():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with testing_session() as db:
        customer_user = User(
            username="dealer@example.test",
            email="dealer@example.test",
            full_name="Đại lý kiểm thử",
            password_hash="not-used",
        )
        sales_user = User(
            username="sales@example.test",
            email="sales@example.test",
            full_name="Nhân viên kinh doanh",
            password_hash="not-used",
        )
        db.add_all([customer_user, sales_user])
        db.flush()

        customer = Customer(
            code="DL-PORTAL",
            name="<Đại lý> kiểm thử",
            email=customer_user.email,
            credit_limit=20000,
            sales_rep_id=sales_user.id,
        )
        other_customer = Customer(
            code="DL-OTHER",
            name="Đại lý khác",
            email="other@example.test",
            credit_limit=100000,
        )
        db.add_all([customer, other_customer])
        db.flush()

        invoice = Invoice(
            customer_id=customer.id,
            invoice_date=datetime(2026, 10, 1),
            payment_term_days=30,
            total_amount=10000,
            status="UNPAID",
        )
        paid_invoice = Invoice(
            customer_id=customer.id,
            invoice_date=datetime(2026, 9, 1),
            payment_term_days=15,
            total_amount=5000,
            status="PAID",
        )
        other_invoice = Invoice(
            customer_id=other_customer.id,
            invoice_date=datetime(2026, 10, 2),
            payment_term_days=10,
            total_amount=9000,
            status="UNPAID",
        )
        product = Product(
            sku="SKU-PORTAL",
            name="Sản phẩm kiểm thử",
            base_unit="Thùng",
            base_price=200,
        )
        db.add(product)
        db.flush()
        order = Order(
            order_code="ORD-PORTAL-INVOICE",
            customer_id=customer.id,
            total_amount=2000,
        )
        db.add(order)
        db.flush()
        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            quantity=10,
            conversion_factor=1,
            unit_price=200,
            line_subtotal=2000,
            line_total=2000,
        )
        dispatch = Dispatch(order_id=order.id, status="DELIVERED")
        db.add_all([order_item, dispatch, invoice, paid_invoice, other_invoice])
        db.flush()
        dispatch_item = DispatchItem(
            dispatch_id=dispatch.id,
            product_id=product.id,
            actual_qty=4,
        )
        db.add(dispatch_item)
        db.flush()
        payment = Payment(
            customer_id=customer.id,
            amount=3000,
            payment_method="BANK_TRANSFER",
        )
        db.add(payment)
        db.flush()
        db.add(
            InvoicePayment(
                invoice_id=invoice.id,
                payment_id=payment.id,
                amount_applied=3000,
            )
        )
        db.commit()
        values = {
            "customer_id": customer.id,
            "customer_user_id": customer_user.id,
            "invoice_id": invoice.id,
            "other_invoice_id": other_invoice.id,
            "sales_user_id": sales_user.id,
            "dispatch_id": dispatch.id,
        }

    with TestClient(app) as client:
        yield client, values

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _headers(username: str, role: str, user_id: int) -> dict[str, str]:
    token = create_access_token(
        {"id": user_id, "sub": username, "username": username, "role": role}
    )
    return {"Authorization": f"Bearer {token}"}


def test_customer_invoice_list_and_debt_summary_are_scoped(invoice_portal_env):
    client, values = invoice_portal_env
    headers = _headers(
        "dealer@example.test", "Customer", values["customer_user_id"]
    )

    invoices_response = client.get("/api/v1/invoices", headers=headers)
    assert invoices_response.status_code == 200, invoices_response.text
    invoices = invoices_response.json()["data"]
    assert len(invoices) == 2
    partial_invoice = next(item for item in invoices if item["amount_due"] > 0)
    assert partial_invoice["amount_paid"] == 3000
    assert partial_invoice["amount_due"] == 7000
    assert partial_invoice["due_date"] == "2026-10-31"
    assert partial_invoice["status"] == "PARTIAL"

    paid_response = client.get(
        "/api/v1/invoices?status=PAID",
        headers=headers,
    )
    assert paid_response.status_code == 200, paid_response.text
    assert [item["id"] for item in paid_response.json()["data"]] == [
        values["invoice_id"] + 1
    ]

    debts_response = client.get("/api/v1/customers/me/debts", headers=headers)
    assert debts_response.status_code == 200, debts_response.text
    debts = debts_response.json()
    assert debts["customer_id"] == values["customer_id"]
    assert debts["current_debt"] == 7000
    assert debts["credit_limit"] == 20000
    assert debts["remaining_credit_limit"] == 13000
    assert len(debts["invoices"]) == 1


def test_customer_cannot_read_another_customers_invoice_or_debt(invoice_portal_env):
    client, values = invoice_portal_env
    headers = _headers(
        "dealer@example.test", "Customer", values["customer_user_id"]
    )

    filtered_response = client.get(
        f"/api/v1/invoices?customerId={values['other_invoice_id']}",
        headers=headers,
    )
    assert filtered_response.status_code == 403

    debt_response = client.get(
        f"/api/v1/customers/{values['customer_id'] + 1}/debts",
        headers=headers,
    )
    assert debt_response.status_code == 403

    invoice_response = client.get(
        f"/api/v1/invoices/{values['other_invoice_id']}/download",
        headers=headers,
    )
    assert invoice_response.status_code == 403


def test_sales_rep_can_view_assigned_customer_debt(invoice_portal_env):
    client, values = invoice_portal_env
    headers = _headers("sales@example.test", "Sales Rep", values["sales_user_id"])

    response = client.get(
        f"/api/v1/customers/{values['customer_id']}/debts",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["current_debt"] == 7000


def test_invoice_download_is_printable_and_escapes_customer_data(invoice_portal_env):
    client, values = invoice_portal_env
    headers = _headers(
        "dealer@example.test", "Customer", values["customer_user_id"]
    )

    response = client.get(
        f"/api/v1/invoices/{values['invoice_id']}/download",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/html")
    assert "In / Lưu hóa đơn PDF" in response.text
    assert "&lt;Đại lý&gt; kiểm thử" in response.text
    assert "<script>" not in response.text


def test_invoice_download_enforces_role_and_sales_assignment(invoice_portal_env):
    client, values = invoice_portal_env
    warehouse_headers = _headers("warehouse-user", "Warehouse", 9999)
    denied_existing_invoice = client.get(
        f"/api/v1/invoices/{values['invoice_id']}/download",
        headers=warehouse_headers,
    )
    denied_missing_invoice = client.get(
        "/api/v1/invoices/99999/download",
        headers=warehouse_headers,
    )
    assert denied_existing_invoice.status_code == 403
    assert denied_missing_invoice.status_code == 403

    sales_headers = _headers(
        "sales@example.test", "Sales Rep", values["sales_user_id"]
    )
    denied_unassigned_invoice = client.get(
        f"/api/v1/invoices/{values['other_invoice_id']}/download",
        headers=sales_headers,
    )
    assert denied_unassigned_invoice.status_code == 403


def test_unlinked_customer_account_is_denied(invoice_portal_env):
    client, _values = invoice_portal_env
    headers = _headers("unlinked-user", "Customer", 9999)

    response = client.get("/api/v1/customers/me/debts", headers=headers)
    assert response.status_code == 403


def test_accountant_issues_invoice_for_actual_dispatch_amount(invoice_portal_env):
    client, values = invoice_portal_env
    headers = _headers("accountant@example.test", "Accountant", 999)
    payload = {
        "dispatchId": values["dispatch_id"],
        "invoiceDate": "2026-10-10",
        "paymentTermDays": 30,
    }

    response = client.post(
        "/api/v1/invoices/from-dispatch",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    result = response.json()["data"]
    assert result["customer_id"] == values["customer_id"]
    assert result["total_amount"] == 800
    assert result["payment_term_days"] == 30

    invoice_document = client.get(
        f"/api/v1/invoices/{result['id']}/download",
        headers=_headers(
            "dealer@example.test", "Customer", values["customer_user_id"]
        ),
    )
    assert invoice_document.status_code == 200, invoice_document.text
    assert "Sản phẩm kiểm thử" in invoice_document.text
    assert "800 VND" in invoice_document.text

    duplicate_response = client.post(
        "/api/v1/invoices/from-dispatch",
        json=payload,
        headers=headers,
    )
    assert duplicate_response.status_code == 409

    payment_response = client.post(
        "/api/v1/payments",
        json={
            "customerId": values["customer_id"],
            "amount": 250,
            "paymentMethod": "BANK_TRANSFER",
            "paymentDate": "2026-10-17",
            "invoiceIds": [result["id"]],
        },
        headers=headers,
    )
    assert payment_response.status_code == 201, payment_response.text

    debt_response = client.get(
        "/api/v1/customers/me/debts",
        headers=_headers(
            "dealer@example.test", "Customer", values["customer_user_id"]
        ),
    )
    assert debt_response.status_code == 200, debt_response.text
    assert debt_response.json()["current_debt"] == 7550
    issued_invoice = next(
        item for item in debt_response.json()["invoices"] if item["id"] == result["id"]
    )
    assert issued_invoice["amount_paid"] == 250
    assert issued_invoice["amount_due"] == 550
    assert issued_invoice["status"] == "PARTIAL"

    overpayment_response = client.post(
        "/api/v1/payments",
        json={
            "customerId": values["customer_id"],
            "amount": 1000,
            "paymentMethod": "BANK_TRANSFER",
            "paymentDate": "2026-10-17",
            "invoiceIds": [result["id"]],
        },
        headers=headers,
    )
    assert overpayment_response.status_code == 422
