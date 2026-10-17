from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

backend_path = Path(__file__).resolve().parents[1] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
    Dispatch,
    DispatchItem,
    Invoice,
    Inventory,
    InventoryLot,
    InventoryStock,
    InventoryTransaction,
    Order,
    Product,
    ProductUnit,
    ReturnOrder,
    ReturnOrderItem,
    User,
    Warehouse,
)
from main import app


def auth(role: str, username: str) -> dict[str, str]:
    token = create_access_token({"sub": username, "username": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def returns_env():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with testing_session() as db:
        sales = User(
            username="return_sales",
            full_name="Sales Rep",
            password_hash="test",
            email="return-sales@example.test",
        )
        manager = User(
            username="return_wh_manager",
            full_name="WH Manager",
            password_hash="test",
            email="return-warehouse@example.test",
        )
        other_sales = User(
            username="other_sales",
            full_name="Other Sales",
            password_hash="test",
            email="other-sales@example.test",
        )
        other_manager = User(
            username="other_wh_manager",
            full_name="Other WH Manager",
            password_hash="test",
            email="other-warehouse@example.test",
        )
        warehouse = Warehouse(code="RET-01", name="Return warehouse")
        manager.warehouses.append(warehouse)
        db.add_all([sales, manager, other_sales, other_manager, warehouse])
        db.flush()
        customer = Customer(
            code="RET-CUST-01",
            name="Return customer",
            sales_rep_id=sales.id,
            is_active=True,
        )
        product = Product(
            sku="RET-SKU-01",
            name="Tracked product",
            base_unit="Piece",
            manage_by_lot=True,
            status="ACTIVE",
        )
        db.add_all([customer, product])
        db.flush()
        base_unit = ProductUnit(
            product_id=product.id,
            unit_name="Piece",
            conversion_rate=1,
            is_base_unit=True,
        )
        carton_unit = ProductUnit(
            product_id=product.id,
            unit_name="Box of 6",
            conversion_rate=6,
            is_base_unit=False,
        )
        order = Order(order_code="RET-ORDER-01", customer_id=customer.id)
        db.add_all([base_unit, carton_unit, order])
        db.flush()
        dispatch = Dispatch(order_id=order.id, status="DELIVERED")
        db.add(dispatch)
        db.flush()
        db.add(
            DispatchItem(
                dispatch_id=dispatch.id,
                product_id=product.id,
                lot_number="LOT-RETURN-01",
                actual_qty=12,
            )
        )
        invoice = Invoice(
            dispatch_id=dispatch.id,
            customer_id=customer.id,
            total_amount=1200,
        )
        db.add(invoice)
        db.flush()
        db.add(
            InventoryLot(
                lot_number="LOT-RETURN-01",
                product_id=product.id,
                warehouse_id=warehouse.id,
                quantity=0,
                damaged_qty=0,
            )
        )
        db.commit()
        ids = {
            "invoice": invoice.id,
            "product": product.id,
            "carton_unit": carton_unit.id,
            "warehouse": warehouse.id,
            "customer": customer.id,
        }

    try:
        with TestClient(app) as client:
            yield client, testing_session, ids
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


def create_payload(ids: dict, quantity: float = 1, lot: str = "LOT-RETURN-01") -> dict:
    return {
        "invoiceId": ids["invoice"],
        "warehouseId": ids["warehouse"],
        "returnDate": "2026-10-17",
        "reason": "Đại lý trả hàng lỗi bao bì",
        "items": [
            {
                "productId": ids["product"],
                "unitId": ids["carton_unit"],
                "lotNumber": lot,
                "quantity": quantity,
            }
        ],
    }


def test_sales_rep_can_list_eligible_invoices_and_remaining_lines(returns_env):
    client, _, ids = returns_env
    headers = auth("Sales Rep", "return_sales")

    sales_page = client.get("/sales/returns")
    warehouse_page = client.get("/warehouse/returns")
    assert sales_page.status_code == 200
    assert warehouse_page.status_code == 200
    assert "text/html" in sales_page.headers["content-type"]
    assert "text/html" in warehouse_page.headers["content-type"]

    invoices = client.get("/api/v1/returns/eligible-invoices", headers=headers)
    assert invoices.status_code == 200
    assert invoices.json()["data"][0]["id"] == ids["invoice"]

    lines = client.get(
        f"/api/v1/returns/invoices/{ids['invoice']}/items",
        headers=headers,
    )
    assert lines.status_code == 200
    line = lines.json()["data"]["items"][0]
    assert line["deliveredBaseQuantity"] == 12
    assert line["returnableBaseQuantity"] == 12
    assert line["lotNumber"] == "LOT-RETURN-01"
    assert line["units"][1]["conversionRate"] == 6


def test_return_quantity_is_converted_and_reserved_before_receipt(returns_env):
    client, session, ids = returns_env
    headers = auth("Sales Rep", "return_sales")

    created = client.post("/api/v1/returns", headers=headers, json=create_payload(ids, quantity=1))
    assert created.status_code == 201, created.text
    return_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "PENDING_RECEIPT"
    assert created.json()["data"]["items"][0]["baseQuantity"] == 6

    too_many = client.post("/api/v1/returns", headers=headers, json=create_payload(ids, quantity=2))
    assert too_many.status_code == 422
    lines = client.get(
        f"/api/v1/returns/invoices/{ids['invoice']}/items",
        headers=headers,
    )
    assert lines.json()["data"]["items"][0]["returnableBaseQuantity"] == 6
    with session() as db:
        assert db.query(Inventory).count() == 0
        assert db.query(InventoryTransaction).count() == 0
        assert db.get(ReturnOrder, return_id).status == "PENDING_RECEIPT"


def test_wrong_lot_and_unassigned_invoice_are_rejected(returns_env):
    client, _, ids = returns_env
    headers = auth("Sales Rep", "return_sales")

    wrong_lot = client.post(
        "/api/v1/returns",
        headers=headers,
        json=create_payload(ids, lot="LOT-OTHER"),
    )
    assert wrong_lot.status_code == 422

    forbidden = client.get(
        f"/api/v1/returns/invoices/{ids['invoice']}/items",
        headers=auth("Sales Rep", "other_sales"),
    )
    assert forbidden.status_code == 403


def test_warehouse_manager_receives_good_return_into_correct_lot_once(returns_env):
    client, session, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids),
    )
    return_id = created.json()["data"]["id"]
    item_id = created.json()["data"]["items"][0]["id"]

    received = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert received.status_code == 200, received.text
    assert received.json()["data"]["status"] == "RECEIVED"

    duplicate = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert duplicate.status_code == 409

    with session() as db:
        inventory = db.query(Inventory).one()
        stock = db.query(InventoryStock).one()
        lot = db.query(InventoryLot).one()
        assert inventory.available_qty == 6
        assert inventory.physical_qty == 6
        assert inventory.damaged_qty == 0
        assert stock.base_quantity == 6
        assert lot.quantity == 6
        assert lot.damaged_qty == 0
        assert db.query(InventoryTransaction).count() == 1


