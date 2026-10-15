"""Unit & Integration Tests cho SCRUM-26: Theo dõi trạng thái đơn hàng cho Đại lý.

Tiêu chí nghiệm thu kiểm thử:
1. Đại lý lấy danh sách đơn hàng của chính mình (GET /api/v1/orders/my-orders).
2. Đại lý xem chi tiết đơn hàng kèm danh sách sản phẩm và số lượng thực giao (GET /api/v1/orders/my-orders/{order_id}).
3. BẮT BUỘC chặn 403 Forbidden nếu đại lý cố tình xem đơn hàng thuộc về đại lý khác.
4. Trả về 404 Not Found nếu đơn hàng không tồn tại.
5. Trả về 401 Unauthorized nếu không có token xác thực.
6. Xác thực chính xác các dòng hàng có số lượng giao thiếu (quantity_delivered < quantity_ordered).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.models import (
    Base,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    RoleCode,
    User,
)
from src.backend.rbac import create_access_token
from src.backend.main import app
from src.backend.schemas.order import (
    OrderItemTrackingResponse,
    OrderTrackingListResponse,
    OrderTrackingDetailResponse,
)


def make_token(username: str, role: str = "Customer", dealer_id: int | None = None) -> Dict[str, str]:
    """Tạo JWT Bearer header cho test."""
    payload: Dict[str, Any] = {"sub": username, "role": role}
    if dealer_id is not None:
        payload["dealer_id"] = dealer_id
        payload["customer_id"] = dealer_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def env():
    """Tạo database SQLite in-memory độc lập cho kiểm thử SCRUM-26."""
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
    client = TestClient(app)

    # Seed dữ liệu mẫu: 2 đại lý, 1 sản phẩm
    db = TestingSessionLocal()

    # Đại lý 1
    dealer_1 = Customer(
        code="DL001",
        name="Đại lý Minh Phát",
        phone="0911000001",
        customer_group="WHOLESALE",
        is_active=True,
    )
    # Đại lý 2
    dealer_2 = Customer(
        code="DL002",
        name="Đại lý Hoàng Nam",
        phone="0911000002",
        customer_group="WHOLESALE",
        is_active=True,
    )
    db.add_all([dealer_1, dealer_2])
    db.flush()

    # Sản phẩm mẫu
    p1 = Product(sku="SP001", name="Gạch men ceramic cao cấp", base_unit="Hộp", base_price=120000.0)
    p2 = Product(sku="SP002", name="Sơn chống thấm ngoại thất", base_unit="Thùng", base_price=350000.0)
    db.add_all([p1, p2])
    db.flush()

    # Đơn hàng 1 của Đại lý 1 (Đang xử lý, có mặt hàng giao thiếu)
    order_1 = Order(
        order_code="ORD-DL1-001",
        customer_id=dealer_1.id,
        status=OrderStatus.PROCESSING,
        total_amount=1500000.0,
        expected_delivery_date=date(2026, 10, 20),
    )
    db.add(order_1)
    db.flush()

    item_1a = OrderItem(
        order_id=order_1.id,
        product_id=p1.id,
        sku=p1.sku,
        product_name=p1.name,
        quantity=10,
        quantity_delivered=8,  # Giao thiếu: 8/10
        unit_price=120000.0,
    )
    item_1b = OrderItem(
        order_id=order_1.id,
        product_id=p2.id,
        sku=p2.sku,
        product_name=p2.name,
        quantity=5,
        quantity_delivered=5,  # Giao đủ: 5/5
        unit_price=350000.0,
    )
    db.add_all([item_1a, item_1b])

    # Đơn hàng 2 của Đại lý 1 (Đã hoàn thành)
    order_2 = Order(
        order_code="ORD-DL1-002",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=500000.0,
        expected_delivery_date=date(2026, 10, 25),
    )
    db.add(order_2)

    # Đơn hàng của Đại lý 2 (Thuộc về đại lý khác)
    order_other = Order(
        order_code="ORD-DL2-001",
        customer_id=dealer_2.id,
        status=OrderStatus.APPROVED,
        total_amount=2000000.0,
        expected_delivery_date=date(2026, 10, 22),
    )
    db.add(order_other)
    db.commit()

    order_1_id = order_1.id
    order_2_id = order_2.id
    order_other_id = order_other.id
    dealer_1_id = dealer_1.id
    dealer_2_id = dealer_2.id

    db.close()

    yield {
        "client": client,
        "dealer_1_id": dealer_1_id,
        "dealer_2_id": dealer_2_id,
        "order_1_id": order_1_id,
        "order_2_id": order_2_id,
        "order_other_id": order_other_id,
    }

    app.dependency_overrides.clear()


def test_get_my_orders_success(env):
    """Test 1: Đại lý lấy danh sách đơn hàng của mình thành công."""
    client = env["client"]
    headers = make_token(username="DL001", dealer_id=env["dealer_1_id"])

    res = client.get("/api/v1/orders/my-orders", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 2

    # Đơn hàng phải thuộc về dealer_1
    for order in data:
        assert order["dealer_id"] == env["dealer_1_id"]
        assert "status" in order
        assert "total_amount" in order
        assert "expected_delivery_date" in order


def test_get_my_orders_isolation(env):
    """Test 2: Đại lý A chỉ thấy đơn của A, Đại lý B chỉ thấy đơn của B."""
    client = env["client"]

    # Đại lý 2
    headers_d2 = make_token(username="DL002", dealer_id=env["dealer_2_id"])
    res_d2 = client.get("/api/v1/orders/my-orders", headers=headers_d2)
    assert res_d2.status_code == 200
    data_d2 = res_d2.json()
    assert len(data_d2) == 1
    assert data_d2[0]["id"] == env["order_other_id"]
    assert data_d2[0]["dealer_id"] == env["dealer_2_id"]


def test_get_my_order_detail_success(env):
    """Test 3: Lấy chi tiết đơn hàng thành công kèm đầy đủ dòng sản phẩm."""
    client = env["client"]
    headers = make_token(username="DL001", dealer_id=env["dealer_1_id"])

    res = client.get(f"/api/v1/orders/my-orders/{env['order_1_id']}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == env["order_1_id"]
    assert data["dealer_id"] == env["dealer_1_id"]
    assert data["status"] == "PROCESSING"
    assert data["expected_delivery_date"] == "2026-10-20"
    assert data["total_amount"] == 1500000.0

    items = data["items"]
    assert len(items) == 2

    # Dòng sản phẩm giao thiếu (8/10)
    item_shortage = next(i for i in items if i["product_name"] == "Gạch men ceramic cao cấp")
    assert item_shortage["quantity_ordered"] == 10
    assert item_shortage["quantity_delivered"] == 8
    assert item_shortage["unit_price"] == 120000.0

    # Dòng sản phẩm giao đủ (5/5)
    item_full = next(i for i in items if i["product_name"] == "Sơn chống thấm ngoại thất")
    assert item_full["quantity_ordered"] == 5
    assert item_full["quantity_delivered"] == 5
    assert item_full["unit_price"] == 350000.0


def test_get_my_order_detail_forbidden_for_other_dealer(env):
    """Test 4: BẮT BUỘC chặn HTTP 403 khi Đại lý cố xem đơn của Đại lý khác."""
    client = env["client"]
    # Đại lý 1 cố xem đơn của Đại lý 2
    headers_d1 = make_token(username="DL001", dealer_id=env["dealer_1_id"])
    res = client.get(f"/api/v1/orders/my-orders/{env['order_other_id']}", headers=headers_d1)

    assert res.status_code == 403
    assert "không có quyền" in res.json()["detail"].lower()


def test_get_my_order_detail_not_found(env):
    """Test 5: Trả về HTTP 404 khi đơn hàng không tồn tại."""
    client = env["client"]
    headers = make_token(username="DL001", dealer_id=env["dealer_1_id"])
    res = client.get("/api/v1/orders/my-orders/99999", headers=headers)

    assert res.status_code == 404
    assert "không tồn tại" in res.json()["detail"].lower()


def test_order_tracking_unauthorized(env):
    """Test 6: Chặn 401 Unauthorized nếu không gửi Authorization header."""
    client = env["client"]
    res_list = client.get("/api/v1/orders/my-orders")
    assert res_list.status_code == 401

    res_detail = client.get(f"/api/v1/orders/my-orders/{env['order_1_id']}")
    assert res_detail.status_code == 401
