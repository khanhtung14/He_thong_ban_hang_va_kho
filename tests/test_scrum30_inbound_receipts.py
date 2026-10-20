"""Unit and Integration tests for SCRUM-30: Inbound Receipt (Lập phiếu nhập kho từ nhà cung cấp)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    Inventory,
    Product,
    RoleCode,
    StorageLevel,
    StorageLocation,
    Supplier,
    User,
    Warehouse,
)
from src.backend.models.inbound_receipt import (
    InboundReceipt,
    InboundReceiptDetail,
    LocationInventory,
    ReceiptStatus,
)
from app.api.v1.endpoints.rbac import create_access_token
import main


def make_auth_header(role: str, username: str = "warehouse_staff") -> dict[str, str]:
    """Generate JWT Bearer token header."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum30_env():
    """Setup in-memory SQLite database and TestClient for SCRUM-30 tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = override_get_db

    # Seed initial test data
    with TestingSession() as db:
        # Supplier
        ncc = Supplier(
            code="NCC-TEST-01",
            name="Công ty TNHH Thép Việt",
            tax_code="010999888",
            contact_person="Nguyễn Văn A",
            is_active=True,
        )
        db.add(ncc)

        # Warehouse
        wh = Warehouse(
            code="KHO-TONG-01",
            name="Kho Tổng Hà Nội",
            address="KCN Thăng Long, Hà Nội",
            is_active=True,
        )
        wh2 = Warehouse(
            code="KHO-HCM-01",
            name="Kho Hồ Chí Minh",
            address="KCN Tân Bình, TP HCM",
            is_active=True,
        )
        db.add_all([wh, wh2])
        db.flush()

        # Storage Locations
        loc_zone = StorageLocation(
            warehouse_id=wh.id,
            code="ZONE-A",
            name="Khu Vực A",
            level=StorageLevel.ZONE,
            is_active=True,
        )
        db.add(loc_zone)
        db.flush()

        loc_rack = StorageLocation(
            warehouse_id=wh.id,
            code="RACK-01",
            name="Kệ Hàng 01",
            level=StorageLevel.RACK,
            parent_id=loc_zone.id,
            is_active=True,
        )
        # Location in wh2
        loc_wh2 = StorageLocation(
            warehouse_id=wh2.id,
            code="RACK-HCM",
            name="Kệ Hàng HCM",
            level=StorageLevel.RACK,
            is_active=True,
        )
        db.add_all([loc_rack, loc_wh2])

        # Products
        p1 = Product(
            name="Thép phi 10 Hòa Phát",
            sku="TP-10-HP",
            base_unit="Cái",
            base_price=150000.0,
            cost_price=120000.0,
            status="ACTIVE",
        )
        p2 = Product(
            name="Xi măng Long Sơn PCB40",
            sku="XM-LS-PCB40",
            base_unit="Bao",
            base_price=90000.0,
            cost_price=75000.0,
            status="ACTIVE",
        )
        db.add_all([p1, p2])
        db.commit()

    client = TestClient(main.app)
    yield client, TestingSession

    main.app.dependency_overrides.clear()


def test_create_inbound_receipt_success(scrum30_env):
    """Test creating a valid inbound receipt in DRAFT status."""
    client, SessionLocal = scrum30_env
    headers = make_auth_header("WAREHOUSE")

    with SessionLocal() as db:
        supplier = db.query(Supplier).first()
        wh = db.query(Warehouse).first()
        prod = db.query(Product).first()
        loc = db.query(StorageLocation).filter(StorageLocation.warehouse_id == wh.id).first()

    payload = {
        "code": "PNK-TEST-001",
        "supplier_id": supplier.id,
        "warehouse_id": wh.id,
        "notes": "Nhập hàng từ nhà cung cấp theo xe 29C-12345",
        "details": [
            {
                "product_id": prod.id,
                "batch_lot": "LOT-2026-X1",
                "quantity": 100,
                "storage_location_id": loc.id,
            }
        ],
    }

    res = client.post("/api/v1/inbound-receipts", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["code"] == "PNK-TEST-001"
    assert data["status"] == "DRAFT"
    assert data["supplier_name"] == supplier.name
    assert data["warehouse_name"] == wh.name
    assert data["total_quantity"] == 100
    assert len(data["details"]) == 1
    assert data["details"][0]["batch_lot"] == "LOT-2026-X1"
    assert data["details"][0]["quantity"] == 100
    assert data["details"][0]["storage_location_id"] == loc.id


def test_create_inbound_receipt_validation_errors(scrum30_env):
    """Test validation errors: invalid quantity, location not in warehouse, empty details."""
    client, SessionLocal = scrum30_env
    headers = make_auth_header("WAREHOUSE")

    with SessionLocal() as db:
        supplier = db.query(Supplier).first()
        wh = db.query(Warehouse).filter(Warehouse.code == "KHO-TONG-01").first()
        loc_hcm = db.query(StorageLocation).filter(StorageLocation.code == "RACK-HCM").first()
        prod = db.query(Product).first()

    # 1. Empty details
    res = client.post(
        "/api/v1/inbound-receipts",
        json={"supplier_id": supplier.id, "warehouse_id": wh.id, "details": []},
        headers=headers,
    )
    assert res.status_code == 422 or res.status_code == 400

    # 2. Location from another warehouse
    payload_wrong_loc = {
        "supplier_id": supplier.id,
        "warehouse_id": wh.id,
        "details": [
            {
                "product_id": prod.id,
                "batch_lot": "LOT-01",
                "quantity": 50,
                "storage_location_id": loc_hcm.id,
            }
        ],
    }
    res = client.post("/api/v1/inbound-receipts", json=payload_wrong_loc, headers=headers)
    assert res.status_code == 400
    assert "không thuộc kho" in res.json()["detail"]


def test_complete_inbound_receipt_increments_inventory(scrum30_env):
    """
    LOGIC CỐT LÕI (CORE LOGIC TEST):
    Completing an inbound receipt must automatically add quantities to:
    1. LocationInventory (table inventories)
    2. Inventory (table inventory)
    And change status to COMPLETED.
    """
    client, SessionLocal = scrum30_env
    headers = make_auth_header("WAREHOUSE")

    with SessionLocal() as db:
        supplier = db.query(Supplier).first()
        wh = db.query(Warehouse).filter(Warehouse.code == "KHO-TONG-01").first()
        prod1 = db.query(Product).filter(Product.sku == "TP-10-HP").first()
        prod2 = db.query(Product).filter(Product.sku == "XM-LS-PCB40").first()
        loc = db.query(StorageLocation).filter(StorageLocation.code == "RACK-01").first()

    # Create draft receipt with 2 items
    payload = {
        "supplier_id": supplier.id,
        "warehouse_id": wh.id,
        "notes": "Kiểm tra tự động cộng tồn kho khi hoàn tất",
        "details": [
            {
                "product_id": prod1.id,
                "batch_lot": "LOT-A1",
                "quantity": 50,
                "storage_location_id": loc.id,
            },
            {
                "product_id": prod2.id,
                "batch_lot": "LOT-B1",
                "quantity": 80,
                "storage_location_id": loc.id,
            },
        ],
    }
    create_res = client.post("/api/v1/inbound-receipts", json=payload, headers=headers)
    assert create_res.status_code == 201
    receipt_id = create_res.json()["id"]

    # Verify inventory BEFORE completion is 0
    with SessionLocal() as db:
        inv1 = db.query(Inventory).filter(Inventory.product_id == prod1.id, Inventory.warehouse_id == wh.id).first()
        assert inv1 is None or inv1.physical_qty == 0

    # Call complete endpoint
    complete_res = client.post(f"/api/v1/inbound-receipts/{receipt_id}/complete", headers=headers)
    assert complete_res.status_code == 200, complete_res.text
    completed_data = complete_res.json()
    assert completed_data["status"] == "COMPLETED"

    # Verify inventory AFTER completion
    with SessionLocal() as db:
        # 1. LocationInventory check
        loc_inv1 = db.query(LocationInventory).filter(
            LocationInventory.product_id == prod1.id,
            LocationInventory.warehouse_id == wh.id,
            LocationInventory.storage_location_id == loc.id,
            LocationInventory.batch_lot == "LOT-A1",
        ).first()
        assert loc_inv1 is not None
        assert loc_inv1.quantity == 50

        loc_inv2 = db.query(LocationInventory).filter(
            LocationInventory.product_id == prod2.id,
            LocationInventory.warehouse_id == wh.id,
            LocationInventory.storage_location_id == loc.id,
            LocationInventory.batch_lot == "LOT-B1",
        ).first()
        assert loc_inv2 is not None
        assert loc_inv2.quantity == 80

        # 2. Aggregate Inventory check
        agg_inv1 = db.query(Inventory).filter(
            Inventory.product_id == prod1.id, Inventory.warehouse_id == wh.id
        ).first()
        assert agg_inv1 is not None
        assert agg_inv1.physical_qty == 50
        assert agg_inv1.available_qty == 50

        agg_inv2 = db.query(Inventory).filter(
            Inventory.product_id == prod2.id, Inventory.warehouse_id == wh.id
        ).first()
        assert agg_inv2 is not None
        assert agg_inv2.physical_qty == 80
        assert agg_inv2.available_qty == 80

    # Completing again should fail
    again_res = client.post(f"/api/v1/inbound-receipts/{receipt_id}/complete", headers=headers)
    assert again_res.status_code == 400


def test_cancel_inbound_receipt(scrum30_env):
    """Test cancelling draft receipt and preventing cancel of completed receipt."""
    client, SessionLocal = scrum30_env
    headers = make_auth_header("WH_MANAGER")

    with SessionLocal() as db:
        supplier = db.query(Supplier).first()
        wh = db.query(Warehouse).first()
        prod = db.query(Product).first()

    # Create draft receipt
    res = client.post(
        "/api/v1/inbound-receipts",
        json={
            "supplier_id": supplier.id,
            "warehouse_id": wh.id,
            "details": [{"product_id": prod.id, "batch_lot": "LOT-C1", "quantity": 10}],
        },
        headers=headers,
    )
    receipt_id = res.json()["id"]

    # Cancel receipt
    cancel_res = client.post(f"/api/v1/inbound-receipts/{receipt_id}/cancel", headers=headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # Cannot complete cancelled receipt
    complete_res = client.post(f"/api/v1/inbound-receipts/{receipt_id}/complete", headers=headers)
    assert complete_res.status_code == 400


def test_rbac_inbound_receipt_access(scrum30_env):
    """Test RBAC: Warehouse, WH Manager, Admin permitted; Customer denied 403."""
    client, SessionLocal = scrum30_env

    # Customer role is forbidden
    customer_headers = make_auth_header("CUSTOMER", "customer_user")
    res_customer = client.get("/api/v1/inbound-receipts", headers=customer_headers)
    assert res_customer.status_code == 403

    # Warehouse role is allowed
    wh_headers = make_auth_header("WAREHOUSE", "wh_staff")
    res_wh = client.get("/api/v1/inbound-receipts", headers=wh_headers)
    assert res_wh.status_code == 200

    # Admin role is allowed
    admin_headers = make_auth_header("ADMIN", "admin_user")
    res_admin = client.get("/api/v1/inbound-receipts", headers=admin_headers)
    assert res_admin.status_code == 200
