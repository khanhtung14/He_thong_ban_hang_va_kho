"""Tests for Sales Assignment & Bulk Handover (User Story S3-06, S3-11, S3-12):
1. Gán một nhân viên phụ trách chính cho mỗi đại lý.
2. Nhân viên kinh doanh chỉ nhìn thấy danh sách đại lý mình được phân công phụ trách.
3. Chuyển giao địa bàn/đại lý hàng loạt khi nhân viên nghỉ, có ghi lịch sử bàn giao.
"""

from __future__ import annotations

from typing import Any
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import (
    Base,
    Customer,
    HandoverHistory,
    Role,
    RoleCode,
    User,
    AccountStatus,
)
from src.backend.rbac import create_access_token


def make_token(role: str, username: str, user_id: int | None = None) -> dict[str, str]:
    payload: dict[str, Any] = {"sub": username, "role": role}
    if user_id is not None:
        payload["user_id"] = user_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()

    # Seed roles
    roles = {
        "admin": Role(code="Admin", name="Admin"),
        "sales_mgr": Role(code="Sales Manager", name="Sales Manager"),
        "sales_rep": Role(code="Sales Rep", name="Sales Rep"),
    }
    for r in roles.values():
        db.add(r)
    db.commit()

    # Seed users
    admin_user = User(
        username="admin01",
        email="admin@example.com",
        full_name="Quản trị viên",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[roles["admin"]],
    )
    mgr_user = User(
        username="manager01",
        email="mgr@example.com",
        full_name="Quản lý kinh doanh",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[roles["sales_mgr"]],
    )
    sales1 = User(
        username="sales01",
        email="sales1@example.com",
        full_name="Nguyễn Văn A",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[roles["sales_rep"]],
    )
    sales2 = User(
        username="sales02",
        email="sales2@example.com",
        full_name="Trần Thị B",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[roles["sales_rep"]],
    )
    sales3 = User(
        username="sales03",
        email="sales3@example.com",
        full_name="Lê Văn C",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[roles["sales_rep"]],
    )

    db.add_all([admin_user, mgr_user, sales1, sales2, sales3])
    db.commit()

    # Seed customers
    c1 = Customer(
        code="DL-001",
        name="Đại lý Cầu Giấy",
        region="Hà Nội",
        sales_rep_id=sales1.id,
        is_active=True,
    )
    c2 = Customer(
        code="DL-002",
        name="Đại lý Đống Đa",
        region="Hà Nội",
        sales_rep_id=sales1.id,
        is_active=True,
    )
    c3 = Customer(
        code="DL-003",
        name="Đại lý Ba Đình",
        region="Hà Nội",
        sales_rep_id=sales2.id,
        is_active=True,
    )
    c4 = Customer(
        code="DL-004",
        name="Đại lý Hải Phòng",
        region="Hải Phòng",
        sales_rep_id=None,
        is_active=True,
    )
    db.add_all([c1, c2, c3, c4])
    db.commit()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield {
        "db": db,
        "admin": admin_user,
        "mgr": mgr_user,
        "sales1": sales1,
        "sales2": sales2,
        "sales3": sales3,
        "c1": c1,
        "c2": c2,
        "c3": c3,
        "c4": c4,
    }
    app.dependency_overrides.pop(get_db, None)
    db.close()


