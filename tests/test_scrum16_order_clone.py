from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_BACKEND = _ROOT / "backend"
for _p in (str(_ROOT), str(_BACKEND)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

try:
    from app.core.database import get_db
    try:
        from backend.main import app
    except ImportError:
        from src.backend.main import app
    from app.models.models import (
        AccountStatus,
        Base,
        Customer,
        DeliveryAddress,
        DiscountPolicy,
        DiscountTier,
        Order,
        OrderItem,
        OrderStatus,
        PriceList,
        PriceListItem,
        Product,
        Role,
        Territory,
        User,
        Warehouse,
    )
    from app.api.v1.endpoints.rbac import create_access_token
except ImportError:
    from src.backend.database import get_db
    from src.backend.main import app
    from src.backend.models import (
        AccountStatus,
        Base,
        Customer,
        DeliveryAddress,
        DiscountPolicy,
        DiscountTier,
        Order,
        OrderItem,
        OrderStatus,
        PriceList,
        PriceListItem,
        Product,
        Role,
        Territory,
        User,
        Warehouse,
    )
    from src.backend.rbac import create_access_token


@pytest.fixture
def clone_env():
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
        # Roles
        sales_role = Role(code="SALES_REP", name="Nhân viên kinh doanh")
        manager_role = Role(code="SALES_MANAGER", name="Quản lý kinh doanh")
        cust_role = Role(code="CUSTOMER", name="Đại lý")
        admin_role = Role(code="ADMIN", name="Quản trị hệ thống")
        db.add_all([sales_role, manager_role, cust_role, admin_role])
        db.flush()

        # Users
        sales_user = User(
            username="sales_assigned",
            email="sales1@example.com",
            full_name="Nguyễn Văn Kinh Doanh",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[sales_role],
        )
        other_sales = User(
            username="sales_other",
            email="sales2@example.com",
            full_name="Trần Văn Khác",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[sales_role],
        )
        manager_user = User(
            username="sales_mgr",
            email="manager@example.com",
            full_name="Trưởng Phòng KD",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[manager_role],
        )
        cust_user = User(
            username="dealer_owner",
            email="dealer@example.com",
            full_name="Đại Lý Phố Huế",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[cust_role],
        )
        other_cust_user = User(
            username="other_dealer",
            email="otherdealer@example.com",
            full_name="Đại Lý Cầu Giấy",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[cust_role],
        )
        admin_user = User(
            username="admin_user",
            email="admin@example.com",
            full_name="Admin Hệ Thống",
            password_hash="pwd",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[admin_role],
        )
        territory = Territory(code="MB-HN", name="Hà Nội")
        warehouse = Warehouse(code="WH-HN", name="Kho Hà Nội", is_active=True)
        db.add_all([sales_user, other_sales, manager_user, cust_user, other_cust_user, admin_user, territory, warehouse])
        db.flush()

        sales_user.territories = [territory]

        # Customer 1: assigned to sales_user
        customer1 = Customer(
            code="DL-HUE-01",
            name="Đại Lý Phố Huế",
            customer_group="DEFAULT",
            sales_rep_id=sales_user.id,
            user_id=cust_user.id,
            territory_id=territory.id,
            warehouse_id=warehouse.id,
            is_active=True,
            is_locked=False,
        )
        # Customer 2: locked for debt
        customer_locked = Customer(
            code="DL-LOCKED-01",
            name="Đại Lý Bị Khóa",
            customer_group="DEFAULT",
            sales_rep_id=sales_user.id,
            warehouse_id=warehouse.id,
            is_active=True,
            is_locked=True,
            lock_reason="Nợ quá hạn 45 ngày chưa thanh toán",
        )
        db.add_all([customer1, customer_locked])
        db.flush()

        # Delivery Address
        addr1 = DeliveryAddress(
            customer_id=customer1.id,
            receiver_name="Kho Nhận Phố Huế",
            phone="0912345678",
            address="123 Phố Huế, Hà Nội",
            is_default=True,
        )
        db.add(addr1)
        db.flush()

        # Products
        prod1 = Product(
            sku="SKU-COFFEE-01",
            name="Cà phê Robusta Đậm Đà",
            base_unit="Hộp",
            base_price=50000.0,
            status="ACTIVE",
        )
        prod2 = Product(
            sku="SKU-TEA-01",
            name="Trà Xanh Thái Nguyên",
            base_unit="Gói",
            base_price=30000.0,
            status="ACTIVE",
        )
        db.add_all([prod1, prod2])
        db.flush()

        # Current Price List:
        # SKU-COFFEE-01 current price: 65,000 (old price was 50,000)
        # SKU-TEA-01 current price: 40,000 (old price was 30,000)
        price_list = PriceList(
            code="PL-2026-Q4",
            version=1,
            customer_group="DEFAULT",
            start_date=date(2025, 1, 1),
            end_date=date(2030, 12, 31),
            published=True,
        )
        db.add(price_list)
        db.flush()

        pli1 = PriceListItem(
            price_list_id=price_list.id,
            sku="SKU-COFFEE-01",
            product_id=prod1.id,
            sale_price=65000.0,
            floor_price=55000.0,
        )
        pli2 = PriceListItem(
            price_list_id=price_list.id,
            sku="SKU-TEA-01",
            product_id=prod2.id,
            sale_price=40000.0,
            floor_price=35000.0,
        )
        db.add_all([pli1, pli2])
        db.flush()

        # Discount Policy for SKU-COFFEE-01:
        # Tier: min_quantity=10 -> 10% discount
        policy = DiscountPolicy(
            code="CK-COFFEE-10",
            name="Chiết khấu cà phê sản lượng lớn",
            scope="SKU",
            target_type="SKU",
            target_id="SKU-COFFEE-01",
            discount_type="PERCENTAGE",
            is_active=True,
        )
        db.add(policy)
        db.flush()
        tier = DiscountTier(
            policy_id=policy.id,
            min_quantity=10,
            min_qty=10,
            discount_value=10.0,
            discount_percent=10.0,
        )
        db.add(tier)
        db.flush()

        # Source Order (Old Order) - COMPLETED
        old_order = Order(
            order_code="ORD-20260101-0001",
            customer_id=customer1.id,
            created_by_id=sales_user.id,
            warehouse_id=warehouse.id,
            delivery_address_id=addr1.id,
            desired_delivery_date=date(2026, 1, 5),
            status=OrderStatus.COMPLETED,
            subtotal_amount=130000.0,
            discount_amount=0.0,
            total_amount=130000.0,
            note="Đơn cũ tháng 1/2026",
        )
        db.add(old_order)
        db.flush()

        # Old order items with OLD prices and 0 discount:
        # Item 1: 2 hộp cà phê @ 50,000 = 100,000
        # Item 2: 1 gói trà @ 30,000 = 30,000
        item1 = OrderItem(
            order_id=old_order.id,
            product_id=prod1.id,
            sku="SKU-COFFEE-01",
            product_name="Cà phê Robusta Đậm Đà",
            quantity=2,
            unit_price=50000.0,  # Old price
            discount_percent=0.0,
            line_subtotal=100000.0,
            discount_amount=0.0,
            line_total=100000.0,
        )
        item2 = OrderItem(
            order_id=old_order.id,
            product_id=prod2.id,
            sku="SKU-TEA-01",
            product_name="Trà Xanh Thái Nguyên",
            quantity=1,
            unit_price=30000.0,  # Old price
            discount_percent=0.0,
            line_subtotal=30000.0,
            discount_amount=0.0,
            line_total=30000.0,
        )
        db.add_all([item1, item2])
        db.flush()

        # Order for locked customer
        order_locked_cust = Order(
            order_code="ORD-LOCKED-001",
            customer_id=customer_locked.id,
            created_by_id=sales_user.id,
            warehouse_id=warehouse.id,
            status=OrderStatus.COMPLETED,
            subtotal_amount=50000.0,
            total_amount=50000.0,
        )
        db.add(order_locked_cust)
        db.flush()
        item_locked = OrderItem(
            order_id=order_locked_cust.id,
            product_id=prod1.id,
            sku="SKU-COFFEE-01",
            product_name="Cà phê Robusta Đậm Đà",
            quantity=1,
            unit_price=50000.0,
            line_subtotal=50000.0,
            line_total=50000.0,
        )
        db.add(item_locked)
        db.commit()

        yield {
            "session_factory": session_factory,
            "sales_user": sales_user,
            "other_sales": other_sales,
            "manager_user": manager_user,
            "cust_user": cust_user,
            "other_cust_user": other_cust_user,
            "admin_user": admin_user,
            "customer1": customer1,
            "customer_locked": customer_locked,
            "old_order": old_order,
            "order_locked_cust": order_locked_cust,
            "prod1": prod1,
            "prod2": prod2,
        }

    app.dependency_overrides.clear()


def test_clone_order_success_for_sales_rep(clone_env):
    """
    SCRUM-16 (S4-09):
    1. Sao chép toàn bộ dòng hàng của đơn đã chọn.
    2. Giá và chiết khấu được áp lại theo bảng giá hiện hành (không kế thừa giá cũ).
    3. Bản sao luôn bắt đầu ở trạng thái Nháp (DRAFT).
    """
    sales_user = clone_env["sales_user"]
    old_order = clone_env["old_order"]

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    response = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 201
    data = response.json()

    # 1. Kiểm tra đơn mới được tạo
    assert data["id"] != old_order.id
    assert data["order_code"] != old_order.order_code
    assert data["customer_id"] == old_order.customer_id

    # 2. Tiêu chí: Bản sao luôn bắt đầu ở trạng thái Nháp (DRAFT)
    assert data["status"] == "DRAFT"

    # 3. Tiêu chí: Sao chép toàn bộ dòng hàng của đơn đã chọn (2 dòng)
    items = data["items"]
    assert len(items) == 2

    coffee_item = next(it for it in items if it["sku"] == "SKU-COFFEE-01")
    tea_item = next(it for it in items if it["sku"] == "SKU-TEA-01")

    # Số lượng giữ nguyên
    assert coffee_item["quantity"] == 2
    assert tea_item["quantity"] == 1

    # 4. Tiêu chí: Giá được áp lại theo BẢNG GIÁ HIỆN HÀNH (không kế thừa giá cũ)
    # Giá cũ của COFFEE là 50,000, giá hiện hành trong PriceList là 65,000
    assert coffee_item["unit_price"] == 65000.0
    # Giá cũ của TEA là 30,000, giá hiện hành trong PriceList là 40,000
    assert tea_item["unit_price"] == 40000.0

    # 5. Tổng giá trị được tính toán lại chính xác
    # Coffee: 2 * 65,000 = 130,000
    # Tea: 1 * 40,000 = 40,000
    # Tổng đơn: 170,000 (Đơn cũ trước đây chỉ là 130,000 do giá cũ thấp hơn)
    assert data["total_amount"] == 170000.0


def test_clone_order_applies_current_discount_policy(clone_env):
    """
    Kiểm tra chiết khấu được áp lại theo chính sách hiện hành (không kế thừa chiết khấu cũ).
    Tạo đơn cũ với số lượng 10 sản phẩm (giá cũ 50,000, không có chiết khấu).
    Khi sao chép, áp bảng giá mới (65,000) và áp chính sách chiết khấu 10% cho số lượng >= 10.
    """
    sales_user = clone_env["sales_user"]
    customer1 = clone_env["customer1"]
    prod1 = clone_env["prod1"]

    with clone_env["session_factory"]() as db:
        bulk_order = Order(
            order_code="ORD-BULK-001",
            customer_id=customer1.id,
            created_by_id=sales_user.id,
            status=OrderStatus.COMPLETED,
            total_amount=500000.0,
        )
        db.add(bulk_order)
        db.flush()
        db.add(OrderItem(
            order_id=bulk_order.id,
            product_id=prod1.id,
            sku="SKU-COFFEE-01",
            product_name="Cà phê Robusta Đậm Đà",
            quantity=10,
            unit_price=50000.0,
            discount_percent=0.0,
            line_subtotal=500000.0,
            discount_amount=0.0,
            line_total=500000.0,
        ))
        db.commit()
        bulk_order_id = bulk_order.id

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    response = client.post(
        f"/api/v1/orders/{bulk_order_id}/clone",
        headers={"Authorization": f"Bearer {token}"},
        json={"note": "Đơn định kỳ số lượng lớn cho khách quen"},
    )
    assert response.status_code == 201
    data = response.json()

    assert data["status"] == "DRAFT"
    item = data["items"][0]
    assert item["sku"] == "SKU-COFFEE-01"
    assert item["quantity"] == 10
    # Đơn giá hiện hành = 65,000
    assert item["unit_price"] == 65000.0
    # Chiết khấu 10% theo chính sách hiện hành cho số lượng 10
    assert item["discount_percent"] == 10.0
    assert item["discount_amount"] == 65000.0  # 650,000 * 10%
    assert item["line_total"] == 585000.0
    assert data["total_amount"] == 585000.0
    assert data["note"] == "Đơn định kỳ số lượng lớn cho khách quen"


def test_clone_order_blocked_when_customer_is_locked(clone_env):
    """
    SCRUM-85 / Quy tắc nghiệp vụ:
    Chặn tạo/sao chép đơn hàng mới khi đại lý đang bị khóa giao dịch (is_locked == True).
    """
    sales_user = clone_env["sales_user"]
    order_locked_cust = clone_env["order_locked_cust"]

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    response = client.post(
        f"/api/v1/orders/{order_locked_cust.id}/clone",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    data = response.json()
    assert "khóa giao dịch" in data["detail"].lower()
    assert "nợ quá hạn 45 ngày" in data["detail"].lower()


def test_clone_order_forbidden_for_unassigned_sales_rep(clone_env):
    """
    Nhân viên kinh doanh không phụ trách đại lý và không tạo đơn đó sẽ bị từ chối quyền (403 Forbidden).
    """
    other_sales = clone_env["other_sales"]
    old_order = clone_env["old_order"]

    token = create_access_token({
        "sub": other_sales.username,
        "username": other_sales.username,
        "role": "SALES_REP",
        "user_id": other_sales.id,
    })

    client = TestClient(app)
    response = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "quyền" in response.json()["detail"].lower()


def test_clone_order_allowed_for_sales_manager_and_admin(clone_env):
    """
    Quản lý kinh doanh (Sales Manager) và Admin có toàn quyền sao chép đơn hàng.
    """
    manager = clone_env["manager_user"]
    admin = clone_env["admin_user"]
    old_order = clone_env["old_order"]

    client = TestClient(app)

    # Manager clone
    mgr_token = create_access_token({
        "sub": manager.username,
        "username": manager.username,
        "role": "SALES_MANAGER",
        "user_id": manager.id,
    })
    res_mgr = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert res_mgr.status_code == 201
    assert res_mgr.json()["status"] == "DRAFT"

    # Admin clone
    admin_token = create_access_token({
        "sub": admin.username,
        "username": admin.username,
        "role": "ADMIN",
        "user_id": admin.id,
    })
    res_admin = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_admin.status_code == 201
    assert res_admin.json()["status"] == "DRAFT"


def test_clone_order_for_customer(clone_env):
    """
    Đại lý (Customer) tự sao chép đơn của chính mình -> Cho phép (S5-02).
    Đại lý sao chép đơn của đại lý khác -> 403 Forbidden.
    """
    cust_owner = clone_env["cust_user"]
    other_cust = clone_env["other_cust_user"]
    old_order = clone_env["old_order"]

    client = TestClient(app)

    # Owner customer clone -> Thành công
    token_owner = create_access_token({
        "sub": cust_owner.username,
        "username": cust_owner.username,
        "role": "CUSTOMER",
        "user_id": cust_owner.id,
    })
    res = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token_owner}"},
    )
    assert res.status_code == 201
    assert res.json()["status"] == "DRAFT"

    # Other customer clone -> 403 Forbidden
    token_other = create_access_token({
        "sub": other_cust.username,
        "username": other_cust.username,
        "role": "CUSTOMER",
        "user_id": other_cust.id,
    })
    res_err = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res_err.status_code == 403


