"""Comprehensive test suite for SCRUM-16: Order Cloning (Sao chép đơn hàng).

Acceptance Criteria:
- AC-01: Sao chép toàn bộ dòng hàng của đơn đã chọn (SKU, số lượng, tên sản phẩm, đơn vị tính).
- AC-02: Giá được áp dụng theo bảng giá hiện hành, không kế thừa giá cũ.
- AC-03: Chiết khấu được tính lại theo chính sách hiện hành.
- AC-04: Bản sao luôn bắt đầu ở trạng thái Nháp (DRAFT).
- AC-05: Độc lập dữ liệu, mã đơn mới, đơn nguồn giữ nguyên, rollback khi có lỗi.
"""

# pyright: reportMissingImports=false

from __future__ import annotations

import uuid
import pytest  # type: ignore[import-untyped, import-not-found]
from sqlalchemy import delete  # type: ignore[import-untyped, import-not-found]

from src.backend.database import SessionLocal
from src.backend.models import (
    Customer,
    DeliveryAddress,
    DiscountPolicy,
    DiscountTier,
    Order,
    OrderItem,
    OrderStatus,
    PriceList,
    PriceListItem,
    User,
)
from src.backend.rbac import create_access_token


def auth(role="Sales Rep", username="sales_rep_01"):
    token = create_access_token({"sub": username, "role": role, "roles": [role]})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def clean_test_data():
    with SessionLocal() as db:
        db.execute(delete(OrderItem))
        db.execute(delete(Order))
        db.execute(delete(DiscountTier))
        db.execute(delete(DiscountPolicy))
        db.execute(delete(PriceListItem))
        db.execute(delete(PriceList))
        db.execute(delete(DeliveryAddress))
        db.execute(delete(Customer))
        db.execute(delete(User).where(User.username.like("test_rep_%")))
        db.commit()


def setup_customer(_client=None, group="DEALER_LEVEL_1", is_locked=False, lock_reason=None, sales_rep_id=None):
    suffix = uuid.uuid4().hex[:6]
    with SessionLocal() as db:
        cust = Customer(
            code=f"CUST-{group}-{suffix}",
            name=f"Khách hàng {group}",
            customer_group=group,
            phone=f"091{uuid.uuid4().int % 10000000:07d}",
            is_locked=is_locked,
            lock_reason=lock_reason,
            sales_rep_id=sales_rep_id,
            is_active=True,
        )
        db.add(cust)
        db.commit()
        db.refresh(cust)
        return cust.id, cust.code, cust.name


def publish_price_list(client, group="DEALER_LEVEL_1", items=None, code="PL-DEFAULT"):
    if items is None:
        items = [{"sku": "SKU-BEER-01", "sale_price": 100, "floor_price": 80}]
    created = client.post(
        "/api/v1/price-lists",
        json={
            "code": code,
            "customer_group": group,
            "start_date": "2020-01-01",
            "end_date": "2099-12-31",
            "items": items,
        },
        headers=auth("Sales Manager"),
    )
    assert created.status_code == 201, created.text
    pl_id = created.json()["id"]
    pub = client.post(f"/api/v1/price-lists/{pl_id}/publish", headers=auth("Sales Manager"))
    assert pub.status_code == 200, pub.text
    return pub.json()


def create_base_order(customer_id, items, status=OrderStatus.APPROVED, note="Đơn ban đầu"):
    with SessionLocal() as db:
        count = db.query(Order).count()
        order = Order(
            order_code=f"ORD-SOURCE-{count + 1:04d}",
            customer_id=customer_id,
            status=status,
            note=note,
            total_amount=sum(it["quantity"] * it.get("unit_price", 100) for it in items),
        )
        db.add(order)
        db.flush()
        for it in items:
            db.add(OrderItem(
                order_id=order.id,
                sku=it["sku"],
                product_name=it.get("product_name", f"Product {it['sku']}"),
                quantity=it["quantity"],
                unit_id=it.get("unit_id"),
                unit_price=it.get("unit_price", 100),
                floor_price=it.get("floor_price", 80),
                price_list_id=it.get("price_list_id"),
            ))
        db.commit()
        db.refresh(order)
        return order.id


# ==============================================================================
# NHÓM 1: HAPPY PATH (AC-01, AC-04, AC-05)
# ==============================================================================

