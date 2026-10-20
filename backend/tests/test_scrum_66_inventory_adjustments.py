"""Tests for SCRUM-66: Phiếu điều chỉnh tồn kho có phê duyệt & Thẻ kho.

Test Coverage:
1. Tạo phiếu điều chỉnh hợp lệ (status PENDING, tồn kho KHÔNG thay đổi).
2. Kiểm tra xác thực đầu vào: bắt buộc lý do, kho hợp lệ, sản phẩm hợp lệ, số lượng khác 0.
3. Kiểm tra tính và lưu giá trị tổn thất (loss value) từ giá vốn snapshot.
4. Quyền lập phiếu: Warehouse, WH Manager, Admin được phép; Sales Rep, Customer bị 403 Forbidden.
5. Quyền phê duyệt/từ chối: Chỉ WH Manager hoặc Admin được duyệt; Warehouse bị 403 Forbidden.
6. QUY TẮC CỐT LÕI: Người lập KHÔNG ĐƯỢC tự duyệt phiếu của chính mình (kể cả khi người lập là WH Manager).
7. Duyệt phiếu thành công:
   - Cập nhật physical_qty và available_qty = physical_qty - reserved_qty.
   - Cập nhật tồn kho theo lô (InventoryLot).
   - Ghi nhận lịch sử giao dịch (InventoryTransaction) và Thẻ kho (GET /inventory/stock-cards).
   - Ghi nhận audit log (BusinessAuditLog).
8. Ngăn tồn kho âm và bảo vệ tồn đang giữ chỗ (reserved_qty): nếu sau điều chỉnh physical_qty < reserved_qty -> lỗi 400.
9. Từ chối phiếu (REJECTED): lưu lý do từ chối, tồn kho KHÔNG thay đổi.
10. Chống duyệt lặp / race condition: không thể duyệt phiếu đã được duyệt hoặc đã bị từ chối.
11. Phân trang, lọc theo kho, trạng thái, lý do và tra cứu chi tiết phiếu.
12. Tra cứu Thẻ kho: phiếu duyệt xuất hiện trên thẻ kho, phiếu chờ duyệt/từ chối không tính thành biến động ghi sổ.
"""
from __future__ import annotations

import sys
import concurrent.futures
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

backend_path = Path(__file__).resolve().parents[1]
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import (
    Base,
    BusinessAuditLog,
    Inventory,
    InventoryAdjustment,
    InventoryAdjustmentItem,
    InventoryLot,
    InventoryTransaction,
    Product,
    Role,
    RoleCode,
    User,
    Warehouse,
)
from app.api.v1.endpoints.rbac import create_access_token
from main import app


