"""Tests for User Story SCRUM-67 (Sales Targets / Quota management and progress tracking)."""
from __future__ import annotations

from datetime import date, datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from src.backend.database import get_db
from src.backend.models import (
    Base,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    Role,
    SalesTarget,
    TargetAuditLog,
    Territory,
    User,
)
from src.backend.rbac import create_access_token


@pytest.fixture
def target_db_session():
    """Create an isolated in-memory SQLite database session for sales target tests."""
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
def client_factory(target_db_session):
    """Factory to generate TestClients with authenticated bearer tokens."""
    def override_get_db():
        yield target_db_session

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


def _seed_basic_data(db):
    """Seed test sales reps, manager, admin, territory, and customer."""
    sales_rep_1 = User(
        id=101,
        username="rep_bac_01",
        email="rep_bac@domain.com",
        full_name="Nguyễn Văn Tuyến Bắc",
        password_hash="test_password_hash",
        status="ACTIVE",
    )
    sales_rep_2 = User(
        id=102,
        username="rep_nam_02",
        email="rep_nam@domain.com",
        full_name="Lê Văn Tuyến Nam",
        password_hash="test_password_hash",
        status="ACTIVE",
    )
    manager = User(
        id=201,
        username="sales_manager_01",
        email="manager@domain.com",
        full_name="Trần Quản Lý",
        password_hash="test_password_hash",
        status="ACTIVE",
    )
    admin_user = User(
        id=202,
        username="admin_01",
        email="admin@domain.com",
        full_name="Hoàng Admin",
        password_hash="test_password_hash",
        status="ACTIVE",
    )
    territory_bac = Territory(
        id=1,
        code="KV-MB",
        name="Khu vực Miền Bắc",
    )
    territory_nam = Territory(
        id=2,
        code="KV-MN",
        name="Khu vực Miền Nam",
    )
    cust_1 = Customer(
        id=501,
        code="DL-HN-01",
        name="Đại lý Hà Nội 1",
        phone="0911000111",
        region="Miền Bắc",
        territory_id=1,
        sales_rep_id=101,
        is_active=True,
    )
    db.add_all([sales_rep_1, sales_rep_2, manager, admin_user, territory_bac, territory_nam, cust_1])
    db.commit()
    return sales_rep_1, sales_rep_2, manager, admin_user, cust_1


# ============================================================================
# 1. Đặt chỉ tiêu (Sales Target / Quota)
# ============================================================================

def test_sales_manager_can_create_sales_target(client_factory, target_db_session):
    """Quản lý kinh doanh thiết lập chỉ tiêu doanh số theo tháng cho NVKD & khu vực."""
    rep1, rep2, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    payload = {
        "staffId": rep1.id,
        "region": "Miền Bắc",
        "month": "2026-10",
        "targetAmount": 100_000_000.0,
        "note": "Chỉ tiêu tháng 10 khu vực Miền Bắc",
    }
    response = manager_client.post("/api/v1/reports/sales-targets", json=payload)
    assert response.status_code == 201
    data = response.json()["data"]

    assert data["staffId"] == rep1.id
    assert data["salesRepId"] == rep1.id
    assert data["salesRepName"] == rep1.full_name
    assert data["region"] == "Miền Bắc"
    assert data["month"] == 10
    assert data["year"] == 2026
    assert data["period"] == "2026-10"
    assert data["targetAmount"] == 100_000_000.0
    assert data["actualAmount"] == 0.0
    assert data["remainingAmount"] == 100_000_000.0
    assert data["completionRate"] == 0.0
    assert data["isLocked"] is False


def test_create_sales_target_validation_errors(client_factory, target_db_session):
    """Validation lỗi khi thiết lập chỉ tiêu: thiếu staffId, target <= 0, tháng sai."""
    _, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    # Thiếu nhân viên
    res1 = manager_client.post("/api/v1/reports/sales-targets", json={
        "month": 10, "year": 2026, "targetAmount": 50_000_000.0
    })
    assert res1.status_code == 400

    # Nhân viên không tồn tại
    res2 = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": 99999, "month": 10, "year": 2026, "targetAmount": 50_000_000.0
    })
    assert res2.status_code == 404

    # targetAmount <= 0
    res3 = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": 101, "month": 10, "year": 2026, "targetAmount": 0.0
    })
    assert res3.status_code == 400

    # Tháng không hợp lệ (> 12)
    res4 = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": 101, "month": 15, "year": 2026, "targetAmount": 50_000_000.0
    })
    assert res4.status_code == 400


