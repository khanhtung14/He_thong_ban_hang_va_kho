"""Tests for SCRUM-46: Nhân viên kho xác nhận xuất kho và xử lý giao thiếu (nợ hàng).

Yêu cầu nghiệp vụ (Jira SCRUM-46):
1. Xác nhận xuất chuyển tồn giữ chỗ thành xuất thực và cập nhật trạng thái đơn (physical_qty & reserved_qty cùng giảm).
2. Xuất thiếu so với đơn thì phần còn lại được ghi nhận là còn nợ hàng (has_backorder = True, status = PARTIALLY_DELIVERED).
3. Đơn còn nợ hàng hiển thị riêng để xử lý ở lượt giao sau (endpoint /orders/backorders).
4. Lượt giao sau có thể xuất tiếp phần hàng còn thiếu để hoàn thành đơn hàng.
5. Phiếu xuất đã xác nhận không sửa được (PUT / DELETE bị chặn với mã 400).
6. Phân quyền: Chỉ nhân viên kho / quản lý kho / admin mới được xác nhận xuất kho.
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
    DeliveryAddress,
    Dispatch,
    DispatchItem,
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
from app.services.inventory_service import reserve_order_stock_transactional
from backend.main import app


def make_auth_header(role: str = "Warehouse Staff", username: str = "wh_user") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum46_env():
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
        wh = Warehouse(id=1, code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
        db.add(wh)

        p1 = Product(id=1, sku="SKU-BIA-01", name="Bia Heineken Thùng 24", base_price=420000.0, base_unit="Thùng", status="ACTIVE")
        p2 = Product(id=2, sku="SKU-BIA-02", name="Bia Tiger Thùng 24", base_price=380000.0, base_unit="Thùng", status="ACTIVE")
        db.add_all([p1, p2])

        # Kho:
        # P1: physical=100, reserved=0, available=100
        # P2: physical=80, reserved=0, available=80
        inv1 = Inventory(product_id=1, warehouse_id=1, physical_qty=100.0, reserved_qty=0.0, available_qty=100.0)
        inv2 = Inventory(product_id=2, warehouse_id=1, physical_qty=80.0, reserved_qty=0.0, available_qty=80.0)
        db.add_all([inv1, inv2])

        cust = Customer(
            id=1,
            code="DL-HN-01",
            name="Đại Lý Bia Nước Ngọt Thành Đạt",
            phone="0988776655",
            is_active=True,
            is_locked=False,
            credit_limit=500000000.0,
            current_debt=0.0,
            warehouse_id=1,
        )
        db.add(cust)

        wh_user = User(
            id=888,
            username="wh_staff_01",
            email="wh@oms.com",
            full_name="Nhân Viên Thủ Kho",
            password_hash="fakehash",
            is_active=True,
        )
        db.add(wh_user)
        db.commit()

    client = TestClient(app)
    yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_get_orders_ready_to_dispatch(scrum46_env):
    """Kiểm tra danh sách đơn hàng sẵn sàng xuất kho."""
    client, SessionLocal = scrum46_env
    headers = make_auth_header("Warehouse Staff", "wh_staff_01")

    with SessionLocal() as db:
        ord_approved = Order(order_code="ORD-APP-01", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        ord_draft = Order(order_code="ORD-DFT-01", customer_id=1, warehouse_id=1, status=OrderStatus.DRAFT)
        ord_partial = Order(order_code="ORD-PAR-01", customer_id=1, warehouse_id=1, status=OrderStatus.PARTIALLY_DELIVERED)
        db.add_all([ord_approved, ord_draft, ord_partial])
        db.flush()
        db.add(OrderItem(order_id=ord_approved.id, product_id=1, sku="SKU-BIA-01", quantity=10, unit_price=420000.0))
        db.add(OrderItem(order_id=ord_partial.id, product_id=2, sku="SKU-BIA-02", quantity=20, quantity_delivered=5, unit_price=380000.0))
        db.commit()

    res = client.get("/api/v1/warehouse/orders/ready-to-dispatch", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    order_codes = [o["order_code"] for o in data]
    assert "ORD-APP-01" in order_codes
    assert "ORD-PAR-01" in order_codes
    assert "ORD-DFT-01" not in order_codes


def test_dispatch_full_success_updates_stock_and_order_delivered(scrum46_env):
    """AC1: Xác nhận xuất chuyển tồn giữ chỗ thành xuất thực và cập nhật trạng thái đơn."""
    client, SessionLocal = scrum46_env
    headers = make_auth_header("Warehouse Staff", "wh_staff_01")

    with SessionLocal() as db:
        order = Order(order_code="ORD-FULL-01", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-BIA-01", quantity=20, unit_price=420000.0)
        item2 = OrderItem(order_id=order.id, product_id=2, sku="SKU-BIA-02", quantity=15, unit_price=380000.0)
        db.add_all([item1, item2])
        db.commit()

        # Giữ chỗ trước khi xuất:
        # P1: physical=100, reserved=20, available=80
        # P2: physical=80, reserved=15, available=65
        reserve_order_stock_transactional(db, order)
        db.commit()
        order_id = order.id
        item1_id = item1.id
        item2_id = item2.id

    # 1. Tạo phiếu xuất kho đủ
    payload = {
        "order_id": order_id,
        "note": "Xuất đủ hàng đợt 1",
        "items": [
            {"order_item_id": item1_id, "actual_qty": 20},
            {"order_item_id": item2_id, "actual_qty": 15},
        ],
    }
    res_create = client.post("/api/v1/warehouse/dispatches", json=payload, headers=headers)
    assert res_create.status_code == 201
    dispatch_id = res_create.json()["data"]["id"]

    # 2. Xác nhận xuất kho
    res_confirm = client.post(f"/api/v1/warehouse/dispatches/{dispatch_id}/confirm", headers=headers)
    assert res_confirm.status_code == 200
    confirm_data = res_confirm.json()["data"]
    assert confirm_data["is_confirmed"] is True
    assert confirm_data["order_status"] in ("DELIVERED", "DISPATCHED")
    assert confirm_data["has_backorder"] is False

    # 3. Kiểm tra tồn kho sau khi xuất thực:
    # P1: physical giảm 100 -> 80, reserved giảm 20 -> 0, available = 80
    # P2: physical giảm 80 -> 65, reserved giảm 15 -> 0, available = 65
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        inv2 = db.query(Inventory).filter(Inventory.product_id == 2, Inventory.warehouse_id == 1).first()
        assert inv1.physical_qty == 80.0
        assert inv1.reserved_qty == 0.0
        assert inv1.available_qty == 80.0

        assert inv2.physical_qty == 65.0
        assert inv2.reserved_qty == 0.0
        assert inv2.available_qty == 65.0

        ord_db = db.get(Order, order_id)
        assert ord_db.status in (OrderStatus.DELIVERED, OrderStatus.DISPATCHED)
        assert ord_db.has_backorder is False


def test_dispatch_partial_backorder_records_debt_and_partially_delivered(scrum46_env):
    """AC2 & AC3: Xuất thiếu so với đơn thì phần còn lại được ghi nhận là còn nợ hàng;
    Đơn còn nợ hàng hiển thị riêng để xử lý ở lượt giao sau."""
    client, SessionLocal = scrum46_env
    headers = make_auth_header("Warehouse Staff", "wh_staff_01")

    with SessionLocal() as db:
        order = Order(order_code="ORD-PARTIAL-01", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        db.add(order)
        db.flush()
        # Đặt 30 thùng Bia Heineken
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-BIA-01", quantity=30, unit_price=420000.0)
        db.add(item1)
        db.commit()

        reserve_order_stock_transactional(db, order)
        db.commit()
        order_id = order.id
        item1_id = item1.id

    # Xe tải chỉ chở được 20 thùng -> xuất thiếu 10 thùng (nợ 10)
    payload = {
        "order_id": order_id,
        "note": "Xuất thiếu 10 thùng do xe hết tải",
        "items": [
            {"order_item_id": item1_id, "actual_qty": 20},
        ],
    }
    res_create = client.post("/api/v1/warehouse/dispatches", json=payload, headers=headers)
    assert res_create.status_code == 201
    dispatch_id = res_create.json()["data"]["id"]

    # Xác nhận xuất
    res_confirm = client.post(f"/api/v1/warehouse/dispatches/{dispatch_id}/confirm", headers=headers)
    assert res_confirm.status_code == 200
    confirm_data = res_confirm.json()["data"]
    assert confirm_data["order_status"] == "PARTIALLY_DELIVERED"
    assert confirm_data["has_backorder"] is True

    # Kiểm tra tồn kho: Đã trừ 20 thùng thực xuất
    # physical giảm từ 100 -> 80, reserved giảm từ 30 -> 10 (còn 10 nợ hàng), available = 70
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv1.physical_qty == 80.0
        assert inv1.reserved_qty == 10.0
        assert inv1.available_qty == 70.0

        disp_item = db.query(DispatchItem).filter(DispatchItem.dispatch_id == dispatch_id).first()
        assert disp_item.requested_qty == 30
        assert disp_item.actual_qty == 20
        assert disp_item.missing_qty == 10

    # AC3: Kiểm tra hiển thị riêng trong danh sách nợ hàng
    res_backorders = client.get("/api/v1/warehouse/orders/backorders", headers=headers)
    assert res_backorders.status_code == 200
    bo_list = res_backorders.json()["data"]
    assert any(b["order_id"] == order_id for b in bo_list)
    bo_order = next(b for b in bo_list if b["order_id"] == order_id)
    assert len(bo_order["backorder_items"]) == 1
    assert bo_order["backorder_items"][0]["ordered_quantity"] == 30
    assert bo_order["backorder_items"][0]["delivered_quantity"] == 20
    assert bo_order["backorder_items"][0]["backorder_quantity"] == 10


def test_subsequent_dispatch_fulfills_remaining_backorder(scrum46_env):
    """Xử lý giao tiếp phần hàng còn thiếu ở lượt sau cho đến khi hoàn thành đơn."""
    client, SessionLocal = scrum46_env
    headers = make_auth_header("Warehouse Staff", "wh_staff_01")

    with SessionLocal() as db:
        order = Order(order_code="ORD-BACKORDER-02", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-BIA-01", quantity=50, unit_price=420000.0)
        db.add(item1)
        db.commit()

        reserve_order_stock_transactional(db, order)
        db.commit()
        order_id = order.id
        item1_id = item1.id

    # Đợt 1: Giao 30 / 50 -> thiếu 20
    p1 = {"order_id": order_id, "note": "Đợt 1", "items": [{"order_item_id": item1_id, "actual_qty": 30}]}
    r1 = client.post("/api/v1/warehouse/dispatches", json=p1, headers=headers)
    d1_id = r1.json()["data"]["id"]
    client.post(f"/api/v1/warehouse/dispatches/{d1_id}/confirm", headers=headers)

    # Đợt 2: Giao nốt 20 còn thiếu
    p2 = {"order_id": order_id, "note": "Đợt 2 - Giao nốt nợ hàng", "items": [{"order_item_id": item1_id, "actual_qty": 20}]}
    r2 = client.post("/api/v1/warehouse/dispatches", json=p2, headers=headers)
    d2_id = r2.json()["data"]["id"]
    r2_conf = client.post(f"/api/v1/warehouse/dispatches/{d2_id}/confirm", headers=headers)
    assert r2_conf.status_code == 200
    assert r2_conf.json()["data"]["order_status"] in ("DELIVERED", "DISPATCHED")
    assert r2_conf.json()["data"]["has_backorder"] is False

    # Đơn không còn trong danh sách nợ hàng
    res_bo = client.get("/api/v1/warehouse/orders/backorders", headers=headers)
    assert not any(b["order_id"] == order_id for b in res_bo.json()["data"])


def test_confirmed_dispatch_cannot_be_modified_or_deleted(scrum46_env):
    """AC4: Phiếu xuất đã xác nhận không sửa được (và không xóa được)."""
    client, SessionLocal = scrum46_env
    headers = make_auth_header("Warehouse Staff", "wh_staff_01")

    with SessionLocal() as db:
        order = Order(order_code="ORD-LOCK-TEST", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-BIA-01", quantity=10, unit_price=420000.0)
        db.add(item1)
        db.commit()
        reserve_order_stock_transactional(db, order)
        db.commit()
        order_id = order.id
        item1_id = item1.id

    p = {"order_id": order_id, "items": [{"order_item_id": item1_id, "actual_qty": 10}]}
    r_create = client.post("/api/v1/warehouse/dispatches", json=p, headers=headers)
    d_id = r_create.json()["data"]["id"]

    # Trước khi confirm: có thể sửa ghi chú
    r_edit = client.put(f"/api/v1/warehouse/dispatches/{d_id}", json={"note": "Ghi chú mới"}, headers=headers)
    assert r_edit.status_code == 200

    # Xác nhận phiếu xuất
    client.post(f"/api/v1/warehouse/dispatches/{d_id}/confirm", headers=headers)

    # Sau khi confirm: Thử sửa -> Phải bị chặn với lỗi 400
    r_edit_after = client.put(f"/api/v1/warehouse/dispatches/{d_id}", json={"note": "Cố tình sửa"}, headers=headers)
    assert r_edit_after.status_code == 400
    assert "Phiếu xuất đã xác nhận không sửa được" in r_edit_after.json()["detail"]

    # Thử xóa -> Phải bị chặn với lỗi 400
    r_del_after = client.delete(f"/api/v1/warehouse/dispatches/{d_id}", headers=headers)
    assert r_del_after.status_code == 400
    assert "Phiếu xuất đã xác nhận không sửa được" in r_del_after.json()["detail"]


def test_unauthorized_role_cannot_confirm_dispatch(scrum46_env):
    """Kiểm tra quyền: Kế toán hoặc Đại lý không được phép xác nhận xuất kho."""
    client, SessionLocal = scrum46_env
    wh_headers = make_auth_header("Warehouse Staff", "wh_staff_01")
    acc_headers = make_auth_header("Accountant", "acc_user")

    with SessionLocal() as db:
        order = Order(order_code="ORD-PERM-TEST", customer_id=1, warehouse_id=1, status=OrderStatus.APPROVED)
        db.add(order)
        db.flush()
        item1 = OrderItem(order_id=order.id, product_id=1, sku="SKU-BIA-01", quantity=5, unit_price=420000.0)
        db.add(item1)
        db.commit()
        reserve_order_stock_transactional(db, order)
        db.commit()
        order_id = order.id
        item1_id = item1.id

    p = {"order_id": order_id, "items": [{"order_item_id": item1_id, "actual_qty": 5}]}
    r_create = client.post("/api/v1/warehouse/dispatches", json=p, headers=wh_headers)
    d_id = r_create.json()["data"]["id"]

    # Kế toán xác nhận -> 403 Forbidden
    res_confirm = client.post(f"/api/v1/warehouse/dispatches/{d_id}/confirm", headers=acc_headers)
    assert res_confirm.status_code == 403
