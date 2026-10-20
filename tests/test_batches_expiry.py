"""Unit & Integration tests for Batch and Expiry Date Tracking (Theo dõi lô và hạn sử dụng).

Acceptance Criteria:
1. Có thể bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU).
2. Quản lý thông tin mỗi lô bao gồm: Số lô, ngày sản xuất, hạn sử dụng và số lượng tồn còn lại.
3. Cảnh báo các lô sắp hết hạn theo một ngưỡng thời gian có thể khai báo/cấu hình được.
4. Chặn xuất kho đối với lô đã quá hạn sử dụng. Chỉ cho phép xuất nếu có sự xác nhận "ghi đè" (override)
   từ tài khoản cấp Quản lý kho và bắt buộc phải ghi kèm lý do.
"""
from __future__ import annotations

from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal, init_db
from app.models.models import (
    BatchOverrideLog,
    Inventory,
    Product,
    ProductBatch,
    Warehouse,
)
from backend.main import app
from src.backend.rbac import create_access_token


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def batch_test_data(db_session):
    # 1. Warehouse
    wh = db_session.query(Warehouse).filter(Warehouse.code == "WH-BATCH-TEST").first()
    if not wh:
        wh = Warehouse(code="WH-BATCH-TEST", name="Kho Kiểm Thử Lô", is_active=True)
        db_session.add(wh)

    # 2. Products: 1 batch-managed, 1 regular
    prod_batch = db_session.query(Product).filter(Product.sku == "SKU-MILK-LOT").first()
    if not prod_batch:
        prod_batch = Product(
            sku="SKU-MILK-LOT",
            name="Sữa tươi tiệt trùng 1L",
            base_unit="Hộp",
            cost_price=25000.0,
            base_price=35000.0,
            is_batch_managed=True,
            manage_by_lot=True,
            status="ACTIVE",
        )
        db_session.add(prod_batch)

    prod_normal = db_session.query(Product).filter(Product.sku == "SKU-CUP-NO-LOT").first()
    if not prod_normal:
        prod_normal = Product(
            sku="SKU-CUP-NO-LOT",
            name="Ly nhựa uống nước",
            base_unit="Cái",
            cost_price=500.0,
            base_price=1000.0,
            is_batch_managed=False,
            manage_by_lot=False,
            status="ACTIVE",
        )
        db_session.add(prod_normal)

    db_session.commit()
    db_session.refresh(wh)
    db_session.refresh(prod_batch)
    db_session.refresh(prod_normal)

    # 3. Inventory for both products in WH
    inv1 = db_session.query(Inventory).filter(
        Inventory.product_id == prod_batch.id, Inventory.warehouse_id == wh.id
    ).first()
    if not inv1:
        inv1 = Inventory(
            product_id=prod_batch.id,
            warehouse_id=wh.id,
            physical_qty=200.0,
            reserved_qty=0.0,
            available_qty=200.0,
        )
        db_session.add(inv1)
    else:
        inv1.physical_qty = 200.0
        inv1.available_qty = 200.0

    inv2 = db_session.query(Inventory).filter(
        Inventory.product_id == prod_normal.id, Inventory.warehouse_id == wh.id
    ).first()
    if not inv2:
        inv2 = Inventory(
            product_id=prod_normal.id,
            warehouse_id=wh.id,
            physical_qty=500.0,
            reserved_qty=0.0,
            available_qty=500.0,
        )
        db_session.add(inv2)
    else:
        inv2.physical_qty = 500.0
        inv2.available_qty = 500.0

    db_session.commit()

    return {
        "warehouse_id": wh.id,
        "product_batch_id": prod_batch.id,
        "product_normal_id": prod_normal.id,
    }


def make_wh_manager_header():
    token = create_access_token({"sub": "wh_manager_01", "role": "WH Manager", "user_id": 99})
    return {"Authorization": f"Bearer {token}"}


def make_staff_header():
    token = create_access_token({"sub": "warehouse_staff_01", "role": "Warehouse", "user_id": 88})
    return {"Authorization": f"Bearer {token}"}


def test_ac1_toggle_batch_management_on_sku(client, batch_test_data, db_session):
    """AC 1: Có thể bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU)."""
    prod_id = batch_test_data["product_normal_id"]

    # 1. Bật tính năng
    res_on = client.patch(
        f"/api/v1/products/{prod_id}/batch-management",
        json={"is_batch_managed": True},
    )
    assert res_on.status_code == 200
    assert res_on.json()["data"]["is_batch_managed"] is True

    db_prod = db_session.get(Product, prod_id)
    db_session.refresh(db_prod)
    assert db_prod.is_batch_managed is True
    assert db_prod.manage_by_lot is True

    # 2. Tắt tính năng
    res_off = client.patch(
        f"/api/v1/products/{prod_id}/batch-management",
        json={"is_batch_managed": False},
    )
    assert res_off.status_code == 200
    assert res_off.json()["data"]["is_batch_managed"] is False

    db_session.refresh(db_prod)
    assert db_prod.is_batch_managed is False


