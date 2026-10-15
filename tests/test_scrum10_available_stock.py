"""Tests for User Story SCRUM-10:
"Là Nhân viên kinh doanh, tôi muốn nhìn thấy tồn khả dụng và bị chặn khi đặt vượt tồn, để không hứa với đại lý mặt hàng mà kho đã hết."

Tiêu chí kiểm thử:
1. Nghiệp vụ & Công thức tính:
   - Tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ cho đơn khác.
   - Mỗi dòng hàng (SKU) khi tạo/xem đơn hàng hiển thị đúng tồn khả dụng của kho phục vụ đại lý.
   - Endpoint GET /api/v1/inventory/available-stock và POST /api/v1/orders/simulate.
2. Validation & Chặn vượt tồn:
   - Chặn đặt hàng khi vượt tồn khả dụng, trả về HTTP 400 kèm gợi ý số lượng tối đa còn có thể đặt.
   - Xử lý khi hết hàng hoàn toàn (tồn khả dụng = 0).
   - Giữ chỗ tồn kho khi tạo đơn và giải phóng tồn khi hủy đơn.
3. Xử lý tranh chấp đồng thời (Concurrency Control):
   - Mô phỏng hai nhân viên kinh doanh cùng chốt đơn trên một SKU sắp hết.
   - Cơ chế Pessimistic Locking ngăn chặn race condition, đảm bảo kết quả chính xác, tuyệt đối không bị âm tồn kho.
4. Tương thích Python 3.8.
"""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import (
    Base,
    Customer,
    Inventory,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    RoleCode,
    Territory,
    User,
    Warehouse,
)
from src.backend.rbac import create_access_token
from app.services.inventory_service import (
    calculate_available_qty,
    get_customer_serving_warehouse,
    get_available_stock_info,
    reserve_stock_atomic,
    release_reserved_stock,
)


