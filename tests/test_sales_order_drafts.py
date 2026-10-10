from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import (
    AccountStatus,
    Base,
    CatalogProduct,
    CatalogProductUnit,
    Customer,
    CustomerDeliveryPoint,
    Role,
    Territory,
    User,
)
from src.backend.rbac import create_access_token


@pytest.fixture
def sales_order_env():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(autoflush=False, bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with session_factory() as db:
        sales_role = Role(code="SALES_REP", name="Nhân viên kinh doanh")
        sales_user = User(
            username="sales-draft-user",
            email="sales-draft@example.test",
            full_name="Sales Draft User",
            password_hash="unused",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[sales_role],
        )
        other_user = User(
            username="other-sales-user",
            email="other-sales@example.test",
            full_name="Other Sales User",
            password_hash="unused",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[sales_role],
        )
        territory = Territory(code="NORTH-1", name="Miền Bắc 1")
        db.add_all([sales_user, other_user, territory])
        db.flush()
        sales_user.territories = [territory]
        customer = Customer(
            code="DL-REAL-01",
            name="Đại lý được giao",
            sales_rep_id=sales_user.id,
            is_active=True,
            is_locked=False,
        )
        territory_customer = Customer(
            code="DL-TERR-01",
            name="Đại lý theo địa bàn",
            territory_id=territory.id,
            is_active=True,
            is_locked=False,
        )
        outside_customer = Customer(
            code="DL-OTHER-01",
            name="Đại lý ngoài phạm vi",
            sales_rep_id=other_user.id,
            is_active=True,
            is_locked=False,
        )
        db.add_all([customer, territory_customer, outside_customer])
        db.flush()
        delivery_point = CustomerDeliveryPoint(
            customer_id=customer.id,
            name="Cửa hàng chính",
            address="Địa chỉ do đại lý cung cấp",
            is_default=True,
            is_active=True,
        )
        product = CatalogProduct(
            sku="REAL-001",
            name="Sản phẩm catalog thật",
            sale_price=Decimal("1200.50"),
            discount_percent=Decimal("10.00"),
            is_active=True,
        )
        second_product = CatalogProduct(
            sku="REAL-002",
            name="Sản phẩm catalog thứ hai",
            sale_price=Decimal("1000.00"),
            discount_percent=Decimal("0.00"),
            is_active=True,
        )
        db.add_all([delivery_point, product, second_product])
        db.flush()
        case_unit = CatalogProductUnit(
            product_id=product.id,
            unit_code="CASE",
            unit_name="Thùng",
            conversion_factor=Decimal("24.0000"),
            is_base_unit=False,
            is_active=True,
        )
        piece_unit = CatalogProductUnit(
            product_id=product.id,
            unit_code="EACH",
            unit_name="Cái",
            conversion_factor=Decimal("1.0000"),
            is_base_unit=True,
            is_active=True,
        )
        second_unit = CatalogProductUnit(
            product_id=second_product.id,
            unit_code="EACH",
            unit_name="Cái",
            conversion_factor=Decimal("1.0000"),
            is_base_unit=True,
            is_active=True,
        )
        db.add_all([case_unit, piece_unit, second_unit])
        db.commit()
        ids = {
            "sales_user": sales_user.id,
            "other_user": other_user.id,
            "customer": customer.id,
            "territory_customer": territory_customer.id,
            "outside_customer": outside_customer.id,
            "delivery_point": delivery_point.id,
            "product": product.id,
            "second_product": second_product.id,
            "case_unit": case_unit.id,
            "piece_unit": piece_unit.id,
            "second_unit": second_unit.id,
        }

    with TestClient(app) as client:
        yield client, session_factory, ids

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def sales_headers(username: str = "sales-draft-user", role: str = "SALES_REP") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


def draft_payload(ids: dict[str, int]) -> dict:
    return {
        "customer_id": ids["customer"],
        "delivery_point_id": ids["delivery_point"],
        "desired_delivery_date": date.today().isoformat(),
        "items": [
            {"product_id": ids["product"], "unit_id": ids["case_unit"], "quantity": 2},
            {"product_id": ids["second_product"], "unit_id": ids["second_unit"], "quantity": 3},
        ],
    }


def test_create_draft_calculates_multiple_lines_from_persisted_catalog(sales_order_env):
    client, _, ids = sales_order_env

    response = client.post(
        "/api/v1/sales-orders/drafts",
        json=draft_payload(ids),
        headers=sales_headers(),
    )

    assert response.status_code == 201
    draft = response.json()
    assert draft["status"] == "DRAFT"
    assert draft["subtotal_amount"] == 60624
    assert draft["discount_amount"] == 5762.4
    assert draft["total_amount"] == 54861.6
    assert draft["items"][0]["unit_price"] == 28812
    assert draft["items"][0]["conversion_factor"] == 24
    assert draft["items"][0]["discount_percent"] == 10
    assert draft["items"][0]["line_total"] == 51861.6


def test_draft_persists_lists_reopens_and_updates(sales_order_env):
    client, session_factory, ids = sales_order_env
    created = client.post(
        "/api/v1/sales-orders/drafts",
        json=draft_payload(ids),
        headers=sales_headers(),
    )
    order_id = created.json()["id"]

    with session_factory() as db:
        from src.backend.models import Order

        assert db.get(Order, order_id) is not None

    listing = client.get("/api/v1/sales-orders/drafts", headers=sales_headers())
    reopened = client.get(f"/api/v1/sales-orders/drafts/{order_id}", headers=sales_headers())
    assert listing.status_code == reopened.status_code == 200
    assert len(listing.json()) == 1
    assert reopened.json()["items"][0]["quantity"] == 2

    payload = draft_payload(ids)
    payload["items"][0]["quantity"] = 4
    updated = client.put(
        f"/api/v1/sales-orders/drafts/{order_id}",
        json=payload,
        headers=sales_headers(),
    )
    assert updated.status_code == 200
    assert updated.json()["items"][0]["quantity"] == 4
    assert updated.json()["subtotal_amount"] == 118248


def test_sales_api_searches_catalog_and_scopes_customers_and_delivery_points(sales_order_env):
    client, _, ids = sales_order_env
    headers = sales_headers()

    product_search = client.get("/api/v1/sales-orders/products?search=real-002", headers=headers)
    customers = client.get("/api/v1/sales-orders/customers", headers=headers)
    points = client.get(
        f"/api/v1/sales-orders/delivery-points?customer_id={ids['customer']}",
        headers=headers,
    )
    outside_points = client.get(
        f"/api/v1/sales-orders/delivery-points?customer_id={ids['outside_customer']}",
        headers=headers,
    )

    assert [item["sku"] for item in product_search.json()] == ["REAL-002"]
    assert {item["id"] for item in customers.json()} == {
        ids["customer"], ids["territory_customer"]
    }
    assert len(points.json()) == 1
    assert outside_points.status_code == 404


@pytest.mark.parametrize(
    ("change", "expected_status"),
    [
        ({"items": [{"product_id": 1, "unit_id": 1, "quantity": 0}]}, 422),
        ({"delivery_point_id": 9999}, 400),
        ({"customer_id": 9999}, 404),
    ],
)
def test_invalid_draft_data_is_rejected(sales_order_env, change, expected_status):
    client, _, ids = sales_order_env
    payload = draft_payload(ids)
    payload.update(change)

    response = client.post(
        "/api/v1/sales-orders/drafts",
        json=payload,
        headers=sales_headers(),
    )

    assert response.status_code == expected_status


def test_invalid_product_unit_pair_locked_customer_and_non_sales_role_are_rejected(sales_order_env):
    client, session_factory, ids = sales_order_env
    headers = sales_headers()

    invalid_unit = draft_payload(ids)
    invalid_unit["items"][0]["unit_id"] = ids["second_unit"]
    assert client.post("/api/v1/sales-orders/drafts", json=invalid_unit, headers=headers).status_code == 400

    with session_factory() as db:
        customer = db.get(Customer, ids["customer"])
        customer.is_locked = True
        customer.lock_reason = "Đang đối soát công nợ"
        db.commit()
    assert client.post(
        "/api/v1/sales-orders/drafts",
        json=draft_payload(ids),
        headers=headers,
    ).status_code == 400

    assert client.get(
        "/api/v1/sales-orders/products",
        headers=sales_headers(role="CUSTOMER"),
    ).status_code == 403


def test_sales_rep_cannot_open_another_users_draft(sales_order_env):
    client, _, ids = sales_order_env
    created = client.post(
        "/api/v1/sales-orders/drafts",
        json=draft_payload(ids),
        headers=sales_headers(),
    )

    response = client.get(
        f"/api/v1/sales-orders/drafts/{created.json()['id']}",
        headers=sales_headers(username="other-sales-user"),
    )
    assert response.status_code == 404