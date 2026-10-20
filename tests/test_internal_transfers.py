"""Unit & Integration tests for Internal Transfer Management (Quản lý luân chuyển hàng hóa nội bộ).

Acceptance Criteria:
1. Hàng đang chuyển đi phải được ghi nhận là "đang trên đường" (IN_TRANSIT),
   tuyệt đối CHƯA ĐƯỢC cộng số lượng vào tồn kho của kho đến.
2. Kho đến phải có hành động "Xác nhận nhận đủ hàng" thì tồn kho ở kho đến mới được cộng.
3. Khi kho đến nhận hàng, nếu có chênh lệch số lượng so với lúc gửi,
   hệ thống bắt buộc người dùng phải nhập "Lý do chênh lệch".
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.models.models import (
    Base,
    InternalTransfer,
    InternalTransferDetail,
    Inventory,
    Product,
    Warehouse,
)
from backend.main import app


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Ensure database tables exist for internal transfers."""
    init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def setup_transfer_data(db_session):
    """Seed sample warehouses, products, and initial inventory."""
    # 1. Warehouses
    wh_hn = db_session.query(Warehouse).filter(Warehouse.code == "WH-HN-TEST").first()
    if not wh_hn:
        wh_hn = Warehouse(code="WH-HN-TEST", name="Kho Hà Nội Test", is_active=True)
        db_session.add(wh_hn)

    wh_hcm = db_session.query(Warehouse).filter(Warehouse.code == "WH-HCM-TEST").first()
    if not wh_hcm:
        wh_hcm = Warehouse(code="WH-HCM-TEST", name="Kho HCM Test", is_active=True)
        db_session.add(wh_hcm)

    # 2. Product
    prod = db_session.query(Product).filter(Product.sku == "SKU-TRANSFER-01").first()
    if not prod:
        prod = Product(
            sku="SKU-TRANSFER-01",
            name="Sữa chua Vinamilk 100g",
            base_unit="Hộp",
            cost_price=7000.0,
            base_price=10000.0,
            status="ACTIVE",
        )
        db_session.add(prod)

    db_session.commit()
    db_session.refresh(wh_hn)
    db_session.refresh(wh_hcm)
    db_session.refresh(prod)

    # 3. Initial Inventory: 100 in WH-HN, 0 in WH-HCM
    inv_hn = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == prod.id, Inventory.warehouse_id == wh_hn.id)
        .first()
    )
    if not inv_hn:
        inv_hn = Inventory(
            product_id=prod.id,
            warehouse_id=wh_hn.id,
            physical_qty=100.0,
            reserved_qty=0.0,
            available_qty=100.0,
        )
        db_session.add(inv_hn)
    else:
        inv_hn.physical_qty = 100.0
        inv_hn.reserved_qty = 0.0
        inv_hn.available_qty = 100.0

    inv_hcm = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == prod.id, Inventory.warehouse_id == wh_hcm.id)
        .first()
    )
    if not inv_hcm:
        inv_hcm = Inventory(
            product_id=prod.id,
            warehouse_id=wh_hcm.id,
            physical_qty=0.0,
            reserved_qty=0.0,
            available_qty=0.0,
        )
        db_session.add(inv_hcm)
    else:
        inv_hcm.physical_qty = 0.0
        inv_hcm.reserved_qty = 0.0
        inv_hcm.available_qty = 0.0

    db_session.commit()

    return {
        "wh_from_id": wh_hn.id,
        "wh_to_id": wh_hcm.id,
        "product_id": prod.id,
        "product_sku": prod.sku,
    }