def make_auth_header(role: str, username: str, user_id: int) -> Dict[str, str]:
    token = create_access_token({
        "sub": str(user_id),
        "username": username,
        "user_id": user_id,
        "role": role,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def adjustment_env():
    """Setup isolated SQLite in-memory test database."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        # Create Warehouses
        wh1 = Warehouse(id=1, code="WH-HN", name="Kho Hà Nội", is_active=True)
        wh2 = Warehouse(id=2, code="WH-HCM", name="Kho TP.HCM", is_active=True)
        session.add_all([wh1, wh2])

        # Create Products
        p1 = Product(
            id=101,
            sku="BIA-HN-LON",
            name="Bia Hà Nội lon 330ml",
            base_price=240000.0,
            cost_price=180000.0,
            base_unit="Thùng",
            status="ACTIVE",
        )
        p2 = Product(
            id=102,
            sku="SUA-TH-HOP",
            name="Sữa tươi TH True Milk",
            base_price=320000.0,
            cost_price=250000.0,
            base_unit="Thùng",
            status="ACTIVE",
        )
        session.add_all([p1, p2])

        # Create Users
        # 1. Staff
        u_staff = User(id=1, username="staff_user", email="staff@test.com", password_hash="dummy_hash", full_name="Nhân Viên Kho A", is_active=True)
        # 2. Manager 1 (Creator)
        u_mgr1 = User(id=2, username="manager_one", email="mgr1@test.com", password_hash="dummy_hash", full_name="Quản Lý Kho 1", is_active=True)
        # 3. Manager 2 (Approver)
        u_mgr2 = User(id=3, username="manager_two", email="mgr2@test.com", password_hash="dummy_hash", full_name="Quản Lý Kho 2", is_active=True)
        # 4. Sales Rep
        u_sales = User(id=4, username="sales_rep", email="sales@test.com", password_hash="dummy_hash", full_name="Nhân Viên Kinh Doanh", is_active=True)
        session.add_all([u_staff, u_mgr1, u_mgr2, u_sales])

        # Create Initial Inventory
        # Product 101 in WH 1: physical = 100, reserved = 20, available = 80
        inv1 = Inventory(
            id=1,
            product_id=101,
            warehouse_id=1,
            physical_qty=100.0,
            reserved_qty=20.0,
            available_qty=80.0,
        )
        # Product 102 in WH 1: physical = 50, reserved = 0, available = 50
        inv2 = Inventory(
            id=2,
            product_id=102,
            warehouse_id=1,
            physical_qty=50.0,
            reserved_qty=0.0,
            available_qty=50.0,
        )
        session.add_all([inv1, inv2])

        # Create Lot for Product 101
        lot1 = InventoryLot(
            id=1,
            lot_number="LOT-202610-01",
            product_id=101,
            warehouse_id=1,
            quantity=60.0,
        )
        session.add(lot1)
        session.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    yield {
        "client": client,
        "session_factory": TestingSessionLocal,
    }

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_create_adjustment_valid_by_staff(adjustment_env):
    """Warehouse staff creates an adjustment slip for damaged goods."""
    client = adjustment_env["client"]
    headers = make_auth_header("Warehouse", "staff_user", 1)

    payload = {
        "warehouseId": 1,
        "reason": "DAMAGED",
        "note": "Lon bị móp méo khi bốc xếp",
        "items": [
            {
                "productId": 101,
                "lotNumber": "LOT-202610-01",
                "adjustQty": -5,
                "note": "Vỏ móp, xì nước",
            }
        ],
    }

    resp = client.post("/api/v1/inventory/adjustments", json=payload, headers=headers)
    assert resp.status_code == 201
    res_data = resp.json()
    assert res_data["success"] is True
    data = res_data["data"]
    assert data["status"] == "PENDING"
    assert data["reason"] == "DAMAGED"
    assert data["warehouseId"] == 1
    assert data["createdById"] == 1
    assert data["createdByName"] == "Nhân Viên Kho A"
    # Loss value auto-calculated: 5 * cost_price (180,000) = 900,000
    assert data["lossValue"] == 900000.0
    assert len(data["items"]) == 1
    assert data["items"][0]["adjustQty"] == -5.0
    assert data["items"][0]["systemQty"] == 100.0

    # Verify inventory is NOT changed yet!
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 100.0
        assert inv.available_qty == 80.0
        lot = db.query(InventoryLot).filter(InventoryLot.lot_number == "LOT-202610-01").first()
        assert lot.quantity == 60.0


def test_create_adjustment_validation_failures(adjustment_env):
    """Validation checks on creating adjustments."""
    client = adjustment_env["client"]
    headers = make_auth_header("Warehouse", "staff_user", 1)

    # 1. Missing reason
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "   ",
        "items": [{"productId": 101, "adjustQty": -2}],
    }, headers=headers)
    assert resp.status_code in {400, 422}

    # 2. Empty items
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [],
    }, headers=headers)
    assert resp.status_code in {400, 422}

    # 3. Non-existent warehouse
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 9999,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -2}],
    }, headers=headers)
    assert resp.status_code == 404

    # 4. Non-existent product
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 9999, "adjustQty": -2}],
    }, headers=headers)
    assert resp.status_code == 404

    # 5. Quantity exceeds physical stock
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -500}],
    }, headers=headers)
    assert resp.status_code == 400
    assert "vượt quá tồn kho thực tế" in resp.json()["detail"]

    # 6. Lot quantity exceeded
    resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "lotNumber": "LOT-202610-01", "adjustQty": -80}],
    }, headers=headers)
    assert resp.status_code == 400
    assert "không đủ" in resp.json()["detail"]


def test_unauthorized_roles_blocked_from_adjustments(adjustment_env):
    """Sales Rep and Customer must be forbidden from creating adjustments."""
    client = adjustment_env["client"]
    sales_headers = make_auth_header("Sales Rep", "sales_rep", 4)
    customer_headers = make_auth_header("Customer", "customer_user", 5)

    payload = {
        "warehouseId": 1,
        "reason": "LOST",
        "items": [{"productId": 101, "adjustQty": -1}],
    }

    resp = client.post("/api/v1/inventory/adjustments", json=payload, headers=sales_headers)
    assert resp.status_code == 403

    resp = client.post("/api/v1/inventory/adjustments", json=payload, headers=customer_headers)
    assert resp.status_code == 403


def test_warehouse_staff_cannot_approve_or_reject(adjustment_env):
    """Warehouse staff cannot approve or reject adjustments (403 Forbidden)."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)

    # First, manager 1 creates a slip
    mgr1_headers = make_auth_header("WH Manager", "manager_one", 2)
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "EXPIRED",
        "items": [{"productId": 101, "adjustQty": -2}],
    }, headers=mgr1_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Staff tries to approve -> 403
    approve_resp = client.post(f"/api/v1/inventory/adjustments/{slip_id}/approve", json={"note": "Staff approve"}, headers=staff_headers)
    assert approve_resp.status_code == 403

    # Staff tries to reject -> 403
    reject_resp = client.post(f"/api/v1/inventory/adjustments/{slip_id}/reject", json={"reason": "Staff reject"}, headers=staff_headers)
    assert reject_resp.status_code == 403


def test_creator_cannot_approve_own_slip(adjustment_env):
    """CRITICAL RULE: Creator cannot approve their own slip even if they are WH Manager."""
    client = adjustment_env["client"]
    mgr1_headers = make_auth_header("WH Manager", "manager_one", 2)

    # Manager 1 creates slip
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -3}],
    }, headers=mgr1_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Manager 1 tries to approve own slip -> 400 Bad Request
    approve_resp = client.post(f"/api/v1/inventory/adjustments/{slip_id}/approve", json={"note": "Self approve"}, headers=mgr1_headers)
    assert approve_resp.status_code == 400
    assert "không được phép tự phê duyệt" in approve_resp.json()["detail"]

    # Manager 1 tries to reject own slip -> 400 Bad Request
    reject_resp = client.post(f"/api/v1/inventory/adjustments/{slip_id}/reject", json={"reason": "Self reject"}, headers=mgr1_headers)
    assert reject_resp.status_code == 400
    assert "không được phép tự từ chối" in reject_resp.json()["detail"]


