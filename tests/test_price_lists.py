"""Integration tests for customer-group price lists and below-floor approvals."""

from datetime import date

import pytest
from sqlalchemy import delete

from src.backend.database import SessionLocal
from src.backend.models import Customer, Order, OrderItem, PriceList, PriceListItem
from src.backend.rbac import create_access_token


@pytest.fixture(autouse=True)
def clear_pricing_business_data():
    # conftest uses a shared in-memory SQLite connection, so explicitly isolate
    # rows owned by this test module between cases.
    with SessionLocal() as db:
        db.execute(delete(OrderItem))
        db.execute(delete(Order))
        db.execute(delete(PriceListItem))
        db.execute(delete(PriceList))
        db.execute(delete(Customer))
        db.commit()


def payload(**overrides):
    data = {
        "code": "WHOLESALE",
        "customer_group": "DEALER_LEVEL_1",
        "start_date": "2020-01-01",
        "end_date": "2099-12-31",
        "items": [{"sku": "sku-001", "sale_price": 100, "floor_price": 80}],
    }
    data.update(overrides)
    return data


def auth(role="Sales Manager"):
    token = create_access_token({"sub": f"test-{role}", "role": role})
    return {"Authorization": f"Bearer {token}"}


def create_and_publish(client, data=None):
    created = client.post("/api/v1/price-lists", json=data or payload(), headers=auth())
    assert created.status_code == 201, created.text
    price_list = created.json()
    published = client.post(f"/api/v1/price-lists/{price_list['id']}/publish", headers=auth())
    assert published.status_code == 200, published.text
    return published.json()


