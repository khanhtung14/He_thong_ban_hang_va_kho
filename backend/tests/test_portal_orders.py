"""Tests for Dealer Portal Order Tracking & Delivery Details (SCRUM-Portal-Orders)
Endpoints:
- GET /api/v1/portal/orders
- GET /api/v1/portal/orders/{order_id}
"""

import pytest
from datetime import date, datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.models import (
    Base,
    Customer,
    DeliveryAddress,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    Role,
    RoleCode,
    User,
)
from app.api.v1.endpoints.customer_lock_routes import router as customer_lock_router
from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import get_db


@pytest.fixture
def portal_orders_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(customer_lock_router)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()

    # Seed role
    cust_role = Role(code="CUSTOMER", name="Khách hàng")
    db.add(cust_role)
    db.commit()

    # Tạo User & Customer cho Đại lý 1
    user_d1 = User(
        username="dealer_portal_1",
        email="dealer1@example.com",
        full_name="Đại Lý Toàn Thắng",
        password_hash="mock",
        is_active=True,
    )
    user_d1.roles.append(cust_role)
    db.add(user_d1)
    db.commit()
    db.refresh(user_d1)

    customer1 = Customer(
        code="DL-TOANTHANG",
        name="Đại Lý Toàn Thắng",
        phone="0912345678",
        address="123 Nguyễn Trãi, Thanh Xuân, Hà Nội",
        user_id=user_d1.id,
        is_active=True,
    )
    db.add(customer1)
    db.commit()
    db.refresh(customer1)

    # Điểm giao hàng của Đại lý 1
    addr1 = DeliveryAddress(
        customer_id=customer1.id,
        receiver_name="Kho Tổng Toàn Thắng",
        phone="0912345678",
        address="Khu Công Nghiệp Đài Tư, Sài Đồng, Long Biên, Hà Nội",
        is_default=True,
    )
    db.add(addr1)
    db.commit()
    db.refresh(addr1)

    # Tạo User & Customer cho Đại lý 2 (để test data isolation / 403 Forbidden)
    user_d2 = User(
        username="dealer_portal_2",
        email="dealer2@example.com",
        full_name="Đại Lý Phát Đạt",
        password_hash="mock",
        is_active=True,
    )
    user_d2.roles.append(cust_role)
    db.add(user_d2)
    db.commit()
    db.refresh(user_d2)

    customer2 = Customer(
        code="DL-PHATDAT",
        name="Đại Lý Phát Đạt",
        phone="0987654321",
        address="456 Lê Lợi, TP. Đà Nẵng",
        user_id=user_d2.id,
        is_active=True,
    )
    db.add(customer2)
    db.commit()
    db.refresh(customer2)

    # Tạo sản phẩm
    p1 = Product(sku="SKU-STEEL-01", name="Thép cuộn mạ kẽm", base_unit="Cuộn", status="ACTIVE")
    p2 = Product(sku="SKU-BRICK-02", name="Gạch lát Viglacera 60x60", base_unit="Hộp", status="ACTIVE")
    db.add_all([p1, p2])
    db.commit()
    db.refresh(p1)
    db.refresh(p2)

    # Đơn hàng 1 của Đại lý 1 (Trạng thái SHIPPING, giao thiếu 2 cuộn)
    ord1 = Order(
        order_code="ORD-PORTAL-001",
        customer_id=customer1.id,
        delivery_address_id=addr1.id,
        desired_delivery_date=date(2026, 10, 25),
        status=OrderStatus.PROCESSING,
        total_amount=50000000.0,
        subtotal_amount=50000000.0,
        discount_amount=0.0,
        note="Giao trước 17h chiều",
        created_at=datetime(2026, 10, 16, 9, 30),
    )
    db.add(ord1)
    db.commit()
    db.refresh(ord1)

    item1_1 = OrderItem(
        order_id=ord1.id,
        product_id=p1.id,
        sku=p1.sku,
        product_name=p1.name,
        unit_name="Cuộn",
        quantity=10,
        unit_price=5000000.0,
        line_total=50000000.0,
    )
    # Gắn thuộc tính quantity_delivered = 8 (thiếu 2 cuộn)
    item1_1.quantity_delivered = 8
    db.add(item1_1)

    # Đơn hàng 2 của Đại lý 1 (Trạng thái COMPLETED, giao đủ)
    ord2 = Order(
        order_code="ORD-PORTAL-002",
        customer_id=customer1.id,
        desired_delivery_date=date(2026, 10, 20),
        status=OrderStatus.COMPLETED,
        total_amount=12000000.0,
        subtotal_amount=12000000.0,
        discount_amount=0.0,
        note="Giao thành công",
        created_at=datetime(2026, 10, 17, 14, 0),
    )
    db.add(ord2)
    db.commit()
    db.refresh(ord2)

    item2_1 = OrderItem(
        order_id=ord2.id,
        product_id=p2.id,
        sku=p2.sku,
        product_name=p2.name,
        unit_name="Hộp",
        quantity=40,
        unit_price=300000.0,
        line_total=12000000.0,
    )
    db.add(item2_1)

    # Đơn hàng của Đại lý 2 (thuộc cust2)
    ord_other = Order(
        order_code="ORD-PORTAL-OTHER",
        customer_id=customer2.id,
        status=OrderStatus.PENDING_APPROVAL,
        total_amount=5000000.0,
        created_at=datetime(2026, 10, 17, 10, 0),
    )
    db.add(ord_other)
    db.commit()

    ord1_id = ord1.id
    ord2_id = ord2.id
    ord_other_id = ord_other.id

    db.close()

    yield {
        "app": app,
        "ord1_id": ord1_id,
        "ord2_id": ord2_id,
        "ord_other_id": ord_other_id,
    }

    app.dependency_overrides.clear()