def test_different_wh_manager_can_approve(adjustment_env):
    """WH Manager 2 approves WH Manager 1's slip:
    - Stock reduces atomically.
    - available_qty = physical_qty - reserved_qty formula preserved.
    - Lot stock decreases.
    - Transaction recorded.
    """
    client = adjustment_env["client"]
    mgr1_headers = make_auth_header("WH Manager", "manager_one", 2)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [
            {
                "productId": 101,
                "lotNumber": "LOT-202610-01",
                "adjustQty": -10,
                "note": "Bị vỡ lon",
            }
        ],
    }, headers=mgr1_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Manager 2 approves
    approve_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={"note": "Đã kiểm tra thực tế hàng vỡ, đồng ý hủy."},
        headers=mgr2_headers,
    )
    assert approve_resp.status_code == 200
    data = approve_resp.json()["data"]
    assert data["status"] == "APPROVED"
    assert data["approvedById"] == 3
    assert data["approvedByName"] == "Quản Lý Kho 2"
    assert data["approvalNote"] == "Đã kiểm tra thực tế hàng vỡ, đồng ý hủy."

    # Verify inventory in database
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        # Initial: physical=100, reserved=20, available=80
        # Reduced by 10: physical=90, reserved=20, available=70
        assert inv.physical_qty == 90.0
        assert inv.reserved_qty == 20.0
        assert inv.available_qty == 70.0

        # Lot initial=60, reduced by 10 = 50
        lot = db.query(InventoryLot).filter(InventoryLot.lot_number == "LOT-202610-01").first()
        assert lot.quantity == 50.0

        # Verify InventoryTransaction
        tx = db.query(InventoryTransaction).filter(
            InventoryTransaction.document_type == "ADJUSTMENT",
            InventoryTransaction.document_id == slip_id,
        ).first()
        assert tx is not None
        assert tx.product_id == 101
        assert tx.warehouse_id == 1
        assert tx.transaction_type == "OUT"
        assert tx.input_quantity == 10.0
        assert tx.before_qty == 100.0
        assert tx.after_qty == 90.0

        # Verify Audit Log
        audit = db.query(BusinessAuditLog).filter(
            BusinessAuditLog.entity_id == str(slip_id),
            BusinessAuditLog.action == "approve_adjustment",
        ).first()
        assert audit is not None
        assert audit.actor_user_id == 3


