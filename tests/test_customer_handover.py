"""Automated integration tests for Customer & Territory Assignment and Bulk Handover.

Covers:
1. Sales Manager assigns a sales rep to a dealer (PATCH /api/v1/customers/{id}/assign-sales-rep).
2. Data Scoping: Sales Rep only views assigned dealers (GET /api/v1/customers).
3. Sales Manager views all dealers or filters by assignedRepId.
4. Bulk territory handover when a sales rep leaves (POST /api/v1/customers/handover) with reason and history logging.
5. History audit trail retrieval (GET /api/v1/customers/handover-history).
6. Security & Permission: Unauthorized roles are denied (403 Forbidden).
"""

import pytest
from sqlalchemy import delete

from src.backend.database import SessionLocal
from src.backend.models import (
    Customer,
    CustomerHandoverHistory,
    Role,
    RoleCode,
    User,
)
from src.backend.rbac import create_access_token


@pytest.fixture(autouse=True)
def clean_handover_data():
    with SessionLocal() as db:
        db.execute(delete(CustomerHandoverHistory))
        db.execute(delete(Customer))
        db.commit()


def make_auth_headers(role: str, username: str) -> dict:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_setup_users():
    """Create test users: Manager, Sales Rep 1, Sales Rep 2."""
    with SessionLocal() as db:
        rep_role = db.query(Role).filter(Role.code.in_(["SALES_REP", "Sales Rep"])).first()
        mgr_role = db.query(Role).filter(Role.code.in_(["SALES_MANAGER", "Sales Manager"])).first()

        rep1 = db.query(User).filter(User.username == "rep_alpha").first()
        if not rep1:
            rep1 = User(
                username="rep_alpha",
                email="rep_alpha@company.com",
                password_hash="test_hash_alpha",
                full_name="Trần Bán Hàng 1",
                status="ACTIVE",
                is_active=True,
            )
            if rep_role:
                rep1.roles.append(rep_role)
            db.add(rep1)

        rep2 = db.query(User).filter(User.username == "rep_beta").first()
        if not rep2:
            rep2 = User(
                username="rep_beta",
                email="rep_beta@company.com",
                password_hash="test_hash_beta",
                full_name="Lê Bán Hàng 2",
                status="ACTIVE",
                is_active=True,
            )
            if rep_role:
                rep2.roles.append(rep_role)
            db.add(rep2)

        mgr = db.query(User).filter(User.username == "mgr_boss").first()
        if not mgr:
            mgr = User(
                username="mgr_boss",
                email="mgr_boss@company.com",
                password_hash="test_hash_boss",
                full_name="Nguyễn Trưởng Phòng",
                status="ACTIVE",
                is_active=True,
            )
            if mgr_role:
                mgr.roles.append(mgr_role)
            db.add(mgr)

        db.commit()
        db.refresh(rep1)
        db.refresh(rep2)
        db.refresh(mgr)

        return {
            "rep1_id": rep1.id,
            "rep1_username": rep1.username,
            "rep2_id": rep2.id,
            "rep2_username": rep2.username,
            "mgr_id": mgr.id,
            "mgr_username": mgr.username,
        }


