import pytest
from fastapi.testclient import TestClient

from app.models.models import (
    Base,
    Warehouse,
    Product,
    Inventory,
    InventoryStock,
    InternalTransfer,
    InternalTransferItem,
)
from app.core.database import SessionLocal, engine
from backend.main import app


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def setup_transfer_data(db_session):
    # Tạo 2 kho
    wh_hn = db_session.query(Warehouse).filter(Warehouse.code == "WH-TEST-HN").first()
    if not wh_hn:
        wh_hn = Warehouse(code="WH-TEST-HN", name="Kho Tổng Test Hà Nội", is_active=True)
        db_session.add(wh_hn)

    wh_hcm = db_session.query(Warehouse).filter(Warehouse.code == "WH-TEST-HCM").first()
    if not wh_hcm:
        wh_hcm = Warehouse(code="WH-TEST-HCM", name="Kho Test TP.HCM", is_active=True)
        db_session.add(wh_hcm)

    # Tạo sản phẩm
    product = db_session.query(Product).filter(Product.sku == "SKU-TRANS-01").first()
    if not product:
        product = Product(
            sku="SKU-TRANS-01",
            name="Sữa chua uống Probi 65ml",
            base_unit="Chai",
            base_price=10000.0,
            status="ACTIVE",
        )
        db_session.add(product)

    db_session.commit()
    db_session.refresh(wh_hn)
    db_session.refresh(wh_hcm)
    db_session.refresh(product)

    # Khởi tạo tồn kho kho đi = 100 chai
    inv_hn = db_session.query(Inventory).filter(
        Inventory.product_id == product.id,
        Inventory.warehouse_id == wh_hn.id
    ).first()
    if not inv_hn:
        inv_hn = Inventory(
            product_id=product.id,
            warehouse_id=wh_hn.id,
            physical_qty=100.0,
            reserved_qty=0.0,
            available_qty=100.0,
        )
        db_session.add(inv_hn)
    else:
        inv_hn.physical_qty = 100.0
        inv_hn.available_qty = 100.0

    stock_hn = db_session.query(InventoryStock).filter(
        InventoryStock.product_id == product.id,
        InventoryStock.warehouse_id == wh_hn.id
    ).first()
    if not stock_hn:
        stock_hn = InventoryStock(
            product_id=product.id,
            warehouse_id=wh_hn.id,
            base_quantity=100.0,
        )
        db_session.add(stock_hn)
    else:
        stock_hn.base_quantity = 100.0

    db_session.commit()

    yield {
        "from_wh": wh_hn,
        "to_wh": wh_hcm,
        "product": product,
    }

    # Dọn dẹp dữ liệu test để không ảnh hưởng các test suite khác
    db_session.query(InternalTransferItem).delete()
    db_session.query(InternalTransfer).delete()
    db_session.query(Inventory).filter(Inventory.product_id == product.id).delete()
    db_session.query(InventoryStock).filter(InventoryStock.product_id == product.id).delete()
    db_session.query(Product).filter(Product.id == product.id).delete()
    db_session.query(Warehouse).filter(Warehouse.id.in_([wh_hn.id, wh_hcm.id])).delete()
    db_session.commit()


def test_create_internal_transfer_success(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    payload = {
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [
            {
                "product_id": product.id,
                "sent_quantity": 30.0,
            }
        ]
    }

    res = client.post("/api/internal-transfers", json=payload)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["status"] == "PENDING"
    assert data["from_warehouse_id"] == from_wh.id
    assert data["to_warehouse_id"] == to_wh.id
    assert len(data["items"]) == 1
    assert data["items"][0]["sent_quantity"] == 30.0
    assert data["items"][0]["received_quantity"] is None

    # Kiểm tra tồn kho kho xuất đã bị trừ tạm thời 30 -> còn 70
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(
            Inventory.product_id == product.id,
            Inventory.warehouse_id == from_wh.id,
        ).first()
        assert inv.available_qty == 70.0
        assert inv.physical_qty == 70.0


def test_create_transfer_same_warehouse_fails(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    product = setup_transfer_data["product"]

    payload = {
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": from_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 10.0}],
    }
    res = client.post("/api/internal-transfers", json=payload)
    assert res.status_code == 400
    assert "trùng nhau" in res.json()["detail"]


def test_create_transfer_insufficient_stock_fails(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    # Yêu cầu gửi 99999 chai trong khi chỉ có 100 chai
    payload = {
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 99999.0}],
    }
    res = client.post("/api/internal-transfers", json=payload)
    assert res.status_code == 400
    assert "không đủ tồn kho" in res.json()["detail"].lower()


def test_confirm_transfer_exact_quantity(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    # 1. Tạo phiếu 20 chai
    create_res = client.post("/api/internal-transfers", json={
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 20.0}]
    })
    assert create_res.status_code == 201
    transfer_id = create_res.json()["data"]["id"]

    # 2. Xác nhận nhận đủ 20 chai
    confirm_payload = {
        "confirmed_by": "Thủ kho miền Nam",
        "items": [
            {
                "product_id": product.id,
                "received_quantity": 20.0,
            }
        ]
    }
    confirm_res = client.put(f"/api/internal-transfers/{transfer_id}/confirm", json=confirm_payload)
    assert confirm_res.status_code == 200
    data = confirm_res.json()["data"]
    assert data["status"] == "COMPLETED"
    assert data["items"][0]["received_quantity"] == 20.0
    assert data["confirmed_by"] == "Thủ kho miền Nam"

    # Kiểm tra tồn kho kho đích đã được cộng 20 chai
    with SessionLocal() as db:
        inv_to = db.query(Inventory).filter(
            Inventory.product_id == product.id,
            Inventory.warehouse_id == to_wh.id
        ).first()
        assert inv_to is not None
        assert inv_to.physical_qty >= 20.0


