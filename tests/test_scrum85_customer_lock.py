"""Tests for SCRUM-85:
Khóa hoặc mở giao dịch với đại lý cho Kế toán công nợ.

Kiểm tra:
1. Trường is_locked và lock_reason trong model Customer.
2. Endpoint khóa đại lý:
   - Kế toán (RoleCode.ACCOUNTANT) hoặc Admin có quyền khóa.
   - Bắt buộc nhập lý do khóa (reason không được rỗng).
3. Endpoint mở khóa đại lý:
   - Kế toán / Admin mở khóa thành công, xóa lock_reason.
   - Các vai trò không có quyền (Sales Rep, Warehouse) bị 403 Forbidden.
4. Kiểm tra tại API tạo đơn hàng mới:
   - Đại lý chưa bị khóa (is_locked == False): Tạo đơn bình thường.
   - Đại lý đang bị khóa (is_locked == True): Chặn tạo đơn, trả về 400 Bad Request và nêu rõ lý do.
5. Cảnh báo đối với các đơn hàng dở dang (DRAFT, PENDING, PROCESSING):
   - Khi đại lý bị khóa, đơn hàng dở dang hiển thị has_warning = True kèm warning_message.
   - Đơn dở dang vẫn cho phép xử lý/cập nhật trạng thái tiếp tục nhưng có thông tin cảnh báo.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import Base, Customer, Order, OrderItem, OrderStatus, Role, RoleCode, User
from src.backend.rbac import create_access_token


def make_auth_header(role: str, username: str = "test_user") -> dict[str, str]:
    """Tạo JWT Bearer Authorization header hợp lệ."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum85_env():
    # SQLite in-memory test database
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

    # Setup basic test data
    with TestingSessionLocal() as db:
        acc_user = User(
            username="accountant_user",
            email="accountant@oms.com",
            full_name="Kế Toán Viên",
            password_hash="fakehash",
            is_active=True,
        )
        sales_user = User(
            username="sales_user",
            email="sales@oms.com",
            full_name="Nhân Viên Kinh Doanh",
            password_hash="fakehash",
            is_active=True,
        )
        db.add_all([acc_user, sales_user])

        # Create customer
        cust1 = Customer(
            code="DL-001",
            name="Đại Lý Phước Hưng",
            is_active=True,
            is_locked=False,
        )
        cust2 = Customer(
            code="DL-002",
            name="Đại Lý Tuấn Kiệt",
            is_active=True,
            is_locked=False,
        )
        db.add_all([cust1, cust2])
        db.commit()

    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_customer_model_locked_fields(scrum85_env):
    """Yêu cầu 1: Kiểm tra trường is_locked và lock_reason trên model Customer."""
    client, SessionLocal = scrum85_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-001").first()
        assert cust is not None
        assert hasattr(cust, "is_locked")
        assert hasattr(cust, "lock_reason")
        assert hasattr(cust, "locked_at")
        assert hasattr(cust, "locked_by_id")
        assert cust.is_locked is False
        assert cust.lock_reason is None


def test_lock_customer_requires_reason(scrum85_env):
    """Yêu cầu 2: Bắt buộc nhập lý do khi khóa đại lý."""
    client, _ = scrum85_env
    acc_headers = make_auth_header(RoleCode.ACCOUNTANT.value, "accountant_user")

    # Không truyền reason hoặc reason rỗng
    res_empty = client.post(
        "/api/v1/customers/1/lock",
        json={"reason": "   "},
        headers=acc_headers,
    )
    assert res_empty.status_code == 400
    assert "Bắt buộc phải nhập lý do" in res_empty.json()["detail"]


def test_lock_and_unlock_customer_success(scrum85_env):
    """Yêu cầu 2: Kế toán khóa và mở khóa đại lý thành công."""
    client, SessionLocal = scrum85_env
    acc_headers = make_auth_header(RoleCode.ACCOUNTANT.value, "accountant_user")

    # Khóa đại lý DL-001
    lock_res = client.post(
        "/api/v1/customers/1/lock",
        json={"reason": "Nợ quá hạn 45 ngày vượt trần công nợ 50 triệu."},
        headers=acc_headers,
    )
    assert lock_res.status_code == 200
    data = lock_res.json()
    assert data["is_locked"] is True
    assert data["lock_reason"] == "Nợ quá hạn 45 ngày vượt trần công nợ 50 triệu."
    assert data["locked_at"] is not None

    # Mở khóa đại lý DL-001
    unlock_res = client.post(
        "/api/v1/customers/1/unlock",
        headers=acc_headers,
    )
    assert unlock_res.status_code == 200
    data_unlock = unlock_res.json()
    assert data_unlock["is_locked"] is False
    assert data_unlock["lock_reason"] is None