def test_assign_sales_rep_endpoint(test_db_session):
    client = TestClient(app)
    env = test_db_session
    mgr_header = make_token("Sales Manager", env["mgr"].username, env["mgr"].id)

    # 1. Gán NVKD cho đại lý chưa được gán
    resp = client.post(
        f"/api/v1/customers/{env['c4'].id}/assign-sales",
        headers=mgr_header,
        json={"sales_user_id": env["sales3"].id, "region": "Miền Bắc - Hải Phòng"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["sales_rep_id"] == env["sales3"].id
    assert data["data"]["region"] == "Miền Bắc - Hải Phòng"

    # Verify in DB
    c4_db = env["db"].get(Customer, env["c4"].id)
    assert c4_db.sales_rep_id == env["sales3"].id
    assert c4_db.region == "Miền Bắc - Hải Phòng"


def test_sales_assignments_alternate_endpoint(test_db_session):
    client = TestClient(app)
    env = test_db_session
    admin_header = make_token("Admin", env["admin"].username, env["admin"].id)

    # Gán qua /api/v1/sales-assignments
    resp = client.post(
        "/api/v1/sales-assignments",
        headers=admin_header,
        json={
            "customer_id": env["c1"].id,
            "sales_user_id": env["sales2"].id,
            "region": "Hà Nội - Đống Đa",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["sales_rep_id"] == env["sales2"].id

    # Non-manager role is rejected (403 Forbidden)
    sales_header = make_token("Sales Rep", env["sales1"].username, env["sales1"].id)
    resp_403 = client.post(
        "/api/v1/sales-assignments",
        headers=sales_header,
        json={
            "customer_id": env["c1"].id,
            "sales_user_id": env["sales3"].id,
            "region": "Test",
        },
    )
    assert resp_403.status_code == 403


def test_customer_list_scoping_by_role(test_db_session):
    """Yêu cầu 4:
    - Nếu role là sales, chỉ truy vấn và trả về các đại lý do chính user đó phụ trách.
    - Nếu role là sales_manager hoặc admin, xem được toàn bộ đại lý.
    """
    client = TestClient(app)
    env = test_db_session

    sales1_header = make_token("Sales Rep", env["sales1"].username, env["sales1"].id)
    sales2_header = make_token("Sales Rep", env["sales2"].username, env["sales2"].id)
    mgr_header = make_token("Sales Manager", env["mgr"].username, env["mgr"].id)
    admin_header = make_token("Admin", env["admin"].username, env["admin"].id)

    # sales01 phụ trách c1, c2
    resp1 = client.get("/api/v1/customers", headers=sales1_header)
    assert resp1.status_code == 200
    items1 = resp1.json()
    assert len(items1) == 2
    assert {c["id"] for c in items1} == {env["c1"].id, env["c2"].id}

    # sales02 phụ trách c3
    resp2 = client.get("/api/v1/customers", headers=sales2_header)
    assert resp2.status_code == 200
    items2 = resp2.json()
    assert len(items2) == 1
    assert items2[0]["id"] == env["c3"].id

    # sales_manager xem được toàn bộ 4 đại lý
    resp_mgr = client.get("/api/v1/customers", headers=mgr_header)
    assert resp_mgr.status_code == 200
    assert len(resp_mgr.json()) == 4

    # admin xem được toàn bộ 4 đại lý
    resp_admin = client.get("/api/v1/customers", headers=admin_header)
    assert resp_admin.status_code == 200
    assert len(resp_admin.json()) == 4


def test_bulk_handover_and_history(test_db_session):
    """Yêu cầu 2 & 3:
    - Chuyển giao hàng loạt khi nhân viên nghỉ.
    - Ghi lại bản ghi lịch sử vào bảng handover_history.
    - API Lịch sử chuyển giao trả về đầy đủ thông tin.
    """
    client = TestClient(app)
    env = test_db_session
    mgr_header = make_token("Sales Manager", env["mgr"].username, env["mgr"].id)

    # sales01 đang có c1, c2. Chuyển giao toàn bộ từ sales01 sang sales03
    payload = {
        "from_user_id": env["sales1"].id,
        "to_user_id": env["sales3"].id,
        "customer_ids": None,  # Toàn bộ
        "reason": "Nhân viên sales01 nghỉ việc theo nguyện vọng cá nhân",
        "notes": "Bàn giao hồ sơ công nợ và hợp đồng đại lý",
    }
    resp = client.post("/api/v1/sales/handover/batch", headers=mgr_header, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["customer_count"] == 2
    assert set(data["data"]["customer_ids"]) == {env["c1"].id, env["c2"].id}

    # Kiểm tra trong DB: c1 và c2 đã chuyển sang sales03
    env["db"].expire_all()
    c1_db = env["db"].get(Customer, env["c1"].id)
    c2_db = env["db"].get(Customer, env["c2"].id)
    assert c1_db.sales_rep_id == env["sales3"].id
    assert c2_db.sales_rep_id == env["sales3"].id

    # Kiểm tra Lịch sử chuyển giao (GET /api/v1/sales/handover/history)
    hist_resp = client.get("/api/v1/sales/handover/history", headers=mgr_header)
    assert hist_resp.status_code == 200
    hist_data = hist_resp.json()
    assert hist_data["success"] is True
    assert len(hist_data["data"]) >= 1

    latest = hist_data["data"][0]
    assert latest["from_user_id"] == env["sales1"].id
    assert latest["to_user_id"] == env["sales3"].id
    assert latest["customer_count"] == 2
    assert latest["reason"] == "Nhân viên sales01 nghỉ việc theo nguyện vọng cá nhân"
    assert latest["notes"] == "Bàn giao hồ sơ công nợ và hợp đồng đại lý"
    assert "handover_date" in latest


def test_bulk_handover_validation(test_db_session):
    client = TestClient(app)
    env = test_db_session
    mgr_header = make_token("Sales Manager", env["mgr"].username, env["mgr"].id)

    # from_user_id == to_user_id
    resp_same = client.post(
        "/api/v1/sales/handover/batch",
        headers=mgr_header,
        json={
            "from_user_id": env["sales1"].id,
            "to_user_id": env["sales1"].id,
            "reason": "Self handover error",
        },
    )
    assert resp_same.status_code == 400
    assert "khác" in resp_same.json()["detail"].lower()