def test_portal_orders_list_sorting_and_fields(portal_orders_app):
    """Kiểm tra danh sách đơn hàng portal: đúng fields, sắp xếp mới nhất lên đầu, lọc đúng đại lý."""
    app = portal_orders_app["app"]
    client = TestClient(app)
    token = create_access_token(data={"sub": "dealer_portal_1", "role": "CUSTOMER"})
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/v1/portal/orders", headers=headers)
    assert resp.status_code == 200
    orders = resp.json()
    assert len(orders) == 2

    # Kiểm tra thứ tự sắp xếp: Đơn ord2 tạo lúc 14:00 ngày 17/10 phải đứng trước ord1 (9:30 ngày 16/10)
    assert orders[0]["order_code"] == "ORD-PORTAL-002"
    assert orders[1]["order_code"] == "ORD-PORTAL-001"

    # Kiểm tra các trường bắt buộc
    ord1_data = orders[1]
    assert ord1_data["id"] == portal_orders_app["ord1_id"]
    assert ord1_data["order_code"] == "ORD-PORTAL-001"
    assert ord1_data["created_at"] is not None
    assert ord1_data["expected_delivery_date"] == "2026-10-25"
    assert ord1_data["total_amount"] == 50000000.0
    assert ord1_data["status"] == "PROCESSING"
    assert "Kho Tổng Toàn Thắng" in ord1_data["delivery_point_name"]
    assert "Long Biên" in ord1_data["delivery_address"]
    assert ord1_data["is_partially_delivered"] is True


def test_portal_order_detail_success(portal_orders_app):
    """Kiểm tra xem chi tiết đơn hàng: trả về đầy đủ items, thông tin giao nhận và cờ giao thiếu."""
    app = portal_orders_app["app"]
    client = TestClient(app)
    token = create_access_token(data={"sub": "dealer_portal_1", "role": "CUSTOMER"})
    headers = {"Authorization": f"Bearer {token}"}

    ord1_id = portal_orders_app["ord1_id"]
    resp = client.get(f"/api/v1/portal/orders/{ord1_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["order_code"] == "ORD-PORTAL-001"
    assert data["expected_delivery_date"] == "2026-10-25"
    assert data["status"] == "PROCESSING"
    assert data["delivery_point_name"] == "Kho Tổng Toàn Thắng"
    assert "Sài Đồng" in data["delivery_address"]
    assert data["is_partially_delivered"] is True

    # Kiểm tra items
    items = data["items"]
    assert len(items) == 1
    it = items[0]
    assert it["sku"] == "SKU-STEEL-01"
    assert it["product_name"] == "Thép cuộn mạ kẽm"
    assert it["unit"] == "Cuộn"
    assert it["ordered_quantity"] == 10
    assert it["delivered_quantity"] == 8
    assert it["unit_price"] == 5000000.0
    assert it["total_price"] == 50000000.0
    assert it["is_partially_delivered"] is True


def test_portal_order_detail_completed_fully_delivered(portal_orders_app):
    """Kiểm tra đơn hàng đã hoàn tất: mặc định giao đủ, is_partially_delivered = False."""
    app = portal_orders_app["app"]
    client = TestClient(app)
    token = create_access_token(data={"sub": "dealer_portal_1", "role": "CUSTOMER"})
    headers = {"Authorization": f"Bearer {token}"}

    ord2_id = portal_orders_app["ord2_id"]
    resp = client.get(f"/api/v1/portal/orders/{ord2_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "COMPLETED"
    assert data["is_partially_delivered"] is False
    assert len(data["items"]) == 1
    assert data["items"][0]["ordered_quantity"] == 40
    assert data["items"][0]["delivered_quantity"] == 40
    assert data["items"][0]["is_partially_delivered"] is False


def test_portal_order_detail_forbidden_for_other_dealer(portal_orders_app):
    """Đại lý 2 không được phép xem đơn hàng của Đại lý 1 -> 403 Forbidden."""
    app = portal_orders_app["app"]
    client = TestClient(app)
    token2 = create_access_token(data={"sub": "dealer_portal_2", "role": "CUSTOMER"})
    headers2 = {"Authorization": f"Bearer {token2}"}

    ord1_id = portal_orders_app["ord1_id"]
    resp = client.get(f"/api/v1/portal/orders/{ord1_id}", headers=headers2)
    assert resp.status_code == 403
    assert "không có quyền" in resp.json()["detail"]


def test_portal_order_detail_not_found(portal_orders_app):
    """Truy vấn đơn hàng không tồn tại -> 404 Not Found."""
    app = portal_orders_app["app"]
    client = TestClient(app)
    token = create_access_token(data={"sub": "dealer_portal_1", "role": "CUSTOMER"})
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/v1/portal/orders/999999", headers=headers)
    assert resp.status_code == 404
