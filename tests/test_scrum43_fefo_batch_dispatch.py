"""Tests for User Story SCRUM-43 (Epic SCRUM-88):
FEFO batch suggestion, override validation, and inventory deduction.
"""
from __future__ import annotations

from datetime import date, timedelta
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
    Dispatch,
    DispatchItem,
    Inventory,
    InventoryLot,
    Order,
    OrderItem,
    OrderStatus,
    PickList,
    Product,
    Warehouse,
)
from src.backend.rbac import AuthenticatedUser, get_current_user
from app.services.fefo_service import (
    deduct_lot_inventory,
    get_fefo_lot_suggestions,
    is_fefo_override,
    validate_fefo_selection,
)


@pytest.fixture
def fefo_db_session():
    """Create an isolated in-memory SQLite database session for FEFO tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def fefo_client(fefo_db_session):
    """FastAPI TestClient with overridden get_db and warehouse staff authentication."""
    def override_get_db():
        yield fefo_db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=99,
        username="warehouse_user",
        role="Warehouse",
        warehouse_id=1,
        warehouse_ids=[1],
    )
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def _seed_test_warehouse_and_product(db):
    wh = Warehouse(id=1, code="WH-TEST-01", name="Kho Thử Nghiệm", is_active=True)
    db.add(wh)
    prod = Product(
        id=101,
        sku="BIA-HN-LON",
        name="Bia Hà Nội Lon 330ml",
        base_unit="Lon",
        base_price=12000.0,
        status="ACTIVE",
    )
    db.add(prod)
    cust = Customer(
        id=1,
        code="CUST-001",
        name="Đại lý Minh Phát",
        customer_group="RETAIL",
        is_active=True,
    )
    db.add(cust)
    db.commit()
    return wh, prod, cust


# ============================================================================
# 1. Logic tự động gợi ý đúng lô có hạn gần nhất (FEFO)
# ============================================================================

def test_fefo_suggests_nearest_expiry_lot_first(fefo_db_session):
    """Mặc định gợi ý lô có hạn sử dụng gần nhất còn đủ số lượng khả dụng."""
    wh, prod, _ = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot_early = InventoryLot(
        id=1,
        lot_number="LOT-2026-EARLY",
        product_id=prod.id,
        warehouse_id=wh.id,
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=20),  # Hạn gần nhất
        quantity=50.0,
    )
    lot_late = InventoryLot(
        id=2,
        lot_number="LOT-2027-LATE",
        product_id=prod.id,
        warehouse_id=wh.id,
        mfg_date=today - timedelta(days=10),
        exp_date=today + timedelta(days=180),  # Hạn xa hơn
        quantity=100.0,
    )
    fefo_db_session.add_all([lot_early, lot_late])
    fefo_db_session.commit()

    # Yêu cầu xuất 30 (nhỏ hơn số lượng lô hạn gần = 50)
    suggestions = get_fefo_lot_suggestions(fefo_db_session, prod.id, wh.id, 30.0)

    assert len(suggestions) == 1
    assert suggestions[0]["lot_number"] == "LOT-2026-EARLY"
    assert suggestions[0]["suggested_qty"] == 30.0
    assert suggestions[0]["available_qty"] == 50.0


def test_fefo_multi_lot_accumulation_when_single_lot_insufficient(fefo_db_session):
    """Nếu 1 lô không đủ số lượng, gợi ý theo thứ tự hạn sử dụng tăng dần cho đến khi gom đủ."""
    wh, prod, _ = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        id=1,
        lot_number="LOT-A",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=10),
        quantity=40.0,
    )
    lot2 = InventoryLot(
        id=2,
        lot_number="LOT-B",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=30),
        quantity=70.0,
    )
    lot3 = InventoryLot(
        id=3,
        lot_number="LOT-C",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=90),
        quantity=100.0,
    )
    fefo_db_session.add_all([lot1, lot2, lot3])
    fefo_db_session.commit()

    # Yêu cầu 100: LOT-A (40) + LOT-B (60)
    suggestions = get_fefo_lot_suggestions(fefo_db_session, prod.id, wh.id, 100.0)

    assert len(suggestions) == 2
    assert suggestions[0]["lot_number"] == "LOT-A"
    assert suggestions[0]["suggested_qty"] == 40.0

    assert suggestions[1]["lot_number"] == "LOT-B"
    assert suggestions[1]["suggested_qty"] == 60.0

    total_suggested = sum(s["suggested_qty"] for s in suggestions)
    assert total_suggested == 100.0


def test_fefo_null_expiry_placed_last(fefo_db_session):
    """Lô không có hạn sử dụng (exp_date is None) được xếp sau các lô có hạn dùng."""
    wh, prod, _ = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot_no_exp = InventoryLot(
        id=1,
        lot_number="LOT-NO-EXP",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=None,
        quantity=50.0,
    )
    lot_with_exp = InventoryLot(
        id=2,
        lot_number="LOT-WITH-EXP",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=60),
        quantity=50.0,
    )
    fefo_db_session.add_all([lot_no_exp, lot_with_exp])
    fefo_db_session.commit()

    suggestions = get_fefo_lot_suggestions(fefo_db_session, prod.id, wh.id, 70.0)
    assert len(suggestions) == 2
    assert suggestions[0]["lot_number"] == "LOT-WITH-EXP"
    assert suggestions[0]["suggested_qty"] == 50.0
    assert suggestions[1]["lot_number"] == "LOT-NO-EXP"
    assert suggestions[1]["suggested_qty"] == 20.0


def test_api_suggest_lots_endpoint(fefo_client, fefo_db_session):
    """Kiểm tra API GET /api/v1/warehouse/suggest-lots và /warehouse/suggest-lots."""
    wh, prod, _ = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    fefo_db_session.add_all([
        InventoryLot(
            id=10,
            lot_number="LOT-API-1",
            product_id=prod.id,
            warehouse_id=wh.id,
            exp_date=today + timedelta(days=15),
            quantity=25.0,
        ),
        InventoryLot(
            id=11,
            lot_number="LOT-API-2",
            product_id=prod.id,
            warehouse_id=wh.id,
            exp_date=today + timedelta(days=45),
            quantity=50.0,
        ),
    ])
    fefo_db_session.commit()

    res = fefo_client.get(f"/api/v1/warehouse/suggest-lots?productId={prod.id}&warehouseId={wh.id}&quantity=30")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["productId"] == prod.id
    assert len(data["suggestedLots"]) == 2
    assert data["suggestedLots"][0]["lot_number"] == "LOT-API-1"
    assert data["suggestedLots"][0]["suggested_qty"] == 25.0
    assert data["suggestedLots"][1]["lot_number"] == "LOT-API-2"
    assert data["suggestedLots"][1]["suggested_qty"] == 5.0


# ============================================================================
# 2. Thủ kho chọn lô khác (Override FEFO): Bắt buộc nhập lý do
# ============================================================================

def test_dispatch_default_fefo_no_reason_needed(fefo_client, fefo_db_session):
    """Khi xuất đúng lô FEFO gợi ý, không bắt buộc nhập lý do override."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        lot_number="LOT-DEF-1",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=10),
        quantity=50.0,
    )
    lot2 = InventoryLot(
        lot_number="LOT-DEF-2",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=60),
        quantity=100.0,
    )
    fefo_db_session.add_all([lot1, lot2])
    fefo_db_session.add(
        Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=150.0,
            reserved_qty=30.0,
            available_qty=120.0,
        )
    )
    order = Order(
        order_code="ORD-FEFO-01",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=30,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # Xuất đúng lô LOT-DEF-1 (hạn gần nhất) với số lượng 30
    payload = {
        "orderId": order.id,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-DEF-1", "actualQty": 30.0}
        ],
    }
    res = fefo_client.post("/api/v1/warehouse/dispatches", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert res.json()["data"]["status"] == "SHIPPED"


def test_dispatch_override_fefo_without_reason_rejected_400(fefo_client, fefo_db_session):
    """Khi chọn lô khác lô gợi ý FEFO mà để trống lý do giải trình, hệ thống báo lỗi 400."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        lot_number="LOT-EXP-SOON",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=10),
        quantity=50.0,
    )
    lot2 = InventoryLot(
        lot_number="LOT-EXP-FAR",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=120),
        quantity=100.0,
    )
    fefo_db_session.add_all([lot1, lot2])
    fefo_db_session.add(
        Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=150.0,
            reserved_qty=30.0,
            available_qty=120.0,
        )
    )
    order = Order(
        order_code="ORD-FEFO-02",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=30,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # FEFO gợi ý LOT-EXP-SOON, nhưng thủ kho cố tình chọn LOT-EXP-FAR và để trống lý do
    payload = {
        "orderId": order.id,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-EXP-FAR", "actualQty": 30.0}
        ],
        "overrideReason": "   ",  # Chỉ chứa khoảng trắng
    }
    res = fefo_client.post("/api/v1/warehouse/dispatches", json=payload)
    assert res.status_code == 400
    assert "lý do" in res.json()["detail"].lower() or "reason" in res.json()["detail"].lower()


def test_dispatch_override_fefo_with_valid_reason_accepted(fefo_client, fefo_db_session):
    """Khi chọn lô khác lô gợi ý FEFO và có nhập lý do hợp lệ, xuất kho thành công."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        lot_number="LOT-EARLY-1",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=15),
        quantity=50.0,
    )
    lot2 = InventoryLot(
        lot_number="LOT-LATER-2",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=90),
        quantity=100.0,
    )
    fefo_db_session.add_all([lot1, lot2])
    fefo_db_session.add(
        Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=150.0,
            reserved_qty=20.0,
            available_qty=130.0,
        )
    )
    order = Order(
        order_code="ORD-FEFO-03",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=20,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # Chọn LOT-LATER-2 kèm lý do giải trình
    reason = "Đại lý yêu cầu lô hàng có date trên 2 tháng để chạy chương trình khuyến mãi hè"
    payload = {
        "orderId": order.id,
        "overrideReason": reason,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-LATER-2", "actualQty": 20.0}
        ],
    }
    res = fefo_client.post("/api/v1/warehouse/dispatches", json=payload)
    assert res.status_code == 200
    res_data = res.json()["data"]
    assert res_data["overrideReason"] == reason
    assert res_data["items"][0]["lotNumber"] == "LOT-LATER-2"