def test_cannot_approve_if_stock_drops_below_reservation(adjustment_env):
    """If deduction would reduce physical_qty below reserved_qty, approval must be rejected."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Product 101: physical = 100, reserved = 20.
    # If we adjust by -85 -> physical would become 15, which is < reserved (20)!
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "EXPIRED",
        "items": [{"productId": 101, "adjustQty": -85}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Approver tries to approve -> 400
    approve_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={"note": "Approve large disposal"},
        headers=mgr2_headers,
    )
    assert approve_resp.status_code == 400
    assert "nhỏ hơn lượng đang giữ chỗ" in approve_resp.json()["detail"]

    # Verify inventory is untouched
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 100.0


def test_reject_adjustment(adjustment_env):
    """Rejecting an adjustment slip saves rejection reason and leaves inventory untouched."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "LOST",
        "items": [{"productId": 102, "adjustQty": -5}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Reject
    reject_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/reject",
        json={"reason": "Không tìm thấy dấu hiệu mất hàng, yêu cầu kiểm đếm lại"},
        headers=mgr2_headers,
    )
    assert reject_resp.status_code == 200
    data = reject_resp.json()["data"]
    assert data["status"] == "REJECTED"
    assert data["rejectReason"] == "Không tìm thấy dấu hiệu mất hàng, yêu cầu kiểm đếm lại"

    # Inventory remains 50
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 102, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 50.0