def make_auth_header(role: str, username: str = "test_user") -> Dict[str, str]:
    """Tạo JWT Bearer Authorization header."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum10_env():
    """Environment SQLite test database cho SCRUM-10."""
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

    # Khởi tạo dữ liệu cơ bản
    with TestingSessionLocal() as db:
        sales_user = User(
            username="sales_rep_01",
            email="sales01@oms.com",
            full_name="Nguyễn Văn A - Sales Rep",
            password_hash="fakehash",
            is_active=True,
        )
        sales_user2 = User(
            username="sales_rep_02",
            email="sales02@oms.com",
            full_name="Trần Văn B - Sales Rep",
            password_hash="fakehash",
            is_active=True,
        )
        db.add_all([sales_user, sales_user2])

        # Kho hàng
        wh_hn = Warehouse(code="WH-HN-01", name="Kho Tổng Hà Nội", is_active=True)
        wh_hcm = Warehouse(code="WH-HCM-01", name="Kho Chi Nhánh TP.HCM", is_active=True)
        db.add_all([wh_hn, wh_hcm])
        db.flush()

        # Đại lý ở miền Bắc (phục vụ bởi kho HN)
        cust_hn = Customer(
            code="DL-HN-01",
            name="Đại Lý Hà Nội Star",
            customer_group="RETAIL",
            region="Miền Bắc (Hà Nội)",
            warehouse_id=wh_hn.id,
            is_active=True,
            is_locked=False,
        )
        # Đại lý ở miền Nam (phục vụ bởi kho HCM)
        cust_hcm = Customer(
            code="DL-HCM-01",
            name="Đại Lý Sài Gòn Tiến Đạt",
            customer_group="RETAIL",
            region="Miền Nam (TP.HCM)",
            warehouse_id=wh_hcm.id,
            is_active=True,
            is_locked=False,
        )
        db.add_all([cust_hn, cust_hcm])

        # Sản phẩm & Tồn kho ban đầu
        # SP1: Nước Tăng Lực Red Bull (SKU-RB)
        prod1 = Product(
            sku="SKU-RB",
            name="Nước tăng lực Red Bull 250ml",
            base_unit="Lon",
            base_price=12000.0,
            status="ACTIVE",
        )
        # SP2: Cà phê Highlands (SKU-HL)
        prod2 = Product(
            sku="SKU-HL",
            name="Cà phê lon Highlands 235ml",
            base_unit="Lon",
            base_price=15000.0,
            status="ACTIVE",
        )
        db.add_all([prod1, prod2])
        db.flush()

        # Kho HN:
        # SKU-RB: Tồn thực tế = 100, Đang giữ chỗ = 20 -> Tồn khả dụng = 80
        # SKU-HL: Tồn thực tế = 10, Đang giữ chỗ = 10 -> Tồn khả dụng = 0 (hết sạch tồn khả dụng)
        inv_hn_rb = Inventory(
            product_id=prod1.id,
            warehouse_id=wh_hn.id,
            physical_qty=100.0,
            reserved_qty=20.0,
            available_qty=80.0,
        )
        inv_hn_hl = Inventory(
            product_id=prod2.id,
            warehouse_id=wh_hn.id,
            physical_qty=10.0,
            reserved_qty=10.0,
            available_qty=0.0,
        )
        # Kho HCM:
        # SKU-RB: Tồn thực tế = 50, Đang giữ chỗ = 5 -> Tồn khả dụng = 45
        inv_hcm_rb = Inventory(
            product_id=prod1.id,
            warehouse_id=wh_hcm.id,
            physical_qty=50.0,
            reserved_qty=5.0,
            available_qty=45.0,
        )
        db.add_all([inv_hn_rb, inv_hn_hl, inv_hcm_rb])
        db.commit()

    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ==============================================================================
# TEST GROUP 1: NGHIỆP VỤ & CÔNG THỨC TÍNH TỒN KHẢ DỤNG
# ==============================================================================

def test_available_stock_formula():
    """Kiểm tra công thức: Tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ cho đơn khác."""
    assert calculate_available_qty(100.0, 20.0) == 80.0
    assert calculate_available_qty(50.0, 0.0) == 50.0
    assert calculate_available_qty(30.0, 30.0) == 0.0

    inv = Inventory(physical_qty=150.0, reserved_qty=35.0)
    assert inv.calculated_available_qty == 115.0


def test_get_available_stock_api_endpoint(scrum10_env):
    """Kiểm tra API GET /api/v1/inventory/available-stock hiển thị đúng 3 chỉ số tồn kho."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # Kiểm tra tồn kho của SKU-RB tại kho Hà Nội (ID 1)
    res = client.get(
        "/api/v1/inventory/available-stock?sku=SKU-RB&warehouseId=1",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["sku"] == "SKU-RB"
    assert data["physicalQty"] == 100.0
    assert data["reservedQty"] == 20.0
    assert data["availableQty"] == 80.0  # 100 - 20 = 80
    assert "Kho Tổng Hà Nội" in data["warehouseName"]


def test_order_simulate_validates_available_stock(scrum10_env):
    """Kiểm tra API POST /api/v1/orders/simulate kiểm tra tồn khả dụng cho đại lý."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # Đại lý 1 (Hà Nội, kho 1) đặt SKU-RB số lượng 50 (tồn khả dụng là 80) -> isAvailable = True
    simulate_payload = {
        "customerId": 1,
        "items": [{"sku": "SKU-RB", "quantity": 50}],
    }
    res = client.post("/api/v1/orders/simulate", json=simulate_payload, headers=headers)
    assert res.status_code == 200
    sim_data = res.json()["data"]
    item_val = sim_data["itemsValidation"][0]
    assert item_val["sku"] == "SKU-RB"
    assert item_val["requestedQty"] == 50
    assert item_val["availableQty"] == 80.0
    assert item_val["isAvailable"] is True

    # Nếu đặt 100 (vượt quá 80) -> isAvailable = False, maxAllowedQty = 80
    simulate_payload_exceed = {
        "customerId": 1,
        "items": [{"sku": "SKU-RB", "quantity": 100}],
    }
    res_exceed = client.post("/api/v1/orders/simulate", json=simulate_payload_exceed, headers=headers)
    assert res_exceed.status_code == 200
    exceed_val = res_exceed.json()["data"]["itemsValidation"][0]
    assert exceed_val["requestedQty"] == 100
    assert exceed_val["availableQty"] == 80.0
    assert exceed_val["isAvailable"] is False
    assert exceed_val["maxAllowedQty"] == 80.0


def test_order_displays_available_stock_per_sku_line(scrum10_env):
    """Kiểm tra mỗi dòng hàng (SKU) khi tạo và xem đơn hàng hiển thị đúng tồn khả dụng của kho phục vụ."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # Tạo đơn cho đại lý 1 (Hà Nội, kho HN) đặt 30 lon Red Bull
    order_payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-RB", "product_name": "Red Bull", "quantity": 30}],
        "note": "Đơn hàng test hiển thị tồn khả dụng",
    }
    res = client.post("/api/v1/orders", json=order_payload, headers=headers)
    assert res.status_code == 201
    order_data = res.json()
    order_id = order_data["id"]

    # Kiểm tra dòng sản phẩm khi tạo đơn có hiển thị tồn khả dụng ban đầu của kho HN (80.0)
    item_res = order_data["items"][0]
    assert item_res["sku"] == "SKU-RB"
    assert item_res["available_qty"] == 80.0
    assert item_res["availableQty"] == 80.0

    # Kiểm tra khi xem lại chi tiết đơn hàng (GET /api/v1/orders/{id})
    res_detail = client.get(f"/api/v1/orders/{order_id}")
    assert res_detail.status_code == 200
    detail_data = res_detail.json()
    assert detail_data["items"][0]["available_qty"] == 80.0
    assert detail_data["items"][0]["availableQty"] == 80.0

    # Kiểm tra đại lý 2 (TP.HCM, kho HCM có tồn khả dụng là 45.0)
    order_payload_hcm = {
        "customer_id": 2,
        "items": [{"sku": "SKU-RB", "product_name": "Red Bull", "quantity": 15}],
    }
    res_hcm = client.post("/api/v1/orders", json=order_payload_hcm, headers=headers)
    assert res_hcm.status_code == 201
    order_hcm = res_hcm.json()
    # Phải hiển thị đúng tồn khả dụng của kho phục vụ đại lý đó (Kho HCM = 45.0)
    assert order_hcm["items"][0]["available_qty"] == 45.0
    assert order_hcm["items"][0]["availableQty"] == 45.0