def test_damaged_return_is_quarantined_not_available(returns_env):
    client, session, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids),
    )
    return_id = created.json()["data"]["id"]
    item_id = created.json()["data"]["items"][0]["id"]
    received = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "DAMAGED"}]},
    )
    assert received.status_code == 200, received.text
    with session() as db:
        inventory = db.query(Inventory).one()
        lot = db.query(InventoryLot).one()
        assert inventory.available_qty == 0
        assert inventory.physical_qty == 0
        assert inventory.damaged_qty == 6
        assert lot.quantity == 0
        assert lot.damaged_qty == 6
        assert db.query(InventoryStock).count() == 0
        assert db.query(InventoryTransaction).one().transaction_type == "DMG"
    inventory_response = client.get(
        f"/api/v1/inventory?warehouseId={ids['warehouse']}",
        headers=auth("WH Manager", "return_wh_manager"),
    )
    assert inventory_response.status_code == 200
    inventory_row = inventory_response.json()["data"][0]
    assert inventory_row["damagedQty"] == 6
    assert inventory_row["availableQty"] == 0
    lots_response = client.get(
        f"/api/v1/inventory/lots?productId={ids['product']}&warehouseId={ids['warehouse']}",
        headers=auth("WH Manager", "return_wh_manager"),
    )
    assert lots_response.status_code == 200
    assert lots_response.json()["data"][0]["damagedQuantity"] == 6