def test_cannot_approve_already_processed_slip(adjustment_env):
    """Double approval / approving rejected slip protection."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 102, "adjustQty": -2}],
    }, headers=staff_headers)
    slip_id = create_resp.json()["data"]["id"]

    # First approval -> 200
    app1 = client.post(f"/api/v1/inventory/adjustments/{slip_id}/approve", json={}, headers=mgr2_headers)
    assert app1.status_code == 200

    # Second approval -> 400
    app2 = client.post(f"/api/v1/inventory/adjustments/{slip_id}/approve", json={}, headers=mgr2_headers)
    assert app2.status_code == 400
    assert "đã được duyệt" in app2.json()["detail"]


def test_stock_cards_reflects_approved_adjustments(adjustment_env):
    """Stock cards report (GET /inventory/stock-cards) must show approved adjustments."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Create & approve adjustment for product 101
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -4, "note": "Hỏng vỡ lon"}],
    }, headers=staff_headers)
    slip_id = create_resp.json()["data"]["id"]
    slip_code = create_resp.json()["data"]["code"]

    client.post(f"/api/v1/inventory/adjustments/{slip_id}/approve", json={}, headers=mgr2_headers)

    # Query stock card
    card_resp = client.get(
        f"/api/v1/inventory/stock-cards?productId=101&warehouseId=1",
        headers=mgr2_headers,
    )
    assert card_resp.status_code == 200
    card_data = card_resp.json()["data"]
    assert len(card_data) >= 1

    entry = next((e for e in card_data if e["documentNo"] == slip_code), None)
    assert entry is not None
    assert entry["documentType"] == "Điều chỉnh tồn kho"
    assert entry["outQty"] == 4.0
    assert entry["productId"] == 101
    assert entry["warehouseId"] == 1


def test_list_and_filter_adjustments(adjustment_env):
    """Test filtering and pagination on GET /api/v1/inventory/adjustments."""
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Create 2 slips
    client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -1}],
    }, headers=staff_headers)

    client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "EXPIRED",
        "items": [{"productId": 102, "adjustQty": -1}],
    }, headers=staff_headers)

    # Filter by reason
    resp = client.get("/api/v1/inventory/adjustments?reason=DAMAGED", headers=mgr2_headers)
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert any(i["reason"] == "DAMAGED" for i in items)

    # Filter by status
    resp = client.get("/api/v1/inventory/adjustments?status=PENDING", headers=mgr2_headers)
    assert resp.status_code == 200
    assert all(i["status"] == "PENDING" for i in resp.json()["data"])


def test_admin_cannot_approve_or_reject_adjustment(adjustment_env):
    """Jira Rule: ONLY WH Manager can approve or reject.
    Admin without WH_MANAGER role is rejected with 403 Forbidden.
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    admin_headers = make_auth_header("Admin", "admin_user", 99)

    # Staff creates a slip
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -2}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Admin tries to approve -> 403 Forbidden
    app_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={"note": "Admin trying to approve"},
        headers=admin_headers,
    )
    assert app_resp.status_code == 403
    assert "Chỉ Quản lý kho" in app_resp.json()["detail"]

    # Admin tries to reject -> 403 Forbidden
    rej_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/reject",
        json={"reason": "Admin trying to reject"},
        headers=admin_headers,
    )
    assert rej_resp.status_code == 403
    assert "Chỉ Quản lý kho" in rej_resp.json()["detail"]


def test_concurrent_approvals_same_slip(adjustment_env):
    """Concurrency Test: Two concurrent threads attempt to approve the EXACT same slip.
    Exactly ONE request must succeed (HTTP 200).
    The other must be rejected (HTTP 400 - đã được duyệt).
    Inventory stock MUST only be deducted once!
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -5}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    results = []

    def try_approve():
        r = client.post(
            f"/api/v1/inventory/adjustments/{slip_id}/approve",
            json={"note": "Concurrent approval attempt"},
            headers=mgr2_headers,
        )
        return r.status_code, r.text

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(try_approve)
        f2 = executor.submit(try_approve)
        results = [f1.result(), f2.result()]

    status_codes = [r[0] for r in results]
    assert 200 in status_codes, f"One approve should succeed, got {status_codes}"
    assert 400 in status_codes, f"One approve should be rejected as already processed, got {status_codes}"

    # Verify inventory was deducted exactly ONCE: 100 - 5 = 95
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 95.0
        assert inv.available_qty == 75.0


