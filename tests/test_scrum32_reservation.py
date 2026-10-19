"""Tests for SCRUM-32: Giữ chỗ tồn kho khi đơn được duyệt.

Yêu cầu nghiệp vụ (Jira SCRUM-32):
1. Đơn chuyển sang Đã duyệt (APPROVED) thì tồn tương ứng được giữ chỗ (reserved_qty tăng, available_qty giảm), không ai đặt được nữa.
2. Không cho phép giữ chỗ vượt quá lượng tồn kho khả dụng.
3. Việc trừ tồn và ghi giữ chỗ nằm trong cùng một giao dịch (atomic), nếu có bất kỳ sản phẩm nào thiếu hoặc lỗi giữa chừng thì hoàn lại toàn bộ (rollback).
4. Không giữ chỗ nhiều lần khi một đơn được xử lý lại (idempotency).
5. Hủy đơn hoặc từ chối đơn thì tồn giữ chỗ được nhả tự động.
6. Tự động giải phóng tồn giữ chỗ khi đơn quá hạn (auto_release_expired_reservations).
"""
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db, migrate_pricing_schema
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
from app.services.inventory_service import (
    calculate_available_qty,
    reserve_order_stock_transactional,
    release_order_stock_transactional,
    auto_release_expired_reservations,
)
from backend.main import app