def test_ac2_create_and_manage_batches(client, batch_test_data, db_session):
    """AC 2: Quản lý thông tin mỗi lô: Số lô, NSX, HSD và số lượng tồn còn lại."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]

    today = date.today()
    mfg = today - timedelta(days=60)
    exp = today + timedelta(days=180)

    payload = {
        "product_id": prod_id,
        "batch_number": "LOT-MILK-2026A",
        "mfg_date": mfg.isoformat(),
        "exp_date": exp.isoformat(),
        "remaining_quantity": 50.0,
        "warehouse_id": wh_id,
    }

    res = client.post("/api/v1/inventory/batches", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["batchNumber"] == "LOT-MILK-2026A"
    assert data["remainingQuantity"] == 50.0

    batch_id = data["id"]

    # Cập nhật số lượng tồn lô
    update_res = client.put(
        f"/api/v1/inventory/batches/{batch_id}",
        json={"remaining_quantity": 45.0},
    )
    assert update_res.status_code == 200
    assert update_res.json()["data"]["remainingQuantity"] == 45.0


def test_ac3_expiry_analysis_and_configurable_warning_threshold(client, batch_test_data, db_session):
    """AC 3: Cảnh báo các lô sắp hết hạn theo một ngưỡng thời gian có thể cấu hình được."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]
    today = date.today()

    # Lô 1: Đã hết hạn (cách đây 5 ngày)
    b_expired = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-EXPIRED-99",
        mfg_date=today - timedelta(days=90),
        exp_date=today - timedelta(days=5),
        remaining_quantity=20.0,
        warehouse_id=wh_id,
    )
    # Lô 2: Sắp hết hạn (còn 15 ngày)
    b_soon = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-SOON-15D",
        mfg_date=today - timedelta(days=30),
        exp_date=today + timedelta(days=15),
        remaining_quantity=30.0,
        warehouse_id=wh_id,
    )
    # Lô 3: Còn hạn dài (còn 120 ngày)
    b_valid = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-VALID-120D",
        mfg_date=today,
        exp_date=today + timedelta(days=120),
        remaining_quantity=50.0,
        warehouse_id=wh_id,
    )

    db_session.add_all([b_expired, b_soon, b_valid])
    db_session.commit()

    # 1. Truy vấn với warning_days = 30 (mặc định)
    res30 = client.get(
        f"/api/v1/inventory/batches?productId={prod_id}&warningDays=30"
    )
    assert res30.status_code == 200
    items = res30.json()["data"]

    item_exp = next(i for i in items if i["batch_number"] == "LOT-EXPIRED-99")
    assert item_exp["is_expired"] is True
    assert item_exp["status"] == "EXPIRED"

    item_soon = next(i for i in items if i["batch_number"] == "LOT-SOON-15D")
    assert item_soon["is_expired"] is False
    assert item_soon["is_expiring_soon"] is True
    assert item_soon["status"] == "EXPIRING_SOON"

    item_valid = next(i for i in items if i["batch_number"] == "LOT-VALID-120D")
    assert item_valid["is_expired"] is False
    assert item_valid["is_expiring_soon"] is False
    assert item_valid["status"] == "ACTIVE"

    # 2. Cấu hình ngưỡng cảnh báo ngắn hơn: warning_days = 10
    # Khi ngưỡng = 10 thì LOT-SOON-15D (còn 15 ngày) sẽ KHÔNG bị đánh dấu sắp hết hạn
    res10 = client.get(
        f"/api/v1/inventory/batches?productId={prod_id}&warningDays=10"
    )
    assert res10.status_code == 200
    items10 = res10.json()["data"]
    item_soon_10 = next(i for i in items10 if i["batch_number"] == "LOT-SOON-15D")
    assert item_soon_10["is_expiring_soon"] is False


