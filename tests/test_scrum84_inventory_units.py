import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import Base, InventoryStock
from src.backend.rbac import AuthenticatedUser, get_current_user


@pytest.fixture
def inventory_client(client):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        username="warehouse-test", role="Warehouse", warehouse_ids=[1]
    )
    yield client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_unit_crud_converts_receipts_and_picks_stock(inventory_client):
    created = inventory_client.post(
        "/api/v1/products/1/units",
        json={"unit_name": " thùng ", "conversion_rate": 24},
    )
    assert created.status_code == 200
    assert created.json()["unit_name"] == "thùng"
    assert inventory_client.get("/api/v1/products/1/units").json()[0]["conversion_rate"] == 24

    received = inventory_client.post(
        "/api/v1/inventory/transaction",
        json={
            "product_id": 1,
            "warehouse_id": 1,
            "transaction_type": "IN",
            "unit_name": " thùng ",
            "input_quantity": 2,
        },
    )
    assert received.status_code == 201
    assert received.json()["base_quantity"] == 48
    assert received.json()["conversion_rate_snapshot"] == 24

    insufficient = inventory_client.post(
        "/api/v1/inventory/transaction",
        json={
            "product_id": 1,
            "warehouse_id": 1,
            "transaction_type": "OUT",
            "unit_name": "thùng",
            "input_quantity": 3,
        },
    )
    assert insufficient.status_code == 400

    picked = inventory_client.post(
        "/api/v1/inventory/transaction",
        json={
            "product_id": 1,
            "warehouse_id": 1,
            "transaction_type": "OUT",
            "unit_name": "thùng",
            "input_quantity": 1,
        },
    )
    assert picked.status_code == 201
    assert picked.json()["base_quantity"] == 24

    listed = inventory_client.get("/api/v1/inventory/items?warehouse_id=1")
    assert listed.status_code == 200
    assert listed.json()[0]["quantity_available"] == 24

    db = next(app.dependency_overrides[get_db]())
    try:
        stock = db.query(InventoryStock).filter_by(product_id=1, warehouse_id=1).one()
        assert stock.base_quantity == 24
    finally:
        db.close()


def test_legacy_transaction_accepts_original_payload(inventory_client):
    response = inventory_client.post(
        "/inventory/transaction",
        json={"product_id": 2, "unit_name": "lon", "input_quantity": 5},
    )
    assert response.status_code == 201
    assert response.json()["warehouse_id"] == 1
    assert response.json()["transaction_type"] == "IN"