def test_clone_order_single_line_item(client):
    """1. Clone order có một dòng hàng."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-BEER-01", "sale_price": 120, "floor_price": 100}])

    source_order_id = create_base_order(
        customer_id=cust_id,
        items=[{"sku": "SKU-BEER-01", "product_name": "Bia Hà Nội 330ml", "quantity": 10, "unit_price": 90, "unit_id": 1}],
    )

    res = client.post(f"/api/v1/orders/{source_order_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201, res.text
    cloned = res.json()

    assert cloned["id"] != source_order_id
    assert cloned["customer_id"] == cust_id
    assert cloned["status"] == "DRAFT"
    assert len(cloned["items"]) == 1
    assert cloned["items"][0]["sku"] == "SKU-BEER-01"
    assert cloned["items"][0]["quantity"] == 10
    assert cloned["items"][0]["unit_id"] == 1


def test_clone_order_multiple_line_items(client):
    """2. Clone order có nhiều dòng hàng."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[
        {"sku": "SKU-A", "sale_price": 50, "floor_price": 40},
        {"sku": "SKU-B", "sale_price": 80, "floor_price": 70},
        {"sku": "SKU-C", "sale_price": 120, "floor_price": 100},
    ])

    source_order_id = create_base_order(
        customer_id=cust_id,
        items=[
            {"sku": "SKU-A", "product_name": "Sản phẩm A", "quantity": 5, "unit_price": 45, "unit_id": 10},
            {"sku": "SKU-B", "product_name": "Sản phẩm B", "quantity": 20, "unit_price": 75, "unit_id": 11},
            {"sku": "SKU-C", "product_name": "Sản phẩm C", "quantity": 2, "unit_price": 110, "unit_id": 12},
        ],
    )

    res = client.post(f"/api/v1/orders/{source_order_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()
    assert len(cloned["items"]) == 3
    skus = [it["sku"] for it in cloned["items"]]
    assert skus == ["SKU-A", "SKU-B", "SKU-C"]


def test_clone_order_preserves_line_item_details(client):
    """3. Kiểm tra đầy đủ từng line item, SKU, số lượng và đơn vị tính."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-VODKA", "sale_price": 200, "floor_price": 150}])

    source_order_id = create_base_order(
        customer_id=cust_id,
        items=[{"sku": "SKU-VODKA", "product_name": "Vodka Hà Nội Chai 500ml", "quantity": 15, "unit_id": 5, "unit_price": 180}],
    )

    res = client.post(f"/api/v1/orders/{source_order_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    item = res.json()["items"][0]
    assert item["sku"] == "SKU-VODKA"
    assert item["product_name"] == "Vodka Hà Nội Chai 500ml"
    assert item["quantity"] == 15
    assert item["unit_id"] == 5


def test_clone_order_generates_distinct_id_and_code(client):
    """4. ID/mã order mới khác order nguồn."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}])
    with SessionLocal() as db:
        source_order = db.get(Order, source_id)
        source_code = source_order.order_code

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()

    assert cloned["id"] != source_id
    assert cloned["order_code"] != source_code
    assert cloned["order_code"].startswith("ORD-")


def test_clone_order_status_is_always_draft(client):
    """5. Trạng thái mới là Draft."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}], status=OrderStatus.APPROVED)

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    assert res.json()["status"] == "DRAFT"


def test_clone_order_leaves_source_order_unchanged(client):
    """6. Order nguồn giữ nguyên."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 150, "floor_price": 120}])

    source_id = create_base_order(
        customer_id=cust_id,
        items=[{"sku": "SKU-001", "quantity": 5, "unit_price": 80}],
        status=OrderStatus.COMPLETED,
        note="Đơn nguồn ban đầu",
    )

    with SessionLocal() as db:
        before_order = db.get(Order, source_id)
        before_total = before_order.total_amount
        before_status = before_order.status
        before_items_count = len(before_order.items)

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201

    with SessionLocal() as db:
        after_order = db.get(Order, source_id)
        assert after_order.total_amount == before_total
        assert after_order.status == before_status
        assert len(after_order.items) == before_items_count
        assert after_order.items[0].unit_price == 80


def test_modifying_cloned_order_does_not_affect_source(client):
    """7. Sửa order mới không làm thay đổi order nguồn."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 3, "unit_price": 90}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned_id = res.json()["id"]

    # Sửa order mới qua API cập nhật trạng thái
    client.put(f"/api/v1/orders/{cloned_id}/status?new_status=PENDING", headers=auth("Sales Rep"))

    with SessionLocal() as db:
        cloned_in_db = db.get(Order, cloned_id)
        source_in_db = db.get(Order, source_id)
        assert cloned_in_db.status == OrderStatus.PENDING
        assert source_in_db.status == OrderStatus.APPROVED  # Nguồn không bị đổi


# ==============================================================================
# NHÓM 2: GIÁ VÀ CHIẾT KHẤU (AC-02, AC-03)
# ==============================================================================

def test_clone_applies_same_price_when_effective_price_unchanged(client):
    """8. Giá cũ và giá mới giống nhau nếu bảng giá hiện hành không đổi."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 2, "unit_price": 100}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()
    assert cloned["items"][0]["unit_price"] == 100.0


def test_clone_applies_new_effective_price_instead_of_old_price(client):
    """9. Giá hiện hành khác giá cũ: P1 cũ -> P2 mới từ bảng giá hiện hành."""
    cust_id, _, _ = setup_customer(client)
    # Bảng giá hiện hành niêm yết 250 (P2)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 250, "floor_price": 200}])

    # Đơn nguồn đã tạo trong quá khứ với giá P1 = 150
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 4, "unit_price": 150}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()
    # Phải áp dụng P2 = 250, KHÔNG kế thừa P1 = 150
    assert cloned["items"][0]["unit_price"] == 250.0
    assert cloned["total_amount"] == 1000.0  # 4 * 250