def test_concurrent_competing_slips_for_stock(adjustment_env):
    """Concurrency Test: Two competing slips both demanding stock where only one can fit.
    Product 102 initially has physical_qty = 50, reserved = 0.
    Slip A demands -30. Slip B demands -30.
    Two threads call approve simultaneously.
    One must succeed (50 -> 20), the second must fail (20 < 30) with HTTP 400.
    Inventory must NEVER become negative!
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    resp_a = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "LOST",
        "items": [{"productId": 102, "adjustQty": -30}],
    }, headers=staff_headers)
    assert resp_a.status_code == 201
    slip_a_id = resp_a.json()["data"]["id"]

    resp_b = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "EXPIRED",
        "items": [{"productId": 102, "adjustQty": -30}],
    }, headers=staff_headers)
    assert resp_b.status_code == 201
    slip_b_id = resp_b.json()["data"]["id"]

    def approve_slip(slip_id):
        r = client.post(
            f"/api/v1/inventory/adjustments/{slip_id}/approve",
            json={"note": "Compete approval"},
            headers=mgr2_headers,
        )
        return r.status_code, r.text

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_a = executor.submit(approve_slip, slip_a_id)
        f_b = executor.submit(approve_slip, slip_b_id)
        results = [f_a.result(), f_b.result()]

    status_codes = [r[0] for r in results]
    assert 200 in status_codes
    assert 400 in status_codes

    # Verify inventory in DB: exactly 20.0 (50 - 30), never negative!
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 102, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 20.0
        assert inv.available_qty == 20.0


def test_lot_not_found_on_approval_fails_and_rolls_back(adjustment_env):
    """If a lot is specified but does not exist at approval time,
    approval must return 404 and roll back without deducting stock.
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Insert lot then create slip
    with adjustment_env["session_factory"]() as db:
        lot_temp = InventoryLot(
            lot_number="LOT-TEMP-DEL",
            product_id=101,
            warehouse_id=1,
            quantity=15.0,
        )
        db.add(lot_temp)
        db.commit()

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "lotNumber": "LOT-TEMP-DEL", "adjustQty": -5}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Now simulate lot deleted / removed before approval
    with adjustment_env["session_factory"]() as db:
        lot = db.query(InventoryLot).filter(InventoryLot.lot_number == "LOT-TEMP-DEL").first()
        db.delete(lot)
        db.commit()

    # Attempt to approve
    app_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={},
        headers=mgr2_headers,
    )
    assert app_resp.status_code == 404
    assert "Không tìm thấy lô hàng" in app_resp.json()["detail"]

    # Verify inventory is completely untouched!
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 100.0


