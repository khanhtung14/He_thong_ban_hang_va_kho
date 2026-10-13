"""Tests for SCRUM-20:
Khai báo và quản lý nhiều điểm giao hàng cho một đại lý (S3-04 / EP-03).

Kiểm tra:
1. Lấy danh sách điểm giao hàng của đại lý (GET /api/v1/customers/{id}/delivery-addresses).
2. Thêm mới điểm giao hàng với đầy đủ thông tin (người nhận, SĐT, địa chỉ, ghi chú, mặc định).
3. Kiểm tra validation: dữ liệu thiếu hoặc SĐT sai định dạng (bị chặn 400).
4. Cập nhật điểm giao hàng (PUT).
5. Đặt điểm giao hàng làm mặc định (PATCH .../default và PUT).
6. Xóa điểm giao hàng (DELETE).
7. Khi xóa điểm giao hàng mặc định, tự động chuyển cờ mặc định cho điểm còn lại.
8. Từ chối đại lý hoặc điểm giao hàng không tồn tại (404).
9. Từ chối thao tác nếu điểm giao hàng thuộc về đại lý khác (400).
10. Phân quyền và bảo mật:
    - Chưa đăng nhập bị 401 Unauthorized.
    - Vai trò không hợp lệ bị 403 Forbidden.
    - Đại lý chỉ được xem và quản lý điểm giao hàng của chính mình (chặn 403 nếu truy cập đại lý khác).
11. Tích hợp tạo đơn hàng (POST /api/v1/orders):
    - Đơn hàng chọn đúng điểm giao hàng của đại lý.
    - Đơn hàng tự động nhận điểm giao mặc định nếu không chỉ định.
    - Chặn và báo lỗi 400 nếu chọn điểm giao hàng thuộc đại lý khác.
    - Chặn và báo lỗi 404 nếu chọn điểm giao hàng không tồn tại.
12. Tương thích SCRUM-85:
    - Đại lý bị khóa giao dịch vẫn bị chặn tạo đơn dù có điểm giao hàng hợp lệ.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db, SessionLocal
from src.backend.main import app
from src.backend.models import (
    Base,
    Customer,
    DeliveryAddress,
    Order,
    OrderItem,
    OrderStatus,
    Role,
    RoleCode,
    User,
)
from src.backend.rbac import create_access_token


def make_auth_headers(role: str, username: str = "test_user") -> dict[str, str]:
    """Tạo JWT Bearer Authorization header."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum20_client():
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

    # Tạo dữ liệu mẫu
    with TestingSessionLocal() as db:
        cust1 = Customer(
            code="DL-001",
            name="Đại lý Minh Anh",
            phone="0911223344",
            customer_group="RETAIL",
            is_active=True,
            is_locked=False,
        )
        cust2 = Customer(
            code="DL-002",
            name="Đại lý Hoàng Long",
            phone="0988776655",
            customer_group="RETAIL",
            is_active=True,
            is_locked=False,
        )
        cust_locked = Customer(
            code="DL-LOCKED",
            name="Đại lý Nợ Xấu",
            phone="0933445566",
            customer_group="RETAIL",
            is_active=True,
            is_locked=True,
            lock_reason="Nợ quá hạn 60 ngày",
        )
        db.add_all([cust1, cust2, cust_locked])
        db.commit()
        db.refresh(cust1)
        db.refresh(cust2)
        db.refresh(cust_locked)

        # Tạo điểm giao mặc định ban đầu cho cust1
        addr1 = DeliveryAddress(
            customer_id=cust1.id,
            receiver_name="Anh Tuấn (Kho 1)",
            phone="0911223344",
            address="Số 10 Dịch Vọng Hậu, Cầu Giấy, Hà Nội",
            is_default=True,
            note="Giao giờ hành chính",
        )
        # Tạo điểm giao cho cust2
        addr2 = DeliveryAddress(
            customer_id=cust2.id,
            receiver_name="Chị Lan (Trụ sở)",
            phone="0988776655",
            address="Số 25 Lê Duẩn, Hải Châu, Đà Nẵng",
            is_default=True,
            note="Gọi trước khi đến 30 phút",
        )
        db.add_all([addr1, addr2])
        db.commit()

        c1_id = cust1.id
        c2_id = cust2.id
        c_locked_id = cust_locked.id
        addr1_id = addr1.id
        addr2_id = addr2.id

    client = TestClient(app)
    yield client, {
        "cust1_id": c1_id,
        "cust2_id": c2_id,
        "cust_locked_id": c_locked_id,
        "addr1_id": addr1_id,
        "addr2_id": addr2_id,
    }

    app.dependency_overrides.clear()


