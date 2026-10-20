"""Comprehensive pytest suite for Stock Card (Thẻ kho của một sản phẩm) feature.
Verifies all 4 Acceptance Criteria:
1. Hiển thị danh sách toàn bộ các phát sinh (nhập, xuất, chuyển kho, điều chỉnh kiểm kê) sắp xếp theo thời gian tăng dần.
2. Trên mỗi dòng lịch sử, hiển thị số lượng tồn kho (tồn cuối) lũy kế ngay sau phát sinh.
3. Mỗi dòng giao dịch có liên kết (document_url) và mã chứng từ gốc (document_code).
4. Bộ lọc theo Kho hàng và Khoảng thời gian (start_date - end_date) kèm số tồn đầu kỳ.
"""
from datetime import datetime, timedelta
import pytest
from starlette.testclient import TestClient

from app.core.database import SessionLocal, engine, get_db
from app.models.models import (
    Base,
    Product,
    Warehouse,
    WarehouseReceipt,
    WarehouseReceiptItem,
    WarehouseTransfer,
    WarehouseTransferItem,
    WarehouseAudit,
    WarehouseAuditItem,
    InventoryAdjustment,
    InventoryAdjustmentItem,
    InventoryTransaction,
    ImportDetail,
    ExportDetail,
    TransferDetail,
    AdjustmentDetail,
    InventoryLog,
)
from main import app


@pytest.fixture(scope="module", autouse=True)
def setup_tables():
    """Ensure all required tables exist."""
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_inventory_card_product_not_found(client: TestClient):
    """Sản phẩm không tồn tại trả về lỗi 404."""
    res = client.get("/api/inventory-cards/9999999")
    assert res.status_code == 404
    assert "Không tìm thấy sản phẩm" in res.json().get("detail", "")


def test_v1_and_root_endpoints_both_supported(client: TestClient, db):
    """Hỗ trợ cả /api/inventory-cards/{id} và /api/v1/inventory-cards/{id}."""
    prod = Product(
        sku=f"SKU-CARD-TEST-{datetime.now().timestamp()}",
        name="Sản phẩm kiểm tra endpoint",
        base_unit="Lon",
        status="ACTIVE",
    )
    db.add(prod)
    db.commit()
    db.refresh(prod)

    res1 = client.get(f"/api/inventory-cards/{prod.id}")
    res2 = client.get(f"/api/v1/inventory-cards/{prod.id}")

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["data"]["product"]["id"] == prod.id
    assert res2.json()["data"]["product"]["id"] == prod.id


def test_ac1_and_ac2_chronological_ordering_and_running_balance(client: TestClient, db):
    """AC 1 & AC 2: Sắp xếp theo thứ tự thời gian tăng dần và tính số tồn lũy kế chính xác trên từng dòng."""
    sku = f"SKU-CHRONO-{datetime.now().timestamp()}"
    prod = Product(sku=sku, name="Nước tăng lực Hổ Vàng", base_unit="Thùng", status="ACTIVE")
    wh = db.query(Warehouse).first()
    if not wh:
        wh = Warehouse(code="WH-TEST-01", name="Kho Thử Nghiệm", is_active=True)
        db.add(wh)
        db.commit()
        db.refresh(wh)

    db.add(prod)
    db.commit()
    db.refresh(prod)

    base_time = datetime(2026, 10, 1, 8, 0, 0)

    # 1. Nhập kho: +100 lúc 08:00
    receipt = WarehouseReceipt(warehouse_id=wh.id, receipt_date=base_time)
    db.add(receipt)
    db.flush()
    item_in = WarehouseReceiptItem(receipt_id=receipt.id, product_id=prod.id, quantity=100.0)
    db.add(item_in)

    # 2. Xuất kho (qua InventoryTransaction OUT): -30 lúc 10:00
    tx_out = InventoryTransaction(
        product_id=prod.id,
        warehouse_id=wh.id,
        transaction_type="OUT",
        unit_name="Thùng",
        input_quantity=30.0,
        conversion_rate_snapshot=1.0,
        base_quantity=30.0,
        created_at=base_time + timedelta(hours=2),
    )
    db.add(tx_out)

    # 3. Điều chuyển xuất kho: -20 lúc 14:00
    transfer = WarehouseTransfer(
        from_warehouse_id=wh.id,
        to_warehouse_id=wh.id + 1,
        transfer_date=base_time + timedelta(hours=6),
    )
    db.add(transfer)
    db.flush()
    trans_item = WarehouseTransferItem(transfer_id=transfer.id, product_id=prod.id, quantity=20.0)
    db.add(trans_item)

    # 4. Điều chỉnh kiểm kê: +5 lúc 18:00
    audit = WarehouseAudit(warehouse_id=wh.id, audit_date=base_time + timedelta(hours=10))
    db.add(audit)
    db.flush()
    audit_item = WarehouseAuditItem(audit_id=audit.id, product_id=prod.id, system_qty=50.0, actual_qty=55.0)
    db.add(audit_item)

    db.commit()

    # Truy vấn thẻ kho cho sản phẩm này tại kho wh.id
    res = client.get(f"/api/inventory-cards/{prod.id}?warehouse_id={wh.id}")
    assert res.status_code == 200
    data = res.json()["data"]

    items = data["items"]
    assert len(items) == 4

    # Kiểm tra thứ tự thời gian tăng dần
    dates = [it["date"] for it in items]
    assert dates == sorted(dates)

    # Dòng 1: Nhập 100 -> Tồn 100
    assert items[0]["transactionType"] == "NHAP"
    assert items[0]["changeQuantity"] == 100.0
    assert items[0]["balanceAfter"] == 100.0

    # Dòng 2: Xuất 30 -> Tồn 70
    assert items[1]["transactionType"] == "XUAT"
    assert items[1]["changeQuantity"] == -30.0
    assert items[1]["balanceAfter"] == 70.0

    # Dòng 3: Chuyển xuất 20 -> Tồn 50
    assert items[2]["transactionType"] == "CHUYEN_XUAT"
    assert items[2]["changeQuantity"] == -20.0
    assert items[2]["balanceAfter"] == 50.0

    # Dòng 4: Kiểm kê thừa 5 -> Tồn 55
    assert items[3]["transactionType"] == "DIEU_CHINH"
    assert items[3]["changeQuantity"] == 5.0
    assert items[3]["balanceAfter"] == 55.0

    # Tồn cuối kỳ
    assert data["closingBalance"] == 55.0


