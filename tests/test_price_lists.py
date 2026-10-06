"""Unit tests for SCRUM-80 price list rules and API."""

import pytest

from src.backend import price_lists
from src.backend.rbac import create_access_token


@pytest.fixture(autouse=True)
def clear_price_lists():
    price_lists.PRICE_LISTS.clear()
    price_lists._next_id = 1


def payload(**overrides):
    data = {
        "code": "WHOLESALE", "customer_group": "DEALER_LEVEL_1",
        "start_date": "2026-01-01", "end_date": "2026-12-31",
        "items": [{"sku": "sku-001", "sale_price": 90, "floor_price": 100}],
    }
    data.update(overrides)
    return data


def manager(client):
    token = create_access_token({"sub": "manager_user", "role": "Sales Manager"})
    return {"Authorization": f"Bearer {token}"}


def create_and_publish(client, data=None):
    created = client.post("/api/v1/price-lists", json=data or payload(), headers=manager(client))
    assert created.status_code == 201
    price_list = created.json()
    published = client.post(
        "/api/v1/price-lists/{}/publish".format(price_list["id"]), headers=manager(client)
    )
    assert published.status_code == 200
    return published.json()


def test_create_price_list_and_reject_invalid_dates(client):
    response = client.post("/api/v1/price-lists", json=payload(), headers=manager(client))
    assert response.status_code == 201
    assert response.json()["version"] == 1
    assert response.json()["items"][0]["sku"] == "SKU-001"
    invalid = payload(start_date="2026-12-31", end_date="2026-01-01")
    assert client.post("/api/v1/price-lists", json=invalid, headers=manager(client)).status_code == 422


@pytest.mark.parametrize("invalid_item", [
    {"sku": "A", "sale_price": -1, "floor_price": 0},
    {"sku": "A", "sale_price": 10, "floor_price": -1},
])
def test_reject_negative_prices(client, invalid_item):
    assert client.post("/api/v1/price-lists", json=payload(items=[invalid_item]), headers=manager(client)).status_code == 422


def test_reject_duplicate_skus(client):
    items = [{"sku": "A", "sale_price": 10, "floor_price": 5}] * 2
    assert client.post("/api/v1/price-lists", json=payload(items=items), headers=manager(client)).status_code == 422


def test_published_list_is_immutable_and_new_version_can_be_created(client):
    published = create_and_publish(client)
    updated = client.put(
        "/api/v1/price-lists/{}".format(published["id"]), json=payload(), headers=manager(client)
    )
    assert updated.status_code == 409
    second = client.post("/api/v1/price-lists", json=payload(), headers=manager(client)).json()
    assert second["version"] == 2


def test_draft_can_be_updated(client):
    first = client.post("/api/v1/price-lists", json=payload(), headers=manager(client)).json()
    changed = payload(items=[{"sku": "SKU-002", "sale_price": 30, "floor_price": 20}])
    result = client.put("/api/v1/price-lists/{}".format(first["id"]), json=changed, headers=manager(client))
    assert result.status_code == 200
    assert result.json()["items"][0]["sku"] == "SKU-002"


def test_effective_price_sets_approval_flag_below_floor(client):
    create_and_publish(client)
    response = client.get(
        "/api/v1/price-lists/effective/sku-001?customer_group=DEALER_LEVEL_1&on_date=2026-06-01"
    )
    assert response.status_code == 200
    assert response.json()["requires_approval"] is True
    assert response.json()["sale_price"] == 90


def test_effective_price_does_not_require_approval_at_floor_or_above(client):
    data = payload(items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 100}])
    create_and_publish(client, data)
    response = client.get(
        "/api/v1/price-lists/effective/SKU-001?customer_group=DEALER_LEVEL_1&on_date=2026-06-01"
    )
    assert response.json()["requires_approval"] is False


def test_effective_price_requires_published_matching_group_and_date(client):
    client.post("/api/v1/price-lists", json=payload(), headers=manager(client))
    path = "/api/v1/price-lists/effective/SKU-001?customer_group=RETAIL&on_date=2026-06-01"
    assert client.get(path).status_code == 404
    create_and_publish(client, payload(start_date="2026-07-01"))
    assert client.get(path.replace("RETAIL", "DEALER_LEVEL_1")).status_code == 404


def test_price_list_management_requires_sales_manager_or_admin(client):
    sales_rep_token = create_access_token({"sub": "sales_rep_01", "role": "Sales Rep"})
    response = client.post(
        "/api/v1/price-lists",
        json=payload(),
        headers={"Authorization": f"Bearer {sales_rep_token}"},
    )
    assert response.status_code == 403
    assert client.post("/api/v1/price-lists", json=payload()).status_code == 401