# ---------------------------------------------------------
# Test Cases SCRUM-20
# ---------------------------------------------------------

def test_list_delivery_addresses(scrum20_client):
    """Lấy danh sách các điểm giao hàng của đại lý."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    res = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=headers)
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) == 1
    assert items[0]["id"] == data["addr1_id"]
    assert items[0]["receiver_name"] == "Anh Tuấn (Kho 1)"
    assert items[0]["phone"] == "0911223344"
    assert items[0]["address"] == "Số 10 Dịch Vọng Hậu, Cầu Giấy, Hà Nội"
    assert items[0]["is_default"] is True
    assert items[0]["note"] == "Giao giờ hành chính"


def test_create_delivery_address_success(scrum20_client):
    """Thêm mới điểm giao hàng với đầy đủ thông tin."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    payload = {
        "receiverName": "Bác Bình (Kho 2)",
        "phone": "0977889900",
        "address": "Km 12 Quốc Lộ 1A, Thanh Trì, Hà Nội",
        "isDefault": False,
        "note": "Kho xe tải lùi vào được",
    }
    res = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 201, res.text
    addr = res.json()
    assert addr["receiver_name"] == "Bác Bình (Kho 2)"
    assert addr["phone"] == "0977889900"
    assert addr["address"] == "Km 12 Quốc Lộ 1A, Thanh Trì, Hà Nội"
    assert addr["is_default"] is False
    assert addr["note"] == "Kho xe tải lùi vào được"

    # Kiểm tra danh sách có 2 điểm
    res_list = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=headers)
    assert len(res_list.json()) == 2


def test_create_delivery_address_make_default_switches_others(scrum20_client):
    """Khi thêm điểm giao mới với isDefault=True, điểm cũ phải bị hủy mặc định."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    payload = {
        "receiverName": "Kho Mới",
        "phone": "0933112233",
        "address": "Khu CN Sài Đồng, Long Biên",
        "isDefault": True,
        "note": "Kho chính mới chuyển",
    }
    res = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 201
    new_addr = res.json()
    assert new_addr["is_default"] is True

    # Kiểm tra điểm cũ addr1_id không còn là mặc định
    res_list = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=headers)
    items = res_list.json()
    addr1 = next(a for a in items if a["id"] == data["addr1_id"])
    assert addr1["is_default"] is False


def test_create_delivery_address_validation_errors(scrum20_client):
    """Kiểm tra validation: Tên người nhận rỗng, SĐT không đúng định dạng VN, địa chỉ rỗng."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # 1. Tên người nhận rỗng
    res1 = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={"receiverName": "   ", "phone": "0911223344", "address": "Hà Nội"},
    )
    assert res1.status_code in {400, 422}

    # 2. Số điện thoại sai định dạng (ít chữ số, chữ cái, sai đầu số)
    res2 = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={"receiverName": "Tuấn", "phone": "123456", "address": "Hà Nội"},
    )
    assert res2.status_code in {400, 422}

    res2_char = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={"receiverName": "Tuấn", "phone": "09abcdef12", "address": "Hà Nội"},
    )
    assert res2_char.status_code in {400, 422}

    # 3. Địa chỉ rỗng
    res3 = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={"receiverName": "Tuấn", "phone": "0911223344", "address": "   "},
    )
    assert res3.status_code in {400, 422}