# ============================================================================
# 2. Theo dõi tiến độ theo thời gian thực (Progress Tracking)
# ============================================================================

def test_realtime_progress_tracking_with_orders(client_factory, target_db_session):
    """Tính toán tiến độ hoàn thành chỉ tiêu theo thời gian thực dựa trên đơn hàng hợp lệ."""
    rep1, _, mgr, _, cust1 = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")
    rep_client = client_factory(rep1.id, rep1.username, "Sales Rep")

    # 1. Quản lý tạo chỉ tiêu 100 triệu cho tháng 10/2026
    manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "region": "Miền Bắc", "month": 10, "year": 2026, "targetAmount": 100_000_000.0
    })

    # Ban đầu chưa có đơn hàng: 0%
    init_res = rep_client.get("/api/v1/reports/sales-targets/progress?month=10&year=2026")
    assert init_res.status_code == 200
    target_item = init_res.json()["data"][0]
    assert target_item["actualAmount"] == 0.0
    assert target_item["completionRate"] == 0.0
    assert target_item["remainingAmount"] == 100_000_000.0
    assert target_item["status"] == "IN_PROGRESS"

    # 2. Phát sinh đơn hàng thứ 1 trong tháng 10/2026: 45 triệu
    order1 = Order(
        order_code="ORD-202610-001",
        customer_id=cust1.id,
        created_by_id=rep1.id,
        status=OrderStatus.APPROVED,
        total_amount=45_000_000.0,
        created_at=datetime(2026, 10, 5, 10, 0, 0),
    )
    # Đơn hàng bị HỦY trong tháng 10: 20 triệu (không được tính vào tiến độ)
    order_cancelled = Order(
        order_code="ORD-202610-002-CANCELLED",
        customer_id=cust1.id,
        created_by_id=rep1.id,
        status=OrderStatus.CANCELLED,
        total_amount=20_000_000.0,
        created_at=datetime(2026, 10, 8, 14, 0, 0),
    )
    # Đơn hàng của tháng khác (tháng 9/2026): 30 triệu (không được tính vào tháng 10)
    order_past = Order(
        order_code="ORD-202609-001",
        customer_id=cust1.id,
        created_by_id=rep1.id,
        status=OrderStatus.COMPLETED,
        total_amount=30_000_000.0,
        created_at=datetime(2026, 9, 20, 9, 0, 0),
    )
    target_db_session.add_all([order1, order_cancelled, order_past])
    target_db_session.commit()

    # Kiểm tra lại tiến độ của NVKD: đạt 45 triệu (45%)
    prog_res1 = rep_client.get("/api/v1/reports/sales-targets?month=10&year=2026")
    assert prog_res1.status_code == 200
    item1 = prog_res1.json()["data"][0]
    assert item1["actualAmount"] == 45_000_000.0
    assert item1["completionRate"] == 45.0
    assert item1["remainingAmount"] == 55_000_000.0
    assert item1["status"] == "IN_PROGRESS"

    # 3. Phát sinh đơn hàng thứ 2 trong tháng 10/2026: 65 triệu -> Tổng đạt 110 triệu (vượt chỉ tiêu)
    order2 = Order(
        order_code="ORD-202610-003",
        customer_id=cust1.id,
        created_by_id=rep1.id,
        status=OrderStatus.COMPLETED,
        total_amount=65_000_000.0,
        created_at=datetime(2026, 10, 15, 16, 30, 0),
    )
    target_db_session.add(order2)
    target_db_session.commit()

    prog_res2 = rep_client.get("/api/v1/reports/sales-targets/progress?month=10&year=2026")
    assert prog_res2.status_code == 200
    item2 = prog_res2.json()["data"][0]
    assert item2["actualAmount"] == 110_000_000.0
    assert item2["completionRate"] == 110.0
    assert item2["remainingAmount"] == 0.0
    assert item2["status"] == "EXCEEDED"


