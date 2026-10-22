"""Integration and unit tests for SCRUM-7:
Tự động áp giá theo nhóm khách hàng, tính chiết khấu theo sản lượng và kiểm soát giá sàn.

Acceptance Criteria:
1. Áp giá tự động theo nhóm khách hàng từ bảng giá hiệu lực.
2. Chiết khấu theo sản lượng tự động tính lại theo số lượng (Volume discount tiers).
3. Cảnh báo giá sàn và tự động chuyển trạng thái duyệt khi sửa giá thấp hơn giá sàn.
4. Chặn dòng hàng khi SKU không có bảng giá hiệu lực cho nhóm khách hàng.
"""

from datetime import date
import uuid
import pytest
from sqlalchemy import delete

from src.backend.database import SessionLocal
from src.backend.models import (
    Customer,
    DeliveryAddress,
    DiscountPolicy,
    DiscountTier,
    Inventory,
    Order,
    OrderItem,
    PriceList,
    PriceListItem,
    Product,
    Warehouse,
)
from src.backend.rbac import create_access_token


@pytest.fixture(autouse=True)
def clean_scrum7_test_data():
    with SessionLocal() as db:
        db.execute(delete(OrderItem))
        db.execute(delete(Order))
        db.execute(delete(DiscountTier))
        db.execute(delete(DiscountPolicy))
        db.execute(delete(PriceListItem))
        db.execute(delete(PriceList))
        db.execute(delete(DeliveryAddress))
        db.execute(delete(Customer))
        db.execute(delete(Inventory))
        db.execute(delete(Product))
        # Ensure default warehouse exists
        wh = db.query(Warehouse).filter(Warehouse.code == "WH-HN").first()
        if not wh:
            wh = Warehouse(code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
            db.add(wh)
        db.commit()


def auth(role="Sales Rep"):
    token = create_access_token({"sub": f"test-{role}", "role": role})
    return {"Authorization": f"Bearer {token}"}


def create_and_publish_price_list(client, group: str, sku: str, sale_price: float, floor_price: float, code=None):
    list_code = code or f"PL-{group}-{uuid.uuid4().hex[:4].upper()}"
    data = {
        "code": list_code,
        "customer_group": group,
        "start_date": "2020-01-01",
        "end_date": "2099-12-31",
        "items": [{"sku": sku, "sale_price": sale_price, "floor_price": floor_price}],
    }
    created = client.post("/api/v1/price-lists", json=data, headers=auth("Sales Manager"))
    assert created.status_code == 201, created.text
    pl_id = created.json()["id"]
    published = client.post(f"/api/v1/price-lists/{pl_id}/publish", headers=auth("Sales Manager"))
    assert published.status_code == 200, published.text
    return published.json()


def create_test_customer(client, group="DEALER_LEVEL_1"):
    suffix = uuid.uuid4().hex[:6]
    phone = f"091{uuid.uuid4().int % 10000000:07d}"
    res = client.post(
        "/api/v1/customers",
        headers=auth("Sales Manager"),
        json={
            "code": f"CUST-S7-{suffix}",
            "name": f"Đại lý {group}",
            "customer_group": group,
            "phone": phone,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def create_test_product(sku: str, name: str, base_price: float = 100000.0, stock_qty: float = 1000.0):
    with SessionLocal() as db:
        wh = db.query(Warehouse).first()
        if not wh:
            wh = Warehouse(code="WH-HN", name="Kho Tổng Hà Nội", is_active=True)
            db.add(wh)
            db.flush()
        prod = Product(
            sku=sku,
            name=name,
            base_price=base_price,
            cost_price=base_price * 0.7,
            base_unit="Cái",
            status="ACTIVE",
        )
        db.add(prod)
        db.flush()
        inv = Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=stock_qty,
            reserved_qty=0.0,
            available_qty=stock_qty,
        )
        db.add(inv)
        db.commit()
        db.refresh(prod)
        return prod.id


# ==============================================================================
# AC 1: Áp giá tự động theo nhóm khách hàng
# ==============================================================================
def test_ac1_auto_apply_price_by_customer_group(client):
    sku = "SCRUM7-BEER-01"
    create_test_product(sku, "Bia Saigon Special", base_price=300000.0, stock_qty=500.0)

    # Bảng giá Đại lý cấp 1: Giá 280.000, Sàn 260.000
    create_and_publish_price_list(client, "DEALER_LEVEL_1", sku, sale_price=280000, floor_price=260000)
    # Bảng giá Đại lý cấp 2: Giá 290.000, Sàn 270.000
    create_and_publish_price_list(client, "DEALER_LEVEL_2", sku, sale_price=290000, floor_price=270000)
    # Bảng giá Bán lẻ: Giá 320.000, Sàn 300.000
    create_and_publish_price_list(client, "RETAIL", sku, sale_price=320000, floor_price=300000)

    # 1. Kiểm tra effective price endpoint trực tiếp
    res1 = client.get(f"/api/v1/price-lists/effective/{sku}?customer_group=DEALER_LEVEL_1&fallback=false")
    assert res1.status_code == 200
    assert res1.json()["sale_price"] == 280000
    assert res1.json()["floor_price"] == 260000

    res2 = client.get(f"/api/v1/price-lists/effective/{sku}?customer_group=DEALER_LEVEL_2&fallback=false")
    assert res2.status_code == 200
    assert res2.json()["sale_price"] == 290000
    assert res2.json()["floor_price"] == 270000

    # 2. Kiểm tra khi tạo đơn hàng tự động áp giá đúng nhóm khách hàng
    cust_dealer1 = create_test_customer(client, group="DEALER_LEVEL_1")
    order_res = client.post(
        "/api/v1/orders",
        headers=auth("Sales Rep"),
        json={
            "customer_id": cust_dealer1["id"],
            "items": [{"sku": sku, "quantity": 10}],
        },
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    assert order["items"][0]["unit_price"] == 280000
    assert order["items"][0]["floor_price"] == 260000


# ==============================================================================
# AC 2: Chiết khấu theo sản lượng (Volume discount tier recalculation)
# ==============================================================================
def test_ac2_volume_discount_recalculation(client):
    sku = "SCRUM7-MILK-01"
    prod_id = create_test_product(sku, "Sữa tươi tiệt trùng 1L", base_price=40000.0, stock_qty=500.0)
    create_and_publish_price_list(client, "DEALER_LEVEL_1", sku, sale_price=40000, floor_price=35000)

    # Tạo chính sách chiết khấu theo sản lượng cho sản phẩm:
    # 10 - 49: 5%
    # 50 - 99: 10%
    # >= 100: 15%
    policy_res = client.post(
        "/api/v1/discounts",
        headers=auth("Sales Manager"),
        json={
            "name": "Chiết khấu sản lượng Sữa",
            "scope": "SKU",
            "targetId": sku,
            "discountType": "PERCENTAGE",
            "isActive": True,
            "tiers": [
                {"minQty": 10, "maxQty": 49, "discountPercent": 5.0},
                {"minQty": 50, "maxQty": 99, "discountPercent": 10.0},
                {"minQty": 100, "maxQty": None, "discountPercent": 15.0},
            ],
        },
    )
    assert policy_res.status_code == 201, policy_res.text

    # Kiểm tra tính toán chiết khấu theo số lượng:
    # 5 hộp -> 0%
    calc_5 = client.post(
        "/api/v1/discounts/calculate",
        headers=auth("Sales Rep"),
        json={"sku": sku, "quantity": 5, "base_price": 40000.0},
    ).json()["data"]
    assert calc_5["discount_percent"] == 0.0
    assert calc_5["discount_amount"] == 0.0

    # 15 hộp -> 5%
    calc_15 = client.post(
        "/api/v1/discounts/calculate",
        headers=auth("Sales Rep"),
        json={"sku": sku, "quantity": 15, "base_price": 40000.0},
    ).json()["data"]
    assert calc_15["discount_percent"] == 5.0
    assert calc_15["discount_amount"] == 15 * 40000.0 * 0.05

    # 60 hộp -> 10%
    calc_60 = client.post(
        "/api/v1/discounts/calculate",
        headers=auth("Sales Rep"),
        json={"sku": sku, "quantity": 60, "base_price": 40000.0},
    ).json()["data"]
    assert calc_60["discount_percent"] == 10.0

    # 120 hộp -> 15%
    calc_120 = client.post(
        "/api/v1/discounts/calculate",
        headers=auth("Sales Rep"),
        json={"sku": sku, "quantity": 120, "base_price": 40000.0},
    ).json()["data"]
    assert calc_120["discount_percent"] == 15.0

    # Kiểm tra khi lên đơn hàng với 50 sản phẩm, chiết khấu 10% được tự động áp dụng
    cust = create_test_customer(client, group="DEALER_LEVEL_1")
    order_res = client.post(
        "/api/v1/orders",
        headers=auth("Sales Rep"),
        json={
            "customer_id": cust["id"],
            "items": [{"sku": sku, "quantity": 50}],
        },
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    assert order["items"][0]["discount_percent"] == 10.0
    expected_discount_amount = 50 * 40000 * 0.10
    assert order["items"][0]["discount_amount"] == expected_discount_amount


# ==============================================================================
# AC 3: Sửa giá thủ công dưới giá sàn -> Cảnh báo & Trạng thái duyệt
# ==============================================================================
def test_ac3_manual_price_below_floor_triggers_pending_approval(client):
    sku = "SCRUM7-WATER-01"
    create_test_product(sku, "Nước khoáng Lavie 500ml", base_price=10000.0, stock_qty=500.0)
    create_and_publish_price_list(client, "DEALER_LEVEL_1", sku, sale_price=10000, floor_price=8000)

    cust = create_test_customer(client, group="DEALER_LEVEL_1")

    # NVKD sửa giá thủ công xuống 7.000 (thấp hơn giá sàn 8.000)
    order_res = client.post(
        "/api/v1/orders",
        headers=auth("Sales Rep"),
        json={
            "customer_id": cust["id"],
            "require_effective_price": True,
            "items": [
                {
                    "sku": sku,
                    "product_name": "Nước khoáng Lavie 500ml",
                    "quantity": 10,
                    "unit_price": 7000,  # Dưới sàn 8.000
                }
            ],
        },
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    # Phải ở trạng thái PENDING hoặc PENDING_APPROVAL
    assert order["status"] in ("PENDING", "PENDING_APPROVAL")
    assert "dưới giá sàn" in order["approval_reason"]
    assert "7,000" in order["approval_reason"] or "7000" in order["approval_reason"]

    # Kiểm tra danh sách đơn chờ duyệt của Quản lý kinh doanh
    pending_list = client.get("/api/v1/orders/pending-approval", headers=auth("Sales Manager"))
    assert pending_list.status_code == 200
    pending_ids = [o["id"] for o in pending_list.json()]
    assert order["id"] in pending_ids


# ==============================================================================
# AC 4: Chặn dòng hàng khi SKU không có bảng giá hiệu lực cho nhóm khách hàng
# ==============================================================================
def test_ac4_block_item_without_effective_price_list(client):
    sku = "SCRUM7-UNPRICED-01"
    create_test_product(sku, "Sản phẩm chưa có bảng giá", base_price=50000.0, stock_qty=100.0)
    # Chưa tạo bảng giá nào cho nhóm DEALER_LEVEL_1

    # 1. Tra cứu trực tiếp với fallback=false trả về 404
    res_404 = client.get(f"/api/v1/price-lists/effective/{sku}?customer_group=DEALER_LEVEL_1&fallback=false")
    assert res_404.status_code == 404

    # 2. Simulate đơn hàng báo hasValidPriceList = False và priceError
    cust = create_test_customer(client, group="DEALER_LEVEL_1")
    sim_res = client.post(
        "/api/v1/orders/simulate",
        headers=auth("Sales Rep"),
        json={
            "customer_id": cust["id"],
            "items": [{"sku": sku, "quantity": 1}],
        },
    )
    assert sim_res.status_code == 200
    sim_data = sim_res.json()["data"]
    validation = sim_data["itemsValidation"][0]
    assert validation["hasValidPriceList"] is False
    assert "không tồn tại bảng giá hiệu lực" in validation["priceError"]

    # 3. Tạo đơn hàng với require_effective_price=True bị chặn với mã lỗi 400
    create_order_res = client.post(
        "/api/v1/orders",
        headers=auth("Sales Rep"),
        json={
            "customer_id": cust["id"],
            "require_effective_price": True,
            "items": [{"sku": sku, "quantity": 1}],
        },
    )
    assert create_order_res.status_code == 400
    assert "không tồn tại bảng giá hiệu lực" in create_order_res.json()["detail"]
    assert "DEALER_LEVEL_1" in create_order_res.json()["detail"]