def test_update_delivery_address_success(scrum20_client):
    """Cập nhật thông tin điểm giao hàng thành công."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    payload = {
        "receiverName": "Anh Tuấn Cập Nhật",
        "phone": "0922334455",
        "address": "Số 99 Duy Tân, Cầu Giấy, Hà Nội",
        "note": "Cổng sau kho số 3",
    }
    res = client.put(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses/{data['addr1_id']}",
        headers=headers,
        json=payload,
    )
    assert res.status_code == 200, res.text
    updated = res.json()
    assert updated["receiver_name"] == "Anh Tuấn Cập Nhật"
    assert updated["phone"] == "0922334455"
    assert updated["address"] == "Số 99 Duy Tân, Cầu Giấy, Hà Nội"
    assert updated["note"] == "Cổng sau kho số 3"


def test_patch_default_delivery_address(scrum20_client):
    """Đặt một điểm giao hàng làm mặc định qua PATCH /default."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # Tạo điểm thứ 2 không mặc định
    res_create = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={
            "receiverName": "Điểm 2",
            "phone": "0955667788",
            "address": "Đông Anh, Hà Nội",
            "isDefault": False,
        },
    )
    addr2_id = res_create.json()["id"]

    # Đặt điểm 2 làm mặc định
    res_patch = client.patch(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses/{addr2_id}/default",
        headers=headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["is_default"] is True

    # Kiểm tra điểm 1 không còn là mặc định
    res_list = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=headers)
    items = res_list.json()
    addr1 = next(a for a in items if a["id"] == data["addr1_id"])
    addr2 = next(a for a in items if a["id"] == addr2_id)
    assert addr1["is_default"] is False
    assert addr2["is_default"] is True


def test_delete_delivery_address_and_maintain_default(scrum20_client):
    """Xóa điểm giao hàng mặc định: điểm còn lại tự động được chọn làm mặc định mới."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # Thêm điểm thứ 2
    res_create = client.post(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses",
        headers=headers,
        json={
            "receiverName": "Điểm Phụ",
            "phone": "0988112233",
            "address": "Phố Huế, Hai Bà Trưng, Hà Nội",
            "isDefault": False,
        },
    )
    addr2_id = res_create.json()["id"]

    # Xóa điểm 1 (đang là mặc định)
    res_del = client.delete(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses/{data['addr1_id']}",
        headers=headers,
    )
    assert res_del.status_code == 200

    # Kiểm tra điểm 2 tự động được thăng làm mặc định
    res_list = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=headers)
    items = res_list.json()
    assert len(items) == 1
    assert items[0]["id"] == addr2_id
    assert items[0]["is_default"] is True


def test_reject_operations_on_wrong_customer_or_nonexistent(scrum20_client):
    """Từ chối thao tác với điểm giao hàng không thuộc về đại lý hoặc không tồn tại."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # 1. Đại lý không tồn tại (404)
    res_not_found = client.get("/api/v1/customers/99999/delivery-addresses", headers=headers)
    assert res_not_found.status_code == 404

    # 2. Điểm giao hàng không tồn tại (404)
    res_addr_not_found = client.put(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses/99999",
        headers=headers,
        json={"receiverName": "Người lạ"},
    )
    assert res_addr_not_found.status_code == 404

    # 3. Thử sửa điểm của cust2 nhưng truyền customer_id là cust1 (chặn 400 Bad Request)
    res_cross_cust = client.put(
        f"/api/v1/customers/{data['cust1_id']}/delivery-addresses/{data['addr2_id']}",
        headers=headers,
        json={"receiverName": "Chiếm đoạt điểm giao"},
    )
    assert res_cross_cust.status_code == 400


def test_authorization_and_customer_data_isolation(scrum20_client):
    """Kiểm tra phân quyền và cô lập dữ liệu đại lý."""
    client, data = scrum20_client

    # 1. Chưa đăng nhập -> 401 Unauthorized
    res_unauth = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses")
    assert res_unauth.status_code == 401

    # 2. Khách hàng xem điểm giao hàng của chính mình (hợp lệ)
    cust1_headers = make_auth_headers("Customer", "DL-001")
    res_own = client.get(f"/api/v1/customers/{data['cust1_id']}/delivery-addresses", headers=cust1_headers)
    assert res_own.status_code == 200

    # 3. Khách hàng cố xem điểm giao hàng của đại lý khác (bị chặn 403 Forbidden)
    res_other = client.get(f"/api/v1/customers/{data['cust2_id']}/delivery-addresses", headers=cust1_headers)
    assert res_other.status_code == 403