def test_ac3_document_hyperlink_and_codes(client: TestClient, db):
    """AC 3: Mỗi dòng giao dịch có mã chứng từ gốc (document_code) và link (document_url)."""
    prod = Product(sku=f"SKU-LINK-{datetime.now().timestamp()}", name="Cà phê lon đậm đặc", base_unit="Lon", status="ACTIVE")
    wh = db.query(Warehouse).first()
    db.add(prod)
    db.commit()
    db.refresh(prod)

    receipt = WarehouseReceipt(warehouse_id=wh.id, receipt_date=datetime.now())
    db.add(receipt)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=receipt.id, product_id=prod.id, quantity=40.0))
    db.commit()

    res = client.get(f"/api/inventory-cards/{prod.id}")
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert len(items) >= 1

    rec = items[0]
    assert rec["documentId"] == receipt.id
    assert rec["documentCode"] == f"PN-{receipt.id:05d}"
    assert "/warehouse/receiving" in rec["documentUrl"]
    assert str(receipt.id) in rec["documentUrl"]


def test_ac4_filter_by_warehouse(client: TestClient, db):
    """AC 4: Bộ lọc theo Kho hàng chỉ tính và trả về phát sinh của kho được chọn."""
    wh1 = Warehouse(code=f"WH1-{datetime.now().timestamp()}", name="Kho 1", is_active=True)
    wh2 = Warehouse(code=f"WH2-{datetime.now().timestamp()}", name="Kho 2", is_active=True)
    prod = Product(sku=f"SKU-WH-{datetime.now().timestamp()}", name="Trà sữa Oolong", base_unit="Chai", status="ACTIVE")
    db.add_all([wh1, wh2, prod])
    db.commit()
    db.refresh(wh1)
    db.refresh(wh2)
    db.refresh(prod)

    # Nhập kho 1: 80
    r1 = WarehouseReceipt(warehouse_id=wh1.id, receipt_date=datetime(2026, 10, 1, 9, 0))
    db.add(r1)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=r1.id, product_id=prod.id, quantity=80.0))

    # Nhập kho 2: 200
    r2 = WarehouseReceipt(warehouse_id=wh2.id, receipt_date=datetime(2026, 10, 2, 9, 0))
    db.add(r2)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=r2.id, product_id=prod.id, quantity=200.0))

    db.commit()

    # Lọc theo Kho 1
    res1 = client.get(f"/api/inventory-cards/{prod.id}?warehouse_id={wh1.id}")
    assert res1.status_code == 200
    data1 = res1.json()["data"]
    assert len(data1["items"]) == 1
    assert data1["items"][0]["changeQuantity"] == 80.0
    assert data1["closingBalance"] == 80.0

    # Lọc theo Kho 2
    res2 = client.get(f"/api/inventory-cards/{prod.id}?warehouse_id={wh2.id}")
    assert res2.status_code == 200
    data2 = res2.json()["data"]
    assert len(data2["items"]) == 1
    assert data2["items"][0]["changeQuantity"] == 200.0
    assert data2["closingBalance"] == 200.0


