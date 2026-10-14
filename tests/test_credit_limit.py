import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import Base, Customer, CreditLimitLog, RoleCode
from app.api.v1.endpoints.rbac import create_access_token
from main import app

# Shared in-memory test database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    # Create test customer
    customer = Customer(
        code="DL-TEST-001",
        name="Đại lý Test 1",
        credit_limit=50000000.0,
        max_due_days=30,
        max_debt_days=30,
        warning_threshold_percent=80.0,
        warning_threshold=80.0,
    )
    db.add(customer)
    db.commit()
    yield
    db.close()
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


def test_update_credit_limit_as_accountant():
    token = create_access_token(
        data={"sub": "1", "username": "accountant_user", "role": "Accountant", "fullName": "Nguyễn Kế Toán"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "new_credit_limit": 120000000.0,
        "new_max_debt_days": 45,
        "reason": "Mở rộng kinh doanh quý 4",
    }
    response = client.put("/api/v1/customers/1/credit-limit", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["credit_limit"] == 120000000.0
    assert res_data["data"]["max_debt_days"] == 45
    assert res_data["data"]["log"]["old_credit_limit"] == 50000000.0
    assert res_data["data"]["log"]["new_credit_limit"] == 120000000.0
    assert res_data["data"]["log"]["old_max_debt_days"] == 30
    assert res_data["data"]["log"]["new_max_debt_days"] == 45
    assert res_data["data"]["log"]["reason"] == "Mở rộng kinh doanh quý 4"
    assert res_data["data"]["log"]["changed_by_name"] == "Nguyễn Kế Toán"


def test_update_credit_limit_as_sales_manager():
    token = create_access_token(
        data={"sub": "2", "username": "manager_user", "role": "Sales Manager", "fullName": "Trần Quản Lý"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "new_credit_limit": 80000000.0,
        "new_max_debt_days": 35,
        "reason": "Điều chỉnh hạn mức định kỳ",
    }
    response = client.put("/api/v1/customers/1/credit-limit", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["credit_limit"] == 80000000.0


def test_update_credit_limit_forbidden_for_sales_rep():
    token = create_access_token(
        data={"sub": "3", "username": "rep_user", "role": "Sales Rep", "fullName": "Lê Nhân Viên"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "new_credit_limit": 90000000.0,
        "new_max_debt_days": 30,
        "reason": "Tự ý tăng hạn mức",
    }
    response = client.put("/api/v1/customers/1/credit-limit", json=payload, headers=headers)
    assert response.status_code == 403


def test_credit_limit_logs_history():
    token = create_access_token(
        data={"sub": "1", "username": "accountant_user", "role": "Accountant", "fullName": "Nguyễn Kế Toán"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1st update
    client.put(
        "/api/v1/customers/1/credit-limit",
        json={"new_credit_limit": 70000000.0, "new_max_debt_days": 35, "reason": "Lần 1"},
        headers=headers,
    )
    # 2nd update
    client.put(
        "/api/v1/customers/1/credit-limit",
        json={"new_credit_limit": 90000000.0, "new_max_debt_days": 40, "reason": "Lần 2"},
        headers=headers,
    )

    # Get logs
    res_logs = client.get("/api/v1/customers/1/credit-limit-logs", headers=headers)
    assert res_logs.status_code == 200, res_logs.text
    logs_data = res_logs.json()
    assert logs_data["success"] is True
    assert len(logs_data["data"]) == 2
    # Newest first
    assert logs_data["data"][0]["reason"] == "Lần 2"
    assert logs_data["data"][0]["new_credit_limit"] == 90000000.0
    assert logs_data["data"][1]["reason"] == "Lần 1"
    assert logs_data["data"][1]["new_credit_limit"] == 70000000.0
    # Check that created_at has timezone information
    assert logs_data["data"][0]["created_at"] is not None
    assert "+" in logs_data["data"][0]["created_at"] or "Z" in logs_data["data"][0]["created_at"]


def test_update_credit_limit_negative_value_rejected():
    token = create_access_token(
        data={"sub": "1", "username": "accountant_user", "role": "Accountant", "fullName": "Nguyễn Kế Toán"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Negative credit limit
    res1 = client.put(
        "/api/v1/customers/1/credit-limit",
        json={"new_credit_limit": -50000.0, "new_max_debt_days": 30, "reason": "Hạn mức âm"},
        headers=headers,
    )
    assert res1.status_code == 422

    # Negative max debt days
    res2 = client.put(
        "/api/v1/customers/1/credit-limit",
        json={"new_credit_limit": 50000000.0, "new_max_debt_days": -5, "reason": "Ngày nợ âm"},
        headers=headers,
    )
    assert res2.status_code == 422


def test_update_credit_limit_identical_values_rejected():
    token = create_access_token(
        data={"sub": "1", "username": "accountant_user", "role": "Accountant", "fullName": "Nguyễn Kế Toán"}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Customer 1 starts with credit_limit=50,000,000 and max_due_days=30
    res = client.put(
        "/api/v1/customers/1/credit-limit",
        json={"new_credit_limit": 50000000.0, "new_max_debt_days": 30, "reason": "Không thay đổi gì"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Hạn mức tiền hoặc số ngày nợ mới phải khác với giá trị hiện tại." in res.json()["detail"]
