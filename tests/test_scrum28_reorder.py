"""Unit & Integration Tests for SCRUM-28: Đặt lại đơn hàng (Reorder).

Kiểm thử toàn diện:
1. Pydantic schemas trong src.backend.schemas (ReorderPreviewRequest, ReorderPreviewResponse, ReorderCreateRequest).
2. Endpoint GET /api/v1/orders/{order_id}/reorder-preview:
   - Tự động kiểm tra trạng thái sản phẩm, loại bỏ sản phẩm đã ngừng kinh doanh (is_active=False / DISCONTINUED).
   - Đưa sản phẩm ngừng kinh doanh vào danh sách cảnh báo kèm lý do.
   - Cập nhật giá sản phẩm theo bảng giá hiện hành (PriceLists), bỏ qua mức giá cũ trong lịch sử đơn hàng.
   - Báo lỗi 404 nếu đơn hàng không tồn tại.
3. Endpoint POST /api/v1/orders/reorder:
   - Cho phép đặt lại toàn bộ hoặc một phần các mặt hàng hợp lệ.
   - Tự động bỏ qua các mặt hàng đã ngừng kinh doanh nếu người dùng cố gửi lên.
   - Tính toán lại tổng tiền dựa trên đơn giá mới nhất.
   - Tạo bản ghi mới trong bảng Orders và OrderItems ở trạng thái DRAFT.
   - Trả về 400 Bad Request nếu toàn bộ mặt hàng được chọn đều đã ngừng kinh doanh.
   - Chặn đặt lại đơn hàng nếu đại lý đang bị khóa giao dịch (tích hợp SCRUM-85).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.models import (
    Base,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    PriceList,
    PriceListItem,
    Product,
    ProductUnit,
    Role,
    RoleCode,
    User,
)
from src.backend.rbac import create_access_token
from src.backend.main import app
from src.backend.schemas import (
    ReorderCreateItem,
    ReorderCreateRequest,
    ReorderPreviewResponse,
)


def make_auth_header(role: str, username: str = "dealer_user") -> dict[str, str]:
    """Tạo JWT Bearer Authorization header hợp lệ."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum28_env():
    """Thiết lập môi trường test SQLite in-memory độc lập cho SCRUM-28."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()
    try:
        # 1. Tạo vai trò và người dùng đại lý
        role_dealer = Role(code="CUSTOMER", name="Đại lý")
        db.add(role_dealer)
        db.flush()

        dealer_user = User(
            username="dealer_user",
            email="dealer_alpha@example.com",
            password_hash="fake_hash",
            full_name="Đại Lý Phân Phối Alpha",
            is_active=True,
        )
        dealer_user.roles.append(role_dealer)
        db.add(dealer_user)
        db.flush()

        # 2. Tạo đại lý (Customer)
        customer = Customer(
            code="DL-ALPHA",
            name="Công ty Đại Lý Alpha",
            phone="0911223344",
            customer_group="DEALER_LEVEL_1",
            is_active=True,
            is_locked=False,
        )
        db.add(customer)
        db.flush()

        # 3. Tạo các sản phẩm:
        # Product 1: Có bảng giá hiện hành (PriceList)
        p1 = Product(
            sku="SP-P1",
            name="Sữa hạt Macca 1L",
            base_unit="Hộp",
            base_price=100000.0,
            status="ACTIVE",
        )
        # Product 2: Không có trong PriceList nhưng cập nhật base_price mới
        p2 = Product(
            sku="SP-P2",
            name="Bánh quy Socola 200g",
            base_unit="Gói",
            base_price=200000.0,
            status="ACTIVE",
        )
        # Product 3: Sản phẩm đã ngừng kinh doanh (is_active = False / status = DISCONTINUED)
        p3 = Product(
            sku="SP-P3-DISCONTINUED",
            name="Trà sữa Matcha (Ngừng KD)",
            base_unit="Chai",
            base_price=50000.0,
            status="DISCONTINUED",
        )
        db.add_all([p1, p2, p3])
        db.flush()

        # Đơn vị tính cho p1
        pu1 = ProductUnit(product_id=p1.id, unit_name="Thùng 12 hộp", conversion_rate=12.0)
        db.add(pu1)
        db.flush()

        # 4. Tạo Bảng giá hiện hành (PriceList) áp dụng cho DEALER_LEVEL_1
        today = date.today()
        price_list = PriceList(
            code="BG-DEALER-2026",
            version=1,
            customer_group="DEALER_LEVEL_1",
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=30),
            published=True,
        )
        db.add(price_list)
        db.flush()

        # P1 có giá mới trong bảng giá: sale_price = 145000, floor_price = 120000
        # (Giá trong đơn cũ là 100000)
        pli1 = PriceListItem(
            price_list_id=price_list.id,
            sku=p1.sku,
            product_id=p1.id,
            sale_price=145000.0,
            floor_price=120000.0,
        )
        db.add(pli1)
        db.flush()

        # Cập nhật base_price của P2 lên 250000 (giá cũ trong đơn là 180000)
        p2.base_price = 250000.0
        db.flush()

        # 5. Tạo đơn hàng cũ lịch sử (Original Order) chứa cả 3 sản phẩm
        old_order = Order(
            order_code="ORD-OLD-001",
            customer_id=customer.id,
            created_by_id=dealer_user.id,
            status=OrderStatus.COMPLETED,
            total_amount=500000.0,
            note="Đơn hàng ban đầu",
        )
        db.add(old_order)
        db.flush()

        item1 = OrderItem(
            order_id=old_order.id,
            product_id=p1.id,
            sku=p1.sku,
            product_name=p1.name,
            unit_id=pu1.id,
            quantity=2,
            unit_price=100000.0,  # Giá cũ lịch sử
        )
        item2 = OrderItem(
            order_id=old_order.id,
            product_id=p2.id,
            sku=p2.sku,
            product_name=p2.name,
            quantity=1,
            unit_price=180000.0,  # Giá cũ lịch sử
        )
        item3 = OrderItem(
            order_id=old_order.id,
            product_id=p3.id,
            sku=p3.sku,
            product_name=p3.name,
            quantity=2,
            unit_price=60000.0,  # Giá cũ lịch sử
        )
        db.add_all([item1, item2, item3])
        db.commit()

        yield {
            "db": db,
            "customer": customer,
            "dealer_user": dealer_user,
            "old_order": old_order,
            "p1": p1,
            "p2": p2,
            "p3": p3,
            "price_list": price_list,
        }
    finally:
        db.close()
        app.dependency_overrides.clear()


# ============================================================================
# TEST SUITE: GET /api/v1/orders/{order_id}/reorder-preview
# ============================================================================

def test_reorder_preview_excludes_discontinued_and_updates_prices(scrum28_env):
    """SCRUM-28: Xem trước đặt lại đơn hàng.
    
    Yêu cầu:
    - Tự động loại bỏ SP-P3-DISCONTINUED (ngừng kinh doanh) và thông báo cảnh báo.
    - Cập nhật giá SP-P1 theo PriceLists (145.000 thay vì giá cũ 100.000).
    - Cập nhật giá SP-P2 theo base_price mới (250.000 thay vì giá cũ 180.000).
    - Tính toán lại tổng tiền ước tính.
    """
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    order_id = scrum28_env["old_order"].id

    res = client.get(f"/api/v1/orders/{order_id}/reorder-preview", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    # Kiểm tra Pydantic validation thông qua schema
    preview = ReorderPreviewResponse.model_validate(data)
    assert preview.order_id == order_id
    assert preview.customer_id == scrum28_env["customer"].id

    # 1. Kiểm tra danh sách mặt hàng đã ngừng kinh doanh
    assert preview.has_discontinued_items is True
    assert len(preview.discontinued_items) == 1
    disc_item = preview.discontinued_items[0]
    assert disc_item.sku == "SP-P3-DISCONTINUED"
    assert "ngừng kinh doanh" in disc_item.reason.lower()
    assert preview.warning_message is not None
    assert "SP-P3-DISCONTINUED" in preview.warning_message

    # 2. Kiểm tra danh sách mặt hàng hợp lệ
    assert len(preview.available_items) == 2
    skus = [it.sku for it in preview.available_items]
    assert "SP-P1" in skus
    assert "SP-P2" in skus
    assert "SP-P3-DISCONTINUED" not in skus

    # 3. Kiểm tra cập nhật giá mới: Bỏ qua giá cũ lịch sử
    item1 = next(it for it in preview.available_items if it.sku == "SP-P1")
    assert item1.old_unit_price == 100000.0
    assert item1.new_unit_price == 145000.0  # Lấy từ PriceLists hiện hành
    assert item1.floor_price == 120000.0
    assert item1.quantity == 2
    assert item1.total_price == 290000.0

    item2 = next(it for it in preview.available_items if it.sku == "SP-P2")
    assert item2.old_unit_price == 180000.0
    assert item2.new_unit_price == 250000.0  # Lấy theo giá mới cập nhật
    assert item2.quantity == 1
    assert item2.total_price == 250000.0

    # 4. Kiểm tra tổng tiền ước tính = 290.000 + 250.000 = 540.000
    expected_total = 290000.0 + 250000.0
    assert preview.total_estimated_amount == expected_total


def test_reorder_preview_not_found(scrum28_env):
    """SCRUM-28: Xem trước đơn hàng không tồn tại trả về 404."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    res = client.get("/api/v1/orders/999999/reorder-preview", headers=headers)
    assert res.status_code == 404
    assert "Không tìm thấy" in res.json()["detail"]


