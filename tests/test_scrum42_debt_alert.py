"""Tests for SCRUM-42: Kế toán công nợ có hệ thống tự cảnh báo và khoá bán khi đại lý vượt hạn mức hoặc quá hạn.

Yêu cầu nghiệp vụ (Jira SCRUM-42):
1. Đại lý vượt hạn mức tiền hoặc có khoản quá số ngày nợ cho phép được gắn cờ tự động (is_debt_flagged = True).
2. Đại lý bị gắn cờ thì đơn mới bị chặn hoặc chuyển sang cần duyệt, theo cấu hình (BLOCK vs REQUIRE_APPROVAL).
3. Tác vụ đánh giá lại chạy mỗi ngày một lần (evaluate-all) và chạy lại sau mỗi lần ghi nhận thu tiền.
4. Khi đại lý thanh toán công nợ về dưới hạn mức, cờ cảnh báo được tự động gỡ bỏ.
5. Phân quyền: Kế toán công nợ và Admin có quyền quản lý cấu hình cảnh báo nợ.
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
    DeliveryAddress,
    Inventory,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    RoleCode,
    User,
    Warehouse,
)
from app.api.v1.endpoints.rbac import create_access_token
from app.api.v1.endpoints.debt_limit import (
    evaluate_customer_debt_status,
    evaluate_all_customers_debt_status,
    get_debt_policy,
    set_debt_policy,
)
from backend.main import app


def make_auth_header(role: str = "Accountant", username: str = "acc_user") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum42_env():
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

    # Đặt lại chính sách mặc định là BLOCK
    set_debt_policy("BLOCK")

    with TestingSessionLocal() as db:
        wh = Warehouse(id=1, code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
        db.add(wh)

        p1 = Product(id=1, sku="SKU-DAU-01", name="Dầu Ăn Neptune 1L", base_price=50000.0, base_unit="Chai", status="ACTIVE")
        db.add(p1)
        inv = Inventory(product_id=1, warehouse_id=1, physical_qty=1000.0, reserved_qty=0.0, available_qty=1000.0)
        db.add(inv)

        # Đại lý 1: Vượt hạn mức tiền (nợ 70tr > hạn mức 50tr)
        cust1 = Customer(
            id=1,
            code="DL-VUOT-TIEN",
            name="Đại Lý Minh Hưng",
            phone="0911223344",
            credit_limit=50000000.0,
            current_debt=70000000.0,
            max_debt_days=30,
            oldest_debt_days=10,
            is_active=True,
            is_locked=False,
            warehouse_id=1,
        )
        # Đại lý 2: Quá số ngày nợ cho phép (45 ngày > 30 ngày)
        cust2 = Customer(
            id=2,
            code="DL-QUA-HAN",
            name="Đại Lý Lan Anh",
            phone="0922334455",
            credit_limit=100000000.0,
            current_debt=20000000.0,
            max_debt_days=30,
            oldest_debt_days=45,
            is_active=True,
            is_locked=False,
            warehouse_id=1,
        )
        # Đại lý 3: Bình thường
        cust3 = Customer(
            id=3,
            code="DL-CHUAN",
            name="Đại Lý Hoàng Mai",
            phone="0933445566",
            credit_limit=80000000.0,
            current_debt=10000000.0,
            max_debt_days=30,
            oldest_debt_days=15,
            is_active=True,
            is_locked=False,
            warehouse_id=1,
        )
        db.add_all([cust1, cust2, cust3])

        # Địa chỉ
        addr1 = DeliveryAddress(customer_id=1, receiver_name="Minh", phone="0911223344", address="Hà Nội", is_default=True)
        addr2 = DeliveryAddress(customer_id=2, receiver_name="Lan", phone="0922334455", address="Hà Nội", is_default=True)
        addr3 = DeliveryAddress(customer_id=3, receiver_name="Hoàng", phone="0933445566", address="Hà Nội", is_default=True)
        db.add_all([addr1, addr2, addr3])

        acc_user = User(id=777, username="acc_lead", email="acc@oms.com", full_name="Kế Toán Trưởng", password_hash="hash", is_active=True)
        sales_user = User(id=778, username="sales_lead", email="sales@oms.com", full_name="Trưởng Phòng Kinh Doanh", password_hash="hash", is_active=True)
        db.add_all([acc_user, sales_user])
        db.commit()

    client = TestClient(app)
    yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_evaluate_debt_flags_customer_exceeding_credit_limit(scrum42_env):
    """AC1: Đại lý vượt hạn mức tiền được gắn cờ tự động."""
    client, SessionLocal = scrum42_env
    with SessionLocal() as db:
        res = evaluate_customer_debt_status(db, 1)
        assert res["is_debt_flagged"] is True
        assert "Vượt hạn mức nợ" in res["debt_flag_reason"]

        cust = db.get(Customer, 1)
        assert cust.is_debt_flagged is True
        assert cust.debt_flag_reason is not None


def test_evaluate_debt_flags_customer_overdue_debt_days(scrum42_env):
    """AC1: Đại lý có khoản quá số ngày nợ cho phép được gắn cờ tự động."""
    client, SessionLocal = scrum42_env
    with SessionLocal() as db:
        res = evaluate_customer_debt_status(db, 2)
        assert res["is_debt_flagged"] is True
        assert "Quá hạn số ngày nợ" in res["debt_flag_reason"]

        cust = db.get(Customer, 2)
        assert cust.is_debt_flagged is True
        assert "45 ngày > 30 ngày" in cust.debt_flag_reason


def test_order_creation_blocked_when_debt_policy_is_block(scrum42_env):
    """AC2: Khi cấu hình chính sách là BLOCK -> Chặn tạo đơn mới cho đại lý bị gắn cờ."""
    client, SessionLocal = scrum42_env
    sales_headers = make_auth_header("Sales Rep", "sales_lead")

    # Đảm bảo chính sách là BLOCK
    set_debt_policy("BLOCK")

    payload = {
        "customer_id": 1,  # Đại lý vượt hạn mức
        "items": [{"sku": "SKU-DAU-01", "product_name": "Dầu Ăn", "quantity": 10, "unit_price": 50000.0}],
    }
    res = client.post("/api/v1/orders", json=payload, headers=sales_headers)
    assert res.status_code == 400
    assert "cảnh báo công nợ" in res.json()["detail"].lower()


def test_order_creation_requires_approval_when_debt_policy_is_require_approval(scrum42_env):
    """AC2: Khi cấu hình chính sách là REQUIRE_APPROVAL -> Chuyển đơn sang cần duyệt."""
    client, SessionLocal = scrum42_env
    acc_headers = make_auth_header("Accountant", "acc_lead")
    sales_headers = make_auth_header("Sales Rep", "sales_lead")

    # Kế toán chuyển cấu hình chính sách sang REQUIRE_APPROVAL
    res_cfg = client.put("/api/v1/accounting/debt-config", json={"action": "REQUIRE_APPROVAL"}, headers=acc_headers)
    assert res_cfg.status_code == 200
    assert res_cfg.json()["data"]["action"] == "REQUIRE_APPROVAL"

    payload = {
        "customer_id": 1,  # Đại lý đang bị nợ
        "items": [{"sku": "SKU-DAU-01", "product_name": "Dầu Ăn", "quantity": 10, "unit_price": 50000.0}],
    }
    res = client.post("/api/v1/orders", json=payload, headers=sales_headers)
    assert res.status_code == 201
    order_data = res.json()
    # Trạng thái bắt buộc phải là PENDING (hoặc PENDING_APPROVAL) để Quản lý duyệt
    assert order_data["status"] in ("PENDING", "PENDING_APPROVAL")
    assert "Cảnh báo công nợ" in (order_data.get("approval_reason") or "")


def test_evaluate_all_debts_daily_task(scrum42_env):
    """AC3: Tác vụ đánh giá lại chạy định kỳ (evaluate-all) quét toàn bộ đại lý."""
    client, SessionLocal = scrum42_env
    acc_headers = make_auth_header("Accountant", "acc_lead")

    res = client.post("/api/v1/accounting/debt/evaluate-all", headers=acc_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_evaluated"] == 3
    assert data["flagged_count"] == 2  # DL-VUOT-TIEN và DL-QUA-HAN
    assert data["clean_count"] == 1    # DL-CHUAN


def test_payment_recording_reduces_debt_and_clears_flag(scrum42_env):
    """AC3 & AC4: Chạy lại đánh giá sau khi ghi nhận thu tiền; tự động gỡ cờ khi hết nợ."""
    client, SessionLocal = scrum42_env
    acc_headers = make_auth_header("Accountant", "acc_lead")

    # Ban đầu đại lý 1 nợ 70tr / hạn mức 50tr -> đang bị gắn cờ
    with SessionLocal() as db:
        evaluate_customer_debt_status(db, 1)
        db.commit()
        cust = db.get(Customer, 1)
        assert cust.is_debt_flagged is True

    # Thu tiền 30,000,000 VND -> nợ còn 40tr (< hạn mức 50tr)
    payment_payload = {
        "customer_id": 1,
        "amount": 30000000.0,
        "payment_method": "BANK_TRANSFER",
        "payment_date": "2026-10-18",
        "invoice_ids": [],
    }
    res_pay = client.post("/api/v1/payments", json=payment_payload, headers=acc_headers)
    assert res_pay.status_code == 201

    # Kiểm tra lại: Đại lý 1 đã được gỡ cờ tự động
    with SessionLocal() as db:
        cust = db.get(Customer, 1)
        assert cust.current_debt == 40000000.0
        assert cust.is_debt_flagged is False
        assert cust.debt_flag_reason is None


def test_unauthorized_role_cannot_update_debt_policy(scrum42_env):
    """Phân quyền: Sales Rep không được phép sửa chính sách nợ của hệ thống."""
    client, SessionLocal = scrum42_env
    sales_headers = make_auth_header("Sales Rep", "sales_lead")

    res = client.put("/api/v1/accounting/debt-config", json={"action": "REQUIRE_APPROVAL"}, headers=sales_headers)
    assert res.status_code == 403