# ============================================================================
# 3. Trừ tồn kho theo đúng lô và chống âm kho
# ============================================================================

def test_exact_lot_inventory_deduction(fefo_client, fefo_db_session):
    """Khi hoàn tất xuất kho, hệ thống trừ chính xác số lượng tồn của đúng lô được chọn."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        lot_number="LOT-DEDUCT-1",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=20),
        quantity=100.0,
    )
    lot2 = InventoryLot(
        lot_number="LOT-DEDUCT-2",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=60),
        quantity=200.0,
    )
    inv = Inventory(
        product_id=prod.id,
        warehouse_id=wh.id,
        physical_qty=300.0,
        reserved_qty=40.0,
        available_qty=260.0,
    )
    fefo_db_session.add_all([lot1, lot2, inv])
    order = Order(
        order_code="ORD-FEFO-04",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=40,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # Xuất 40 sản phẩm từ LOT-DEDUCT-1
    payload = {
        "orderId": order.id,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-DEDUCT-1", "actualQty": 40.0}
        ],
    }
    res = fefo_client.post("/api/v1/warehouse/dispatches", json=payload)
    assert res.status_code == 200

    # Kiểm tra tồn kho sau xuất
    fefo_db_session.refresh(lot1)
    fefo_db_session.refresh(lot2)
    fefo_db_session.refresh(inv)

    assert lot1.quantity == 60.0  # 100 - 40 = 60
    assert lot2.quantity == 200.0  # LOT-DEDUCT-2 không bị ảnh hưởng
    assert inv.physical_qty == 260.0  # 300 - 40 = 260
    assert inv.reserved_qty == 0.0  # 40 - 40 = 0


def test_anti_negative_stock_per_lot_blocked_400(fefo_client, fefo_db_session):
    """Chống âm kho trên từng lô: Xuất quá số lượng tồn của lô phải bị chặn với lỗi 400."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot = InventoryLot(
        lot_number="LOT-LIMITED",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=20),
        quantity=15.0,  # Chỉ có 15
    )
    inv = Inventory(
        product_id=prod.id,
        warehouse_id=wh.id,
        physical_qty=15.0,
        reserved_qty=15.0,
        available_qty=0.0,
    )
    fefo_db_session.add_all([lot, inv])
    order = Order(
        order_code="ORD-FEFO-05",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=20,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # Cố tình xuất 20 từ lô chỉ có 15
    payload = {
        "orderId": order.id,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-LIMITED", "actualQty": 20.0}
        ],
    }
    res = fefo_client.post("/api/v1/warehouse/dispatches", json=payload)
    assert res.status_code == 400
    assert "vượt quá" in res.json()["detail"].lower() or "âm kho" in res.json()["detail"].lower()

    # Tồn kho không bị trừ khi lỗi
    fefo_db_session.refresh(lot)
    assert lot.quantity == 15.0