def test_clone_fails_when_effective_price_is_missing(client):
    """10. Bảng giá không có hiệu lực hoặc không có SKU phù hợp -> HTTP 409/404."""
    cust_id, _, _ = setup_customer(client, group="DEALER_LEVEL_1")
    # Không xuất bản bảng giá nào cho SKU-UNKNOWN
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-UNKNOWN", "quantity": 1, "unit_price": 100}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code in (404, 409)


def test_clone_applies_updated_discount_policy(client):
    """11. Chính sách chiết khấu thay đổi sau khi tạo đơn nguồn: đơn mới phản ánh chính sách mới."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-BEER", "sale_price": 100, "floor_price": 80}])

    # Đơn nguồn tạo khi chưa có chiết khấu -> unit_price = 100
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-BEER", "quantity": 50, "unit_price": 100}])

    # Thêm chính sách chiết khấu mới: mua >= 50 lon giảm 10%
    with SessionLocal() as db:
        pol = DiscountPolicy(
            name="Chiết khấu Bia 10% cho số lượng >= 50",
            target_type="SKU",
            target_id="SKU-BEER",
            discount_type="PERCENTAGE",
            is_active=True,
        )
        db.add(pol)
        db.flush()
        tier = DiscountTier(
            policy_id=pol.id,
            min_quantity=50,
            max_quantity=None,
            discount_value=10.0,
        )
        db.add(tier)
        db.commit()

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()
    # Giá bán gốc 100, chiết khấu 10% -> 90
    assert cloned["items"][0]["unit_price"] == 90.0
    assert cloned["total_amount"] == 4500.0  # 50 * 90


def test_clone_discount_tier_matches_quantity(client):
    """12. Điều kiện chiết khấu thay đổi theo số lượng (các bậc khác nhau)."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-MILK", "sale_price": 20, "floor_price": 15}])

    with SessionLocal() as db:
        pol = DiscountPolicy(
            name="Chiết khấu sữa bậc thang",
            target_type="SKU",
            target_id="SKU-MILK",
            discount_type="PERCENTAGE",
            is_active=True,
        )
        db.add(pol)
        db.flush()
        db.add(DiscountTier(policy_id=pol.id, min_quantity=10, max_quantity=49, discount_value=5.0))
        db.add(DiscountTier(policy_id=pol.id, min_quantity=50, max_quantity=None, discount_value=15.0))
        db.commit()

    # Đơn nguồn số lượng 60 -> bậc 15%
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-MILK", "quantity": 60, "unit_price": 20}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    # 20 - 15% = 17.0
    assert res.json()["items"][0]["unit_price"] == 17.0
    assert res.json()["total_amount"] == 1020.0  # 60 * 17


def test_line_total_and_grand_total_accuracy(client):
    """13. Xác nhận tiền dòng hàng và tổng tiền đúng công thức chuẩn."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[
        {"sku": "SKU-X", "sale_price": 30, "floor_price": 20},
        {"sku": "SKU-Y", "sale_price": 70, "floor_price": 50},
    ])

    source_id = create_base_order(
        customer_id=cust_id,
        items=[
            {"sku": "SKU-X", "quantity": 3, "unit_price": 30},
            {"sku": "SKU-Y", "quantity": 2, "unit_price": 70},
        ],
    )

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    cloned = res.json()
    expected_total = (3 * 30.0) + (2 * 70.0)
    assert cloned["total_amount"] == expected_total


def test_rounding_rules_applied(client):
    """14. Kiểm tra quy tắc làm tròn 2 chữ số thập phân."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-ROUND", "sale_price": 33, "floor_price": 20}])

    with SessionLocal() as db:
        pol = DiscountPolicy(
            name="Chiết khấu 7% lẻ",
            target_type="SKU",
            target_id="SKU-ROUND",
            discount_type="PERCENTAGE",
            is_active=True,
        )
        db.add(pol)
        db.flush()
        db.add(DiscountTier(policy_id=pol.id, min_quantity=1, max_quantity=None, discount_value=7.0))
        db.commit()

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-ROUND", "quantity": 3, "unit_price": 33}])
    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    # 33 * 0.07 = 2.31 -> 33 - 2.31 = 30.69
    assert res.json()["items"][0]["unit_price"] == 30.69
    assert res.json()["total_amount"] == round(3 * 30.69, 2)