def create_customer(client, group="DEALER_LEVEL_1"):
    response = client.post(
        "/api/v1/customers",
        json={"code": f"CUST-{group}", "name": f"Customer {group}", "customer_group": group},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_order(client, customer_id, unit_price=None):
    return client.post(
        "/api/v1/orders",
        headers=auth("Sales Rep"),
        json={
            "customer_id": customer_id,
            "items": [{"sku": "SKU-001", "product_name": "Demo product", "quantity": 2, "unit_price": unit_price}],
        },
    )


def test_create_price_list_normalizes_values_and_rejects_invalid_period(client):
    created = client.post("/api/v1/price-lists", json=payload(), headers=auth())
    assert created.status_code == 201
    assert created.json()["code"] == "WHOLESALE"
    assert created.json()["items"][0]["sku"] == "SKU-001"
    assert created.json()["version"] == 1

    invalid = payload(start_date="2026-12-31", end_date="2026-01-01")
    assert client.post("/api/v1/price-lists", json=invalid, headers=auth()).status_code == 422


@pytest.mark.parametrize("line", [
    {"sku": "A", "sale_price": -1, "floor_price": 0},
    {"sku": "A", "sale_price": 10, "floor_price": -1},
    {"sku": "A", "sale_price": 10, "floor_price": 11},
])
def test_reject_invalid_price_lines(client, line):
    response = client.post("/api/v1/price-lists", json=payload(items=[line]), headers=auth())
    assert response.status_code == 422


def test_reject_duplicate_skus(client):
    lines = [{"sku": "A", "sale_price": 10, "floor_price": 5}] * 2
    response = client.post("/api/v1/price-lists", json=payload(items=lines), headers=auth())
    assert response.status_code == 422


@pytest.mark.parametrize("group,sale_price,floor_price", [
    ("DEALER_LEVEL_1", 100, 80),
    ("DEALER_LEVEL_2", 90, 70),
    ("RETAIL", 120, 100),
])
def test_effective_price_is_selected_by_group(client, group, sale_price, floor_price):
    create_and_publish(client, payload(
        code=f"PRICE-{group}", customer_group=group,
        items=[{"sku": "SKU-001", "sale_price": sale_price, "floor_price": floor_price}],
    ))
    response = client.get(
        f"/api/v1/price-lists/effective/SKU-001?customer_group={group}&on_date={date.today().isoformat()}"
    )
    assert response.status_code == 200
    assert response.json()["customer_group"] == group
    assert response.json()["sale_price"] == sale_price
    assert response.json()["floor_price"] == floor_price


def test_effective_price_requires_published_list_matching_group_sku_and_date(client):
    draft = client.post("/api/v1/price-lists", json=payload(), headers=auth())
    assert draft.status_code == 201
    base = "/api/v1/price-lists/effective/SKU-001"
    assert client.get(f"{base}?customer_group=DEALER_LEVEL_1&on_date={date.today()}").status_code == 404

    create_and_publish(client, payload(start_date="2020-01-01", end_date="2020-12-31"))
    assert client.get(f"{base}?customer_group=DEALER_LEVEL_1&on_date={date.today()}").status_code == 404
    assert client.get(f"{base}?customer_group=RETAIL&on_date=2020-06-01").status_code == 404
    assert client.get(f"/api/v1/price-lists/effective/UNKNOWN?customer_group=DEALER_LEVEL_1&on_date=2020-06-01").status_code == 404


def test_published_list_is_immutable_and_new_version_preserves_group(client):
    published = create_and_publish(client)
    update = client.put(f"/api/v1/price-lists/{published['id']}", json=payload(), headers=auth())
    assert update.status_code == 409

    version = client.post("/api/v1/price-lists", json=payload(), headers=auth())
    assert version.status_code == 201
    assert version.json()["version"] == 2
    assert version.json()["customer_group"] == "DEALER_LEVEL_1"


def test_draft_can_be_updated_and_deleted_but_published_list_cannot_be_deleted(client):
    draft = client.post("/api/v1/price-lists", json=payload(), headers=auth()).json()
    changed = payload(items=[{"sku": "SKU-002", "sale_price": 50, "floor_price": 40}])
    updated = client.put(f"/api/v1/price-lists/{draft['id']}", json=changed, headers=auth())
    assert updated.status_code == 200
    assert updated.json()["items"][0]["sku"] == "SKU-002"
    assert client.delete(f"/api/v1/price-lists/{draft['id']}", headers=auth()).status_code == 204

    published = create_and_publish(client)
    assert client.delete(f"/api/v1/price-lists/{published['id']}", headers=auth()).status_code == 409


def test_overlapping_different_price_list_conflict_is_rejected(client):
    create_and_publish(client, payload(code="LIST-A"))
    conflict = client.post("/api/v1/price-lists", json=payload(code="LIST-B"), headers=auth()).json()
    response = client.post(f"/api/v1/price-lists/{conflict['id']}/publish", headers=auth())
    assert response.status_code == 409


def test_next_version_of_same_list_can_replace_effective_price(client):
    create_and_publish(client, payload(code="LIST-A"))
    second = client.post(
        "/api/v1/price-lists", json=payload(code="LIST-A", items=[{"sku": "SKU-001", "sale_price": 110, "floor_price": 90}]), headers=auth()
    ).json()
    assert second["version"] == 2
    assert client.post(f"/api/v1/price-lists/{second['id']}/publish", headers=auth()).status_code == 200
    effective = client.get(f"/api/v1/price-lists/effective/SKU-001?customer_group=DEALER_LEVEL_1&on_date={date.today()}")
    assert effective.json()["version"] == 2
    assert effective.json()["sale_price"] == 110


def test_order_uses_effective_group_price_when_price_is_not_overridden(client):
    create_and_publish(client, payload(items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}]))
    customer = create_customer(client)
    order = create_order(client, customer["id"])
    assert order.status_code == 201, order.text
    assert order.json()["status"] == "DRAFT"
    assert order.json()["items"][0]["unit_price"] == 100
    assert order.json()["items"][0]["floor_price"] == 80


def test_below_floor_order_waits_for_manager_approval_and_can_be_approved(client):
    create_and_publish(client)
    customer = create_customer(client)
    order_response = create_order(client, customer["id"], unit_price=70)
    assert order_response.status_code == 201
    order = order_response.json()
    assert order["status"] == "PENDING"
    assert "dưới giá sàn" in order["approval_reason"]

    pending = client.get("/api/v1/orders/pending-approval", headers=auth()).json()
    assert any(row["id"] == order["id"] for row in pending)
    approved = client.post(f"/api/v1/orders/{order['id']}/approve", headers=auth())
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"


def test_below_floor_order_can_be_rejected_and_manager_only_can_decide(client):
    create_and_publish(client)
    customer = create_customer(client)
    order = create_order(client, customer["id"], unit_price=70).json()
    forbidden = client.post(f"/api/v1/orders/{order['id']}/approve", headers=auth("Sales Rep"))
    assert forbidden.status_code == 403
    rejected = client.post(f"/api/v1/orders/{order['id']}/reject", headers=auth(), json={"reason": "Test từ chối"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "CANCELLED"


def test_price_list_management_requires_manager_or_admin(client):
    response = client.post("/api/v1/price-lists", json=payload(), headers=auth("Sales Rep"))
    assert response.status_code == 403
    assert client.post("/api/v1/price-lists", json=payload()).status_code == 401
