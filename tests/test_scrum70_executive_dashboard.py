"""Unit and integration tests for User Story SCRUM-70 (Epic SCRUM-91).

"Là Quản lý kinh doanh, tôi muốn xem dashboard điều hành bán hàng và kho,
để nắm tình hình toàn công ty mỗi sáng trong hai phút."

Test coverage:
1. Endpoint API GET /api/v1/dashboard/executive & /dashboard/executive:
   - Thẻ chỉ số KPI (today_revenue, month_revenue, pending_approval_orders,
     pending_dispatch_orders, total_overdue_debt, low_stock_sku_count).
   - Biểu đồ xu hướng doanh số theo ngày (daily_revenue_trend).
   - Doanh số phân bổ theo khu vực (revenue_by_region) kèm tỷ trọng %.
   - Danh sách đại lý quá hạn công nợ (overdue_dealers) được sắp xếp giảm dần theo overdue_amount DESC.
2. Phân quyền (Data RBAC):
   - Sales Manager & Admin truy cập thành công (HTTP 200 OK).
   - Các vai trò khác (Sales Rep, Warehouse, WH Manager, Accountant, Customer) bị chặn (HTTP 403 Forbidden).
   - Chưa đăng nhập / thiếu token bị từ chối (HTTP 401 Unauthorized).
3. Hiệu năng & thời gian phản hồi:
   - Toàn bộ dữ liệu tổng hợp được tính toán nhanh chóng (dưới 2 giây).
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, Generator, List, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import get_db
from app.models.models import (
    Base,
    Customer,
    Inventory,
    Invoice,
    InvoicePayment,
    Order,
    OrderStatus,
    Product,
    RoleCode,
    Territory,
    Warehouse,
)
from backend.main import app


def make_auth_header(role: str, username: str = "test_user") -> Dict[str, str]:
    """Helper to generate JWT bearer header for RBAC testing."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_db_session() -> Generator[Session, None, None]:
    """Provide an isolated, clean SQLite in-memory database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(test_db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def seeded_dashboard_data(test_db_session: Session) -> Dict[str, Any]:
    """Seed comprehensive test dataset for reference date 2026-10-22."""
    ref_date = date(2026, 10, 22)

    # 1. Warehouses
    wh1 = Warehouse(code="WH-NORTH", name="Kho Tổng Miền Bắc", is_active=True)
    wh2 = Warehouse(code="WH-SOUTH", name="Kho Tổng Miền Nam", is_active=True)
    test_db_session.add_all([wh1, wh2])
    test_db_session.flush()

    # 2. Customers in different regions
    cust1 = Customer(
        code="DL-HN-01",
        name="Đại lý Thăng Long Hà Nội",
        phone="0911000001",
        region="Miền Bắc",
        credit_limit=100_000_000.0,
        current_debt=0.0,
        is_active=True,
    )
    cust2 = Customer(
        code="DL-SG-02",
        name="Đại lý Sài Gòn Petro",
        phone="0911000002",
        region="Miền Nam",
        credit_limit=150_000_000.0,
        current_debt=80_000_000.0,
        is_active=True,
    )
    cust3 = Customer(
        code="DL-DN-03",
        name="Đại lý Đà Nẵng Central",
        phone="0911000003",
        region="Miền Trung",
        credit_limit=50_000_000.0,
        current_debt=30_000_000.0,
        is_active=True,
    )
    test_db_session.add_all([cust1, cust2, cust3])
    test_db_session.flush()

    # 3. Products & Inventory for Low Stock SKU verification
    # P1: min_stock=100, available=30 -> LOW STOCK
    p1 = Product(sku="SKU-OIL-01", name="Dầu nhớt khoáng 4L", min_stock=100, base_unit="Can", status="ACTIVE")
    # P2: min_stock=50, available=0 (no inventory record) -> LOW STOCK
    p2 = Product(sku="SKU-OIL-02", name="Dầu nhớt tổng hợp 1L", min_stock=50, base_unit="Chai", status="ACTIVE")
    # P3: min_stock=50, physical=120, reserved=20 -> available=100 -> OK
    p3 = Product(sku="SKU-FLTR-01", name="Lọc dầu cao cấp", min_stock=50, base_unit="Cái", status="ACTIVE")
    # P4: min_stock=0, available=0 -> NOT LOW STOCK (no minimum defined)
    p4 = Product(sku="SKU-MISC-01", name="Phụ kiện linh tinh", min_stock=0, base_unit="Cái", status="ACTIVE")
    # P5: INACTIVE product with low stock -> Should NOT be counted
    p5 = Product(sku="SKU-DISC-01", name="Sản phẩm ngừng kinh doanh", min_stock=100, base_unit="Cái", status="INACTIVE")

    test_db_session.add_all([p1, p2, p3, p4, p5])
    test_db_session.flush()

    inv1 = Inventory(product_id=p1.id, warehouse_id=wh1.id, physical_qty=30.0, reserved_qty=0.0, available_qty=30.0)
    inv3 = Inventory(product_id=p3.id, warehouse_id=wh1.id, physical_qty=120.0, reserved_qty=20.0, available_qty=100.0)
    test_db_session.add_all([inv1, inv3])
    test_db_session.flush()

    # 4. Invoices for Overdue Debts
    # Cust 2 has an overdue invoice of 50,000,000 (due 2026-10-01, overdue by 21 days)
    inv_overdue_1 = Invoice(
        customer_id=cust2.id,
        invoice_date=datetime(2026, 9, 1, 10, 0, 0),
        payment_term_days=30,
        total_amount=50_000_000.0,
        status="UNPAID",
    )
    # Cust 3 has an invoice of 30,000,000 (due 2026-09-30), with partial payment 10,000,000 -> remaining overdue 20,000,000
    inv_overdue_2 = Invoice(
        customer_id=cust3.id,
        invoice_date=datetime(2026, 9, 15, 10, 0, 0),
        payment_term_days=15,
        total_amount=30_000_000.0,
        status="PARTIAL",
    )
    # Cust 1 has an invoice not yet due
    inv_normal = Invoice(
        customer_id=cust1.id,
        invoice_date=datetime(2026, 10, 20, 10, 0, 0),
        payment_term_days=30,
        total_amount=10_000_000.0,
        status="UNPAID",
    )
    test_db_session.add_all([inv_overdue_1, inv_overdue_2, inv_normal])
    test_db_session.flush()

    # Partial payment on inv_overdue_2
    pmt_part = InvoicePayment(
        invoice_id=inv_overdue_2.id,
        payment_id=999,
        amount_applied=10_000_000.0,
    )
    test_db_session.add(pmt_part)
    test_db_session.flush()

    # 5. Orders for Revenue and Status counts
    # Order 1: Today (2026-10-22), COMPLETED, Cust 1 (Miền Bắc), 15,000,000
    ord1 = Order(
        order_code="ORD-261022-001",
        customer_id=cust1.id,
        created_at=datetime(2026, 10, 22, 9, 30, 0),
        status=OrderStatus.COMPLETED,
        total_amount=15_000_000.0,
    )
    # Order 2: Today (2026-10-22), APPROVED, Cust 2 (Miền Nam), 10,000,000
    ord2 = Order(
        order_code="ORD-261022-002",
        customer_id=cust2.id,
        created_at=datetime(2026, 10, 22, 11, 0, 0),
        status=OrderStatus.APPROVED,
        total_amount=10_000_000.0,
    )
    # Order 3: Earlier this month (2026-10-10), PROCESSING, Cust 1 (Miền Bắc), 25,000,000
    ord3 = Order(
        order_code="ORD-261010-003",
        customer_id=cust1.id,
        created_at=datetime(2026, 10, 10, 14, 0, 0),
        status=OrderStatus.PROCESSING,
        total_amount=25_000_000.0,
    )
    # Order 4: Last month (2026-09-20), COMPLETED, Cust 1, 50,000,000 (Should not count in this month)
    ord4 = Order(
        order_code="ORD-260920-004",
        customer_id=cust1.id,
        created_at=datetime(2026, 9, 20, 15, 0, 0),
        status=OrderStatus.COMPLETED,
        total_amount=50_000_000.0,
    )
    # Order 5: Today, PENDING_APPROVAL, Cust 3, 8,000,000
    ord5 = Order(
        order_code="ORD-261022-005",
        customer_id=cust3.id,
        created_at=datetime(2026, 10, 22, 13, 0, 0),
        status=OrderStatus.PENDING_APPROVAL,
        total_amount=8_000_000.0,
    )
    # Order 6: Today, PENDING, Cust 3, 5,000,000
    ord6 = Order(
        order_code="ORD-261022-006",
        customer_id=cust3.id,
        created_at=datetime(2026, 10, 22, 14, 0, 0),
        status=OrderStatus.PENDING,
        total_amount=5_000_000.0,
    )
    # Order 7: Today, CANCELLED, Cust 1, 10,000,000 (Cancelled does not count in revenue)
    ord7 = Order(
        order_code="ORD-261022-007",
        customer_id=cust1.id,
        created_at=datetime(2026, 10, 22, 15, 0, 0),
        status=OrderStatus.CANCELLED,
        total_amount=10_000_000.0,
    )

    test_db_session.add_all([ord1, ord2, ord3, ord4, ord5, ord6, ord7])
    test_db_session.commit()

    return {
        "ref_date": "2026-10-22",
        "expected_today_revenue": 25_000_000.0,  # ord1 (15M) + ord2 (10M)
        "expected_month_revenue": 50_000_000.0,  # ord1 (15M) + ord2 (10M) + ord3 (25M)
        "expected_pending_approval": 2,           # ord5 (PENDING_APPROVAL) + ord6 (PENDING)
        "expected_pending_dispatch": 2,           # ord2 (APPROVED) + ord3 (PROCESSING)
        "expected_low_stock_sku_count": 2,        # p1 (30 < 100) + p2 (0 < 50)
        "expected_total_overdue": 70_000_000.0,   # cust2 (50M) + cust3 (20M)
        "expected_top_dealers": [
            {"code": "DL-SG-02", "overdue_amount": 50_000_000.0},
            {"code": "DL-DN-03", "overdue_amount": 20_000_000.0},
        ],
    }


def test_executive_dashboard_kpi_cards(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify accuracy of all KPI cards on the executive dashboard."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    resp = client.get(f"/api/v1/dashboard/executive?as_of_date={ref_date}", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]

    # Verify nested and flat KPI access
    kpi = data["kpi_cards"]
    assert kpi["today_revenue"] == seeded_dashboard_data["expected_today_revenue"]
    assert kpi["month_revenue"] == seeded_dashboard_data["expected_month_revenue"]
    assert kpi["pending_approval_orders"] == seeded_dashboard_data["expected_pending_approval"]
    assert kpi["pending_dispatch_orders"] == seeded_dashboard_data["expected_pending_dispatch"]
    assert kpi["low_stock_sku_count"] == seeded_dashboard_data["expected_low_stock_sku_count"]
    assert kpi["total_overdue_debt"] == seeded_dashboard_data["expected_total_overdue"]

    # Flat aliases check
    assert data["today_revenue"] == kpi["today_revenue"]
    assert data["month_revenue"] == kpi["month_revenue"]
    assert data["pending_approval_orders"] == kpi["pending_approval_orders"]
    assert data["pending_dispatch_orders"] == kpi["pending_dispatch_orders"]
    assert data["total_overdue_debt"] == kpi["total_overdue_debt"]
    assert data["low_stock_sku_count"] == kpi["low_stock_sku_count"]


def test_executive_dashboard_daily_revenue_trend(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify daily revenue trend structure and accuracy."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    resp = client.get(f"/api/v1/dashboard/executive?as_of_date={ref_date}", headers=headers)
    assert resp.status_code == 200
    trend = resp.json()["data"]["daily_revenue_trend"]

    # Must contain 22 days (from 2026-10-01 to 2026-10-22)
    assert len(trend) == 22

    # Check continuity and structure
    for i, item in enumerate(trend, 1):
        assert item["date"] == f"2026-10-{i:02d}"
        assert "revenue" in item
        assert "order_count" in item
        assert item["revenue"] >= 0.0
        assert item["order_count"] >= 0

    # Day 10 has ord3 (25M, 1 order)
    day_10 = next(d for d in trend if d["date"] == "2026-10-10")
    assert day_10["revenue"] == 25_000_000.0
    assert day_10["order_count"] == 1

    # Day 22 has ord1 + ord2 (15M + 10M = 25M, 2 orders)
    day_22 = next(d for d in trend if d["date"] == "2026-10-22")
    assert day_22["revenue"] == 25_000_000.0
    assert day_22["order_count"] == 2

    # Other days have 0 revenue and 0 orders
    day_1 = next(d for d in trend if d["date"] == "2026-10-01")
    assert day_1["revenue"] == 0.0
    assert day_1["order_count"] == 0


def test_executive_dashboard_revenue_by_region(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify regional revenue distribution and percentage breakdown."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    resp = client.get(f"/api/v1/dashboard/executive?as_of_date={ref_date}", headers=headers)
    assert resp.status_code == 200
    regions = resp.json()["data"]["revenue_by_region"]

    assert len(regions) == 2
    # Miền Bắc: 40M (15M ord1 + 25M ord3) -> 80%
    # Miền Nam: 10M (ord2) -> 20%
    reg_map = {r["region"]: r for r in regions}
    assert "Miền Bắc" in reg_map
    assert "Miền Nam" in reg_map

    assert reg_map["Miền Bắc"]["revenue"] == 40_000_000.0
    assert reg_map["Miền Bắc"]["percentage"] == 80.0

    assert reg_map["Miền Nam"]["revenue"] == 10_000_000.0
    assert reg_map["Miền Nam"]["percentage"] == 20.0

    # List must be sorted descending by revenue
    assert regions[0]["region"] == "Miền Bắc"
    assert regions[1]["region"] == "Miền Nam"


def test_executive_dashboard_top_overdue_dealers_sorted(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify overdue dealers are accurately listed and strictly sorted by overdue_amount DESC."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    resp = client.get(f"/api/v1/dashboard/executive?as_of_date={ref_date}", headers=headers)
    assert resp.status_code == 200
    dealers = resp.json()["data"]["overdue_dealers"]

    assert len(dealers) == 2

    # Sorted strictly descending
    assert dealers[0]["overdue_amount"] >= dealers[1]["overdue_amount"]

    # Dealer 1: DL-SG-02 with 50M overdue
    assert dealers[0]["code"] == "DL-SG-02"
    assert dealers[0]["overdue_amount"] == 50_000_000.0
    assert dealers[0]["overdue_days"] >= 21
    assert dealers[0]["region"] == "Miền Nam"

    # Dealer 2: DL-DN-03 with 20M overdue
    assert dealers[1]["code"] == "DL-DN-03"
    assert dealers[1]["overdue_amount"] == 20_000_000.0
    assert dealers[1]["overdue_days"] >= 22
    assert dealers[1]["region"] == "Miền Trung"

    # Total overdue debt must match sum of overdue amounts
    total_overdue = resp.json()["data"]["kpi_cards"]["total_overdue_debt"]
    assert total_overdue == sum(d["overdue_amount"] for d in dealers)


def test_executive_dashboard_compat_endpoint(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify backward compatibility route /dashboard/executive."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    resp = client.get(f"/dashboard/executive?as_of_date={ref_date}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["kpi_cards"]["today_revenue"] == seeded_dashboard_data["expected_today_revenue"]


def test_executive_dashboard_rbac_permitted_roles(client: TestClient):
    """Verify that both Sales Manager and Admin have full access (HTTP 200 OK)."""
    # 1. Sales Manager
    mgr_headers = make_auth_header("Sales Manager", "sales_manager_user")
    resp_mgr = client.get("/api/v1/dashboard/executive", headers=mgr_headers)
    assert resp_mgr.status_code == 200, resp_mgr.text

    # 2. Admin
    admin_headers = make_auth_header("Admin", "admin_user")
    resp_admin = client.get("/api/v1/dashboard/executive", headers=admin_headers)
    assert resp_admin.status_code == 200, resp_admin.text


@pytest.mark.parametrize(
    "forbidden_role",
    [
        "Sales Rep",
        "Warehouse",
        "WH Manager",
        "Accountant",
        "Customer",
    ],
)
def test_executive_dashboard_rbac_forbidden_roles(client: TestClient, forbidden_role: str):
    """Verify that non-executive roles are denied access with HTTP 403 Forbidden."""
    headers = make_auth_header(forbidden_role, f"user_{forbidden_role.lower().replace(' ', '_')}")
    resp = client.get("/api/v1/dashboard/executive", headers=headers)
    assert resp.status_code == 403, f"Role '{forbidden_role}' should be forbidden with 403 but got {resp.status_code}"
    error_detail = resp.json().get("detail", "")
    assert "từ chối" in error_detail or "Forbidden" in error_detail or "không được phép" in error_detail


def test_executive_dashboard_unauthenticated(client: TestClient):
    """Verify unauthenticated requests receive HTTP 401 Unauthorized."""
    # No auth header
    resp = client.get("/api/v1/dashboard/executive")
    assert resp.status_code == 401

    # Invalid token
    resp_invalid = client.get(
        "/api/v1/dashboard/executive",
        headers={"Authorization": "Bearer invalid.fake.token"},
    )
    assert resp_invalid.status_code == 401


def test_executive_dashboard_performance(client: TestClient, seeded_dashboard_data: Dict[str, Any]):
    """Verify that the dashboard endpoint responds well under the 2-second limit."""
    headers = make_auth_header("Sales Manager", "manager_test")
    ref_date = seeded_dashboard_data["ref_date"]

    start = time.perf_counter()
    resp = client.get(f"/api/v1/dashboard/executive?as_of_date={ref_date}", headers=headers)
    elapsed = time.perf_counter() - start

    assert resp.status_code == 200
    assert elapsed < 2.0, f"Dashboard response time {elapsed:.3f}s exceeded 2.0s requirement."