def test_create_transfer_success_and_ac1_in_transit_stock(client, setup_transfer_data, db_session):
    """AC 1:
    - Trừ tồn kho ở kho gửi (WH-HN: 100 -> 70).
    - Tạo record với trạng thái IN_TRANSIT.
    - Tuyệt đối CHƯA ĐƯỢC cộng số lượng vào tồn kho của kho đến (WH-HCM: vẫn 0).
    """
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    payload = {
        "from_warehouse_id": wh_from_id,
        "to_warehouse_id": wh_to_id,
        "items": [
            {
                "product_id": product_id,
                "quantity_sent": 30.0,
            }
        ],
    }

    response = client.post("/api/internal-transfers", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["success"] is True
    transfer = data["data"]
    assert transfer["status"] == "IN_TRANSIT"
    assert transfer["from_warehouse_id"] == wh_from_id
    assert transfer["to_warehouse_id"] == wh_to_id
    assert len(transfer["details"]) == 1
    assert transfer["details"][0]["quantity_sent"] == 30.0
    assert transfer["details"][0]["quantity_received"] is None

    transfer_id = transfer["id"]

    # Kiểm tra tồn kho kho gửi: 100 - 30 = 70
    inv_from = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_from_id)
        .first()
    )
    assert inv_from.physical_qty == 70.0
    assert inv_from.available_qty == 70.0

    # TIÊU CHÍ AC 1: Tuyệt đối CHƯA ĐƯỢC cộng vào kho đến (vẫn bằng 0)
    inv_to = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_to_id)
        .first()
    )
    assert inv_to.physical_qty == 0.0
    assert inv_to.available_qty == 0.0


def test_create_transfer_insufficient_stock_fails(client, setup_transfer_data):
    """Kho gửi không đủ hàng thì phải báo lỗi 400 và không cho chuyển."""
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    # Hiện tại kho gửi chỉ còn 70, yêu cầu chuyển 150
    payload = {
        "from_warehouse_id": wh_from_id,
        "to_warehouse_id": wh_to_id,
        "items": [
            {
                "product_id": product_id,
                "quantity_sent": 150.0,
            }
        ],
    }

    response = client.post("/api/internal-transfers", json=payload)
    assert response.status_code == 400
    assert "không đủ" in response.text.lower()


def test_create_transfer_same_warehouse_fails(client, setup_transfer_data):
    """Kho gửi và nhận trùng nhau phải bị từ chối 400."""
    wh_from_id = setup_transfer_data["wh_from_id"]
    product_id = setup_transfer_data["product_id"]

    payload = {
        "from_warehouse_id": wh_from_id,
        "to_warehouse_id": wh_from_id,
        "items": [
            {
                "product_id": product_id,
                "quantity_sent": 5.0,
            }
        ],
    }

    response = client.post("/api/internal-transfers", json=payload)
    assert response.status_code == 400
    assert "không được trùng" in response.text.lower()


def test_confirm_transfer_discrepancy_without_reason_fails(client, setup_transfer_data, db_session):
    """AC 3:
    Khi nhận hàng có chênh lệch số lượng so với lúc gửi,
    nếu KHÔNG có 'Lý do chênh lệch' -> BẮT BUỘC BÁO LỖI 400.
    """
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    # 1. Tạo phiếu gửi 20
    create_res = client.post(
        "/api/internal-transfers",
        json={
            "from_warehouse_id": wh_from_id,
            "to_warehouse_id": wh_to_id,
            "items": [{"product_id": product_id, "quantity_sent": 20.0}],
        },
    )
    assert create_res.status_code == 201
    transfer_id = create_res.json()["data"]["id"]

    # 2. Xác nhận nhận hàng chỉ có 18 (lệch 2) nhưng không có lý do chênh lệch
    confirm_payload = {
        "items": [
            {
                "product_id": product_id,
                "quantity_received": 18.0,
                "discrepancy_reason": "",  # Trống lý do
            }
        ]
    }

    confirm_res = client.post(f"/api/internal-transfers/{transfer_id}/confirm", json=confirm_payload)
    assert confirm_res.status_code == 400
    assert "chênh lệch" in confirm_res.text.lower()
    assert "lý do" in confirm_res.text.lower()

    # Tồn kho kho đến vẫn chưa được cộng
    inv_to = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_to_id)
        .first()
    )
    assert inv_to.physical_qty == 0.0

    # Trạng thái vẫn là IN_TRANSIT
    db_transfer = db_session.get(InternalTransfer, transfer_id)
    assert db_transfer.status == "IN_TRANSIT"


