from __future__ import annotations

from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from backend.main import app
from app.models.models import (
    AccountStatus,
    Base,
    Customer,
    DeliveryAddress,
    Inventory,
    Order,
    OrderStatus,
    PriceList,
    PriceListItem,
    Product,
    Role,
    RoleCode,
    User,
    Warehouse,
)
from app.api.v1.endpoints.rbac import create_access_token


@pytest.fixture
def portal_ordering_env():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(autoflush=False, bind=engine, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    with session_factory() as db:
        customer_role = Role(code="CUSTOMER", name="Đại lý")
        customer_user = User(
            id=10,
            username="dealer_caugiay",
            email="caugiay@dealer.test",
            full_name="Đại lý Cầu Giấy",
            password_hash="unused",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[customer_role],
        )
        wh = Warehouse(id=1, code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
        customer = Customer(
            id=1,
            code="dealer_caugiay",
            name="Đại lý Cầu Giấy",
            user_id=10,
            customer_group="LEVEL_1",
            credit_limit=100_000_000.0,
            current_debt=30_000_000.0,
            is_active=True,
            is_locked=False,
            warehouse_id=1,
        )
        deliv = DeliveryAddress(
            id=1,
            customer_id=1,
            receiver_name="Anh Tuấn Kho 1",
            phone="0912345678",
            address="123 Cầu Giấy, Hà Nội",
            is_default=True,
        )
        # 2 sản phẩm: 1 có trong bảng giá LEVEL_1, 1 không có
        prod1 = Product(
            id=101,
            sku="BIA-HN-LON",
            name="Bia Hà Nội Lon 330ml",
            base_price=300000.0,
            base_unit="Thùng",
            status="ACTIVE",
        )
        prod2 = Product(
            id=102,
            sku="NUOC-KHOANG",
            name="Nước khoáng Lavie 500ml",
            base_price=100000.0,
            base_unit="Thùng",
            status="ACTIVE",
        )
        inv1 = Inventory(
            product_id=101,
            warehouse_id=1,
            physical_qty=500.0,
            reserved_qty=0.0,
            available_qty=500.0,
        )
        # Bảng giá cho LEVEL_1: prod1 có giá ưu đãi 280,000 (thay vì 300,000)
        pl = PriceList(
            id=1,
            code="PL-LEVEL1-2026",
            version=1,
            customer_group="LEVEL_1",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            published=True,
        )
        pl_item = PriceListItem(
            price_list_id=1,
            sku="BIA-HN-LON",
            product_id=101,
            sale_price=280000.0,
            floor_price=260000.0,
        )

        db.add_all([customer_role, customer_user, wh, customer, deliv, prod1, prod2, inv1, pl, pl_item])
        db.commit()

    client = TestClient(app)
    token = create_access_token({"sub": "dealer_caugiay", "role": "CUSTOMER"})
    yield client, token

    app.dependency_overrides.clear()


def test_portal_customer_profile(portal_ordering_env):
    client, token = portal_ordering_env
    res = client.get("/api/v1/portal/customer", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    cust = data["customer"]
    assert cust["code"] == "dealer_caugiay"
    assert cust["customer_group"] == "LEVEL_1"
    assert cust["credit_limit"] == 100_000_000.0
    assert cust["current_debt"] == 30_000_000.0
    assert cust["available_credit"] == 70_000_000.0
    assert len(cust["delivery_addresses"]) == 1
    assert cust["delivery_addresses"][0]["receiver_name"] == "Anh Tuấn Kho 1"


def test_products_list_for_customer_group(portal_ordering_env):
    client, token = portal_ordering_env
    res = client.get("/api/v1/products", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    items = res.json()
    # Chỉ sản phẩm có trong bảng giá LEVEL_1 được hiển thị
    assert len(items) == 1
    item = items[0]
    assert item["sku"] == "BIA-HN-LON"
    # Đơn giá hiển thị đúng giá đại lý Cấp 1 (280,000 thay vì giá niêm yết 300,000)
    assert item["sale_price"] == 280000.0


def test_simulate_order_for_customer(portal_ordering_env):
    client, token = portal_ordering_env
    payload = {
        "customer_id": 1,
        "warehouse_id": 1,
        "items": [
            {"product_id": 101, "sku": "BIA-HN-LON", "quantity": 10, "unit_price": 280000.0}
        ],
    }
    res = client.post("/api/v1/orders/simulate", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["subTotal"] == 2_800_000.0
    assert data["currentDebt"] == 30_000_000.0
    assert data["creditLimit"] == 100_000_000.0
    assert data["debtAfterOrder"] == 32_800_000.0
    assert data["isCreditLimitExceeded"] is False


def test_customer_order_creates_as_pending_approval(portal_ordering_env):
    client, token = portal_ordering_env
    payload = {
        "customer_id": 1,
        "delivery_address_id": 1,
        "warehouse_id": 1,
        "desired_delivery_date": "2026-10-25",
        "note": "Giao nửa đêm trước 6h sáng",
        "items": [
            {"product_id": 101, "sku": "BIA-HN-LON", "quantity": 5, "unit_price": 280000.0}
        ],
    }
    res = client.post("/api/v1/orders", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    order = res.json()
    # Yêu cầu: Đơn gửi lên luôn ở trạng thái Chờ duyệt (PENDING_APPROVAL)
    assert order["status"] == "PENDING_APPROVAL"
    assert order["customer_id"] == 1
    assert len(order["items"]) == 1