# ============================================================================
# 3. Khóa kỳ và Audit Log chỉnh sửa
# ============================================================================

def test_past_period_target_is_automatically_locked(client_factory, target_db_session):
    """Chỉ tiêu của các kỳ/tháng đã qua tự động bị khóa (is_locked = True)."""
    rep1, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    # Tạo chỉ tiêu của kỳ quá khứ: Tháng 1 năm 2026
    res = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "region": "Miền Bắc", "month": 1, "year": 2026, "targetAmount": 80_000_000.0
    })
    assert res.status_code == 201
    target_id = res.json()["data"]["id"]

    # Tra cứu chi tiết: isLocked phải là True vì là tháng đã qua
    detail_res = manager_client.get(f"/api/v1/reports/sales-targets/{target_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["isLocked"] is True


def test_update_locked_target_requires_reason_and_records_audit_log(client_factory, target_db_session):
    """Sửa chỉ tiêu của kỳ đã khóa bắt buộc nhập lý do; ghi nhật ký kiểm toán TargetAuditLog."""
    rep1, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    # Tạo chỉ tiêu kỳ quá khứ (tháng 2/2026) -> tự động bị khóa
    create_res = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "region": "Miền Bắc", "month": 2, "year": 2026, "targetAmount": 70_000_000.0
    })
    target_id = create_res.json()["data"]["id"]

    # 1. Cố sửa chỉ tiêu kỳ đã khóa nhưng KHÔNG nhập lý do -> BỊ CHẶN 400 Bad Request
    fail_res = manager_client.put(f"/api/v1/reports/sales-targets/{target_id}", json={
        "targetAmount": 90_000_000.0,
    })
    assert fail_res.status_code == 400
    assert "bắt buộc phải nhập lý do" in fail_res.json()["detail"].lower()

    # 2. Sửa chỉ tiêu kỳ đã khóa CÓ nhập lý do hợp lệ -> THÀNH CÔNG 200 OK
    edit_reason = "Điều chỉnh hồi tố theo phê duyệt của Ban Giám đốc do mở rộng địa bàn"
    success_res = manager_client.put(f"/api/v1/reports/sales-targets/{target_id}", json={
        "targetAmount": 85_000_000.0,
        "reason": edit_reason,
    })
    assert success_res.status_code == 200
    updated_data = success_res.json()["data"]
    assert updated_data["targetAmount"] == 85_000_000.0

    # 3. Kiểm tra nhật ký kiểm toán (TargetAuditLog)
    audit_res = manager_client.get(f"/api/v1/reports/sales-targets/{target_id}/audit-logs")
    assert audit_res.status_code == 200
    logs = audit_res.json()["data"]
    assert len(logs) == 1
    log_item = logs[0]
    assert log_item["targetId"] == target_id
    assert log_item["changedById"] == mgr.id
    assert log_item["oldAmount"] == 70_000_000.0
    assert log_item["newAmount"] == 85_000_000.0
    assert log_item["reason"] == edit_reason
    assert log_item["changedAt"] is not None


def test_manual_lock_and_unlock_target(client_factory, target_db_session):
    """Quản lý có thể chủ động khóa/mở khóa chỉ tiêu thủ công qua endpoint lock."""
    rep1, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    # Tạo chỉ tiêu kỳ hiện tại / tương lai (tháng 12/2026)
    res = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "month": 12, "year": 2026, "targetAmount": 90_000_000.0
    })
    target_id = res.json()["data"]["id"]
    assert res.json()["data"]["isLocked"] is False

    # Chủ động khóa thủ công
    lock_res = manager_client.post(f"/api/v1/reports/sales-targets/{target_id}/lock", json={"isLocked": True})
    assert lock_res.status_code == 200
    assert lock_res.json()["data"]["isLocked"] is True

    # Sửa khi đã bị khóa thủ công mà không có lý do -> Bị chặn 400
    fail_edit = manager_client.put(f"/api/v1/reports/sales-targets/{target_id}", json={"targetAmount": 95_000_000.0})
    assert fail_edit.status_code == 400


# ============================================================================
# 4. Phân quyền (RBAC)
# ============================================================================