def test_receipt_requires_every_item_and_assigned_warehouse(returns_env):
    client, session, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids),
    )
    return_id = created.json()["data"]["id"]
    item_id = created.json()["data"]["items"][0]["id"]

    incomplete = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": []},
    )
    assert incomplete.status_code == 422
    unauthorized_role = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("Warehouse", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert unauthorized_role.status_code == 403
    with session() as db:
        assert db.get(ReturnOrder, return_id).status == "PENDING_RECEIPT"
        assert db.query(Inventory).count() == 0
        assert db.query(ReturnOrderItem).one().received_condition is None


def test_return_list_is_visible_to_sales_and_assigned_warehouse_manager(returns_env):
    client, _, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids),
    )
    assert created.status_code == 201
    sales_list = client.get("/api/v1/returns", headers=auth("Sales Rep", "return_sales"))
    warehouse_list = client.get("/api/v1/returns", headers=auth("WH Manager", "return_wh_manager"))
    assert sales_list.status_code == 200
    assert warehouse_list.status_code == 200
    assert sales_list.json()["data"][0]["status"] == "PENDING_RECEIPT"
    assert warehouse_list.json()["data"][0]["id"] == created.json()["data"]["id"]


def test_non_lot_managed_product_can_be_returned_without_lot(returns_env):
    client, session, ids = returns_env
    with session() as db:
        product = Product(
            sku="RET-SKU-02",
            name="Untracked product",
            base_unit="Piece",
            manage_by_lot=False,
            status="ACTIVE",
        )
        db.add(product)
        db.flush()
        db.add(
            DispatchItem(
                dispatch_id=db.get(Invoice, ids["invoice"]).dispatch_id,
                product_id=product.id,
                lot_number=None,
                actual_qty=4,
            )
        )
        db.commit()
        product_id = product.id

    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json={
            "invoiceId": ids["invoice"],
            "warehouseId": ids["warehouse"],
            "returnDate": "2026-10-17",
            "reason": "Đại lý trả hàng nguyên vẹn",
            "items": [{"productId": product_id, "quantity": 2}],
        },
    )
    assert created.status_code == 201, created.text
    return_id = created.json()["data"]["id"]
    item_id = created.json()["data"]["items"][0]["id"]
    received = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert received.status_code == 200, received.text
    with session() as db:
        inventory = db.query(Inventory).filter(Inventory.product_id == product_id).one()
        assert inventory.available_qty == 2
        assert db.query(InventoryLot).filter(InventoryLot.product_id == product_id).count() == 0


def test_only_manager_assigned_to_return_warehouse_can_receive(returns_env):
    client, session, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids),
    )
    return_id = created.json()["data"]["id"]
    item_id = created.json()["data"]["items"][0]["id"]

    response = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "other_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert response.status_code == 403
    with session() as db:
        assert db.get(ReturnOrder, return_id).status == "PENDING_RECEIPT"
        assert db.query(Inventory).count() == 0


def test_fully_returned_quantity_is_no_longer_eligible(returns_env):
    client, _, ids = returns_env
    created = client.post(
        "/api/v1/returns",
        headers=auth("Sales Rep", "return_sales"),
        json=create_payload(ids, quantity=2),
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["data"]["items"][0]["id"]
    return_id = created.json()["data"]["id"]
    received = client.post(
        f"/api/v1/returns/{return_id}/receive",
        headers=auth("WH Manager", "return_wh_manager"),
        json={"items": [{"returnItemId": item_id, "condition": "GOOD"}]},
    )
    assert received.status_code == 200
    lines = client.get(
        f"/api/v1/returns/invoices/{ids['invoice']}/items",
        headers=auth("Sales Rep", "return_sales"),
    )
    assert lines.status_code == 200
    assert lines.json()["data"]["items"] == []
    invoices = client.get(
        "/api/v1/returns/eligible-invoices",
        headers=auth("Sales Rep", "return_sales"),
    )
    assert invoices.status_code == 200
    assert invoices.json()["data"] == []
