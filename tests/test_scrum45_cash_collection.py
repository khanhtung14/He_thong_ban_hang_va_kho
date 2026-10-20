"""Tests for User Story SCRUM-45 (Epic SCRUM-89):
Cash collection along routes, accountant confirmation, and reconciliation report.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
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
    CustomerDebt,
    Invoice,
    InvoicePayment,
    Payment,
    Role,
    User,
)
from src.backend.rbac import AuthenticatedUser, create_access_token, get_current_user


@pytest.fixture
def collection_db_session():
    """Create an isolated in-memory SQLite database session for cash collection tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def client_factory(collection_db_session):
    """Factory to generate TestClients with specific user roles and IDs."""
    def override_get_db():
        yield collection_db_session

    app.dependency_overrides[get_db] = override_get_db

    def _create_client(user_id: int, username: str, role: str):
        token = create_access_token({
            "sub": username,
            "username": username,
            "role": role,
            "user_id": user_id,
            "id": user_id,
            "full_name": f"User {username}",
        })
        client = TestClient(app)
        client.headers.update({"Authorization": f"Bearer {token}"})
        return client

    yield _create_client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def _seed_basic_data(db):
    """Seed test sales reps, accountant, and customers."""
    sales_rep_1 = User(
        id=10,
        username="sales_rep_1",
        email="rep1@domain.com",
        full_name="Nguyễn Văn Tuyến",
        password_hash="hashed_test_password",
        status="ACTIVE",
    )
    sales_rep_2 = User(
        id=20,
        username="sales_rep_2",
        email="rep2@domain.com",
        full_name="Trần Thị Tuyến",
        password_hash="hashed_test_password",
        status="ACTIVE",
    )
    accountant_user = User(
        id=30,
        username="accountant_01",
        email="kt@domain.com",
        full_name="Lê Kế Toán",
        password_hash="hashed_test_password",
        status="ACTIVE",
    )
    customer_1 = Customer(
        id=101,
        code="DL-001",
        name="Đại lý Tạp Hóa An Nhiên",
        phone="0911222333",
        current_debt=20_000_000.0,
        is_active=True,
    )
    customer_2 = Customer(
        id=102,
        code="DL-002",
        name="Đại lý Bách Hóa Cầu Giấy",
        phone="0922333444",
        current_debt=15_000_000.0,
        is_active=True,
    )
    db.add_all([sales_rep_1, sales_rep_2, accountant_user, customer_1, customer_2])
    db.commit()
    return sales_rep_1, sales_rep_2, accountant_user, customer_1, customer_2


# ============================================================================
# 1. Ghi nhận khoản thu tại cửa hàng/đại lý kèm ảnh biên lai
# ============================================================================

def test_sales_rep_can_create_payment_with_receipt_image(client_factory, collection_db_session):
    """NVKD tạo phiếu thu tiền kèm ảnh biên lai đối soát, mặc định ở trạng thái Chờ nộp."""
    rep1, _, _, cust1, _ = _seed_basic_data(collection_db_session)
    client = client_factory(rep1.id, rep1.username, "Sales Rep")

    payload = {
        "customerId": cust1.id,
        "amount": 5_000_000.0,
        "paymentMethod": "CASH",
        "paymentDate": "2026-10-20",
        "receiptImage": "https://cdn.domain.com/receipts/bien_lai_001.jpg",
        "note": "Thu tiền mặt đơn hàng đợt 1 theo tuyến Cầu Giấy",
    }
    response = client.post("/api/v1/payments", json=payload)
    assert response.status_code == 201
    res_data = response.json()["data"]

    assert res_data["customerId"] == cust1.id
    assert res_data["amount"] == 5_000_000.0
    assert res_data["paymentMethod"] == "CASH"
    assert res_data["paymentDate"] == "2026-10-20"
    assert res_data["receiptImage"] == "https://cdn.domain.com/receipts/bien_lai_001.jpg"
    assert res_data["status"] == "PENDING_SUBMISSION"
    assert res_data["salesId"] == rep1.id  # Tự động gán NVKD đăng nhập


def test_create_payment_validation_errors(client_factory, collection_db_session):
    """Kiểm tra validation khi tạo phiếu thu: thiếu khách hàng hoặc số tiền <= 0."""
    rep1, _, _, cust1, _ = _seed_basic_data(collection_db_session)
    client = client_factory(rep1.id, rep1.username, "Sales Rep")

    # Số tiền <= 0
    res1 = client.post("/api/v1/payments", json={"customerId": cust1.id, "amount": 0})
    assert res1.status_code == 422

    # Không tìm thấy khách hàng
    res2 = client.post("/api/v1/payments", json={"customerId": 99999, "amount": 1_000_000})
    assert res2.status_code == 404
    assert "không tìm thấy" in res2.json()["detail"].lower()


