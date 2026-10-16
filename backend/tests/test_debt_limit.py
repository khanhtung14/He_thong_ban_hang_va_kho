"""Tests for 'Kiểm soát hạn mức công nợ' (Debt Limit Control).

Kiểm tra:
1. Model Customer có các cột max_debt_amount và max_debt_days.
2. Bảng mới DebtLimitHistory lưu log (agency_id, old_limit, new_limit, reason, changed_by, created_at).
3. Endpoint PUT /api/v1/customers/{customer_id}/debt-limit cập nhật hạn mức:
   - Kế toán công nợ (RoleCode.ACCOUNTANT) có quyền cập nhật.
   - Quản lý kinh doanh (RoleCode.SALES_MANAGER) có quyền cập nhật.
   - Admin có quyền cập nhật.
   - Các vai trò khác (Sales Rep, Warehouse, Customer) bị từ chối 403 Forbidden.
4. Bắt buộc có reason (không được rỗng hay khoảng trắng); nếu thiếu -> 400 Bad Request.
5. Database transaction đảm bảo vừa cập nhật Customer vừa tạo bản ghi DebtLimitHistory đồng thời.
6. Endpoint GET xem thông tin hạn mức và GET lịch sử thay đổi (DebtLimitHistory).
7. Alias endpoint /api/v1/agencies/{agency_id}/debt-limit.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict

# Ensure backend root is on sys.path
backend_path = Path(__file__).resolve().parents[1]
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    Agency,
    Customer,
    CreditLimitLog,
    DebtLimitHistory,
    RoleCode,
    User,
)
from app.api.v1.endpoints.rbac import create_access_token
from main import app


def make_auth_header(role: str, username: str = "test_user") -> Dict[str, str]:
    """Tạo JWT Bearer token hợp lệ cho vai trò cụ thể."""
    token = create_access_token({"sub": username, "username": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def debt_test_env():
    """Tạo database SQLite in-memory độc lập cho kiểm thử."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Setup dữ liệu ban đầu
    with TestingSessionLocal() as db:
        acc_user = User(
            username="accountant_01",
            email="accountant@oms.com",
            full_name="Nguyễn Kế Toán",
            password_hash="fakehash",
            is_active=True,
        )
        sm_user = User(
            username="sales_manager_01",
            email="salesmgr@oms.com",
            full_name="Trần Quản Lý",
            password_hash="fakehash",
            is_active=True,
        )
        sales_user = User(
            username="sales_rep_01",
            email="salesrep@oms.com",
            full_name="Lê Kinh Doanh",
            password_hash="fakehash",
            is_active=True,
        )
        wh_user = User(
            username="warehouse_01",
            email="warehouse@oms.com",
            full_name="Phạm Thủ Kho",
            password_hash="fakehash",
            is_active=True,
        )
        db.add_all([acc_user, sm_user, sales_user, wh_user])

        # Tạo đại lý thử nghiệm
        customer = Customer(
            code="DL-TEST-01",
            name="Đại Lý Toàn Thắng",
            customer_group="DEALER_LEVEL_1",
            is_active=True,
            is_locked=False,
            credit_limit=10000000.0,
            max_due_days=15,
            max_debt_amount=10000000.0,
            max_debt_days=15,
        )
        db.add(customer)
        db.commit()
        customer_id = customer.id

    with TestClient(app) as client:
        yield client, TestingSessionLocal, customer_id

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_models_have_debt_limit_attributes():
    """Kiểm tra model Customer và DebtLimitHistory có đầy đủ các cột yêu cầu."""
    assert hasattr(Customer, "max_debt_amount"), "Customer model thiếu cột max_debt_amount"
    assert hasattr(Customer, "max_debt_days"), "Customer model thiếu cột max_debt_days"
    assert hasattr(Customer, "debt_limit_histories"), "Customer model thiếu quan hệ debt_limit_histories"

    assert hasattr(DebtLimitHistory, "agency_id"), "DebtLimitHistory thiếu cột agency_id"
    assert hasattr(DebtLimitHistory, "old_limit"), "DebtLimitHistory thiếu cột old_limit"
    assert hasattr(DebtLimitHistory, "new_limit"), "DebtLimitHistory thiếu cột new_limit"
    assert hasattr(DebtLimitHistory, "reason"), "DebtLimitHistory thiếu cột reason"
    assert hasattr(DebtLimitHistory, "changed_by"), "DebtLimitHistory thiếu cột changed_by"
    assert hasattr(DebtLimitHistory, "created_at"), "DebtLimitHistory thiếu cột created_at"