def test_ac4_outbound_batch_mandatory_for_batch_managed_sku(client, batch_test_data):
    """AC 4: SKU có quản lý lô mà không chọn lô khi xuất thì bị từ chối 400."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]

    payload = {
        "product_id": prod_id,
        "warehouse_id": wh_id,
        "quantity": 10.0,
        "batch_id": None,  # Không chọn lô
    }

    res = client.post("/api/v1/inventory/outbound", json=payload)
    assert res.status_code == 400
    assert "quản lý theo lô" in res.text.lower()


def test_ac4_outbound_expired_batch_blocked_without_override(client, batch_test_data, db_session):
    """AC 4: Chặn xuất kho đối với lô đã quá hạn sử dụng nếu không có xác nhận ghi đè."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]
    today = date.today()

    expired_batch = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-BLOCKED-EXPIRED",
        mfg_date=today - timedelta(days=60),
        exp_date=today - timedelta(days=2),  # Quá hạn 2 ngày
        remaining_quantity=15.0,
        warehouse_id=wh_id,
    )
    db_session.add(expired_batch)
    db_session.commit()

    payload = {
        "product_id": prod_id,
        "warehouse_id": wh_id,
        "quantity": 5.0,
        "batch_id": expired_batch.id,
        "override_expired": False,  # Không ghi đè
    }

    res = client.post("/api/v1/inventory/outbound", json=payload)
    assert res.status_code == 400
    data = res.json()
    assert "quá hạn" in str(data).lower()
    assert "chặn" in str(data).lower()

    # Lô không bị trừ tồn
    db_session.refresh(expired_batch)
    assert expired_batch.remaining_quantity == 15.0


def test_ac4_outbound_expired_batch_override_without_reason_fails(client, batch_test_data, db_session):
    """AC 4: Ghi đè nhưng bỏ trống lý do -> Bắt buộc báo lỗi."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]
    today = date.today()

    expired_batch = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-NO-REASON",
        mfg_date=today - timedelta(days=60),
        exp_date=today - timedelta(days=1),
        remaining_quantity=10.0,
        warehouse_id=wh_id,
    )
    db_session.add(expired_batch)
    db_session.commit()

    payload = {
        "product_id": prod_id,
        "warehouse_id": wh_id,
        "quantity": 2.0,
        "batch_id": expired_batch.id,
        "override_expired": True,
        "override_reason": "   ",  # Bỏ trống lý do
    }

    res = client.post(
        "/api/v1/inventory/outbound",
        json=payload,
        headers=make_wh_manager_header(),
    )
    assert res.status_code == 400
    assert "lý do" in res.text.lower()


def test_ac4_outbound_expired_batch_override_with_manager_succeeds(client, batch_test_data, db_session):
    """AC 4: Có xác nhận ghi đè từ Quản lý kho kèm lý do -> Cho phép xuất và ghi lại log."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]
    today = date.today()

    expired_batch = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-OVERRIDE-OK",
        mfg_date=today - timedelta(days=60),
        exp_date=today - timedelta(days=3),
        remaining_quantity=20.0,
        warehouse_id=wh_id,
    )
    db_session.add(expired_batch)
    db_session.commit()

    reason_text = "Xuất kho để tiêu hủy theo biên bản xử lý hàng hỏng số BB-TH-2026/09"
    payload = {
        "product_id": prod_id,
        "warehouse_id": wh_id,
        "quantity": 8.0,
        "batch_id": expired_batch.id,
        "override_expired": True,
        "override_reason": reason_text,
    }

    res = client.post(
        "/api/v1/inventory/outbound",
        json=payload,
        headers=make_wh_manager_header(),
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["override_applied"] is True
    assert data["override_reason"] == reason_text
    assert data["remaining_batch_quantity"] == 12.0

    # Kiểm tra log ghi đè đã được lưu
    log = (
        db_session.query(BatchOverrideLog)
        .filter(BatchOverrideLog.batch_id == expired_batch.id)
        .first()
    )
    assert log is not None
    assert log.override_reason == reason_text
    assert log.quantity == 8.0


def test_ac4_outbound_valid_batch_succeeds_normally(client, batch_test_data, db_session):
    """Lô còn hạn sử dụng xuất kho bình thường không cần ghi đè."""
    prod_id = batch_test_data["product_batch_id"]
    wh_id = batch_test_data["warehouse_id"]
    today = date.today()

    valid_batch = ProductBatch(
        product_id=prod_id,
        batch_number="LOT-NORMAL-DISPATCH",
        mfg_date=today,
        exp_date=today + timedelta(days=90),
        remaining_quantity=30.0,
        warehouse_id=wh_id,
    )
    db_session.add(valid_batch)
    db_session.commit()

    payload = {
        "product_id": prod_id,
        "warehouse_id": wh_id,
        "quantity": 5.0,
        "batch_id": valid_batch.id,
    }

    res = client.post(
        "/api/v1/inventory/outbound",
        json=payload,
        headers=make_staff_header(),
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["override_applied"] is False
    assert data["remaining_batch_quantity"] == 25.0