# ============================================================================
# 4. PickList flow & Suggest lots kết hợp Dispatch
# ============================================================================

def test_picklist_creation_suggest_and_dispatch_flow(fefo_client, fefo_db_session):
    """Kiểm tra toàn bộ luồng tạo PickList -> Gợi ý lô -> Dispatch hoàn tất."""
    wh, prod, cust = _seed_test_warehouse_and_product(fefo_db_session)
    today = date.today()

    lot1 = InventoryLot(
        lot_number="LOT-FLOW-1",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=10),
        quantity=30.0,
    )
    lot2 = InventoryLot(
        lot_number="LOT-FLOW-2",
        product_id=prod.id,
        warehouse_id=wh.id,
        exp_date=today + timedelta(days=40),
        quantity=50.0,
    )
    fefo_db_session.add_all([lot1, lot2])
    fefo_db_session.add(
        Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=80.0,
            reserved_qty=40.0,
            available_qty=40.0,
        )
    )
    order = Order(
        order_code="ORD-FLOW-01",
        customer_id=cust.id,
        warehouse_id=wh.id,
        status=OrderStatus.APPROVED,
    )
    fefo_db_session.add(order)
    fefo_db_session.flush()

    item = OrderItem(
        order_id=order.id,
        product_id=prod.id,
        sku=prod.sku,
        product_name=prod.name,
        quantity=40,
    )
    fefo_db_session.add(item)
    fefo_db_session.commit()

    # Bước 1: Tạo pick-list
    res_pick = fefo_client.post("/api/v1/warehouse/pick-lists", json={"orderId": order.id})
    assert res_pick.status_code == 200
    pick_list_id = res_pick.json()["data"]["id"]

    # Bước 2: Gọi gợi ý lô theo pick-list
    res_sug = fefo_client.get(f"/api/v1/warehouse/pick-lists/{pick_list_id}/suggest-lots")
    assert res_sug.status_code == 200
    suggested_lots = res_sug.json()["data"]["items"][0]["suggestedLots"]
    assert len(suggested_lots) == 2
    assert suggested_lots[0]["lot_number"] == "LOT-FLOW-1"
    assert suggested_lots[0]["suggested_qty"] == 30.0
    assert suggested_lots[1]["lot_number"] == "LOT-FLOW-2"
    assert suggested_lots[1]["suggested_qty"] == 10.0

    # Bước 3: Xuất kho theo đúng gợi ý
    dispatch_payload = {
        "orderId": order.id,
        "pickListId": pick_list_id,
        "items": [
            {"productId": prod.id, "lotNumber": "LOT-FLOW-1", "actualQty": 30.0},
            {"productId": prod.id, "lotNumber": "LOT-FLOW-2", "actualQty": 10.0},
        ],
    }
    res_disp = fefo_client.post("/api/v1/warehouse/dispatches", json=dispatch_payload)
    assert res_disp.status_code == 200

    # Kiểm tra tồn sau xuất
    fefo_db_session.refresh(lot1)
    fefo_db_session.refresh(lot2)
    fefo_db_session.refresh(order)
    fefo_db_session.refresh(item)

    assert lot1.quantity == 0.0
    assert lot2.quantity == 40.0
    assert item.quantity_delivered == 40
    assert order.status == OrderStatus.COMPLETED


# ============================================================================
# 5. Phân quyền RBAC
# ============================================================================

def test_unauthorized_role_cannot_dispatch(fefo_db_session):
    """Vai trò không thuộc nhóm kho (ví dụ: Customer hoặc Sales Rep) bị chặn 403 Forbidden."""
    def override_get_db():
        yield fefo_db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=55,
        username="rep_user",
        role="Sales Rep",
    )
    with TestClient(app) as client:
        res = client.post("/api/v1/warehouse/dispatches", json={"orderId": 1, "items": []})
        assert res.status_code == 403
        assert "quyền" in res.json()["detail"].lower()

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