def test_confirm_transfer_discrepancy_with_reason_succeeds(client, setup_transfer_data, db_session):
    """AC 2 & AC 3:
    Khi có chênh lệch và CÓ cung cấp 'Lý do chênh lệch':
    - Cập nhật trạng thái thành COMPLETED.
    - Cộng số lượng THỰC NHẬN (18) vào kho đến.
    - Lưu lý do chênh lệch vào chi tiết phiếu.
    """
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    # 1. Tạo phiếu gửi 20
    create_res = client.post(
        "/api/internal-transfers",
        json={
            "from_warehouse_id": wh_from_id,
            "to_warehouse_id": wh_to_id,
            "items": [{"product_id": product_id, "quantity_sent": 20.0}],
        },
    )
    assert create_res.status_code == 201
    transfer_id = create_res.json()["data"]["id"]

    # 2. Xác nhận nhận hàng 18 với lý do
    confirm_payload = {
        "items": [
            {
                "product_id": product_id,
                "quantity_received": 18.0,
                "discrepancy_reason": "Vỡ 2 hộp sữa trong quá trình bốc dỡ xe tải",
            }
        ]
    }

    confirm_res = client.post(f"/api/internal-transfers/{transfer_id}/confirm", json=confirm_payload)
    assert confirm_res.status_code == 200, confirm_res.text
    data = confirm_res.json()["data"]
    assert data["status"] == "COMPLETED"
    assert data["details"][0]["quantity_received"] == 18.0
    assert data["details"][0]["discrepancy_reason"] == "Vỡ 2 hộp sữa trong quá trình bốc dỡ xe tải"

    # AC 2: Kho đến đã được cộng đúng số thực nhận (18)
    inv_to = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_to_id)
        .first()
    )
    assert inv_to.physical_qty == 18.0
    assert inv_to.available_qty == 18.0


def test_confirm_transfer_exact_match_succeeds(client, setup_transfer_data, db_session):
    """Nhận đủ 100% không chênh lệch:
    - Không bắt buộc lý do chênh lệch.
    - Trạng thái COMPLETED.
    - Kho đến được cộng đủ số lượng.
    """
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    initial_to_qty = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_to_id)
        .first()
        .physical_qty
    )

    create_res = client.post(
        "/api/internal-transfers",
        json={
            "from_warehouse_id": wh_from_id,
            "to_warehouse_id": wh_to_id,
            "items": [{"product_id": product_id, "quantity_sent": 10.0}],
        },
    )
    assert create_res.status_code == 201
    transfer_id = create_res.json()["data"]["id"]

    confirm_payload = {
        "items": [
            {
                "product_id": product_id,
                "quantity_received": 10.0,
            }
        ]
    }

    confirm_res = client.post(f"/api/internal-transfers/{transfer_id}/confirm", json=confirm_payload)
    assert confirm_res.status_code == 200
    data = confirm_res.json()["data"]
    assert data["status"] == "COMPLETED"

    # Kiểm tra tồn kho kho đến tăng thêm đúng 10
    inv_to = (
        db_session.query(Inventory)
        .filter(Inventory.product_id == product_id, Inventory.warehouse_id == wh_to_id)
        .first()
    )
    assert inv_to.physical_qty == initial_to_qty + 10.0


def test_confirm_already_completed_transfer_fails(client, setup_transfer_data):
    """Không thể xác nhận lại phiếu đã COMPLETED."""
    wh_from_id = setup_transfer_data["wh_from_id"]
    wh_to_id = setup_transfer_data["wh_to_id"]
    product_id = setup_transfer_data["product_id"]

    create_res = client.post(
        "/api/internal-transfers",
        json={
            "from_warehouse_id": wh_from_id,
            "to_warehouse_id": wh_to_id,
            "items": [{"product_id": product_id, "quantity_sent": 5.0}],
        },
    )
    transfer_id = create_res.json()["data"]["id"]

    confirm_res1 = client.post(
        f"/api/internal-transfers/{transfer_id}/confirm",
        json={"items": [{"product_id": product_id, "quantity_received": 5.0}]},
    )
    assert confirm_res1.status_code == 200

    # Xác nhận lần 2
    confirm_res2 = client.post(
        f"/api/internal-transfers/{transfer_id}/confirm",
        json={"items": [{"product_id": product_id, "quantity_received": 5.0}]},
    )
    assert confirm_res2.status_code == 400
    assert "không ở trạng thái đang chuyển" in confirm_res2.text.lower()


def test_get_transfers_list_and_detail(client, setup_transfer_data):
    """Kiểm tra API lấy danh sách và chi tiết phiếu luân chuyển."""
    res = client.get("/api/internal-transfers")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)
    assert len(data["data"]) > 0

    first_id = data["data"][0]["id"]
    detail_res = client.get(f"/api/internal-transfers/{first_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["data"]["id"] == first_id