def test_ac4_filter_by_date_range_and_opening_balance(client: TestClient, db):
    """AC 4: Bộ lọc theo khoảng thời gian tính đúng số tồn đầu kỳ (opening_balance) và các phát sinh trong kỳ."""
    wh = db.query(Warehouse).first()
    prod = Product(sku=f"SKU-DATE-{datetime.now().timestamp()}", name="Bánh quy bơ Pháp", base_unit="Hộp", status="ACTIVE")
    db.add(prod)
    db.commit()
    db.refresh(prod)

    # 1. Phát sinh trước kỳ (tháng 9):
    # 2026-09-10: Nhập 60
    r_prev = WarehouseReceipt(warehouse_id=wh.id, receipt_date=datetime(2026, 9, 10, 10, 0))
    db.add(r_prev)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=r_prev.id, product_id=prod.id, quantity=60.0))

    # 2026-09-20: Xuất 20 -> Tồn cuối tháng 9 = 40
    tx_prev = InventoryTransaction(
        product_id=prod.id,
        warehouse_id=wh.id,
        transaction_type="OUT",
        unit_name="Hộp",
        input_quantity=20.0,
        conversion_rate_snapshot=1.0,
        base_quantity=20.0,
        created_at=datetime(2026, 9, 20, 15, 0),
    )
    db.add(tx_prev)

    # 2. Phát sinh trong kỳ (tháng 10):
    # 2026-10-05: Nhập 50 -> Tồn 90
    r_curr = WarehouseReceipt(warehouse_id=wh.id, receipt_date=datetime(2026, 10, 5, 8, 30))
    db.add(r_curr)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=r_curr.id, product_id=prod.id, quantity=50.0))

    # 2026-10-18: Xuất 30 -> Tồn 60
    tx_curr = InventoryTransaction(
        product_id=prod.id,
        warehouse_id=wh.id,
        transaction_type="OUT",
        unit_name="Hộp",
        input_quantity=30.0,
        conversion_rate_snapshot=1.0,
        base_quantity=30.0,
        created_at=datetime(2026, 10, 18, 11, 0),
    )
    db.add(tx_curr)

    # 3. Phát sinh sau kỳ (tháng 11):
    # 2026-11-02: Nhập 10
    r_next = WarehouseReceipt(warehouse_id=wh.id, receipt_date=datetime(2026, 11, 2, 9, 0))
    db.add(r_next)
    db.flush()
    db.add(WarehouseReceiptItem(receipt_id=r_next.id, product_id=prod.id, quantity=10.0))

    db.commit()

    # Lọc từ ngày 2026-10-01 đến 2026-10-31
    res = client.get(
        f"/api/inventory-cards/{prod.id}?start_date=2026-10-01&end_date=2026-10-31&warehouse_id={wh.id}"
    )
    assert res.status_code == 200
    data = res.json()["data"]

    # Tồn đầu kỳ từ tháng 9 mang sang: 60 - 20 = 40.0
    assert data["openingBalance"] == 40.0

    # Chỉ có 2 phát sinh tháng 10 được trả về
    items = data["items"]
    assert len(items) == 2

    assert items[0]["changeQuantity"] == 50.0
    assert items[0]["balanceAfter"] == 90.0

    assert items[1]["changeQuantity"] == -30.0
    assert items[1]["balanceAfter"] == 60.0

    # Tổng kết trong kỳ
    assert data["totalIn"] == 50.0
    assert data["totalOut"] == 30.0
    assert data["closingBalance"] == 70.0  # Tồn cuối tích lũy tổng


def test_compatibility_with_custom_detail_tables(client: TestClient, db):
    """Tương thích với các bảng ImportDetails, ExportDetails, TransferDetails, AdjustmentDetails."""
    wh = db.query(Warehouse).first()
    prod = Product(sku=f"SKU-CUSTOM-{datetime.now().timestamp()}", name="Sữa chua Hy Lạp", base_unit="Hộp", status="ACTIVE")
    db.add(prod)
    db.commit()
    db.refresh(prod)

    base_time = datetime(2026, 10, 10, 8, 0)

    # 1. ImportDetail
    imp = ImportDetail(
        product_id=prod.id,
        warehouse_id=wh.id,
        quantity=50.0,
        document_code="PN-CUSTOM-001",
        created_at=base_time,
    )
    # 2. ExportDetail
    exp = ExportDetail(
        product_id=prod.id,
        warehouse_id=wh.id,
        quantity=15.0,
        document_code="PX-CUSTOM-001",
        created_at=base_time + timedelta(hours=2),
    )
    # 3. AdjustmentDetail
    adj = AdjustmentDetail(
        product_id=prod.id,
        warehouse_id=wh.id,
        adjust_quantity=-5.0,
        document_code="PDC-CUSTOM-001",
        created_at=base_time + timedelta(hours=4),
    )
    # 4. InventoryLog
    log = InventoryLog(
        product_id=prod.id,
        warehouse_id=wh.id,
        transaction_type="DIEU_CHINH",
        change_quantity=2.0,
        document_code="LOG-001",
        created_at=base_time + timedelta(hours=6),
    )
    db.add_all([imp, exp, adj, log])
    db.commit()

    res = client.get(f"/api/inventory-cards/{prod.id}?warehouse_id={wh.id}")
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert len(items) == 4

    # 50 - 15 - 5 + 2 = 32
    assert items[0]["balanceAfter"] == 50.0
    assert items[1]["balanceAfter"] == 35.0
    assert items[2]["balanceAfter"] == 30.0
    assert items[3]["balanceAfter"] == 32.0
    assert res.json()["data"]["closingBalance"] == 32.0