def test_assign_sales_rep_success(client, test_setup_users):
    """Test Sales Manager assigning a sales rep to a customer."""
    setup = test_setup_users
    # 1. Tạo đại lý
    with SessionLocal() as db:
        c = Customer(code="DL-001", name="Đại lý Mai Dịch", customer_group="DEALER_LEVEL_1")
        db.add(c)
        db.commit()
        customer_id = c.id

    # 2. Quản lý gán NVKD
    mgr_headers = make_auth_headers(RoleCode.SALES_MANAGER.value, setup["mgr_username"])
    res = client.patch(
        f"/api/v1/customers/{customer_id}/assign-sales-rep",
        headers=mgr_headers,
        json={"salesRepId": setup["rep1_id"]},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["sales_rep_id"] == setup["rep1_id"]
    assert data["sales_rep_name"] == "Trần Bán Hàng 1"

    # 3. Kiểm tra log lịch sử được tạo
    with SessionLocal() as db:
        logs = db.query(CustomerHandoverHistory).filter(CustomerHandoverHistory.customer_id == customer_id).all()
        assert len(logs) == 1
        assert logs[0].to_sales_rep_id == setup["rep1_id"]
        assert logs[0].reason == "Phân công nhân viên phụ trách trực tiếp"


def test_sales_rep_only_views_own_customers(client, test_setup_users):
    """Test Data Scoping: NVKD chỉ nhìn thấy đại lý mình phụ trách."""
    setup = test_setup_users
    with SessionLocal() as db:
        c1 = Customer(code="DL-REP1-A", name="Đại lý Cầu Giấy", sales_rep_id=setup["rep1_id"])
        c2 = Customer(code="DL-REP1-B", name="Đại lý Đống Đa", sales_rep_id=setup["rep1_id"])
        c3 = Customer(code="DL-REP2-C", name="Đại lý Hoàn Kiếm", sales_rep_id=setup["rep2_id"])
        db.add_all([c1, c2, c3])
        db.commit()

    # Rep 1 xem danh sách
    rep1_headers = make_auth_headers(RoleCode.SALES_REP.value, setup["rep1_username"])
    res1 = client.get("/api/v1/customers", headers=rep1_headers)
    assert res1.status_code == 200
    items1 = res1.json()
    codes1 = [it["code"] for it in items1]
    assert "DL-REP1-A" in codes1
    assert "DL-REP1-B" in codes1
    assert "DL-REP2-C" not in codes1  # KHÔNG được nhìn thấy đại lý của Rep 2

    # Rep 2 xem danh sách
    rep2_headers = make_auth_headers(RoleCode.SALES_REP.value, setup["rep2_username"])
    res2 = client.get("/api/v1/customers", headers=rep2_headers)
    assert res2.status_code == 200
    items2 = res2.json()
    codes2 = [it["code"] for it in items2]
    assert codes2 == ["DL-REP2-C"]


def test_sales_manager_views_all_or_filters(client, test_setup_users):
    """Test Quản lý kinh doanh xem được tất cả và lọc theo NVKD phụ trách."""
    setup = test_setup_users
    with SessionLocal() as db:
        c1 = Customer(code="DL-A", name="Đại lý A", sales_rep_id=setup["rep1_id"])
        c2 = Customer(code="DL-B", name="Đại lý B", sales_rep_id=setup["rep2_id"])
        db.add_all([c1, c2])
        db.commit()

    mgr_headers = make_auth_headers(RoleCode.SALES_MANAGER.value, setup["mgr_username"])

    # Xem tất cả
    res_all = client.get("/api/v1/customers", headers=mgr_headers)
    assert res_all.status_code == 200
    assert len(res_all.json()) >= 2

    # Lọc theo assignedRepId
    res_filtered = client.get(f"/api/v1/customers?assignedRepId={setup['rep1_id']}", headers=mgr_headers)
    assert res_filtered.status_code == 200
    items = res_filtered.json()
    assert len(items) == 1
    assert items[0]["code"] == "DL-A"


def test_bulk_handover_success(client, test_setup_users):
    """Test chuyển giao địa bàn hàng loạt khi NVKD nghỉ việc kèm ghi nhận lịch sử."""
    setup = test_setup_users
    with SessionLocal() as db:
        c1 = Customer(code="DL-HO-1", name="Đại lý Tuyến 1", sales_rep_id=setup["rep1_id"])
        c2 = Customer(code="DL-HO-2", name="Đại lý Tuyến 2", sales_rep_id=setup["rep1_id"])
        c3 = Customer(code="DL-HO-3", name="Đại lý Tuyến 3", sales_rep_id=setup["rep1_id"])
        db.add_all([c1, c2, c3])
        db.commit()

    mgr_headers = make_auth_headers(RoleCode.SALES_MANAGER.value, setup["mgr_username"])

    # Thực hiện chuyển giao hàng loạt từ Rep 1 sang Rep 2
    res = client.post(
        "/api/v1/customers/handover",
        headers=mgr_headers,
        json={
            "fromSalesRepId": setup["rep1_id"],
            "toSalesRepId": setup["rep2_id"],
            "reason": "Nhân viên rep_alpha nghỉ việc, chuyển giao toàn bộ tuyến bán hàng cho rep_beta",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True
    assert data["transferred_count"] == 3

    # Kiểm tra database: cả 3 đại lý đều đã thuộc về Rep 2
    with SessionLocal() as db:
        updated = db.query(Customer).filter(Customer.code.in_(["DL-HO-1", "DL-HO-2", "DL-HO-3"])).all()
        for cust in updated:
            assert cust.sales_rep_id == setup["rep2_id"]

        logs = db.query(CustomerHandoverHistory).all()
        assert len(logs) == 3
        for log in logs:
            assert log.from_sales_rep_id == setup["rep1_id"]
            assert log.to_sales_rep_id == setup["rep2_id"]
            assert "nghỉ việc" in log.reason


def test_get_handover_history(client, test_setup_users):
    """Test Sales Manager xem danh sách lịch sử chuyển giao."""
    setup = test_setup_users
    with SessionLocal() as db:
        c = Customer(code="DL-HIST", name="Đại lý Test Log")
        db.add(c)
        db.flush()
        log = CustomerHandoverHistory(
            customer_id=c.id,
            from_sales_rep_id=setup["rep1_id"],
            to_sales_rep_id=setup["rep2_id"],
            reason="Điều chuyển địa bàn thử nghiệm",
        )
        db.add(log)
        db.commit()

    mgr_headers = make_auth_headers(RoleCode.SALES_MANAGER.value, setup["mgr_username"])
    res = client.get("/api/v1/customers/handover-history", headers=mgr_headers)
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) >= 1
    found = next((x for x in items if x["customer_code"] == "DL-HIST"), None)
    assert found is not None
    assert found["from_sales_rep_name"] == "Trần Bán Hàng 1"
    assert found["to_sales_rep_name"] == "Lê Bán Hàng 2"
    assert found["reason"] == "Điều chuyển địa bàn thử nghiệm"


def test_unauthorized_access_denied(client, test_setup_users):
    """Test Sales Rep không được phép tự phân công hoặc chuyển giao đại lý."""
    setup = test_setup_users
    rep_headers = make_auth_headers(RoleCode.SALES_REP.value, setup["rep1_username"])

    # Thử tự gán NVKD
    res_assign = client.patch(
        "/api/v1/customers/1/assign-sales-rep",
        headers=rep_headers,
        json={"salesRepId": setup["rep1_id"]},
    )
    assert res_assign.status_code == 403

    # Thử tự chuyển giao hàng loạt
    res_handover = client.post(
        "/api/v1/customers/handover",
        headers=rep_headers,
        json={
            "fromSalesRepId": setup["rep1_id"],
            "toSalesRepId": setup["rep2_id"],
            "reason": "Tự ý chuyển",
        },
    )
    assert res_handover.status_code == 403


def test_admin_creates_customer_successfully(client, test_setup_users):
    """Test Admin tạo mới đại lý thành công với đầy đủ thông tin."""
    setup = test_setup_users
    admin_headers = make_auth_headers("ADMIN", "admin_tester")

    payload = {
        "code": "DL-HN-999",
        "name": "Đại lý Thử Nghiệm Hà Nội",
        "customerGroup": "DEALER_LEVEL_1",
        "salesRepId": setup["rep1_id"],
        "creditLimit": 100000000.0,
        "maxDueDays": 45,
        "phone": "0988776655",
        "address": "Số 10 Phố Huế, Hoàn Kiếm, Hà Nội",
    }
    res = client.post("/api/v1/customers", headers=admin_headers, json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["code"] == "DL-HN-999"
    assert data["name"] == "Đại lý Thử Nghiệm Hà Nội"
    assert data["customer_group"] == "DEALER_LEVEL_1"
    assert data["sales_rep_id"] == setup["rep1_id"]
    assert data["sales_rep_name"] == "Trần Bán Hàng 1"
    assert data["debt_limit"] == 100000000.0
    assert data["phone"] == "0988776655"
    assert data["address"] == "Số 10 Phố Huế, Hoàn Kiếm, Hà Nội"

    # Trùng mã đại lý sẽ bị từ chối 400
    res_dup = client.post("/api/v1/customers", headers=admin_headers, json=payload)
    assert res_dup.status_code == 400
    assert "tồn tại" in res_dup.json()["detail"].lower()


def test_unauthorized_role_cannot_create_customer(client, test_setup_users):
    """Test Sales Rep không được phép tự tạo đại lý."""
    setup = test_setup_users
    rep_headers = make_auth_headers(RoleCode.SALES_REP.value, setup["rep1_username"])

    payload = {
        "code": "DL-UNAUTH-01",
        "name": "Đại lý Bất Hợp Pháp",
    }
    res = client.post("/api/v1/customers", headers=rep_headers, json=payload)
    assert res.status_code == 403


def test_server_side_filtering_and_pagination(client, test_setup_users):
    """Test truy vấn và lọc đại lý trực tiếp từ backend (server-side query, filter, pagination)."""
    setup = test_setup_users
    admin_headers = make_auth_headers("ADMIN", "admin_tester")

    # Tạo 3 đại lý với các thuộc tính khác nhau
    with SessionLocal() as db:
        c1 = Customer(
            code="DL-NORTH-01",
            name="Đại lý Phía Bắc Alpha",
            customer_group="DEALER_LEVEL_1",
            sales_rep_id=setup["rep1_id"],
            is_active=True,
            is_locked=False,
        )
        c2 = Customer(
            code="DL-NORTH-02",
            name="Đại lý Phía Bắc Beta",
            customer_group="DEALER_LEVEL_2",
            sales_rep_id=None,  # Chưa phân công
            is_active=True,
            is_locked=False,
        )
        c3 = Customer(
            code="DL-SOUTH-03",
            name="Đại lý Phía Nam Gamma",
            customer_group="DEALER_LEVEL_1",
            sales_rep_id=setup["rep2_id"],
            is_active=True,
            is_locked=True,  # Bị khóa
        )
        db.add_all([c1, c2, c3])
        db.commit()

    # 1. Tìm kiếm theo keyword
    res_search = client.get("/api/v1/customers?search=Alpha", headers=admin_headers)
    assert res_search.status_code == 200
    items_search = res_search.json()
    assert len(items_search) == 1
    assert items_search[0]["code"] == "DL-NORTH-01"

    # 2. Lọc đại lý chưa phân công NVKD (assignedRepId=UNASSIGNED hoặc -1)
    res_unassigned = client.get("/api/v1/customers?assignedRepId=UNASSIGNED", headers=admin_headers)
    assert res_unassigned.status_code == 200
    items_unassigned = res_unassigned.json()
    assert len(items_unassigned) == 1
    assert items_unassigned[0]["code"] == "DL-NORTH-02"

    res_neg_one = client.get("/api/v1/customers?assignedRepId=-1", headers=admin_headers)
    assert res_neg_one.status_code == 200
    assert len(res_neg_one.json()) == 1

    # 3. Lọc theo customerGroup
    res_grp = client.get("/api/v1/customers?customerGroup=DEALER_LEVEL_2", headers=admin_headers)
    assert res_grp.status_code == 200
    items_grp = res_grp.json()
    assert len(items_grp) == 1
    assert items_grp[0]["code"] == "DL-NORTH-02"

    # 4. Lọc theo trạng thái status=LOCKED
    res_locked = client.get("/api/v1/customers?status=LOCKED", headers=admin_headers)
    assert res_locked.status_code == 200
    items_locked = res_locked.json()
    assert len(items_locked) == 1
    assert items_locked[0]["code"] == "DL-SOUTH-03"

    # 5. Phân trang & Header X-Total-Count
    res_page = client.get("/api/v1/customers?page=1&limit=2", headers=admin_headers)
    assert res_page.status_code == 200
    items_page = res_page.json()
    assert len(items_page) == 2
    assert res_page.headers.get("x-total-count") == "3"


def test_create_customer_phone_constraints(client, test_setup_users):
    """Test ràng buộc số điện thoại khi tạo đại lý mới: bắt buộc nhập, đúng định dạng 10 số VN, không được trùng."""
    admin_headers = make_auth_headers("ADMIN", "admin_tester")

    base_payload = {
        "code": "DL-PHONE-01",
        "name": "Đại lý Thử Phone",
        "customerGroup": "DEALER_LEVEL_1",
    }

    # 1. Bắt buộc nhập số điện thoại: thiếu phone -> 400
    res_no_phone = client.post("/api/v1/customers", headers=admin_headers, json=base_payload)
    assert res_no_phone.status_code == 400
    assert "bắt buộc" in res_no_phone.json()["detail"].lower()

    # 2. Số điện thoại rỗng -> 400
    res_empty_phone = client.post(
        "/api/v1/customers", headers=admin_headers, json={**base_payload, "phone": "   "}
    )
    assert res_empty_phone.status_code == 400
    assert "bắt buộc" in res_empty_phone.json()["detail"].lower()

    # 3. Định dạng sai: không đủ 10 số -> 400
    res_invalid_len = client.post(
        "/api/v1/customers", headers=admin_headers, json={**base_payload, "phone": "0912345"}
    )
    assert res_invalid_len.status_code == 400
    assert "không hợp lệ" in res_invalid_len.json()["detail"].lower()

    # 4. Định dạng sai: đầu số không thuộc Việt Nam (vd: 04, bắt đầu bằng chữ cái) -> 400
    res_invalid_prefix = client.post(
        "/api/v1/customers", headers=admin_headers, json={**base_payload, "phone": "0412345678"}
    )
    assert res_invalid_prefix.status_code == 400
    assert "không hợp lệ" in res_invalid_prefix.json()["detail"].lower()

    # 5. Tạo thành công với số điện thoại hợp lệ
    valid_payload = {
        **base_payload,
        "phone": "0912345678",
    }
    res_valid = client.post("/api/v1/customers", headers=admin_headers, json=valid_payload)
    assert res_valid.status_code == 201
    data = res_valid.json()
    assert data["phone"] == "0912345678"

    # Kiểm tra đã lưu vào DB
    with SessionLocal() as db:
        c = db.query(Customer).filter(Customer.code == "DL-PHONE-01").first()
        assert c is not None
        assert c.phone == "0912345678"

    # 6. Trùng lặp số điện thoại -> 400
    dup_payload = {
        "code": "DL-PHONE-02",
        "name": "Đại lý Trùng Số ĐT",
        "phone": "0912345678",
    }
    res_dup = client.post("/api/v1/customers", headers=admin_headers, json=dup_payload)
    assert res_dup.status_code == 400
    assert "đã được đăng ký" in res_dup.json()["detail"].lower()