# ============================================================================
# 2. Quản lý trạng thái và xác nhận từ Kế toán
# ============================================================================

def test_sales_rep_cannot_confirm_payment_blocked_403(client_factory, collection_db_session):
    """Ràng buộc phân quyền: NVKD KHÔNG được tự ý duyệt xác nhận tiền đã nộp (bị chặn 403)."""
    rep1, _, _, cust1, _ = _seed_basic_data(collection_db_session)
    sales_client = client_factory(rep1.id, rep1.username, "Sales Rep")

    # Tạo phiếu thu
    create_res = sales_client.post(
        "/api/v1/payments",
        json={"customerId": cust1.id, "amount": 2_000_000.0, "paymentMethod": "CASH"},
    )
    assert create_res.status_code == 201
    payment_id = create_res.json()["data"]["id"]

    # NVKD cố tình gọi API xác nhận
    confirm_res = sales_client.post(f"/api/v1/payments/{payment_id}/confirm")
    assert confirm_res.status_code == 403
    assert "chỉ kế toán hoặc quản trị viên" in confirm_res.json()["detail"].lower()


def test_accountant_can_confirm_payment_and_deducts_debt(client_factory, collection_db_session):
    """Kế toán xác nhận nhận tiền: Chuyển sang Đã nộp (CONFIRMED) và giảm công nợ đại lý."""
    rep1, _, acct, cust1, _ = _seed_basic_data(collection_db_session)
    sales_client = client_factory(rep1.id, rep1.username, "Sales Rep")
    accountant_client = client_factory(acct.id, acct.username, "Accountant")

    # NVKD tạo phiếu thu 5 triệu
    create_res = sales_client.post(
        "/api/v1/payments",
        json={"customerId": cust1.id, "amount": 5_000_000.0, "paymentMethod": "CASH"},
    )
    payment_id = create_res.json()["data"]["id"]

    # Kế toán xác nhận
    confirm_res = accountant_client.post(
        f"/api/v1/payments/{payment_id}/confirm",
        json={"confirmationNote": "Đã nhận đủ 5 triệu tiền mặt nộp tại văn phòng"},
    )
    assert confirm_res.status_code == 200
    res_data = confirm_res.json()["data"]

    assert res_data["status"] == "CONFIRMED"
    assert res_data["confirmedById"] == acct.id
    assert res_data["confirmedByName"] == "Lê Kế Toán"
    assert res_data["confirmationNote"] == "Đã nhận đủ 5 triệu tiền mặt nộp tại văn phòng"

    # Kiểm tra nợ của đại lý giảm từ 20 triệu xuống 15 triệu
    collection_db_session.refresh(cust1)
    assert cust1.current_debt == 15_000_000.0