# ============================================================================
# TEST SUITE: POST /api/v1/orders/reorder
# ============================================================================

def test_create_reorder_full_items_success(scrum28_env):
    """SCRUM-28: Đặt lại toàn bộ các mặt hàng hợp lệ thành công."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    old_order_id = scrum28_env["old_order"].id

    payload = {
        "original_order_id": old_order_id,
        "items": [
            {"sku": "SP-P1", "quantity": 3},
            {"sku": "SP-P2", "quantity": 2},
        ],
        "note": "Đặt hàng định kỳ tháng 10",
    }

    res = client.post("/api/v1/orders/reorder", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    res_json = res.json()
    assert res_json["success"] is True

    data = res_json.get("data", res_json)
    assert data["order_id"] != old_order_id
    assert data["order_code"] != scrum28_env["old_order"].order_code
    assert data["status"] == "DRAFT"
    assert data["items_count"] == 2

    # Giá mới: P1 (145.000 * 3 = 435.000) + P2 (250.000 * 2 = 500.000) = 935.000
    expected_total = (145000.0 * 3) + (250000.0 * 2)
    assert data["total_amount"] == expected_total

    # Kiểm tra database đã lưu đúng bản ghi
    db = scrum28_env["db"]
    new_order = db.get(Order, data["order_id"])
    assert new_order is not None
    assert len(new_order.items) == 2
    for item in new_order.items:
        if item.sku == "SP-P1":
            assert item.unit_price == 145000.0
            assert item.floor_price == 120000.0
        elif item.sku == "SP-P2":
            assert item.unit_price == 250000.0


def test_create_reorder_partial_selection(scrum28_env):
    """SCRUM-28: Đại lý chỉ chọn một phần mặt hàng từ đơn cũ để đặt lại."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    old_order_id = scrum28_env["old_order"].id

    # Chỉ đặt lại SP-P1, bỏ qua SP-P2
    payload = {
        "original_order_id": old_order_id,
        "items": [
            {"sku": "SP-P1", "quantity": 5},
        ],
        "note": "Chỉ lấy thêm sữa hạt",
    }

    res = client.post("/api/v1/orders/reorder", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json().get("data", res.json())
    assert data["items_count"] == 1
    assert data["total_amount"] == 145000.0 * 5


def test_create_reorder_automatically_filters_discontinued_items(scrum28_env):
    """SCRUM-28: Nếu frontend gửi kèm sản phẩm đã ngừng kinh doanh, backend tự loại bỏ."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    old_order_id = scrum28_env["old_order"].id

    payload = {
        "original_order_id": old_order_id,
        "items": [
            {"sku": "SP-P1", "quantity": 1},
            {"sku": "SP-P3-DISCONTINUED", "quantity": 5},  # Đã ngừng kinh doanh
        ],
    }

    res = client.post("/api/v1/orders/reorder", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json().get("data", res.json())
    # Chỉ còn 1 sản phẩm SP-P1 được tạo
    assert data["items_count"] == 1
    assert data["total_amount"] == 145000.0
    assert data["warning_message"] is not None
    assert "SP-P3-DISCONTINUED" in data["warning_message"]


def test_create_reorder_all_discontinued_fails(scrum28_env):
    """SCRUM-28: Nếu tất cả mặt hàng được chọn đều đã ngừng kinh doanh, trả về HTTP 400."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    old_order_id = scrum28_env["old_order"].id

    payload = {
        "original_order_id": old_order_id,
        "items": [
            {"sku": "SP-P3-DISCONTINUED", "quantity": 2},
        ],
    }

    res = client.post("/api/v1/orders/reorder", json=payload, headers=headers)
    assert res.status_code == 400
    assert "Không có mặt hàng hợp lệ nào" in res.json()["detail"]


def test_create_reorder_blocked_when_dealer_is_locked(scrum28_env):
    """SCRUM-28 & SCRUM-85: Chặn đặt lại đơn nếu đại lý đang bị khóa giao dịch."""
    db = scrum28_env["db"]
    customer = db.get(Customer, scrum28_env["customer"].id)
    customer.is_locked = True
    customer.lock_reason = "Nợ quá hạn 60 ngày"
    db.commit()

    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    payload = {
        "original_order_id": scrum28_env["old_order"].id,
        "items": [{"sku": "SP-P1", "quantity": 1}],
    }

    res = client.post("/api/v1/orders/reorder", json=payload, headers=headers)
    assert res.status_code == 400
    assert "bị khóa giao dịch" in res.json()["detail"]
    assert "Nợ quá hạn 60 ngày" in res.json()["detail"]


def test_get_order_detail_endpoint(scrum28_env):
    """Kiểm tra endpoint chi tiết đơn hàng GET /api/v1/orders/{order_id}."""
    client = TestClient(app)
    headers = make_auth_header("Customer", "dealer_user")
    order_id = scrum28_env["old_order"].id

    res = client.get(f"/api/v1/orders/{order_id}", headers=headers)
    assert res.status_code == 200, res.text
    res_json = res.json()
    data = res_json.get("data", res_json)
    assert data["id"] == order_id
    assert len(data["items"]) == 3