def test_sales_rep_cannot_create_or_update_sales_target_blocked_403(client_factory, target_db_session):
    """NVKD không được tự ý thiết lập hoặc sửa chỉ tiêu (403 Forbidden)."""
    rep1, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")
    rep_client = client_factory(rep1.id, rep1.username, "Sales Rep")

    # NVKD cố tình tạo chỉ tiêu -> 403 Forbidden
    create_res = rep_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "month": 10, "year": 2026, "targetAmount": 50_000_000.0
    })
    assert create_res.status_code == 403

    # Quản lý tạo hợp lệ một chỉ tiêu
    target_res = manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "month": 10, "year": 2026, "targetAmount": 50_000_000.0
    })
    target_id = target_res.json()["data"]["id"]

    # NVKD cố tình sửa chỉ tiêu -> 403 Forbidden
    update_res = rep_client.put(f"/api/v1/reports/sales-targets/{target_id}", json={
        "targetAmount": 30_000_000.0, "reason": "Tự giảm chỉ tiêu"
    })
    assert update_res.status_code == 403


def test_sales_rep_cannot_view_other_rep_target_progress(client_factory, target_db_session):
    """NVKD cố tình xem tiến độ của NVKD khác sẽ bị chặn 403 Forbidden."""
    rep1, rep2, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")
    rep1_client = client_factory(rep1.id, rep1.username, "Sales Rep")

    # Quản lý đặt chỉ tiêu cho cả 2 NVKD
    manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "month": 10, "year": 2026, "targetAmount": 100_000_000.0
    })
    manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep2.id, "month": 10, "year": 2026, "targetAmount": 120_000_000.0
    })

    # NVKD 1 cố tình xem tiến độ của NVKD 2 -> 403 Forbidden
    forbidden_res = rep1_client.get(f"/api/v1/reports/sales-targets?salesRepId={rep2.id}")
    assert forbidden_res.status_code == 403

    # NVKD 1 gọi xem danh sách thông thường -> Chỉ nhìn thấy bản ghi của chính mình (1 bản ghi)
    own_res = rep1_client.get("/api/v1/reports/sales-targets?month=10&year=2026")
    assert own_res.status_code == 200
    data = own_res.json()["data"]
    assert len(data) == 1
    assert data[0]["staffId"] == rep1.id


def test_manager_can_view_all_sales_reps_and_filter_by_region(client_factory, target_db_session):
    """Quản lý xem được toàn bộ nhân viên và lọc theo từng khu vực."""
    rep1, rep2, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep1.id, "region": "Miền Bắc", "month": 10, "year": 2026, "targetAmount": 100_000_000.0
    })
    manager_client.post("/api/v1/reports/sales-targets", json={
        "staffId": rep2.id, "region": "Miền Nam", "month": 10, "year": 2026, "targetAmount": 120_000_000.0
    })

    # Quản lý xem toàn bộ
    all_res = manager_client.get("/api/v1/reports/sales-targets?month=10&year=2026")
    assert all_res.status_code == 200
    assert len(all_res.json()["data"]) == 2
    assert all_res.json()["summary"]["totalTargets"] == 220_000_000.0

    # Quản lý lọc theo khu vực Miền Bắc
    bac_res = manager_client.get("/api/v1/reports/sales-targets?month=10&year=2026&region=Miền Bắc")
    assert bac_res.status_code == 200
    assert len(bac_res.json()["data"]) == 1
    assert bac_res.json()["data"][0]["staffId"] == rep1.id


def test_compat_and_direct_endpoints(client_factory, target_db_session):
    """Kiểm tra các router tương thích /reports/sales-targets và /api/v1/sales-targets."""
    rep1, _, mgr, _, _ = _seed_basic_data(target_db_session)
    manager_client = client_factory(mgr.id, mgr.username, "Sales Manager")

    # Tạo qua /api/v1/sales-targets
    res1 = manager_client.post("/api/v1/sales-targets", json={
        "staffId": rep1.id, "month": 11, "year": 2026, "targetAmount": 60_000_000.0
    })
    assert res1.status_code == 201

    # Xem qua /reports/sales-targets
    res2 = manager_client.get("/reports/sales-targets?month=11&year=2026")
    assert res2.status_code == 200
    assert len(res2.json()["data"]) == 1
    assert res2.json()["data"][0]["targetAmount"] == 60_000_000.0
