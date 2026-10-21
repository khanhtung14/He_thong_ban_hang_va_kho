"""Integration tests for S4-04: Xem lịch sử mua hàng 3 tháng và thêm nhanh vào đơn mới.

Endpoints tested:
- GET /api/v1/dealers/{dealer_id}/purchase-history
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
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
from backend.main import app


def make_token(username: str, role: str = "Sales Rep", user_id: int | None = None) -> Dict[str, str]:
    payload: Dict[str, Any] = {"sub": username, "role": role}
    if user_id is not None:
        payload["user_id"] = user_id
    token = create_access_token(payload)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def env():
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

    # 1. Tạo kho và người dùng
    wh = Warehouse(code="WH-MAIN", name="Kho Tổng Hà Nội", is_active=True)
    db.add(wh)
    db.flush()

    sales_1 = User(
        username="sales_user_1",
        email="sales1@example.com",
        full_name="Nguyễn Văn Kinh Doanh 1",
        password_hash="fake",
        is_active=True,
    )
    sales_2 = User(
        username="sales_user_2",
        email="sales2@example.com",
        full_name="Trần Văn Kinh Doanh 2",
        password_hash="fake",
        is_active=True,
    )
    db.add_all([sales_1, sales_2])
    db.flush()

    # 2. Tạo Đại lý
    dealer_1 = Customer(
        code="DL001",
        name="Đại lý Nam Hải",
        phone="0987654321",
        customer_group="WHOLESALE",
        sales_rep_id=sales_1.id,
        assigned_sales_id=sales_1.id,
        warehouse_id=wh.id,
        is_active=True,
    )
    dealer_2 = Customer(
        code="DL002",
        name="Đại lý Bắc Á",
        phone="0987654322",
        customer_group="WHOLESALE",
        sales_rep_id=sales_2.id,
        assigned_sales_id=sales_2.id,
        warehouse_id=wh.id,
        is_active=True,
    )
    db.add_all([dealer_1, dealer_2])
    db.flush()

    # 3. Tạo sản phẩm và tồn kho
    p1 = Product(sku="SKU-BRICK", name="Gạch Men Cao Cấp", base_unit="Hộp", base_price=120000.0)
    p2 = Product(sku="SKU-PAINT", name="Sơn Tường Chống Thấm", base_unit="Thùng", base_price=350000.0)
    p3 = Product(sku="SKU-STEEL", name="Thép Xây Dựng", base_unit="Cây", base_price=95000.0)
    db.add_all([p1, p2, p3])
    db.flush()

    inv1 = Inventory(product_id=p1.id, warehouse_id=wh.id, physical_qty=100.0, reserved_qty=15.0, available_qty=85.0)
    inv2 = Inventory(product_id=p2.id, warehouse_id=wh.id, physical_qty=50.0, reserved_qty=10.0, available_qty=40.0)
    db.add_all([inv1, inv2])
    db.flush()

    now = datetime.now(timezone.utc)

    # 4. Tạo các đơn hàng
    # Đơn 1: 30 ngày trước, COMPLETED (p1: 10 cái giá 115k, p2: 5 thùng giá 340k)
    order_1 = Order(
        order_code="ORD-S4-01",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=2850000.0,
        created_at=now - timedelta(days=30),
    )
    db.add(order_1)
    db.flush()
    db.add_all([
        OrderItem(order_id=order_1.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, unit_name=p1.base_unit, quantity=10, unit_price=115000.0),
        OrderItem(order_id=order_1.id, product_id=p2.id, sku=p2.sku, product_name=p2.name, unit_name=p2.base_unit, quantity=5, unit_price=340000.0),
    ])

    # Đơn 2: 10 ngày trước, APPROVED (p1: 20 cái giá 120k)
    order_2 = Order(
        order_code="ORD-S4-02",
        customer_id=dealer_1.id,
        status=OrderStatus.APPROVED,
        total_amount=2400000.0,
        created_at=now - timedelta(days=10),
    )
    db.add(order_2)
    db.flush()
    db.add(
        OrderItem(order_id=order_2.id, product_id=p1.id, sku=p1.sku, product_name=p1.name, unit_name=p1.base_unit, quantity=20, unit_price=120000.0)
    )

    # Đơn 3: 100 ngày trước (Quá 90 ngày -> không được tính)
    order_old = Order(
        order_code="ORD-S4-OLD",
        customer_id=dealer_1.id,
        status=OrderStatus.COMPLETED,
        total_amount=9500000.0,
        created_at=now - timedelta(days=100),
    )
    db.add(order_old)
    db.flush()
    db.add(
        OrderItem(order_id=order_old.id, product_id=p3.id, sku=p3.sku, product_name=p3.name, unit_name=p3.base_unit, quantity=100, unit_price=95000.0)
    )

    # Đơn 4: CANCELLED (Không được tính)
    order_cancel = Order(
        order_code="ORD-S4-CANCEL",
        customer_id=dealer_1.id,
        status=OrderStatus.CANCELLED,
        total_amount=999999.0,
        created_at=now - timedelta(days=5),
    )
    db.add(order_cancel)
    db.flush()
    db.add(
        OrderItem(order_id=order_cancel.id, product_id=p3.id, sku=p3.sku, product_name=p3.name, unit_name=p3.base_unit, quantity=50, unit_price=90000.0)
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
        "p3_id": p3.id,
    }

    app.dependency_overrides.clear()


def test_s4_04_get_purchase_history_calculation(env):
    """Kiểm tra logic tính toán, lọc 90 ngày và tồn khả dụng."""
    client = env["client"]
    headers = make_token(username="sales_user_1", role="Sales Rep", user_id=env["sales_1_id"])

    res = client.get(f"/api/v1/dealers/{env['dealer_1_id']}/purchase-history", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Chỉ có p1 và p2 được tính (p3 thuộc đơn 100 ngày trước và đơn hủy nên không xuất hiện)
    assert len(data) == 2

    # p1: xuất hiện 2 đơn (10 + 20 = 30), avg = 15.0, tồn khả dụng = 85.0, đơn giá mua gần nhất = 120000.0
    item_p1 = next(it for it in data if it["product_id"] == env["p1_id"])
    assert item_p1["sku"] == "SKU-BRICK"
    assert item_p1["product_name"] == "Gạch Men Cao Cấp"
    assert item_p1["unit"] == "Hộp"
    assert item_p1["total_orders_count"] == 2
    assert item_p1["total_quantity"] == 30.0
    assert item_p1["avg_quantity"] == 15.0
    assert item_p1["last_price"] == 120000.0
    assert item_p1["available_quantity"] == 85.0
    assert item_p1["last_ordered_at"] is not None

    # p2: xuất hiện 1 đơn (5), avg = 5.0, tồn khả dụng = 40.0, last_price = 340000.0
    item_p2 = next(it for it in data if it["product_id"] == env["p2_id"])
    assert item_p2["sku"] == "SKU-PAINT"
    assert item_p2["total_orders_count"] == 1
    assert item_p2["total_quantity"] == 5.0
    assert item_p2["avg_quantity"] == 5.0
    assert item_p2["last_price"] == 340000.0
    assert item_p2["available_quantity"] == 40.0

    # Thứ tự sắp xếp: p1 (total_orders_count = 2) xếp trước p2 (total_orders_count = 1)
    assert data[0]["sku"] == "SKU-BRICK"
    assert data[1]["sku"] == "SKU-PAINT"


def test_s4_04_security_isolation_403(env):
    """Kiểm tra phân quyền: Sales Rep không phụ trách đại lý bị chặn 403 Forbidden."""
    client = env["client"]
    # sales_1 gọi đại lý của sales_2
    headers = make_token(username="sales_user_1", role="Sales Rep", user_id=env["sales_1_id"])

    res = client.get(f"/api/v1/dealers/{env['dealer_2_id']}/purchase-history", headers=headers)
    assert res.status_code == 403
    assert res.json()["detail"] == "Bạn không có quyền xem thông tin của đại lý này"


def test_s4_04_manager_and_admin_allowed(env):
    """Kiểm tra Admin và Sales Manager được phép xem lịch sử của mọi đại lý."""
    client = env["client"]

    admin_headers = make_token(username="admin_boss", role="Admin", user_id=999)
    res_admin = client.get(f"/api/v1/dealers/{env['dealer_2_id']}/purchase-history", headers=admin_headers)
    assert res_admin.status_code == 200

    mgr_headers = make_token(username="sales_manager_lead", role="Sales Manager", user_id=888)
    res_mgr = client.get(f"/api/v1/dealers/{env['dealer_1_id']}/purchase-history", headers=mgr_headers)
    assert res_mgr.status_code == 200