# ==============================================================================
# TEST GROUP 2: VALIDATION & CHẶN VƯỢT TỒN KÈM GỢI Ý
# ==============================================================================

def test_block_order_when_exceeding_available_stock_with_suggestion(scrum10_env):
    """Yêu cầu 2: Khi đặt vượt quá tồn khả dụng, hệ thống phải chặn lại và trả về lỗi
    rõ ràng kèm gợi ý số lượng tối đa còn có thể đặt được."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # Đại lý 1 có kho Hà Nội, SKU-RB có tồn khả dụng là 80.
    # Đặt số lượng 90 (> 80) -> BỊ CHẶN 400 Bad Request
    payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-RB", "product_name": "Red Bull", "quantity": 90}],
    }
    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 400
    detail = res.json()["detail"]

    # Kiểm tra thông báo lỗi có đầy đủ:
    # 1. Tên SKU
    assert "SKU-RB" in detail
    # 2. Báo lỗi không đủ số lượng tồn khả dụng
    assert "không đủ số lượng tồn khả dụng" in detail
    # 3. Nêu rõ số lượng yêu cầu (90) và tồn khả dụng hiện tại (80)
    assert "90" in detail
    assert "80" in detail
    # 4. Gợi ý rõ ràng số lượng tối đa còn có thể đặt
    assert "Số lượng tối đa còn có thể đặt: 80" in detail


def test_block_order_when_product_out_of_stock_completely(scrum10_env):
    """Yêu cầu 2: Khi sản phẩm hết sạch tồn khả dụng (available_qty = 0), chặn và gợi ý tối đa = 0."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # SKU-HL tại kho Hà Nội có tồn khả dụng = 0 (physical = 10, reserved = 10)
    payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-HL", "product_name": "Highlands Coffee", "quantity": 1}],
    }
    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "SKU-HL" in detail
    assert "Số lượng tối đa còn có thể đặt: 0" in detail


def test_reserve_stock_on_order_and_release_on_cancellation(scrum10_env):
    """Kiểm tra: Đặt hàng thành công thì tăng tồn giữ chỗ và giảm tồn khả dụng;
    Khi đơn hàng bị hủy (CANCELLED), tồn giữ chỗ được giải phóng."""
    client, SessionLocal = scrum10_env
    headers = make_auth_header(RoleCode.SALES_REP.value, "sales_rep_01")

    # Ban đầu: Kho HN SKU-RB có physical=100, reserved=20, available=80
    payload = {
        "customer_id": 1,
        "items": [{"sku": "SKU-RB", "product_name": "Red Bull", "quantity": 25}],
    }
    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201
    order_id = res.json()["id"]

    # Sau khi chốt đơn 25:
    # reserved_qty tăng từ 20 -> 45
    # available_qty giảm từ 80 -> 55
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.reserved_qty == 45.0
        assert inv.available_qty == 55.0

    # Hủy đơn hàng (chuyển sang CANCELLED)
    res_cancel = client.put(f"/api/v1/orders/{order_id}/status?new_status=CANCELLED", headers=headers)
    assert res_cancel.status_code == 200

    # Sau khi hủy:
    # Tồn giữ chỗ phải được giải phóng: 45 - 25 = 20
    # Tồn khả dụng hồi phục về 80
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
        assert inv.reserved_qty == 20.0
        assert inv.available_qty == 80.0


# ==============================================================================
# TEST GROUP 3: XỬ LÝ TRANH CHẤP ĐỒNG THỜI (CONCURRENCY CONTROL)
# ==============================================================================