def test_order_creation_with_delivery_address(scrum20_client):
    """Tạo đơn hàng liên kết đúng điểm giao hàng."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # 1. Tạo đơn hàng chọn điểm giao hàng cụ thể của cust1
    res = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "customer_id": data["cust1_id"],
            "delivery_address_id": data["addr1_id"],
            "items": [{"sku": "SKU-001", "product_name": "Nước tăng lực", "quantity": 5, "unit_price": 50000}],
            "note": "Giao gấp buổi sáng",
        },
    )
    assert res.status_code == 201, res.text
    order_data = res.json()
    assert order_data["customer_id"] == data["cust1_id"]
    assert order_data["delivery_address_id"] == data["addr1_id"]
    assert order_data["delivery_address"] is not None
    assert order_data["delivery_address"]["receiver_name"] == "Anh Tuấn (Kho 1)"

    # 2. Tạo đơn hàng KHÔNG chỉ định điểm giao -> tự động lấy điểm mặc định
    res_auto = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "customer_id": data["cust1_id"],
            "items": [{"sku": "SKU-001", "product_name": "Nước tăng lực", "quantity": 2, "unit_price": 50000}],
        },
    )
    assert res_auto.status_code == 201
    assert res_auto.json()["delivery_address_id"] == data["addr1_id"]

    # 3. Thử tạo đơn hàng với điểm giao thuộc về ĐẠI LÝ KHÁC (chặn 400 Bad Request)
    res_invalid_combo = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "customer_id": data["cust1_id"],
            "delivery_address_id": data["addr2_id"],  # addr2 thuộc về cust2
            "items": [{"sku": "SKU-001", "product_name": "Nước tăng lực", "quantity": 1, "unit_price": 50000}],
        },
    )
    assert res_invalid_combo.status_code == 400
    assert "không thuộc về đại lý" in res_invalid_combo.json()["detail"]

    # 4. Thử tạo đơn hàng với điểm giao không tồn tại (chặn 404 Not Found)
    res_not_found = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "customer_id": data["cust1_id"],
            "delivery_address_id": 99999,
            "items": [{"sku": "SKU-001", "product_name": "Nước tăng lực", "quantity": 1, "unit_price": 50000}],
        },
    )
    assert res_not_found.status_code == 404


def test_scrum85_locked_customer_cannot_order_with_delivery_address(scrum20_client):
    """Bảo toàn SCRUM-85: Đại lý bị khóa giao dịch không thể tạo đơn dù có điểm giao hàng."""
    client, data = scrum20_client
    headers = make_auth_headers("Sales Rep", "sales_01")

    # Tạo điểm giao cho đại lý bị khóa
    res_addr = client.post(
        f"/api/v1/customers/{data['cust_locked_id']}/delivery-addresses",
        headers=headers,
        json={
            "receiverName": "Người nhận",
            "phone": "0933445566",
            "address": "Kho đại lý khóa",
            "isDefault": True,
        },
    )
    assert res_addr.status_code == 201
    locked_addr_id = res_addr.json()["id"]

    # Cố gắng tạo đơn hàng -> Phải bị chặn 400 Bad Request theo SCRUM-85
    res_order = client.post(
        "/api/v1/orders",
        headers=headers,
        json={
            "customer_id": data["cust_locked_id"],
            "delivery_address_id": locked_addr_id,
            "items": [{"sku": "SKU-001", "product_name": "Nước tăng lực", "quantity": 1, "unit_price": 50000}],
        },
    )
    assert res_order.status_code == 400
    assert "đã bị khóa giao dịch" in res_order.json()["detail"]
