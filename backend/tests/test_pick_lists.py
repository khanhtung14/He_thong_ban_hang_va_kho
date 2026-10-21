"""Unit and integration tests for Pick Lists and Batch Picking (EP-06 / SCRUM-36 / SCRUM-40).

Acceptance Criteria tested:
1. Phiếu soạn hàng liệt kê dòng hàng kèm 'vị trí lưu trữ' (Location/Bin), sắp xếp tối ưu theo đường đi (pick_sequence).
2. Cho phép gộp nhiều đơn hàng (Approved Orders) thành một lượt soạn (Batch Picking), trùng mặt hàng thì cộng dồn số lượng.
3. Nhân viên kho đánh dấu đã soạn và nhập 'số lượng thực soạn'.
4. Nếu actual_qty < required_qty, bắt buộc nhập 'Lý do soạn thiếu' (trả lỗi 400 nếu thiếu).
"""
import pytest
from datetime import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.models import (
    Base,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    PickList,
    PickListDetail,
    Product,
    Warehouse,
    WarehouseLocation,
)
from app.api.v1.endpoints.pick_lists import router as pick_lists_router
from app.core.database import get_db


@pytest.fixture
def pick_list_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(pick_lists_router)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Setup seed data
    db = TestingSessionLocal()

    # 1. Warehouse
    wh = Warehouse(id=1, code="WH-01", name="Kho Tổng Hà Nội", is_active=True)
    db.add(wh)

    # 2. Customer
    cust = Customer(id=1, code="CUST-01", name="Đại lý Minh Phát", customer_group="DEALER")
    db.add(cust)

    # 3. Products
    p1 = Product(id=1, sku="SKU-A", name="Bia Tiger Nâu 330ml", base_unit="Thùng", base_price=350000)
    p2 = Product(id=2, sku="SKU-B", name="Bia Heineken Bạc 330ml", base_unit="Thùng", base_price=420000)
    p3 = Product(id=3, sku="SKU-C", name="Nước Ngọt Coca Cola", base_unit="Thùng", base_price=210000)
    db.add_all([p1, p2, p3])

    # 4. Warehouse Locations with intentional pick sequence to test route optimization:
    # Let's say:
    # Product 2 (Heineken) is at A-01-01 (sequence 1)
    # Product 1 (Tiger) is at A-01-02 (sequence 2)
    # Product 3 (Coca) is at B-01-01 (sequence 10)
    loc2 = WarehouseLocation(
        id=1, warehouse_id=1, code="A-01-01", aisle="A", rack="01", shelf="01", bin="01",
        pick_sequence=1, product_id=2, is_active=True
    )
    loc1 = WarehouseLocation(
        id=2, warehouse_id=1, code="A-01-02", aisle="A", rack="01", shelf="02", bin="01",
        pick_sequence=2, product_id=1, is_active=True
    )
    loc3 = WarehouseLocation(
        id=3, warehouse_id=1, code="B-01-01", aisle="B", rack="01", shelf="01", bin="01",
        pick_sequence=10, product_id=3, is_active=True
    )
    db.add_all([loc1, loc2, loc3])

    # 5. Orders: Create 2 approved orders with overlapping products
    # Order 1: Product 1 (qty 10), Product 2 (qty 5)
    order1 = Order(
        id=101,
        order_code="ORD-101",
        customer_id=1,
        warehouse_id=1,
        status=OrderStatus.APPROVED,
        total_amount=5600000,
    )
    db.add(order1)
    db.flush()

    item1_1 = OrderItem(order_id=101, product_id=1, sku="SKU-A", product_name="Bia Tiger Nâu 330ml", quantity=10, unit_price=350000, line_total=3500000)
    item1_2 = OrderItem(order_id=101, product_id=2, sku="SKU-B", product_name="Bia Heineken Bạc 330ml", quantity=5, unit_price=420000, line_total=2100000)
    db.add_all([item1_1, item1_2])

    # Order 2: Product 1 (qty 15 - duplicate!), Product 3 (qty 8)
    order2 = Order(
        id=102,
        order_code="ORD-102",
        customer_id=1,
        warehouse_id=1,
        status=OrderStatus.APPROVED,
        total_amount=6930000,
    )
    db.add(order2)
    db.flush()

    item2_1 = OrderItem(order_id=102, product_id=1, sku="SKU-A", product_name="Bia Tiger Nâu 330ml", quantity=15, unit_price=350000, line_total=5250000)
    item2_3 = OrderItem(order_id=102, product_id=3, sku="SKU-C", product_name="Nước Ngọt Coca Cola", quantity=8, unit_price=210000, line_total=1680000)
    db.add_all([item2_1, item2_3])

    db.commit()
    db.close()

    client = TestClient(app)
    return client


def test_get_pending_approved_orders(pick_list_client):
    """Test API retrieves approved orders ready for batch picking."""
    res = pick_list_client.get("/api/pick-lists/pending-orders")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    order_codes = [o["order_code"] for o in data]
    assert "ORD-101" in order_codes
    assert "ORD-102" in order_codes