def test_confirm_transfer_discrepancy_without_reason_returns_400(setup_transfer_data, client):
    """Nghiệp vụ bắt buộc: Nếu sent_quantity != received_quantity thì BẮT BUỘC phải có discrepancy_reason (nếu trống -> lỗi 400)."""
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    # Tạo phiếu gửi 20 chai
    create_res = client.post("/api/internal-transfers", json={
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 20.0}]
    })
    transfer_id = create_res.json()["data"]["id"]

    # Xác nhận nhận chỉ 18 chai nhưng bỏ trống lý do chênh lệch
    bad_confirm = {
        "items": [
            {
                "product_id": product.id,
                "received_quantity": 18.0,
                "discrepancy_reason": "",  # Trống
            }
        ]
    }
    res = client.put(f"/api/internal-transfers/{transfer_id}/confirm", json=bad_confirm)
    assert res.status_code == 400
    assert "lý do chênh lệch" in res.json()["detail"].lower()

    # Thử lại với discrepancy_reason là whitespace
    bad_confirm_ws = {
        "items": [
            {
                "product_id": product.id,
                "received_quantity": 18.0,
                "discrepancy_reason": "   ",
            }
        ]
    }
    res_ws = client.put(f"/api/internal-transfers/{transfer_id}/confirm", json=bad_confirm_ws)
    assert res_ws.status_code == 400


def test_confirm_transfer_discrepancy_with_reason_succeeds(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    # Tạo phiếu gửi 20 chai
    create_res = client.post("/api/internal-transfers", json={
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 20.0}]
    })
    transfer_id = create_res.json()["data"]["id"]

    # Xác nhận nhận 18 chai kèm lý do chênh lệch
    good_confirm = {
        "confirmed_by": "Thủ kho nhận hàng",
        "items": [
            {
                "product_id": product.id,
                "received_quantity": 18.0,
                "discrepancy_reason": "Vỡ 2 chai trong quá trình vận chuyển bốc xếp",
            }
        ]
    }
    res = client.put(f"/api/internal-transfers/{transfer_id}/confirm", json=good_confirm)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "COMPLETED"
    assert data["items"][0]["received_quantity"] == 18.0
    assert data["items"][0]["discrepancy_reason"] == "Vỡ 2 chai trong quá trình vận chuyển bốc xếp"


def test_get_and_list_internal_transfers(setup_transfer_data, client):
    from_wh = setup_transfer_data["from_wh"]
    to_wh = setup_transfer_data["to_wh"]
    product = setup_transfer_data["product"]

    # Tạo phiếu
    create_res = client.post("/api/internal-transfers", json={
        "from_warehouse_id": from_wh.id,
        "to_warehouse_id": to_wh.id,
        "items": [{"product_id": product.id, "sent_quantity": 5.0}]
    })
    transfer_id = create_res.json()["data"]["id"]

    # GET detail
    get_res = client.get(f"/api/internal-transfers/{transfer_id}")
    assert get_res.status_code == 200
    assert get_res.json()["data"]["id"] == transfer_id

    # GET list
    list_res = client.get("/api/internal-transfers")
    assert list_res.status_code == 200
    assert list_res.json()["total"] >= 1
