"""Unit & Integration Tests cho SCRUM-11: Lịch sử mua hàng của đại lý dành cho Sales.

Tiêu chí kiểm thử:
1. Sales lấy lịch sử mua hàng 90 ngày của đại lý được phân công quản lý.
2. Kiểm tra tính toán total_quantity và average_quantity chuẩn xác, loại bỏ đơn quá 90 ngày và đơn hủy.
3. Lấy danh sách sản phẩm từ đơn đặt hàng thành công mới nhất của đại lý.
4. BẢO MẬT BẮT BUỘC (Isolation): Chặn lỗi 403 Forbidden khi Sales cố tình xem lịch sử của đại lý không thuộc quyền quản lý.
5. Admin/Sales Manager có quyền xem lịch sử của mọi đại lý.
6. Trả về 404 nếu đại lý không tồn tại, 401 nếu thiếu token xác thực.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
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
from src.backend.schemas.sales import (
    PurchaseHistoryItemResponse,
    LastOrderItemResponse,
    LastOrderGroupResponse,
)


def make_token(username: str, role: str = "Sales Rep", user_id: int | None = None) -> Dict[str, str]:
    """Tạo JWT Bearer header cho test."""
    payload: Dict[str, Any] = {"sub": username, "role": role}
    if user_id is not None:
        payload["user_id"] = user_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def env():
    """Tạo môi trường SQLite in-memory biệt lập cho kiểm thử SCRUM-11."""
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

    db = TestingSessionLocal()

    # 1. Tạo 2 Sales Rep
    sales_1 = User(
        username="sales_01",
        email="sales01@company.com",
        full_name="Nguyễn Văn Kinh Doanh 1",
        password_hash="fakehash",
        is_active=True,
    )
    sales_2 = User(
        username="sales_02",
        email="sales02@company.com",
        full_name="Trần Thị Kinh Doanh 2",
        password_hash="fakehash",
        is_active=True,
    )
    db.add_all([sales_1, sales_2])
    db.flush()

    # 2. Tạo 2 Đại lý (Dealer)
    dealer_1 = Customer(
        code="DL001",
        name="Đại lý Minh Phát",
        phone="0911000001",
        customer_group="WHOLESALE",
        sales_rep_id=sales_1.id,  # Thuộc sales_1
        assigned_sales_id=sales_1.id,
        is_active=True,
    )
    dealer_2 = Customer(
        code="DL002",
        name="Đại lý Hoàng Nam",
        phone="0911000002",
        customer_group="WHOLESALE",
        sales_rep_id=sales_2.id,  # Thuộc sales_2
        assigned_sales_id=sales_2.id,
        is_active=True,
    )
    db.add_all([dealer_1, dealer_2])
    db.flush()

    # 3. Tạo sản phẩm mẫu
    p1 = Product(sku="SP001", name="Gạch Ceramic", base_unit="Hộp", base_price=100000.0)
    p2 = Product(sku="SP002", name="Xi Măng Hà Tiên", base_unit="Bao", base_price=80000.0)
    db.add_all([p1, p2])
    db.flush()

    now = datetime.now(timezone.utc)

    # 4. Tạo các đơn hàng cho dealer_1
    # Đơn 1: 40 ngày trước (Thành công - COMPLETED), mua 10 p1 và 5 p2
    order_1 = Order(
        order_code="ORD-D1-01",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=1400000.0,
        created_at=now - timedelta(days=40),
    )
    db.add(order_1)
    db.flush()
    db.add_all([
        OrderItem(order_id=order_1.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, quantity=10, unit_price=100000.0),
        OrderItem(order_id=order_1.id, product_id=p2.id, sku=p2.sku, product_name=p2.name, quantity=5, unit_price=80000.0),
    ])

    # Đơn 2: 20 ngày trước (Thành công - COMPLETED, đây là đơn gần nhất của dealer_1), mua 20 p1
    order_2 = Order(
        order_code="ORD-D1-02",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=2000000.0,
        created_at=now - timedelta(days=20),
    )
    db.add(order_2)
    db.flush()
    db.add(
        OrderItem(order_id=order_2.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, quantity=20, unit_price=100000.0)
    )

    # Đơn 3: 120 ngày trước (Quá 90 ngày, KHÔNG ĐƯỢC tính vào lịch sử 90 ngày)
    order_old = Order(
        order_code="ORD-D1-OLD",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=5000000.0,
        created_at=now - timedelta(days=120),
    )
    db.add(order_old)
    db.flush()
    db.add(
        OrderItem(order_id=order_old.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, quantity=50, unit_price=100000.0)
    )

    # Đơn 4: 10 ngày trước nhưng trạng thái HỦY (CANCELLED, KHÔNG ĐƯỢC tính)
    order_cancelled = Order(
        order_code="ORD-D1-CANCEL",
        customer_id=dealer_1.id,
        status=OrderStatus.CANCELLED,
        total_amount=9900000.0,
        created_at=now - timedelta(days=10),
    )
    db.add(order_cancelled)
    db.flush()
    db.add(
        OrderItem(order_id=order_cancelled.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, quantity=99, unit_price=100000.0)
    )

    # 5. Đơn hàng cho dealer_2 (do sales_2 quản lý)
    order_d2 = Order(
        order_code="ORD-D2-01",
        customer_id=dealer_2.id,
        status=OrderStatus.COMPLETED,
        total_amount=800000.0,
        created_at=now - timedelta(days=15),
    )
    db.add(order_d2)
    db.flush()
    db.add(
        OrderItem(order_id=order_d2.id, product_id=p2.id, sku=p2.sku, product_name=p2.name, quantity=10, unit_price=80000.0)
    )

    db.commit()

    yield {
        "client": client,
        "sales_1_id": sales_1.id,
        "sales_2_id": sales_2.id,
        "dealer_1_id": dealer_1.id,
        "dealer_2_id": dealer_2.id,
        "p1_id": p1.id,
        "p2_id": p2.id,
        "order_2_id": order_2.id,
    }

    app.dependency_overrides.clear()


def test_get_dealer_purchase_history_success_and_calculation(env):
    """Test 1: Lấy lịch sử mua hàng 90 ngày thành công, kiểm tra logic tính toán chuẩn xác."""
    client = env["client"]
    headers = make_token(username="sales_01", role="Sales Rep", user_id=env["sales_1_id"])

    res = client.get(f"/api/v1/sales/dealers/{env['dealer_1_id']}/purchase-history", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 2

    # Mặt hàng p1 (Gạch Ceramic): Đơn 1 có 10, Đơn 2 có 20 -> Tổng = 30, Bình quân = 15.0
    item_p1 = next(item for item in data if item["product_id"] == env["p1_id"])
    assert item_p1["product_name"] == "Gạch Ceramic"
    assert item_p1["total_quantity"] == 30
    assert item_p1["average_quantity"] == 15.0

    # Mặt hàng p2 (Xi Măng): Đơn 1 có 5 -> Tổng = 5, Bình quân = 5.0
    item_p2 = next(item for item in data if item["product_id"] == env["p2_id"])
    assert item_p2["product_name"] == "Xi Măng Hà Tiên"
    assert item_p2["total_quantity"] == 5
    assert item_p2["average_quantity"] == 5.0


def test_get_dealer_last_order_success(env):
    """Test 2: Lấy đơn hàng thành công gần nhất của đại lý."""
    client = env["client"]
    headers = make_token(username="sales_01", role="Sales Rep", user_id=env["sales_1_id"])

    res = client.get(f"/api/v1/sales/dealers/{env['dealer_1_id']}/last-order", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["order_id"] == env["order_2_id"]
    assert data["order_code"] == "ORD-D1-02"
    items = data["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == env["p1_id"]
    assert items[0]["product_name"] == "Gạch Ceramic"
    assert items[0]["quantity"] == 20
    assert items[0]["unit_price"] == 100000.0


def test_sales_rep_isolation_forbidden_for_unassigned_dealer(env):
    """Test 3: BẢO MẬT BẮT BUỘC - Chặn 403 Forbidden khi Sales cố tình xem đại lý của Sales khác."""
    client = env["client"]
    # sales_1 cố tình xem đại lý 2 (thuộc quyền quản lý của sales_2)
    headers = make_token(username="sales_01", role="Sales Rep", user_id=env["sales_1_id"])

    # 1. Thử xem lịch sử mua hàng
    res_hist = client.get(f"/api/v1/sales/dealers/{env['dealer_2_id']}/purchase-history", headers=headers)
    assert res_hist.status_code == 403
    assert "quyền" in res_hist.json()["detail"].lower()

    # 2. Thử xem đơn hàng gần nhất
    res_last = client.get(f"/api/v1/sales/dealers/{env['dealer_2_id']}/last-order", headers=headers)
    assert res_last.status_code == 403
    assert "quyền" in res_last.json()["detail"].lower()


def test_admin_and_sales_manager_access(env):
    """Test 4: Admin và Sales Manager có quyền truy cập đại lý của bất kỳ nhân viên nào."""
    client = env["client"]

    # Token Admin
    admin_headers = make_token(username="admin_user", role="Admin", user_id=999)
    res_admin = client.get(f"/api/v1/sales/dealers/{env['dealer_1_id']}/purchase-history", headers=admin_headers)
    assert res_admin.status_code == 200

    # Token Sales Manager
    mgr_headers = make_token(username="sales_mgr", role="Sales Manager", user_id=888)
    res_mgr = client.get(f"/api/v1/sales/dealers/{env['dealer_2_id']}/last-order", headers=mgr_headers)
    assert res_mgr.status_code == 200


def test_dealer_not_found(env):
    """Test 5: Trả về 404 nếu đại lý không tồn tại."""
    client = env["client"]
    headers = make_token(username="sales_01", role="Sales Rep", user_id=env["sales_1_id"])

    res = client.get("/api/v1/sales/dealers/99999/purchase-history", headers=headers)
    assert res.status_code == 404


def test_unauthenticated_request(env):
    """Test 6: Trả về 401 Unauthorized nếu không gửi token."""
    client = env["client"]

    res1 = client.get(f"/api/v1/sales/dealers/{env['dealer_1_id']}/purchase-history")
    assert res1.status_code == 401

    res2 = client.get(f"/api/v1/sales/dealers/{env['dealer_1_id']}/last-order")
    assert res2.status_code == 401
