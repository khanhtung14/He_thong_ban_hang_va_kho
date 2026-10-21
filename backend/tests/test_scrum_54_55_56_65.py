"""Focused regression tests for the four merged debt/return Scrum stories."""

from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.returns import CreditNoteCreate, ReturnCreate, ReturnItem, create_credit_note, create_return
from app.models.models import (
    Base,
    Customer,
    CustomerDebt,
    Dispatch,
    DispatchItem,
    Invoice,
    Order,
    OrderItem,
    ReturnOrder,
    ReturnOrderItem,
    User,
    Warehouse,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _return_fixture(db_session):
    customer = Customer(code="DL-TEST", name="Đại lý kiểm thử", credit_limit=1000, current_debt=700)
    warehouse = Warehouse(code="WH-TEST", name="Kho kiểm thử", is_active=True)
    user = User(
        username="warehouse_test",
        email="warehouse@test.local",
        full_name="Warehouse Test",
        password_hash="test",
        is_active=True,
    )
    db_session.add_all([customer, warehouse, user])
    db_session.flush()
    order = Order(order_code="ORD-TEST", customer_id=customer.id, total_amount=500)
    db_session.add(order)
    db_session.flush()
    db_session.add(OrderItem(order_id=order.id, product_id=101, quantity=2, unit_price=250, line_total=500))
    dispatch = Dispatch(order_id=order.id, status="SHIPPED")
    db_session.add(dispatch)
    db_session.flush()
    db_session.add(DispatchItem(dispatch_id=dispatch.id, product_id=101, lot_number="LOT-1", actual_qty=2))
    invoice = Invoice(
        dispatch_id=dispatch.id,
        customer_id=customer.id,
        total_amount=500,
        status="UNPAID",
        payment_term_days=30,
    )
    db_session.add(invoice)
    db_session.flush()
    return customer, warehouse, user, invoice


def test_scrum65_uses_original_line_price_and_keeps_invoice_unchanged(db_session):
    customer, warehouse, user, invoice = _return_fixture(db_session)
    return_order = ReturnOrder(
        invoice_id=invoice.id,
        warehouse_id=warehouse.id,
        return_date=date(2026, 10, 10),
        reason="Hàng lỗi",
        status="RECEIVED_DAMAGED",
    )
    db_session.add(return_order)
    db_session.flush()
    db_session.add(ReturnOrderItem(return_id=return_order.id, product_id=101, lot_number="LOT-1", quantity=1))
    db_session.add(CustomerDebt(customer_id=customer.id, total_debt=700))
    db_session.commit()

    result = create_credit_note(
        return_order.id,
        CreditNoteCreate(return_id=return_order.id, note="Giảm trừ hàng trả"),
        db_session,
        SimpleNamespace(id=user.id),
    )

    assert result["data"]["amount"] == 250
    assert result["data"]["originalInvoiceId"] == invoice.id
    assert result["data"]["currentDebt"] == 450
    assert result["data"]["availableCredit"] == 550
    db_session.refresh(invoice)
    assert invoice.status == "UNPAID"
    assert db_session.query(CustomerDebt).filter_by(customer_id=customer.id).one().total_debt == 450


def test_scrum56_persists_return_date(db_session):
    customer, warehouse, user, invoice = _return_fixture(db_session)
    result = create_return(
        ReturnCreate(
            invoiceId=invoice.id,
            warehouseId=warehouse.id,
            returnDate="2026-10-11",
            reason="Trả hàng",
            items=[ReturnItem(productId=101, unitId=1, lotNumber="LOT-1", quantity=1)],
        ),
        db_session,
        SimpleNamespace(id=user.id),
    )
    saved = db_session.get(ReturnOrder, result["data"]["id"])
    assert saved.return_date == date(2026, 10, 11)


def test_scrum56_counts_confirmed_damaged_returns(db_session):
    customer, warehouse, user, invoice = _return_fixture(db_session)
    existing = ReturnOrder(
        invoice_id=invoice.id,
        warehouse_id=warehouse.id,
        return_date=date(2026, 10, 9),
        reason="Hàng lỗi",
        status="RECEIVED_DAMAGED",
    )
    db_session.add(existing)
    db_session.flush()
    db_session.add(ReturnOrderItem(return_id=existing.id, product_id=101, lot_number="LOT-1", quantity=2))
    db_session.commit()

    with pytest.raises(Exception) as error:
        create_return(
            ReturnCreate(
                invoiceId=invoice.id,
                warehouseId=warehouse.id,
                returnDate="2026-10-11",
                reason="Trả thêm",
                items=[ReturnItem(productId=101, unitId=1, lotNumber="LOT-1", quantity=1)],
            ),
            db_session,
            SimpleNamespace(id=user.id),
        )
    assert getattr(error.value, "status_code", None) == 422