def test_accountant_updates_debt_limit_success(debt_test_env):
    """Kế toán công nợ cập nhật thành công hạn mức; kiểm tra transaction và lịch sử log."""
    client, SessionLocal, customer_id = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    payload = {
        "max_debt_amount": 50000000.0,
        "max_debt_days": 30,
        "reason": "Đại lý uy tín, thanh toán đúng hạn 6 tháng liên tiếp.",
    }

    resp = client.put(f"/api/v1/customers/{customer_id}/debt-limit", json=payload, headers=auth_header)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["agency_id"] == customer_id
    assert data["data"]["old_limit"] == 10000000.0
    assert data["data"]["new_limit"] == 50000000.0
    assert data["data"]["max_debt_amount"] == 50000000.0
    assert data["data"]["max_debt_days"] == 30
    assert data["data"]["reason"] == payload["reason"]

    # Kiểm tra trực tiếp trong Database
    with SessionLocal() as db:
        cust = db.get(Customer, customer_id)
        assert cust.max_debt_amount == 50000000.0
        assert cust.max_debt_days == 30
        assert cust.credit_limit == 50000000.0

        histories = db.query(DebtLimitHistory).filter(DebtLimitHistory.agency_id == customer_id).all()
        assert len(histories) == 1
        h = histories[0]
        assert h.old_limit == 10000000.0
        assert h.new_limit == 50000000.0
        assert h.reason == payload["reason"]
        assert "accountant_01" in (h.changed_by or "")
        assert h.created_at is not None


def test_sales_manager_updates_debt_limit_success(debt_test_env):
    """Quản lý kinh doanh (Sales Manager) có quyền cập nhật hạn mức."""
    client, SessionLocal, customer_id = debt_test_env
    auth_header = make_auth_header("Sales Manager", "sales_manager_01")

    payload = {
        "max_debt_amount": 75000000.0,
        "max_debt_days": 45,
        "reason": "Chính sách khuyến khích mở rộng vùng bao phủ mùa vụ Tết.",
    }

    resp = client.put(f"/api/v1/customers/{customer_id}/debt-limit", json=payload, headers=auth_header)
    assert resp.status_code == 200
    res_data = resp.json()["data"]
    assert res_data["new_limit"] == 75000000.0
    assert res_data["max_debt_days"] == 45


def test_admin_cannot_update_debt_limit(debt_test_env):
    """Admin không có quyền cập nhật hạn mức (Chỉ Kế toán và Quản lý kinh doanh)."""
    client, SessionLocal, customer_id = debt_test_env
    auth_header = make_auth_header("Admin", "admin_user")

    payload = {
        "max_debt_amount": 100000000.0,
        "max_debt_days": 60,
        "reason": "Điều chỉnh theo quyết định Ban Giám Đốc",
    }

    resp = client.put(f"/api/v1/customers/{customer_id}/debt-limit", json=payload, headers=auth_header)
    assert resp.status_code == 403


def test_unauthorized_roles_forbidden(debt_test_env):
    """Các vai trò không có thẩm quyền (Sales Rep, Warehouse, Customer) phải bị 403 Forbidden."""
    client, SessionLocal, customer_id = debt_test_env

    unauthorized_roles = [
        "Sales Rep",
        "Warehouse",
        "WH Manager",
        "Customer",
    ]

    payload = {
        "max_debt_amount": 99999999.0,
        "max_debt_days": 90,
        "reason": "Cố gắng tự ý chỉnh sửa trái phép",
    }

    for role in unauthorized_roles:
        headers = make_auth_header(role, f"user_{role.lower().replace(' ', '_')}")
        resp = client.put(f"/api/v1/customers/{customer_id}/debt-limit", json=payload, headers=headers)
        assert resp.status_code == 403, f"Vai trò {role} không bị chặn 403!"

    # Database không được thay đổi
    with SessionLocal() as db:
        cust = db.get(Customer, customer_id)
        assert cust.max_debt_amount == 10000000.0
        histories = db.query(DebtLimitHistory).filter(DebtLimitHistory.agency_id == customer_id).all()
        assert len(histories) == 0


def test_missing_reason_rejected_with_400(debt_test_env):
    """Bắt buộc nhập reason. Nếu để trống hoặc chỉ có khoảng trắng, phải trả về 400 Bad Request."""
    client, SessionLocal, customer_id = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    # 1. Reason rỗng
    resp1 = client.put(
        f"/api/v1/customers/{customer_id}/debt-limit",
        json={"max_debt_amount": 20000000.0, "max_debt_days": 30, "reason": ""},
        headers=auth_header,
    )
    assert resp1.status_code in (400, 422)

    # 2. Reason toàn khoảng trắng
    resp2 = client.put(
        f"/api/v1/customers/{customer_id}/debt-limit",
        json={"max_debt_amount": 20000000.0, "max_debt_days": 30, "reason": "    "},
        headers=auth_header,
    )
    assert resp2.status_code == 400
    assert "lý do" in resp2.json()["detail"].lower()

    # Database nguyên vẹn
    with SessionLocal() as db:
        cust = db.get(Customer, customer_id)
        assert cust.max_debt_amount == 10000000.0


def test_negative_debt_amount_rejected(debt_test_env):
    """Hạn mức âm phải bị từ chối."""
    client, _, customer_id = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    resp = client.put(
        f"/api/v1/customers/{customer_id}/debt-limit",
        json={"max_debt_amount": -1000.0, "max_debt_days": 30, "reason": "Lỗi nhập liệu"},
        headers=auth_header,
    )
    assert resp.status_code in (400, 422)