def make_auth_header(role: str = "Sales Manager", username: str = "sm_user") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum32_env():
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
        # Tạo kho
        wh = Warehouse(id=1, code="WH-HN", name="Kho Hà Nội", is_active=True)
        db.add(wh)

        # Tạo sản phẩm
        p1 = Product(id=1, sku="SKU-TEST-01", name="Sữa Tươi Tiệt Trùng 1L", base_price=30000.0, base_unit="Hộp", status="ACTIVE")
        p2 = Product(id=2, sku="SKU-TEST-02", name="Nước Khoáng Lavie 500ml", base_price=10000.0, base_unit="Chai", status="ACTIVE")
        db.add_all([p1, p2])

        # Tạo tồn kho:
        # P1: physical=100, reserved=0, available=100
        # P2: physical=30, reserved=0, available=30
        inv1 = Inventory(product_id=1, warehouse_id=1, physical_qty=100.0, reserved_qty=0.0, available_qty=100.0)
        inv2 = Inventory(product_id=2, warehouse_id=1, physical_qty=30.0, reserved_qty=0.0, available_qty=30.0)
        db.add_all([inv1, inv2])

        # Tạo khách hàng & địa chỉ
        cust = Customer(
            id=1,
            code="DL-001",
            name="Đại Lý Toàn Thắng",
            phone="0912345678",
            is_active=True,
            is_locked=False,
            credit_limit=100000000.0,
            current_debt=0.0,
            warehouse_id=1,
        )
        db.add(cust)
        addr = DeliveryAddress(
            customer_id=1,
            receiver_name="Nguyễn Văn Thắng",
            phone="0912345678",
            address="123 Phố Huế, Hà Nội",
            is_default=True,
        )
        db.add(addr)

        # Tạo user
        u = User(
            id=999,
            username="sm_user",
            email="sm@oms.com",
            full_name="Sales Manager User",
            password_hash="fakehash",
            is_active=True,
        )
        db.add(u)
        db.commit()

    client = TestClient(app)
    yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_approve_order_reserves_stock_transactional_success(scrum32_env):
    """AC1: Khi duyệt đơn, hệ thống giữ chỗ tồn kho tương ứng, không ai đặt được nữa."""
    client, SessionLocal = scrum32_env
    headers = make_auth_header("Sales Manager", "sm_user")

    # Tạo đơn hàng ở trạng thái PENDING_APPROVAL
    with SessionLocal() as db:
        order = Order(
            order_code="ORD-32-001",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.PENDING_APPROVAL,
            total_amount=1500000.0,
            is_stock_reserved=False,
        )
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-TEST-01", product_name="Sữa Tươi", quantity=20, unit_price=30000.0)
        item2 = OrderItem(order_id=order.id, product_id=2, sku="SKU-TEST-02", product_name="Nước Khoáng", quantity=10, unit_price=10000.0)
        db.add_all([item1, item2])
        db.commit()
        order_id = order.id

    # Duyệt đơn hàng
    res = client.post(f"/api/v1/orders/{order_id}/approve", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "APPROVED"

    # Kiểm tra tồn kho sau khi duyệt:
    # P1: physical=100, reserved=20, available=80
    # P2: physical=30, reserved=10, available=20
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        inv2 = db.query(Inventory).filter(Inventory.product_id == 2, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 20.0
        assert inv1.available_qty == 80.0
        assert inv2.reserved_qty == 10.0
        assert inv2.available_qty == 20.0

        ord_db = db.get(Order, order_id)
        assert ord_db.is_stock_reserved is True
        assert ord_db.approved_at is not None
        assert ord_db.reservation_expires_at is not None


def test_approve_order_insufficient_stock_atomic_rollback(scrum32_env):
    """AC2: Lỗi giữa chừng (thiếu tồn ở một sản phẩm) thì hoàn lại toàn bộ giao dịch, không giữ chỗ dở dang."""
    client, SessionLocal = scrum32_env
    headers = make_auth_header("Sales Manager", "sm_user")

    # Tạo đơn hàng: P1 cần 10 (đủ tồn 100), nhưng P2 cần 50 (trong khi P2 chỉ có tồn 30)
    with SessionLocal() as db:
        order = Order(
            order_code="ORD-32-002",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.PENDING_APPROVAL,
            total_amount=800000.0,
            is_stock_reserved=False,
        )
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-TEST-01", product_name="Sữa Tươi", quantity=10, unit_price=30000.0)
        item2 = OrderItem(order_id=order.id, product_id=2, sku="SKU-TEST-02", product_name="Nước Khoáng", quantity=50, unit_price=10000.0)
        db.add_all([item1, item2])
        db.commit()
        order_id = order.id

    # Duyệt đơn hàng -> phải thất bại vì P2 không đủ hàng
    res = client.post(f"/api/v1/orders/{order_id}/approve", headers=headers)
    assert res.status_code == 400
    assert "Tồn khả dụng không đủ" in res.json()["detail"]

    # Kiểm tra tồn kho: P1 TUYỆT ĐỐI KHÔNG bị tăng reserved_qty (phải giữ nguyên reserved=0, available=100)
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        inv2 = db.query(Inventory).filter(Inventory.product_id == 2, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 0.0
        assert inv1.available_qty == 100.0
        assert inv2.reserved_qty == 0.0
        assert inv2.available_qty == 30.0

        ord_db = db.get(Order, order_id)
        assert ord_db.status == OrderStatus.PENDING_APPROVAL
        assert ord_db.is_stock_reserved is False


def test_approve_order_idempotency_no_duplicate_reservation(scrum32_env):
    """Không giữ chỗ lặp khi đơn đã được giữ chỗ."""
    client, SessionLocal = scrum32_env

    with SessionLocal() as db:
        order = Order(
            order_code="ORD-32-003",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.APPROVED,
            total_amount=300000.0,
            is_stock_reserved=False,
        )
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-TEST-01", product_name="Sữa Tươi", quantity=15, unit_price=30000.0)
        db.add(item1)
        db.commit()

        # Gọi lần 1
        reserve_order_stock_transactional(db, order)
        db.commit()

        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 15.0

        # Gọi lần 2 (idempotent)
        reserve_order_stock_transactional(db, order)
        db.commit()

        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 15.0  # Không bị cộng dồn thành 30


def test_cancel_order_releases_reserved_stock(scrum32_env):
    """AC3: Huỷ đơn thì tồn giữ chỗ được nhả tự động."""
    client, SessionLocal = scrum32_env
    headers = make_auth_header("Sales Manager", "sm_user")

    # Tạo đơn đã duyệt & giữ chỗ 20 units
    with SessionLocal() as db:
        order = Order(
            order_code="ORD-32-004",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.APPROVED,
            total_amount=600000.0,
            is_stock_reserved=False,
        )
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-TEST-01", product_name="Sữa Tươi", quantity=20, unit_price=30000.0)
        db.add(item1)
        db.commit()
        order_id = order.id

        reserve_order_stock_transactional(db, order)
        db.commit()

    # Xác nhận trước khi hủy: reserved=20, available=80
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 20.0
        assert inv1.available_qty == 80.0

    # Hủy đơn hàng
    res = client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers)
    assert res.status_code == 200, res.text

    # Sau khi hủy: reserved về 0, available về 100
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 0.0
        assert inv1.available_qty == 100.0
        ord_db = db.get(Order, order_id)
        assert ord_db.status == OrderStatus.CANCELLED
        assert ord_db.is_stock_reserved is False


def test_reject_order_releases_reserved_stock(scrum32_env):
    """Từ chối đơn hàng (reject) tự động giải phóng tồn đang giữ chỗ."""
    client, SessionLocal = scrum32_env
    headers = make_auth_header("Sales Manager", "sm_user")

    with SessionLocal() as db:
        order = Order(
            order_code="ORD-32-005",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.PENDING_APPROVAL,
            total_amount=300000.0,
            is_stock_reserved=True,  # Đã tạm giữ chỗ lúc tạo
        )
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-TEST-01", product_name="Sữa Tươi", quantity=10, unit_price=30000.0)
        db.add(item1)
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        inv1.reserved_qty = 10.0
        inv1.available_qty = 90.0
        db.commit()
        order_id = order.id

    res = client.post(f"/api/v1/orders/{order_id}/reject", json={"reason": "Hết ngân sách"}, headers=headers)
    assert res.status_code == 200

    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.reserved_qty == 0.0
        assert inv1.available_qty == 100.0
        ord_db = db.get(Order, order_id)
        assert ord_db.status == OrderStatus.CANCELLED


def test_auto_release_expired_reservations(scrum32_env):
    """AC3: Đơn quá hạn giữ chỗ thì tồn được nhả tự động."""
    client, SessionLocal = scrum32_env
    headers = make_auth_header("Warehouse Staff", "wh_staff")

    # Tạo 2 đơn: 1 đơn quá hạn (hết hạn 1 giờ trước), 1 đơn còn hạn (hết hạn sau 24h)
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        expired_order = Order(
            order_code="ORD-EXPIRED",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.APPROVED,
            is_stock_reserved=True,
            approved_at=now - timedelta(hours=50),
            reservation_expires_at=now - timedelta(hours=2),
        )
        active_order = Order(
            order_code="ORD-ACTIVE",
            customer_id=1,
            warehouse_id=1,
            status=OrderStatus.APPROVED,
            is_stock_reserved=True,
            approved_at=now,
            reservation_expires_at=now + timedelta(hours=48),
        )
        db.add_all([expired_order, active_order])
        db.flush()

        item_exp = OrderItem(order_id=expired_order.id, product_id=1, sku="SKU-TEST-01", quantity=30, unit_price=30000.0)
        item_act = OrderItem(order_id=active_order.id, product_id=1, sku="SKU-TEST-01", quantity=20, unit_price=30000.0)
        db.add_all([item_exp, item_act])

        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        inv.reserved_qty = 50.0  # 30 + 20
        inv.available_qty = 50.0
        db.commit()
        expired_id = expired_order.id
        active_id = active_order.id

    # Gọi API quét và giải phóng đơn quá hạn
    res = client.post("/api/v1/orders/release-expired-reservations", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert expired_id in data["released_order_ids"]
    assert active_id not in data["released_order_ids"]

    # Kiểm tra lại DB:
    # Đơn expired bị CANCELLED và reserved 30 units được nhả ra
    # inv.reserved_qty từ 50 giảm xuống 20 (chỉ còn đơn active), available_qty từ 50 lên 80
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.reserved_qty == 20.0
        assert inv.available_qty == 80.0

        exp_db = db.get(Order, expired_id)
        assert exp_db.status == OrderStatus.CANCELLED
        assert exp_db.is_stock_reserved is False

        act_db = db.get(Order, active_id)
        assert act_db.status == OrderStatus.APPROVED
        assert act_db.is_stock_reserved is True
