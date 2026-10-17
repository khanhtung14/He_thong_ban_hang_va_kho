import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.models import (
    Base,
    User,
    Customer,
    Role,
    RoleCode,
    AccountStatus,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    PriceList,
    PriceListItem,
    Warehouse,
    DeliveryAddress,
)
from app.api.v1.endpoints.customer_lock_routes import router as customer_lock_router
from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import get_db


@pytest.fixture
def reorder_app():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()

    # Seed roles
    cust_role = Role(code="CUSTOMER", name="Đại lý")
    session.add(cust_role)
    session.commit()

    # Seed users and customers
    user_owner = User(
        username="owner_dealer",
        email="owner@test.com",
        full_name="Đại Lý Chủ Sở Hữu",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[cust_role],
    )
    user_other = User(
        username="other_dealer",
        email="other@test.com",
        full_name="Đại Lý Khác",
        password_hash="fake",
        status=AccountStatus.ACTIVE,
        roles=[cust_role],
    )
    session.add_all([user_owner, user_other])
    session.commit()

    customer_owner = Customer(
        code="DL-OWNER",
        name="Đại Lý Chủ Sở Hữu",
        user_id=user_owner.id,
        is_active=True,
    )
    customer_other = Customer(
        code="DL-OTHER",
        name="Đại Lý Khác",
        user_id=user_other.id,
        is_active=True,
    )
    session.add_all([customer_owner, customer_other])
    session.commit()


    # Seed warehouse and delivery address
    warehouse = Warehouse(code="WH-MAIN", name="Kho Tổng Miền Bắc", is_active=True)
    session.add(warehouse)
    session.commit()

    delivery_addr = DeliveryAddress(
        customer_id=customer_owner.id,
        receiver_name="Kho Giao Nhận",
        phone="0912345678",
        address="123 Phố Huế, Hà Nội",
        is_default=True,
    )
    session.add(delivery_addr)
    session.commit()

    # Seed products: 1 active, 1 discontinued
    prod_active = Product(
        sku="CAFE-001",
        name="Cà phê hòa tan 3in1",
        base_unit="Hộp",
        status="ACTIVE",
    )
    prod_discontinued = Product(
        sku="TEA-002",
        name="Trà sữa matcha túi lọc (Ngừng sx)",
        base_unit="Gói",
        status="discontinued",
    )
    session.add_all([prod_active, prod_discontinued])
    session.commit()

    from datetime import date
    price_list = PriceList(
        code="PL-DEALER",
        version=1,
        customer_group="DEFAULT",
        start_date=date(2025, 1, 1),
        end_date=date(2030, 12, 31),
        published=True,
    )
    session.add(price_list)
    session.commit()

    price_item = PriceListItem(
        price_list_id=price_list.id,
        sku=prod_active.sku,
        product_id=prod_active.id,
        sale_price=85000.0,
        floor_price=70000.0,
    )
    session.add(price_item)
    session.commit()

    # Old order for customer_owner
    # Old price of prod_active was 70000.0
    old_order = Order(
        order_code="ORD-OLD-001",
        customer_id=customer_owner.id,
        total_amount=140000.0,
        status=OrderStatus.COMPLETED,
        delivery_address_id=delivery_addr.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(old_order)
    session.commit()

    item1 = OrderItem(
        order_id=old_order.id,
        product_id=prod_active.id,
        sku=prod_active.sku,
        product_name=prod_active.name,
        quantity=2,
        unit_price=70000.0,
    )
    item2 = OrderItem(
        order_id=old_order.id,
        product_id=prod_discontinued.id,
        sku=prod_discontinued.sku,
        product_name=prod_discontinued.name,
        quantity=3,
        unit_price=50000.0,
    )
    session.add_all([item1, item2])
    session.commit()

    # Create test app
    app = FastAPI()
    app.include_router(customer_lock_router)

    # Override get_db
    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    yield {
        "app": app,
        "session": session,
        "order_id": old_order.id,
        "user_owner": user_owner,
        "user_other": user_other,
    }

    session.close()


def test_reorder_successful_for_owner_with_discontinued_filtering(reorder_app):
    app = reorder_app["app"]
    order_id = reorder_app["order_id"]
    owner = reorder_app["user_owner"]

    owner_token = create_access_token({
        "sub": owner.username,
        "username": owner.username,
        "role": "CUSTOMER",
        "user_id": owner.id,
    })

    client = TestClient(app)
    response = client.get(
        f"/api/v1/portal/orders/{order_id}/reorder-items",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["success"] is True
    assert data["original_order_code"] == "ORD-OLD-001"
    assert data["default_delivery_point_id"] is not None

    # Check active items
    assert len(data["items"]) == 1
    active_item = data["items"][0]
    assert active_item["sku"] == "CAFE-001"
    assert active_item["quantity"] == 2
    assert active_item["old_price"] == 70000.0
    assert active_item["current_price"] == 85000.0
    assert active_item["price_changed"] is True
    assert active_item["subtotal"] == 170000.0

    # Check discontinued items
    assert len(data["removed_items"]) == 1
    removed = data["removed_items"][0]
    assert removed["sku"] == "TEA-002"
    assert "ngừng kinh doanh" in removed["reason"].lower()


def test_reorder_forbidden_for_other_dealer(reorder_app):
    app = reorder_app["app"]
    order_id = reorder_app["order_id"]
    other = reorder_app["user_other"]

    other_token = create_access_token({
        "sub": other.username,
        "username": other.username,
        "role": "CUSTOMER",
        "user_id": other.id,
    })

    client = TestClient(app)
    response = client.get(
        f"/api/v1/portal/orders/{order_id}/reorder-items",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 403
    assert "quyền" in response.json()["detail"].lower()