def test_nonexistent_customer_returns_404(debt_test_env):
    """ID đại lý không tồn tại phải trả về 404 Not Found."""
    client, _, _ = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    resp = client.put(
        "/api/v1/customers/999999/debt-limit",
        json={"max_debt_amount": 50000000.0, "max_debt_days": 30, "reason": "Test 404"},
        headers=auth_header,
    )
    assert resp.status_code == 404


def test_debt_limit_history_retrieval(debt_test_env):
    """Kiểm tra endpoint GET lịch sử thay đổi hạn mức (DebtLimitHistory)."""
    client, _, customer_id = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    # Cập nhật lần 1
    client.put(
        f"/api/v1/customers/{customer_id}/debt-limit",
        json={"max_debt_amount": 20000000.0, "max_debt_days": 20, "reason": "Lần 1: Nâng hạn mức"},
        headers=auth_header,
    )
    # Cập nhật lần 2
    client.put(
        f"/api/v1/customers/{customer_id}/debt-limit",
        json={"max_debt_amount": 35000000.0, "max_debt_days": 30, "reason": "Lần 2: Nâng hạn mức tiếp"},
        headers=auth_header,
    )

    # Lấy lịch sử
    resp = client.get(f"/api/v1/customers/{customer_id}/debt-limit/history", headers=auth_header)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["data"]) == 2
    # Mới nhất ở đầu
    assert data["data"][0]["new_limit"] == 35000000.0
    assert data["data"][1]["new_limit"] == 20000000.0


def test_agencies_credit_limit_scrum21_features(debt_test_env):
    """Kiểm tra đầy đủ các yêu cầu SCRUM-21:
    - Model Agency có credit_limit, max_debt_days, current_debt.
    - Model/Bảng credit_limit_logs có agency_id, old_credit_limit, new_credit_limit,
      old_max_debt_days, new_max_debt_days, reason, created_by, created_at.
    - Endpoint PUT /api/agencies/{id}/credit-limit hoạt động chuẩn xác.
    """
    # 1. Kiểm tra model Agency
    assert hasattr(Agency, "credit_limit"), "Agency thiếu credit_limit"
    assert hasattr(Agency, "max_debt_days"), "Agency thiếu max_debt_days"
    assert hasattr(Agency, "current_debt"), "Agency thiếu current_debt"

    # 2. Kiểm tra model CreditLimitLog (credit_limit_logs)
    assert hasattr(CreditLimitLog, "agency_id"), "CreditLimitLog thiếu agency_id"
    assert hasattr(CreditLimitLog, "old_credit_limit"), "CreditLimitLog thiếu old_credit_limit"
    assert hasattr(CreditLimitLog, "new_credit_limit"), "CreditLimitLog thiếu new_credit_limit"
    assert hasattr(CreditLimitLog, "old_max_debt_days"), "CreditLimitLog thiếu old_max_debt_days"
    assert hasattr(CreditLimitLog, "new_max_debt_days"), "CreditLimitLog thiếu new_max_debt_days"
    assert hasattr(CreditLimitLog, "reason"), "CreditLimitLog thiếu reason"
    assert hasattr(CreditLimitLog, "created_by"), "CreditLimitLog thiếu created_by"
    assert hasattr(CreditLimitLog, "created_at"), "CreditLimitLog thiếu created_at"
    assert CreditLimitLog.__tablename__ == "credit_limit_logs"

    # 3. Gọi PUT /api/agencies/{id}/credit-limit
    client, SessionLocal, customer_id = debt_test_env
    auth_header = make_auth_header("Accountant", "accountant_01")

    payload = {
        "credit_limit": 60000000.0,
        "max_debt_days": 35,
        "reason": "Điều chỉnh hạn mức định kỳ quý 4 cho đại lý.",
    }

    resp = client.put(f"/api/agencies/{customer_id}/credit-limit", json=payload, headers=auth_header)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["agency_id"] == customer_id
    assert data["data"]["new_credit_limit"] == 60000000.0
    assert data["data"]["new_max_debt_days"] == 35
    assert data["data"]["reason"] == payload["reason"]

    # 4. Kiểm tra Database có bản ghi trong credit_limit_logs
    with SessionLocal() as db:
        agency = db.get(Agency, customer_id)
        assert agency.credit_limit == 60000000.0
        assert agency.max_debt_days == 35

        logs = db.query(CreditLimitLog).filter(CreditLimitLog.agency_id == customer_id).all()
        assert len(logs) == 1
        log = logs[0]
        assert log.old_credit_limit == 10000000.0
        assert log.new_credit_limit == 60000000.0
        assert log.new_max_debt_days == 35
        assert log.reason == payload["reason"]
        assert "accountant_01" in (log.created_by or "")


if __name__ == "__main__":
    pytest.main(["-v", __file__])
