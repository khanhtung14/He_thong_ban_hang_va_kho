"""End-to-End Integration Tests covering all 4 Scrums in a complete business lifecycle:

Flow 1 (Full Order & Dispatch Lifecycle across Scrums):
1. SCRUM-42: Kiểm tra công nợ đại lý -> Cho phép hoặc chặn tạo đơn.
2. Tạo đơn hàng mới thành công khi đại lý đủ hạn mức.
3. SCRUM-32: Duyệt đơn hàng (APPROVED) -> Hệ thống giữ chỗ tồn kho nguyên tử (reserved_qty tăng, available_qty giảm).
4. SCRUM-46: Nhân viên kho tạo phiếu xuất và xác nhận xuất thiếu (giao 60/100) -> Ghi nhận nợ hàng (PARTIALLY_DELIVERED, has_backorder = True).
5. SCRUM-46: Đơn hàng xuất hiện trong danh sách nợ hàng riêng (/orders/backorders).
6. SCRUM-46: Lượt giao tiếp theo xuất nốt 40/40 còn thiếu -> Đơn chuyển thành DELIVERED, has_backorder = False.
7. SCRUM-74: Dữ liệu xuất kho phản ánh chính xác vào báo cáo tồn kho & vòng quay (turnover_ratio, DSI).

Flow 2 (Cancellation & Auto-Release):
1. Tạo đơn hàng mới, duyệt đơn -> tồn được giữ chỗ.
2. Hủy đơn hàng (CANCELLED) -> SCRUM-32 giải phóng toàn bộ tồn giữ chỗ trở lại kho.

Flow 3 (Debt Alerting, Block, Payment, and Unlock):
1. SCRUM-42: Đại lý nợ vượt hạn mức -> bị gắn cờ cảnh báo (is_debt_flagged = True).
2. Tạo đơn bị chặn (400 Bad Request) theo chính sách BLOCK.
3. Kế toán ghi nhận thu tiền (POST /api/v1/payments) -> Công nợ giảm dưới hạn mức -> Hệ thống tự động gỡ cờ và cho phép tạo đơn tiếp theo.
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
    Category,
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
from app.api.v1.endpoints.debt_limit import set_debt_policy
from backend.main import app


def make_auth_header(role: str, username: str) -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def integrated_env():
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
    set_debt_policy("BLOCK")

    with TestingSessionLocal() as db:
        wh = Warehouse(id=1, code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
        db.add(wh)

        cat = Category(id=1, code="CAT-SUA", name="Sữa & Chế phẩm sữa")
        db.add(cat)

        p = Product(id=1, sku="SKU-MILK-100", name="Sữa Tươi 100% 1L", category_id=1, base_price=35000.0, cost_price=28000.0, base_unit="Hộp", status="ACTIVE")
        db.add(p)

        # Ban đầu: physical = 200, reserved = 0, available = 200
        inv = Inventory(product_id=1, warehouse_id=1, physical_qty=200.0, reserved_qty=0.0, available_qty=200.0)
        db.add(inv)

        cust = Customer(
            id=1,
            code="DL-ECO",
            name="Đại Lý Thực Phẩm Xanh",
            phone="0901234567",
            credit_limit=50000000.0,
            current_debt=10000000.0,
            max_debt_days=30,
            oldest_debt_days=5,
            is_active=True,
            is_locked=False,
            warehouse_id=1,
        )
        db.add(cust)
        addr = DeliveryAddress(customer_id=1, receiver_name="Xanh", phone="0901234567", address="Cầu Giấy, Hà Nội", is_default=True)
        db.add(addr)

        # Users
        u_sales = User(id=101, username="sales_01", email="s@oms.com", full_name="NVKD", password_hash="h", is_active=True)
        u_sm = User(id=102, username="sm_01", email="sm@oms.com", full_name="QLKD", password_hash="h", is_active=True)
        u_wh = User(id=103, username="wh_01", email="wh@oms.com", full_name="Thủ Kho", password_hash="h", is_active=True)
        u_acc = User(id=104, username="acc_01", email="acc@oms.com", full_name="Kế Toán", password_hash="h", is_active=True)
        db.add_all([u_sales, u_sm, u_wh, u_acc])
        db.commit()

    client = TestClient(app)
    yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_complete_four_scrums_end_to_end_flow(integrated_env):
    """Kiểm thử luồng xuyên suốt cả 4 Scrum:
    1. Tạo đơn (Sales) -> Kiểm tra hạn mức công nợ (SCRUM-42).
    2. Duyệt đơn (Manager) -> Giữ chỗ tồn kho nguyên tử (SCRUM-32).
    3. Xuất kho đợt 1 thiếu (Warehouse) -> Ghi nhận nợ hàng (SCRUM-46).
    4. Kiểm tra danh sách đơn nợ hàng riêng (SCRUM-46).
    5. Xuất kho đợt 2 đủ -> Hoàn thành đơn hàng (SCRUM-46).
    6. Xem báo cáo tồn kho & vòng quay phản ánh giao dịch xuất (SCRUM-74).
    """
    client, SessionLocal = integrated_env
    h_sales = make_auth_header("Sales Rep", "sales_01")
    h_sm = make_auth_header("Sales Manager", "sm_01")
    h_wh = make_auth_header("Warehouse Staff", "wh_01")

    # 1. Sales tạo đơn hàng mua 100 hộp sữa (Đại lý đủ hạn mức -> thành công)
    order_payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-MILK-100", "product_name": "Sữa Tươi 100%", "quantity": 100, "unit_price": 35000.0}],
    }
    res_order = client.post("/api/v1/orders", json=order_payload, headers=h_sales)
    assert res_order.status_code == 201
    order_id = res_order.json()["id"]

    # Chuyển đơn sang chờ duyệt (nếu tạo ở trạng thái draft)
    client.put(f"/api/v1/orders/{order_id}/status?new_status=PENDING_APPROVAL", headers=h_sales)

    # 2. Quản lý duyệt đơn -> SCRUM-32 giữ chỗ nguyên tử 100 hộp
    res_app = client.post(f"/api/v1/orders/{order_id}/approve", headers=h_sm)
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "APPROVED"

    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 200.0
        assert inv.reserved_qty == 100.0
        assert inv.available_qty == 100.0
        ord_db = db.get(Order, order_id)
        assert ord_db.is_stock_reserved is True
        item_id = ord_db.items[0].id

    # 3. Nhân viên kho xuất đợt 1: Chỉ xuất được 60 hộp (thiếu 40 hộp nợ hàng) -> SCRUM-46
    disp1_payload = {
        "order_id": order_id,
        "note": "Xuất thiếu 40 hộp",
        "items": [{"order_item_id": item_id, "actual_qty": 60}],
    }
    r_disp1 = client.post("/api/v1/warehouse/dispatches", json=disp1_payload, headers=h_wh)
    assert r_disp1.status_code == 201
    d1_id = r_disp1.json()["data"]["id"]

    # Xác nhận xuất đợt 1
    r_conf1 = client.post(f"/api/v1/warehouse/dispatches/{d1_id}/confirm", headers=h_wh)
    assert r_conf1.status_code == 200
    assert r_conf1.json()["data"]["order_status"] == "PARTIALLY_DELIVERED"
    assert r_conf1.json()["data"]["has_backorder"] is True

    # Kiểm tra kho sau đợt 1:
    # physical giảm 200 -> 140, reserved giảm 100 -> 40 (còn giữ chỗ 40 cho nợ hàng), available = 100
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 140.0
        assert inv.reserved_qty == 40.0
        assert inv.available_qty == 100.0

    # 4. Kiểm tra đơn hàng hiển thị trong danh sách nợ hàng riêng
    r_backorder = client.get("/api/v1/warehouse/orders/backorders", headers=h_wh)
    assert r_backorder.status_code == 200
    bo_orders = r_backorder.json()["data"]
    assert any(b["order_id"] == order_id for b in bo_orders)

    # 5. Xuất kho đợt 2: Giao nốt 40 hộp còn thiếu -> Đơn hoàn tất
    disp2_payload = {
        "order_id": order_id,
        "note": "Xuất nốt 40 hộp nợ hàng",
        "items": [{"order_item_id": item_id, "actual_qty": 40}],
    }
    r_disp2 = client.post("/api/v1/warehouse/dispatches", json=disp2_payload, headers=h_wh)
    d2_id = r_disp2.json()["data"]["id"]
    r_conf2 = client.post(f"/api/v1/warehouse/dispatches/{d2_id}/confirm", headers=h_wh)
    assert r_conf2.status_code == 200
    assert r_conf2.json()["data"]["order_status"] in ("DELIVERED", "DISPATCHED")
    assert r_conf2.json()["data"]["has_backorder"] is False

    # Kho sau đợt 2:
    # physical: 140 - 40 = 100
    # reserved: 40 - 40 = 0
    # available: 100
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 100.0
        assert inv.reserved_qty == 0.0
        assert inv.available_qty == 100.0

    # 6. Xem báo cáo tồn kho & vòng quay (SCRUM-74)
    r_rep = client.get("/api/v1/reports/inventory-turnover?period_days=90", headers=h_wh)
    assert r_rep.status_code == 200
    rep_data = r_rep.json()["data"]
    sku_row = next(s for s in rep_data["sku_details"] if s["sku"] == "SKU-MILK-100")
    # Đã xuất tổng cộng 100 hộp (60 + 40)
    assert sku_row["dispatched_qty"] == 100.0
    assert sku_row["physical_qty"] == 100.0
    assert sku_row["inventory_value"] == 2800000.0  # 100 * 28k giá vốn
    assert sku_row["turnover_ratio"] == 1.0        # 100 / 100


def test_order_cancellation_releases_reservation(integrated_env):
    """Hủy đơn hàng giải phóng tồn kho giữ chỗ (SCRUM-32)."""
    client, SessionLocal = integrated_env
    h_sales = make_auth_header("Sales Rep", "sales_01")
    h_sm = make_auth_header("Sales Manager", "sm_01")

    # Tạo và duyệt đơn 50 hộp
    order_payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-MILK-100", "product_name": "Sữa Tươi 100%", "quantity": 50, "unit_price": 35000.0}],
    }
    res_order = client.post("/api/v1/orders", json=order_payload, headers=h_sales)
    order_id = res_order.json()["id"]

    client.put(f"/api/v1/orders/{order_id}/status?new_status=PENDING_APPROVAL", headers=h_sales)
    client.post(f"/api/v1/orders/{order_id}/approve", headers=h_sm)

    # Đã giữ chỗ 50: reserved=50, available=150
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.reserved_qty == 50.0
        assert inv.available_qty == 150.0

    # Khách hủy đơn
    res_cancel = client.post(f"/api/v1/orders/{order_id}/cancel", headers=h_sales)
    assert res_cancel.status_code == 200

    # Sau khi hủy: reserved về 0, available về 200
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.reserved_qty == 0.0
        assert inv.available_qty == 200.0


def test_debt_alert_block_payment_and_unlock_flow(integrated_env):
    """Kiểm thử luồng công nợ: Vượt hạn mức -> Bị khóa tạo đơn -> Thanh toán -> Tự động mở khóa (SCRUM-42)."""
    client, SessionLocal = integrated_env
    h_sales = make_auth_header("Sales Rep", "sales_01")
    h_acc = make_auth_header("Accountant", "acc_01")

    # Giả lập khách hàng nợ tăng lên 60 triệu (vượt hạn mức 50 triệu)
    with SessionLocal() as db:
        cust = db.get(Customer, 1)
        cust.current_debt = 60000000.0
        db.commit()

    # Thử tạo đơn mới -> Phải bị chặn với lỗi 400 do vượt hạn mức
    order_payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-MILK-100", "product_name": "Sữa Tươi 100%", "quantity": 10, "unit_price": 35000.0}],
    }
    res_block = client.post("/api/v1/orders", json=order_payload, headers=h_sales)
    assert res_block.status_code == 400
    assert "cảnh báo công nợ" in res_block.json()["detail"].lower()

    # Kế toán ghi nhận thu tiền 25 triệu -> nợ giảm còn 35 triệu (< hạn mức 50tr)
    pay_payload = {
        "customer_id": 1,
        "amount": 25000000.0,
        "payment_method": "CASH",
        "payment_date": "2026-10-18",
        "invoice_ids": [],
    }
    res_pay = client.post("/api/v1/payments", json=pay_payload, headers=h_acc)
    assert res_pay.status_code == 201

    # Tạo lại đơn hàng -> Thành công
    res_success = client.post("/api/v1/orders", json=order_payload, headers=h_sales)
    assert res_success.status_code == 201