def test_clone_order_not_found(clone_env):
    """Kiểm tra khi order_id không tồn tại -> 404 Not Found."""
    sales_user = clone_env["sales_user"]
    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    res = client.post(
        "/api/v1/orders/999999/clone",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 404
    assert "không tìm thấy" in res.json()["detail"].lower()


def test_clone_order_empty_items(clone_env):
    """Kiểm tra khi đơn hàng gốc không có dòng hàng nào -> 400 Bad Request."""
    sales_user = clone_env["sales_user"]
    customer1 = clone_env["customer1"]

    with clone_env["session_factory"]() as db:
        empty_order = Order(
            order_code="ORD-EMPTY-001",
            customer_id=customer1.id,
            created_by_id=sales_user.id,
            status=OrderStatus.COMPLETED,
            total_amount=0.0,
        )
        db.add(empty_order)
        db.commit()
        empty_order_id = empty_order.id

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    res = client.post(
        f"/api/v1/orders/{empty_order_id}/clone",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
    assert "không có dòng sản phẩm nào" in res.json()["detail"].lower()


def test_clone_order_with_custom_payload(clone_env):
    """
    Kiểm tra sao chép đơn với payload tuỳ biến (delivery_address_id, desired_delivery_date, note).
    """
    sales_user = clone_env["sales_user"]
    customer1 = clone_env["customer1"]
    old_order = clone_env["old_order"]

    # Tạo địa chỉ giao hàng thứ 2 cho customer1
    with clone_env["session_factory"]() as db:
        addr2 = DeliveryAddress(
            customer_id=customer1.id,
            receiver_name="Chi nhánh Hai Bà Trưng",
            phone="0987654321",
            address="456 Bạch Mai, Hà Nội",
            is_default=False,
        )
        db.add(addr2)
        db.commit()
        addr2_id = addr2.id

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    payload = {
        "delivery_address_id": addr2_id,
        "desired_delivery_date": "2026-11-20",
        "note": "Giao vào buổi sáng trước 10h",
    }
    res = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "DRAFT"
    assert data["delivery_address_id"] == addr2_id
    assert data["desired_delivery_date"] == "2026-11-20"
    assert data["note"] == "Giao vào buổi sáng trước 10h"


def test_clone_order_invalid_delivery_address(clone_env):
    """
    Kiểm tra khi truyền delivery_address_id thuộc về đại lý khác -> 400 Bad Request.
    """
    sales_user = clone_env["sales_user"]
    old_order = clone_env["old_order"]
    other_cust_user = clone_env["other_cust_user"]

    with clone_env["session_factory"]() as db:
        other_customer = Customer(
            code="DL-OTHER-99",
            name="Đại Lý Khác",
            is_active=True,
            is_locked=False,
            user_id=other_cust_user.id,
        )
        db.add(other_customer)
        db.flush()
        other_addr = DeliveryAddress(
            customer_id=other_customer.id,
            receiver_name="Địa chỉ đại lý khác",
            phone="0999999999",
            address="999 Lạc Long Quân",
            is_default=True,
        )
        db.add(other_addr)
        db.commit()
        other_addr_id = other_addr.id

    token = create_access_token({
        "sub": sales_user.username,
        "username": sales_user.username,
        "role": "SALES_REP",
        "user_id": sales_user.id,
    })

    client = TestClient(app)
    res = client.post(
        f"/api/v1/orders/{old_order.id}/clone",
        headers={"Authorization": f"Bearer {token}"},
        json={"delivery_address_id": other_addr_id},
    )
    assert res.status_code == 400
    assert "không hợp lệ hoặc không thuộc đại lý" in res.json()["detail"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
