import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.audit_logs import get_db, router
from src.backend.models import BusinessAuditLog


@pytest.fixture
def audit_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    BusinessAuditLog.__table__.create(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router)

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    engine.dispose()


def test_create_inventory_audit_log_keeps_before_and_after_values(audit_client):
    response = audit_client.post(
        "/api/v1/audit-logs",
        json={
            "actor_user_id": 7,
            "actor_name": "  Nguyen Van A ",
            "entity_type": "inventory",
            "entity_id": "SKU-001",
            "action": "stock_adjustment",
            "before_value": {"quantity": 10},
            "after_value": {"quantity": 8},
            "happened_at": "2026-09-30T10:00:00+07:00",
        },
    )

    assert response.status_code == 201
    record = response.json()
    assert record["actor_name"] == "Nguyen Van A"
    assert record["before_value"] == {"quantity": 10}
    assert record["after_value"] == {"quantity": 8}
    assert record["entity_id"] == "SKU-001"


def test_list_audit_logs_filters_actor_type_and_time_range(audit_client):
    for actor_id, entity_type, date in [
        (7, "inventory", "2026-09-29T10:00:00+00:00"),
        (7, "invoice", "2026-09-30T10:00:00+00:00"),
        (8, "inventory", "2026-09-30T11:00:00+00:00"),
        (7, "inventory", "2026-09-30T12:00:00+00:00"),
    ]:
        response = audit_client.post(
            "/api/v1/audit-logs",
            json={
                "actor_user_id": actor_id,
                "actor_name": f"User {actor_id}",
                "entity_type": entity_type,
                "entity_id": "DOC-1",
                "action": "update",
                "before_value": {"value": 1},
                "after_value": {"value": 2},
                "happened_at": date,
            },
        )
        assert response.status_code == 201

    response = audit_client.get(
        "/api/v1/audit-logs",
        params={
            "actor_user_id": 7,
            "entity_type": "inventory",
            "start_at": "2026-09-30T00:00:00+00:00",
            "end_at": "2026-09-30T23:59:59+00:00",
        },
    )

    assert response.status_code == 200
    assert [row["entity_type"] for row in response.json()] == ["inventory"]
    assert [row["actor_user_id"] for row in response.json()] == [7]
    assert response.json()[0]["happened_at"].startswith("2026-09-30T12:00:00")


@pytest.mark.parametrize(
    "payload",
    [
        {"actor_name": " ", "entity_type": "inventory", "entity_id": "S1", "action": "update", "before_value": 1, "after_value": 2},
        {"actor_name": "User", "entity_type": "unknown", "entity_id": "S1", "action": "update", "before_value": 1, "after_value": 2},
        {"actor_name": "User", "entity_type": "inventory", "entity_id": "S1", "action": "update", "before_value": 1, "after_value": 2, "happened_at": "2026-09-30T10:00:00"},
    ],
)
def test_create_audit_log_rejects_invalid_payload(audit_client, payload):
    response = audit_client.post("/api/v1/audit-logs", json=payload)
    assert response.status_code == 422


def test_list_audit_logs_rejects_reversed_time_range(audit_client):
    response = audit_client.get(
        "/api/v1/audit-logs",
        params={
            "start_at": "2026-09-30T12:00:00+00:00",
            "end_at": "2026-09-30T10:00:00+00:00",
        },
    )
    assert response.status_code == 422