def test_batch_picking_and_route_optimization(pick_list_client):
    """AC 1 & AC 2:
    - Batch picking groups identical products from ORD-101 and ORD-102 and sums required_qty.
    - Result is ordered by pick_sequence (optimal route in warehouse).
    """
    res = pick_list_client.post(
        "/api/pick-lists",
        json={"order_ids": [101, 102], "warehouse_id": 1, "note": "Gộp đơn buổi sáng"}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["code"].startswith("PL-")
    assert data["status"] == "PENDING"
    assert data["total_items"] == 3  # 3 distinct products: SKU-A, SKU-B, SKU-C
    # Total required qty: SKU-A (10 + 15 = 25) + SKU-B (5) + SKU-C (8) = 38
    assert data["total_required_qty"] == 38.0

    details = data["details"]
    assert len(details) == 3

    # Route optimization check: pick_sequence order should be 1 -> 2 -> 10
    # Sequence 1: Product 2 (Heineken) at A-01-01
    # Sequence 2: Product 1 (Tiger) at A-01-02
    # Sequence 10: Product 3 (Coca) at B-01-01
    assert details[0]["product_id"] == 2
    assert details[0]["location_code"] == "A-01-01"
    assert details[0]["pick_sequence"] == 1
    assert details[0]["required_qty"] == 5.0

    assert details[1]["product_id"] == 1
    assert details[1]["location_code"] == "A-01-02"
    assert details[1]["pick_sequence"] == 2
    # Summed quantity for Tiger: 10 + 15 = 25!
    assert details[1]["required_qty"] == 25.0
    assert 101 in details[1]["order_ids"] and 102 in details[1]["order_ids"]

    assert details[2]["product_id"] == 3
    assert details[2]["location_code"] == "B-01-01"
    assert details[2]["pick_sequence"] == 10
    assert details[2]["required_qty"] == 8.0


def test_execute_shortage_validation_error(pick_list_client):
    """AC 4: If actual_qty < required_qty and missing_reason is missing, must return 400 Bad Request."""
    # Create pick list
    create_res = pick_list_client.post(
        "/api/pick-lists",
        json={"order_ids": [101, 102], "warehouse_id": 1}
    )
    pick_id = create_res.json()["id"]
    details = create_res.json()["details"]
    tiger_detail = next(d for d in details if d["sku"] == "SKU-A")

    # Attempt to pick 20 instead of 25 WITHOUT reason
    execute_res = pick_list_client.put(
        f"/api/pick-lists/{pick_id}/execute",
        json={
            "items": [
                {
                    "detail_id": tiger_detail["id"],
                    "actual_qty": 20.0,  # 20 < 25
                    "missing_reason": None,  # Missing reason!
                    "is_completed": True,
                }
            ]
        }
    )
    assert execute_res.status_code == 400
    assert "Bắt buộc phải nhập 'Lý do soạn thiếu'" in execute_res.json()["detail"]

    # Also test whitespace reason
    execute_res_ws = pick_list_client.put(
        f"/api/pick-lists/{pick_id}/execute",
        json={
            "items": [
                {
                    "detail_id": tiger_detail["id"],
                    "actual_qty": 20.0,
                    "missing_reason": "   ",
                    "is_completed": True,
                }
            ]
        }
    )
    assert execute_res_ws.status_code == 400
    assert "Bắt buộc phải nhập 'Lý do soạn thiếu'" in execute_res_ws.json()["detail"]


def test_execute_shortage_with_valid_reason(pick_list_client):
    """AC 3 & AC 4: Successfully records shortage when reason is provided."""
    create_res = pick_list_client.post(
        "/api/pick-lists",
        json={"order_ids": [101, 102], "warehouse_id": 1}
    )
    pick_id = create_res.json()["id"]
    details = create_res.json()["details"]
    
    # Pick all items, one with shortage and valid reason
    update_items = []
    for d in details:
        if d["sku"] == "SKU-A":
            update_items.append({
                "detail_id": d["id"],
                "actual_qty": 20.0,
                "missing_reason": "Hàng trên kệ A-01-02 bị móp méo 5 thùng, không đủ tiêu chuẩn xuất",
                "is_completed": True,
            })
        else:
            update_items.append({
                "detail_id": d["id"],
                "actual_qty": d["required_qty"],
                "missing_reason": None,
                "is_completed": True,
            })

    exec_res = pick_list_client.put(
        f"/api/pick-lists/{pick_id}/execute",
        json={"items": update_items, "note": "Đã kiểm đếm xong tại kệ"}
    )
    assert exec_res.status_code == 200
    res_data = exec_res.json()
    assert res_data["status"] == "COMPLETED"
    
    # Check details
    updated_tiger = next(d for d in res_data["details"] if d["sku"] == "SKU-A")
    assert updated_tiger["actual_qty"] == 20.0
    assert updated_tiger["missing_reason"] == "Hàng trên kệ A-01-02 bị móp méo 5 thùng, không đủ tiêu chuẩn xuất"
    assert updated_tiger["is_completed"] is True
    assert updated_tiger["status"] == "PARTIALLY_PICKED"