def test_lot_insufficient_on_approval_fails_and_rolls_back(adjustment_env):
    """If lot quantity has dropped below required reduction quantity before approval,
    approval must return 400 and roll back without deducting inventory.
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Insert lot with quantity 5
    with adjustment_env["session_factory"]() as db:
        lot_temp = InventoryLot(
            lot_number="LOT-INSUF",
            product_id=101,
            warehouse_id=1,
            quantity=5.0,
        )
        db.add(lot_temp)
        db.commit()

    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "lotNumber": "LOT-INSUF", "adjustQty": -5}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # Another operation reduced lot quantity to 2
    with adjustment_env["session_factory"]() as db:
        lot = db.query(InventoryLot).filter(InventoryLot.lot_number == "LOT-INSUF").first()
        lot.quantity = 2.0
        db.commit()

    # Attempt to approve -> 400 Insufficient lot quantity
    app_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={},
        headers=mgr2_headers,
    )
    assert app_resp.status_code == 400
    assert "chỉ còn 2.0" in app_resp.json()["detail"]

    # Verify inventory physical_qty untouched
    with adjustment_env["session_factory"]() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        assert inv.physical_qty == 100.0


def test_multi_item_transaction_atomicity_on_partial_failure(adjustment_env):
    """Atomicity Test: Slip has two items.
    Item 1 has enough stock (Product 101, qty 5).
    Item 2 exceeds available stock (Product 102, qty 9999).
    Approval must fail and rollback: Item 1's stock must NOT be deducted partially!
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr2_headers = make_auth_header("WH Manager", "manager_two", 3)

    # Manually inject slip with 2 items bypassing create-time validation to simulate mid-approval failure
    with adjustment_env["session_factory"]() as db:
        adj = InventoryAdjustment(
            code="ADJ-TEST-ATOMIC",
            warehouse_id=1,
            reason="DAMAGED",
            status="PENDING",
            loss_value=1000000.0,
            created_by_id=1,
            created_at=datetime.now(timezone.utc),
        )
        db.add(adj)
        db.flush()

        item1 = InventoryAdjustmentItem(
            adjustment_id=adj.id,
            product_id=101,
            adjust_qty=-5.0,
            unit_cost_snapshot=180000.0,
            loss_value=900000.0,
        )
        item2 = InventoryAdjustmentItem(
            adjustment_id=adj.id,
            product_id=102,
            adjust_qty=-9999.0,  # Exceeds physical stock (50)
            unit_cost_snapshot=250000.0,
            loss_value=100000.0,
        )
        db.add_all([item1, item2])
        db.commit()
        slip_id = adj.id

    # Attempt to approve
    app_resp = client.post(
        f"/api/v1/inventory/adjustments/{slip_id}/approve",
        json={},
        headers=mgr2_headers,
    )
    assert app_resp.status_code == 400

    # Verify Product 101 was NOT deducted partially!
    with adjustment_env["session_factory"]() as db:
        inv101 = db.query(Inventory).filter(Inventory.product_id == 101, Inventory.warehouse_id == 1).first()
        inv102 = db.query(Inventory).filter(Inventory.product_id == 102, Inventory.warehouse_id == 1).first()
        assert inv101.physical_qty == 100.0  # NOT 95.0!
        assert inv102.physical_qty == 50.0

        # No transactions should be created
        txs = db.query(InventoryTransaction).filter(InventoryTransaction.document_id == slip_id).all()
        assert len(txs) == 0


def test_financial_visibility_masking(adjustment_env):
    """Financial Data Protection:
    - WH Manager & Warehouse roles can view lossValue, but unitCost is masked (None).
    - Sales Manager (with PERM_PRODUCTS_VIEW_FINANCIALS) can view unitCost.
    """
    client = adjustment_env["client"]
    staff_headers = make_auth_header("Warehouse", "staff_user", 1)
    mgr_headers = make_auth_header("WH Manager", "manager_two", 3)
    sales_mgr_headers = make_auth_header("Sales Manager", "sales_mgr", 10)

    # Create slip
    create_resp = client.post("/api/v1/inventory/adjustments", json={
        "warehouseId": 1,
        "reason": "DAMAGED",
        "items": [{"productId": 101, "adjustQty": -2}],
    }, headers=staff_headers)
    assert create_resp.status_code == 201
    slip_id = create_resp.json()["data"]["id"]

    # 1. WH Manager views detail
    mgr_resp = client.get(f"/api/v1/inventory/adjustments/{slip_id}", headers=mgr_headers)
    assert mgr_resp.status_code == 200
    mgr_data = mgr_resp.json()["data"]
    assert mgr_data["lossValue"] == 360000.0  # 2 * 180,000
    # unitCost MUST be None (masked) for WH Manager!
    assert mgr_data["items"][0]["unitCost"] is None

    # 2. Staff views detail
    staff_resp = client.get(f"/api/v1/inventory/adjustments/{slip_id}", headers=staff_headers)
    assert staff_resp.status_code == 200
    staff_data = staff_resp.json()["data"]
    assert staff_data["items"][0]["unitCost"] is None

    # 3. Sales Manager views detail
    sales_resp = client.get(f"/api/v1/inventory/adjustments/{slip_id}", headers=sales_mgr_headers)
    assert sales_resp.status_code == 200
    sales_data = sales_resp.json()["data"]
    assert sales_data["items"][0]["unitCost"] == 180000.0  # Visible to authorized role!