def test_concurrency_race_condition_protection():
    """Yêu cầu 3: Xử lý kịch bản hai người cùng chốt đơn trên một SKU sắp hết.
    
    Kịch bản:
    - SKU-RB tại kho HCM: Tồn thực tế = 50, Đang giữ chỗ = 42 -> Tồn khả dụng chỉ còn = 8.
    - Hai nhân viên kinh doanh (Sales Rep 1 và Sales Rep 2) cùng chốt đơn số lượng = 6 tại cùng một thời điểm.
      (Tổng yêu cầu = 12 > tồn khả dụng 8).
    - Cơ chế Pessimistic Locking (SELECT ... FOR UPDATE) và transaction atomic:
      + Chính xác 1 người chốt đơn THÀNH CÔNG (201 Created).
      + Người kia BỊ CHẶN (400 Bad Request) kèm thông báo lỗi và gợi ý số lượng tối đa còn đặt được là 2.
      + Tồn kho tuyệt đối KHÔNG BỊ ÂM (available_qty >= 0).
    """
    import os
    import tempfile

    temp_db_path = os.path.join(tempfile.gettempdir(), f"test_concurrent_order_{threading.get_ident()}.db")
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except Exception:
            pass

    concurrent_engine = create_engine(f"sqlite:///{temp_db_path}", connect_args={"timeout": 30})
    Base.metadata.create_all(concurrent_engine)
    ConcurrentSessionLocal = sessionmaker(bind=concurrent_engine, autoflush=False, autocommit=False)

    def override_get_db_concurrent():
        db = ConcurrentSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db_concurrent

    try:
        with ConcurrentSessionLocal() as db:
            u1 = User(username="sales_rep_01", email="s1@oms.com", full_name="Sales 1", password_hash="x", is_active=True)
            u2 = User(username="sales_rep_02", email="s2@oms.com", full_name="Sales 2", password_hash="x", is_active=True)
            wh = Warehouse(code="WH-HCM-01", name="Kho Chi Nhánh TP.HCM", is_active=True)
            prod = Product(sku="SKU-RB", name="Nước tăng lực Red Bull 250ml", base_unit="Lon", base_price=12000.0, status="ACTIVE")
            cust = Customer(code="DL-HCM-01", name="Đại Lý HCM", customer_group="RETAIL", is_active=True, warehouse_id=1)
            db.add_all([u1, u2, wh, prod, cust])
            db.flush()

            # Tồn thực tế 50, giữ chỗ 42 -> khả dụng đúng 8
            inv = Inventory(product_id=prod.id, warehouse_id=wh.id, physical_qty=50.0, reserved_qty=42.0, available_qty=8.0)
            db.add(inv)
            db.commit()

        results = []
        barrier = threading.Barrier(2)

        def submit_order_thread(sales_username: str):
            thread_client = TestClient(app)
            headers = make_auth_header(RoleCode.SALES_REP.value, sales_username)
            order_payload = {
                "customer_id": 1,
                "items": [{"sku": "SKU-RB", "product_name": "Red Bull", "quantity": 6}],
                "note": f"Đơn đồng thời bởi {sales_username}",
            }
            # Đồng bộ thời điểm bắt đầu
            barrier.wait()
            res = thread_client.post("/api/v1/orders", json=order_payload, headers=headers)
            results.append((sales_username, res.status_code, res.json()))

        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(submit_order_thread, "sales_rep_01")
            f2 = executor.submit(submit_order_thread, "sales_rep_02")
            f1.result()
            f2.result()

        status_codes = [r[1] for r in results]
        assert len(status_codes) == 2

        # Đúng 1 người thành công (201) và 1 người bị chặn (400)
        assert 201 in status_codes, f"Phải có đúng 1 người đặt thành công, kết quả: {status_codes}"
        assert 400 in status_codes, f"Phải có đúng 1 người bị chặn do không đủ tồn, kết quả: {status_codes}"

        # Kiểm tra response của người bị chặn
        blocked_response = next(r[2] for r in results if r[1] == 400)
        assert "không đủ số lượng tồn khả dụng" in blocked_response["detail"]
        assert "Số lượng tối đa còn có thể đặt: 2" in blocked_response["detail"]

        # Kiểm tra trong DB: Tồn kho không bao giờ bị âm
        with ConcurrentSessionLocal() as db:
            final_inv = db.query(Inventory).filter(Inventory.product_id == 1, Inventory.warehouse_id == 1).first()
            assert final_inv.reserved_qty == 48.0  # 42 + 6 = 48
            assert final_inv.available_qty == 2.0  # 50 - 48 = 2.0 >= 0
            assert final_inv.available_qty >= 0, "TUYỆT ĐỐI KHÔNG ĐƯỢC ÂM TỒN KHO!"
    finally:
        app.dependency_overrides.pop(get_db, None)
        concurrent_engine.dispose()
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
            except Exception:
                pass
