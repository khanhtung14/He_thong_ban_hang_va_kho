"""Tests for Customer / Agency Management Module:
User Story: "Là Kế toán công nợ, tôi muốn quản lý hồ sơ đại lý, để có một danh sách khách hàng chuẩn thay vì mỗi nhân viên giữ một file riêng."

Tiêu chí nghiệm thu:
1. Khai báo mã đại lý, tên, mã số thuế, nhóm khách hàng, khu vực, người phụ trách, trạng thái.
2. Mã đại lý là duy nhất (case-insensitive).
3. Nhóm khách hàng quyết định bảng giá được áp dụng.
4. Đại lý đã phát sinh giao dịch thì không xoá được, chỉ ngừng giao dịch.
"""

from __future__ import annotations

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from src.backend.main import app
from app.models.models import (
    Base,
    Customer,
    Order,
    OrderStatus,
    PriceList,
    PriceListItem,
    Role,
    RoleCode,
    User,
    AccountStatus,
)
from app.api.v1.endpoints.rbac import create_access_token


def make_token(role: str, username: str = "test_user", user_id: int | None = None) -> dict[str, str]:
    payload = {"sub": username, "role": role}
    if user_id is not None:
        payload["user_id"] = user_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def agency_env():
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

    with TestingSessionLocal() as db:
        acc_user = User(
            username="accountant01",
            email="acc@OMS.com",
            full_name="Nguyễn Kế Toán",
            password_hash="fake",
            status=AccountStatus.ACTIVE,
        )
        sales_mgr = User(
            username="smgr01",
            email="smgr@OMS.com",
            full_name="Trần Quản Lý",
            password_hash="fake",
            status=AccountStatus.ACTIVE,
        )
        sales_rep = User(
            username="srep01",
            email="srep@OMS.com",
            full_name="Lê Bán Hàng",
            password_hash="fake",
            status=AccountStatus.ACTIVE,
        )
        wh_user = User(
            username="wh01",
            email="wh@OMS.com",
            full_name="Phạm Thủ Kho",
            password_hash="fake",
            status=AccountStatus.ACTIVE,
        )
        db.add_all([acc_user, sales_mgr, sales_rep, wh_user])
        db.commit()

        # Seed Price List for DEALER_LEVEL_1
        pl_l1 = PriceList(
            code="BG-DL-CAP-1",
            version=1,
            customer_group="DEALER_LEVEL_1",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            published=True,
        )
        db.add(pl_l1)
        db.flush()
        item1 = PriceListItem(price_list_id=pl_l1.id, sku="SKU-BIA-01", sale_price=250000, floor_price=230000)
        item2 = PriceListItem(price_list_id=pl_l1.id, sku="SKU-SUA-01", sale_price=180000, floor_price=170000)
        db.add_all([item1, item2])

        # Seed initial customers
        c1 = Customer(
            code="DL-HN-001",
            name="Đại lý Bách Hóa Cầu Giấy",
            tax_code="0101234567",
            customer_group="DEALER_LEVEL_1",
            region="Hà Nội",
            sales_rep_id=sales_rep.id,
            is_active=True,
        )
        c2 = Customer(
            code="DL-SG-002",
            name="Đại lý Tạp Hóa Quận 1",
            tax_code="0309876543",
            customer_group="DEALER_LEVEL_2",
            region="TP.HCM",
            sales_rep_id=sales_rep.id,
            is_active=False,
        )
        db.add_all([c1, c2])
        db.commit()

        # Seed an order for c1 (so c1 has transactions_count > 0)
        order1 = Order(
            order_code="ORD-001",
            customer_id=c1.id,
            status=OrderStatus.COMPLETED,
            total_amount=5000000,
        )
        db.add(order1)
        db.commit()

    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_create_customer_success_and_case_insensitive_duplicate(agency_env):
    """1. Tạo mới đại lý thành công và kiểm tra tính duy nhất (case-insensitive) của mã đại lý."""
    client, _ = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    # Tạo đại lý mới hợp lệ
    payload = {
        "code": "DL-DN-003",
        "name": "Đại lý Siêu Thị Đà Nẵng",
        "tax_code": "0401122334",
        "customer_group": "DEALER_LEVEL_1",
        "region": "Đà Nẵng",
        "person_in_charge": "Lê Bán Hàng",
        "status": "ACTIVE",
        "is_active": True,
        "phone": "0236123456",
        "email": "danang@agency.vn",
        "address": "123 Bạch Đằng, Đà Nẵng",
    }
    resp = client.post("/api/v1/customers", json=payload, headers=acc_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["code"] == "DL-DN-003"
    assert data["name"] == "Đại lý Siêu Thị Đà Nẵng"
    assert data["customer_group"] == "DEALER_LEVEL_1"
    assert data["status"] == "ACTIVE"
    assert data["is_active"] is True
    assert data["transactions_count"] == 0

    # Trùng mã đại lý chữ hoa chữ thường (Case-insensitive check: "dl-dn-003" vs "DL-DN-003")
    dup_payload = {
        "code": "dl-dn-003",  # lower case
        "name": "Đại lý Trùng Mã",
        "customer_group": "RETAIL",
    }
    resp_dup = client.post("/api/v1/customers", json=dup_payload, headers=acc_headers)
    assert resp_dup.status_code == 400
    assert "đã tồn tại" in resp_dup.json()["detail"].lower()


def test_rbac_customer_creation(agency_env):
    """Phân quyền: Accountant, Admin, Sales Manager được phép tạo; vai trò khác bị 403."""
    client, _ = agency_env
    admin_headers = make_token("Admin", "admin01")
    mgr_headers = make_token("Sales Manager", "smgr01")
    wh_headers = make_token("Warehouse", "wh01")

    # Admin tạo được
    resp_admin = client.post(
        "/api/v1/customers",
        json={"code": "DL-ADM-01", "name": "Đại lý do Admin tạo", "customer_group": "RETAIL"},
        headers=admin_headers,
    )
    assert resp_admin.status_code == 201

    # Sales Manager tạo được
    resp_mgr = client.post(
        "/api/v1/customers",
        json={"code": "DL-MGR-01", "name": "Đại lý do Manager tạo", "customer_group": "RETAIL"},
        headers=mgr_headers,
    )
    assert resp_mgr.status_code == 201

    # Warehouse bị chặn 403
    resp_wh = client.post(
        "/api/v1/customers",
        json={"code": "DL-WH-01", "name": "Đại lý bị chặn", "customer_group": "RETAIL"},
        headers=wh_headers,
    )
    assert resp_wh.status_code == 403


def test_list_customers_with_pagination_and_filters(agency_env):
    """2. Danh sách đại lý kèm phân trang, tìm kiếm và bộ lọc."""
    client, _ = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    # Phân trang
    resp = client.get("/api/v1/customers?page=1&limit=2", headers=acc_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "data" in data
    assert "pagination" in data
    assert data["pagination"]["page"] == 1
    assert data["pagination"]["limit"] == 2
    assert len(data["data"]) == 2
    # c1 có đơn hàng đã lập nên transactions_count == 1
    c1_record = next(c for c in data["data"] if c["code"] == "DL-HN-001")
    assert c1_record["transactions_count"] == 1

    # Tìm kiếm theo mã số thuế
    resp_search = client.get("/api/v1/customers?keyword=0309876543&page=1&limit=10", headers=acc_headers)
    assert resp_search.status_code == 200
    items = resp_search.json()["data"]
    assert len(items) == 1
    assert items[0]["code"] == "DL-SG-002"

    # Lọc theo trạng thái hoạt động (INACTIVE)
    resp_inactive = client.get("/api/v1/customers?is_active=false&page=1&limit=10", headers=acc_headers)
    assert resp_inactive.status_code == 200
    items_in = resp_inactive.json()["data"]
    assert len(items_in) == 1
    assert items_in[0]["code"] == "DL-SG-002"

    # Lọc theo khu vực
    resp_region = client.get("/api/v1/customers?region=Hà Nội&page=1&limit=10", headers=acc_headers)
    assert resp_region.status_code == 200
    items_reg = resp_region.json()["data"]
    assert len(items_reg) == 1
    assert items_reg[0]["code"] == "DL-HN-001"


def test_get_customer_detail_and_price_list(agency_env):
    """3. Chi tiết đại lý kèm bảng giá tương ứng theo nhóm khách hàng."""
    client, SessionLocal = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    with SessionLocal() as db:
        c1 = db.query(Customer).filter(Customer.code == "DL-HN-001").first()
        c1_id = c1.id

    resp = client.get(f"/api/v1/customers/{c1_id}", headers=acc_headers)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["code"] == "DL-HN-001"
    assert detail["customer_group"] == "DEALER_LEVEL_1"
    assert detail["transactions_count"] == 1
    assert detail["price_list"] is not None
    assert detail["price_list"]["code"] == "BG-DL-CAP-1"
    assert detail["price_list"]["items_count"] == 2

    # Đại lý không tồn tại -> 404
    resp_404 = client.get("/api/v1/customers/99999", headers=acc_headers)
    assert resp_404.status_code == 404


def test_update_customer_and_code_conflict(agency_env):
    """4. Cập nhật thông tin đại lý và kiểm tra trùng mã với đại lý khác."""
    client, SessionLocal = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    with SessionLocal() as db:
        c2 = db.query(Customer).filter(Customer.code == "DL-SG-002").first()
        c2_id = c2.id

    # Cập nhật thành công
    update_payload = {
        "name": "Đại lý Tạp Hóa Quận 1 - Đổi Tên",
        "customer_group": "DEALER_LEVEL_1",
        "region": "Miền Nam",
    }
    resp_up = client.put(f"/api/v1/customers/{c2_id}", json=update_payload, headers=acc_headers)
    assert resp_up.status_code == 200
    assert resp_up.json()["name"] == "Đại lý Tạp Hóa Quận 1 - Đổi Tên"
    assert resp_up.json()["customer_group"] == "DEALER_LEVEL_1"

    # Cập nhật mã trùng với c1 -> 400
    resp_dup = client.put(f"/api/v1/customers/{c2_id}", json={"code": "dl-hn-001"}, headers=acc_headers)
    assert resp_dup.status_code == 400
    assert "đã tồn tại" in resp_dup.json()["detail"].lower()


def test_patch_customer_status(agency_env):
    """5. Chuyển đổi trạng thái hoạt động / ngừng giao dịch."""
    client, SessionLocal = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    with SessionLocal() as db:
        c2 = db.query(Customer).filter(Customer.code == "DL-SG-002").first()
        c2_id = c2.id

    # Kích hoạt lại (ACTIVE)
    resp = client.patch(f"/api/v1/customers/{c2_id}/status", json={"status": "ACTIVE"}, headers=acc_headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
    assert resp.json()["status"] == "ACTIVE"

    # Ngừng giao dịch (INACTIVE)
    resp_off = client.patch(f"/api/v1/customers/{c2_id}/status", json={"is_active": False}, headers=acc_headers)
    assert resp_off.status_code == 200
    assert resp_off.json()["is_active"] is False
    assert resp_off.json()["status"] == "INACTIVE"


def test_delete_customer_constraint(agency_env):
    """6. Ràng buộc xóa: Đã phát sinh giao dịch không được xóa, chỉ ngừng giao dịch. Chưa có giao dịch thì xóa được."""
    client, SessionLocal = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    with SessionLocal() as db:
        c1 = db.query(Customer).filter(Customer.code == "DL-HN-001").first()
        c2 = db.query(Customer).filter(Customer.code == "DL-SG-002").first()
        c1_id = c1.id
        c2_id = c2.id

    # 1. c1 đã có đơn hàng (transactions_count == 1) -> TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA (400)
    del_c1 = client.delete(f"/api/v1/customers/{c1_id}", headers=acc_headers)
    assert del_c1.status_code == 400
    assert "Đại lý đã phát sinh giao dịch thì không xoá được, chỉ ngừng giao dịch." in del_c1.json()["detail"]

    # 2. c2 chưa có giao dịch nào (transactions_count == 0) -> XÓA THÀNH CÔNG
    del_c2 = client.delete(f"/api/v1/customers/{c2_id}", headers=acc_headers)
    assert del_c2.status_code == 200

    # Kiểm tra lại c2 không còn trong db -> 404
    get_c2 = client.get(f"/api/v1/customers/{c2_id}", headers=acc_headers)
    assert get_c2.status_code == 404


def test_agencies_alias_endpoints(agency_env):
    """7. Kiểm tra alias router /api/v1/agencies hoạt động hoàn toàn tương thích."""
    client, _ = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    resp = client.get("/api/v1/agencies?page=1&limit=10", headers=acc_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert len(resp.json()["data"]) >= 1


def test_sales_rep_select_and_assignment(agency_env):
    """8. Kiểm tra endpoint lấy danh sách sales reps cho Accountant và lưu assigned_sales_id/sales_rep_id."""
    client, SessionLocal = agency_env
    acc_headers = make_token("Accountant", "accountant01")

    # 1. Gọi GET /api/v1/sales/reps bằng tài khoản Kế toán
    resp = client.get("/api/v1/sales/reps", headers=acc_headers)
    assert resp.status_code == 200
    reps_data = resp.json()["data"]
    assert len(reps_data) >= 1
    sales_rep = next((r for r in reps_data if r["username"] == "srep01"), None)
    assert sales_rep is not None
    assert sales_rep["full_name"] == "Lê Bán Hàng"
    rep_id = sales_rep["id"]

    # 2. Thử tạo đại lý với sales rep ID không tồn tại -> HTTP 400
    invalid_rep_payload = {
        "code": "DL-INVALID-REP",
        "name": "Đại lý Sales Rep ảo",
        "customer_group": "DEALER_LEVEL_1",
        "assigned_sales_id": 999999,
    }
    invalid_resp = client.post("/api/v1/customers", json=invalid_rep_payload, headers=acc_headers)
    assert invalid_resp.status_code == 400
    assert "không tồn tại trên hệ thống" in invalid_resp.json()["detail"]

    # 3. Tạo đại lý mới hợp lệ với assigned_sales_id
    create_payload = {
        "code": "DL-TEST-SALES-01",
        "name": "Đại lý Test Sales Rep",
        "customer_group": "DEALER_LEVEL_1",
        "assigned_sales_id": rep_id,
        "region": "Miền Bắc",
        "tax_code": "0109988776",
        "phone": "0987654321",
        "email": "sales_agency@test.com",
        "address": "123 Đường Test",
    }
    create_resp = client.post("/api/v1/customers", json=create_payload, headers=acc_headers)
    assert create_resp.status_code == 201
    created_cust = create_resp.json()["data"]
    assert created_cust["sales_rep_id"] == rep_id
    assert created_cust["person_in_charge"] == "Lê Bán Hàng"
    cust_id = created_cust["id"]

    # 4. Thử tạo trùng mã đại lý -> HTTP 400 ("Mã đại lý đã tồn tại trên hệ thống")
    dup_resp = client.post("/api/v1/customers", json=create_payload, headers=acc_headers)
    assert dup_resp.status_code == 400
    assert "Mã đại lý đã tồn tại trên hệ thống" in dup_resp.json()["detail"]

    # 5. Chỉnh sửa bỏ phân công (allowClear / None)
    update_payload = {
        "sales_rep_id": None,
        "person_in_charge": None,
    }
    update_resp = client.put(f"/api/v1/customers/{cust_id}", json=update_payload, headers=acc_headers)
    assert update_resp.status_code == 200
    updated_cust = update_resp.json()["data"]
    assert updated_cust["sales_rep_id"] is None