def test_unauthorized_role_cannot_lock_customer(scrum85_env):
    """Yêu cầu 2: Quyền hạn - Sales Rep không có quyền khóa đại lý."""
    client, _ = scrum85_env
    sales_headers = make_auth_header(RoleCode.SALES_REP.value, "sales_user")

    res = client.post(
        "/api/v1/customers/1/lock",
        json={"reason": "Nợ xấu"},
        headers=sales_headers,
    )
    # RBAC chặn 403 Forbidden
    assert res.status_code == 403


def test_block_create_order_when_customer_locked(scrum85_env):
    """Yêu cầu 3: Chặn tạo đơn hàng mới khi đại lý có is_locked == True."""
    client, SessionLocal = scrum85_env
    sales_headers = make_auth_header(RoleCode.SALES_REP.value, "sales_user")

    order_payload = {
        "customer_id": 1,
        "items": [
            {"sku": "SKU-001", "product_name": "Ống nhựa Tiền Phong", "quantity": 10, "unit_price": 50000}
        ],
        "note": "Giao gấp buổi sáng",
    }

    # 1. Đại lý chưa bị khóa: Tạo đơn thành công
    res_ok = client.post("/api/v1/orders", json=order_payload, headers=sales_headers)
    assert res_ok.status_code == 201
    order_data = res_ok.json()
    assert order_data["status"] == "DRAFT"
    assert order_data["total_amount"] == 500000

    # 2. Khóa đại lý DL-001
    with SessionLocal() as db:
        cust = db.get(Customer, 1)
        cust.is_locked = True
        cust.lock_reason = "Có nguy cơ mất khả năng thanh toán"
        db.commit()

    # 3. Thử tạo đơn hàng mới cho đại lý đã bị khóa -> BỊ CHẶN 400 Bad Request
    res_blocked = client.post("/api/v1/orders", json=order_payload, headers=sales_headers)
    assert res_blocked.status_code == 400
    detail = res_blocked.json()["detail"]
    assert "đã bị khóa giao dịch" in detail
    assert "không thể tạo đơn hàng mới" in detail
    assert "Có nguy cơ mất khả năng thanh toán" in detail


def test_warning_on_incomplete_orders_of_locked_customer(scrum85_env):
    """Yêu cầu 4: Hiển thị cảnh báo đối với các đơn hàng dở dang của đại lý đang bị khóa."""
    client, SessionLocal = scrum85_env
    sales_headers = make_auth_header(RoleCode.SALES_REP.value, "sales_user")

    # Tạo 1 đơn hàng dở dang (DRAFT) và 1 đơn đã hoàn tất (COMPLETED) trước khi bị khóa
    with SessionLocal() as db:
        draft_order = Order(
            order_code="ORD-DRAFT-01",
            customer_id=1,
            status=OrderStatus.DRAFT,
            total_amount=1000000,
        )
        completed_order = Order(
            order_code="ORD-DONE-01",
            customer_id=1,
            status=OrderStatus.COMPLETED,
            total_amount=5000000,
        )
        db.add_all([draft_order, completed_order])
        db.commit()
        draft_id = draft_order.id
        done_id = completed_order.id

    # Trước khi khóa: không có cảnh báo
    res_draft_pre = client.get(f"/api/v1/orders/{draft_id}")
    assert res_draft_pre.status_code == 200
    assert res_draft_pre.json()["has_warning"] is False

    # Tiến hành khóa đại lý
    with SessionLocal() as db:
        cust = db.get(Customer, 1)
        cust.is_locked = True
        cust.lock_reason = "Đang rà soát công nợ xấu"
        db.commit()

    # Sau khi khóa:
    # 1. Đơn dở dang (DRAFT) PHẢI CÓ CẢNH BÁO
    res_draft_post = client.get(f"/api/v1/orders/{draft_id}")
    assert res_draft_post.status_code == 200
    draft_data = res_draft_post.json()
    assert draft_data["has_warning"] is True
    assert "CẢNH BÁO" in draft_data["warning_message"]
    assert "KHÓA GIAO DỊCH" in draft_data["warning_message"]
    assert "Đang rà soát công nợ xấu" in draft_data["warning_message"]

    # 2. Đơn đã hoàn tất (COMPLETED) KHÔNG có cảnh báo dở dang
    res_done = client.get(f"/api/v1/orders/{done_id}")
    assert res_done.status_code == 200
    assert res_done.json()["has_warning"] is False

    # 3. Đơn dở dang vẫn cho phép xử lý tiếp trạng thái nhưng vẫn duy trì cảnh báo
    res_update = client.put(
        f"/api/v1/orders/{draft_id}/status?new_status=PROCESSING",
        headers=sales_headers,
    )
    assert res_update.status_code == 200
    updated_data = res_update.json()
    assert updated_data["status"] == "PROCESSING"
    assert updated_data["has_warning"] is True
    assert "CẢNH BÁO" in updated_data["warning_message"]