def test_accountant_can_reject_payment(client_factory, collection_db_session):
    """Kế toán có quyền từ chối phiếu nộp tiền nếu phát hiện chênh lệch/sai sót."""
    rep1, _, acct, cust1, _ = _seed_basic_data(collection_db_session)
    sales_client = client_factory(rep1.id, rep1.username, "Sales Rep")
    accountant_client = client_factory(acct.id, acct.username, "Accountant")

    create_res = sales_client.post(
        "/api/v1/payments",
        json={"customerId": cust1.id, "amount": 3_000_000.0, "paymentMethod": "CASH"},
    )
    payment_id = create_res.json()["data"]["id"]

    reject_res = accountant_client.post(
        f"/api/v1/payments/{payment_id}/reject",
        json={"reason": "Thiếu tiền mặt 500k so với biên lai, yêu cầu nộp lại"},
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["data"]["status"] == "REJECTED"


# ============================================================================
# 3. Bảng đối chiếu tiền thu theo từng nhân viên và từng ngày
# ============================================================================

def test_reconciliation_summary_per_sales_rep_and_date(client_factory, collection_db_session):
    """Bảng đối chiếu tổng hợp chính xác: Đã thu, Đã nộp (CONFIRMED), và Chênh lệch/Chờ nộp."""
    rep1, rep2, acct, cust1, cust2 = _seed_basic_data(collection_db_session)
    sales_client_1 = client_factory(rep1.id, rep1.username, "Sales Rep")
    sales_client_2 = client_factory(rep2.id, rep2.username, "Sales Rep")
    accountant_client = client_factory(acct.id, acct.username, "Accountant")

    today_str = "2026-10-20"

    # NVKD 1 thu 3 khoản trong ngày 2026-10-20:
    # Khoản 1: 5 triệu (Đã được kế toán xác nhận)
    p1 = sales_client_1.post("/api/v1/payments", json={
        "customerId": cust1.id, "amount": 5_000_000.0, "paymentMethod": "CASH", "paymentDate": today_str
    }).json()["data"]["id"]
    accountant_client.post(f"/api/v1/payments/{p1}/confirm")

    # Khoản 2: 3 triệu (Chờ nộp)
    sales_client_1.post("/api/v1/payments", json={
        "customerId": cust2.id, "amount": 3_000_000.0, "paymentMethod": "CASH", "paymentDate": today_str
    })

    # Khoản 3: 2 triệu (Chờ nộp)
    sales_client_1.post("/api/v1/payments", json={
        "customerId": cust1.id, "amount": 2_000_000.0, "paymentMethod": "BANK_TRANSFER", "paymentDate": today_str
    })

    # NVKD 2 thu 1 khoản 7 triệu (không được tính gộp vào NVKD 1)
    sales_client_2.post("/api/v1/payments", json={
        "customerId": cust2.id, "amount": 7_000_000.0, "paymentMethod": "CASH", "paymentDate": today_str
    })

    # NVKD 1 gọi bảng đối chiếu của chính mình trong ngày 2026-10-20
    recon_res = sales_client_1.get(f"/api/v1/payments/reconciliation?date={today_str}")
    assert recon_res.status_code == 200
    data = recon_res.json()["data"]

    # Xác thực số liệu đối chiếu của NVKD 1
    assert data["salesId"] == rep1.id
    assert data["totalCollected"] == 10_000_000.0  # 5 + 3 + 2 = 10 triệu
    assert data["totalConfirmed"] == 5_000_000.0   # Đã nộp về công ty: 5 triệu
    assert data["totalPending"] == 5_000_000.0     # Còn chờ nộp: 5 triệu
    assert data["difference"] == 5_000_000.0       # Chênh lệch: 5 triệu
    assert len(data["payments"]) == 3


def test_sales_rep_cannot_view_other_sales_rep_reconciliation(client_factory, collection_db_session):
    """NVKD không được xem bảng đối chiếu của nhân viên khác (chặn 403)."""
    rep1, rep2, _, _, _ = _seed_basic_data(collection_db_session)
    sales_client_1 = client_factory(rep1.id, rep1.username, "Sales Rep")

    # NVKD 1 cố tình xem số liệu của NVKD 2
    res = sales_client_1.get(f"/api/v1/payments/reconciliation?salesId={rep2.id}")
    assert res.status_code == 403
    assert "chính mình" in res.json()["detail"].lower()


def test_accountant_can_view_all_sales_reps_reconciliation(client_factory, collection_db_session):
    """Kế toán có quyền xem bảng đối chiếu của bất kỳ NVKD nào hoặc xem toàn bộ."""
    rep1, rep2, acct, cust1, _ = _seed_basic_data(collection_db_session)
    sales_client_1 = client_factory(rep1.id, rep1.username, "Sales Rep")
    sales_client_2 = client_factory(rep2.id, rep2.username, "Sales Rep")
    accountant_client = client_factory(acct.id, acct.username, "Accountant")

    sales_client_1.post("/api/v1/payments", json={
        "customerId": cust1.id, "amount": 4_000_000.0, "paymentDate": "2026-10-20"
    })
    sales_client_2.post("/api/v1/payments", json={
        "customerId": cust1.id, "amount": 6_000_000.0, "paymentDate": "2026-10-20"
    })

    # Kế toán xem lọc theo NVKD 2
    res_rep2 = accountant_client.get(f"/api/v1/payments/reconciliation?salesId={rep2.id}")
    assert res_rep2.status_code == 200
    assert res_rep2.json()["data"]["totalCollected"] == 6_000_000.0

    # Kế toán xem toàn bộ
    res_all = accountant_client.get("/api/v1/payments/reconciliation?date=2026-10-20")
    assert res_all.status_code == 200
    assert res_all.json()["data"]["totalCollected"] == 10_000_000.0


# ============================================================================
# 4. Tương thích Compat Router (/payments)
# ============================================================================

def test_compat_payments_endpoints(client_factory, collection_db_session):
    """Kiểm tra router tương thích không có prefix /api/v1 hoạt động đồng nhất."""
    rep1, _, acct, cust1, _ = _seed_basic_data(collection_db_session)
    sales_client = client_factory(rep1.id, rep1.username, "Sales Rep")
    acct_client = client_factory(acct.id, acct.username, "Accountant")

    # POST /payments
    create_res = sales_client.post(
        "/payments",
        json={"customerId": cust1.id, "amount": 1_000_000.0, "paymentMethod": "CASH"},
    )
    assert create_res.status_code == 201
    p_id = create_res.json()["data"]["id"]

    # POST /payments/{id}/confirm
    confirm_res = acct_client.post(f"/payments/{p_id}/confirm")
    assert confirm_res.status_code == 200

    # GET /payments/reconciliation
    recon_res = sales_client.get("/payments/reconciliation")
    assert recon_res.status_code == 200
    assert recon_res.json()["data"]["totalConfirmed"] == 1_000_000.0