# ==============================================================================
# NHÓM 3: TRẠNG THÁI VÀ BẢO MẬT (AC-04, AC-05, RBAC, CUSTOMER LOCK)
# ==============================================================================

@pytest.mark.parametrize("source_status", [
    OrderStatus.APPROVED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.PENDING,
    OrderStatus.PENDING_APPROVAL,
    OrderStatus.DRAFT,
])
def test_clone_from_various_order_statuses(client, source_status):
    """15 & 16. Clone từ các trạng thái nguồn khác nhau; bản sao luôn luôn là DRAFT."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])

    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}], status=source_status)

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 201
    assert res.json()["status"] == "DRAFT"


def test_clone_without_token_returns_401(client):
    """17. Request không có token -> 401 Unauthorized."""
    cust_id, _, _ = setup_customer(client)
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}])

    res = client.post(f"/api/v1/orders/{source_id}/clone")
    assert res.status_code in (401, 403)


def test_clone_with_insufficient_permissions_returns_403(client):
    """18. Vai trò không có quyền tạo đơn (Warehouse) -> 403 Forbidden."""
    cust_id, _, _ = setup_customer(client)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Warehouse"))
    assert res.status_code == 403


def test_sales_rep_cannot_clone_order_of_unassigned_customer(client):
    """19. Sales Rep không được phép thao tác trên đơn hàng của đại lý do người khác phụ trách."""
    suffix = uuid.uuid4().hex[:6]
    u1 = f"test_rep_1_{suffix}"
    u2 = f"test_rep_2_{suffix}"
    with SessionLocal() as db:
        rep1 = User(username=u1, email=f"{u1}@oms.com", full_name="Sales Rep 1", password_hash="hash", is_active=True)
        rep2 = User(username=u2, email=f"{u2}@oms.com", full_name="Sales Rep 2", password_hash="hash", is_active=True)
        db.add_all([rep1, rep2])
        db.commit()
        db.refresh(rep1)
        db.refresh(rep2)
        rep1_id, rep2_id = rep1.id, rep2.id

    # Đại lý do rep1 phụ trách
    cust_id, _, _ = setup_customer(client, sales_rep_id=rep1_id)
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 1}])

    # rep2 cố clone -> 403 Forbidden
    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep", username=u2))
    assert res.status_code == 403

    # rep1 clone -> 201 Thành công
    res_ok = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep", username=u1))
    assert res_ok.status_code == 201


def test_clone_nonexistent_order_returns_404(client):
    """20. Order nguồn không tồn tại -> 404 Not Found."""
    res = client.post("/api/v1/orders/9999999/clone", headers=auth("Sales Rep"))
    assert res.status_code == 404


def test_clone_fails_when_customer_is_locked(client):
    """21. Customer bị khóa giao dịch -> 400 Bad Request kèm lý do khóa (SCRUM-85)."""
    cust_id, _, _ = setup_customer(
        client,
        is_locked=True,
        lock_reason="Nợ quá hạn 60 ngày",
    )
    publish_price_list(client, items=[{"sku": "SKU-001", "sale_price": 100, "floor_price": 80}])
    source_id = create_base_order(customer_id=cust_id, items=[{"sku": "SKU-001", "quantity": 2}])

    res = client.post(f"/api/v1/orders/{source_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 400
    assert "bị khóa giao dịch" in res.json()["detail"]
    assert "Nợ quá hạn 60 ngày" in res.json()["detail"]


def test_clone_order_without_line_items_fails_and_does_not_create_partial_data(client):
    """22. Order nguồn không có dòng hàng -> báo lỗi 400 và không tạo dữ liệu một phần."""
    cust_id, _, _ = setup_customer(client)

    # Tạo đơn nguồn rỗng (không có line item)
    with SessionLocal() as db:
        empty_order = Order(
            order_code="ORD-EMPTY-001",
            customer_id=cust_id,
            status=OrderStatus.DRAFT,
            total_amount=0,
        )
        db.add(empty_order)
        db.commit()
        db.refresh(empty_order)
        empty_order_id = empty_order.id

    with SessionLocal() as db:
        orders_count_before = db.query(Order).count()

    res = client.post(f"/api/v1/orders/{empty_order_id}/clone", headers=auth("Sales Rep"))
    assert res.status_code == 400
    assert "không có dòng hàng" in res.json()["detail"]

    # Đảm bảo không tạo thêm bất kỳ order nào
    with SessionLocal() as db:
        orders_count_after = db.query(Order).count()
        assert orders_count_after == orders_count_before
