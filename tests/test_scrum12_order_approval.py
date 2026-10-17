"""Unit and Integration tests for User Story SCRUM-12 (Epic SCRUM-86):
Duyệt đơn vượt hạn mức hoặc bán dưới giá sàn.

Yêu cầu chi tiết được kiểm thử:
1. Danh sách đơn chờ duyệt:
   - Endpoint GET /api/v1/orders/pending-approval
   - Hiển thị rõ lý do cần duyệt và mức độ vi phạm cụ thể:
     + Số tiền vượt hạn mức tín dụng/công nợ (credit_limit_exceeded_amount).
     + Khoảng chênh lệch giá sàn (floor_price_gap).
     + Loại vi phạm (violation_type: BELOW_FLOOR_PRICE, CREDIT_LIMIT_EXCEEDED, BOTH).
     + Chi tiết vi phạm từng sản phẩm (violation_details).
2. Ba hành động xử lý đơn hàng:
   - DUYỆT (Approve): POST /api/v1/orders/{id}/approve (optional comment).
   - TỪ CHỐI (Reject): POST /api/v1/orders/{id}/reject (bắt buộc nhập lý do/ý kiến, rỗng -> 400).
   - TRẢ LẠI SỬA (Return / Request Changes): POST /api/v1/orders/{id}/return hoặc /request-changes (bắt buộc nhập ý kiến, rỗng -> 400).
     Sau khi trả lại sửa, trạng thái đơn chuyển về DRAFT.
3. Tích hợp tồn kho (Inventory Reservation):
   - Đơn chờ duyệt: Chưa giữ chỗ tồn kho (reserved_qty = 0).
   - Khi Quản lý duyệt: Kích hoạt giữ chỗ tồn kho (reserved_qty tăng, available_qty giảm).
4. Tính toàn vẹn dữ liệu (Audit Log):
   - Model OrderApprovalHistory lưu trữ chi tiết: order_id, action, performed_by, comment, created_at.
   - Endpoint GET /api/v1/orders/{id}/approval-history trả về danh sách lịch sử.
   - Chặn tuyệt đối các thao tác sửa/xóa lịch sử duyệt (PUT, PATCH, DELETE trả về 405 Method Not Allowed).
   - Kiểm tra tính bất biến ở mức ORM (listener chặn update).
5. Phân quyền (RBAC):
   - Chỉ Sales Manager và Admin mới có quyền duyệt, từ chối, trả lại sửa.
   - Các vai trò khác (Sales Rep, Warehouse, Accountant, Customer) bị chặn 403 Forbidden.
   - Chưa xác thực bị chặn 401 Unauthorized.
"""
from __future__ import annotations

import uuid
import pytest
from sqlalchemy import delete

from src.backend.database import SessionLocal
from src.backend.models import (
    Customer,
    CustomerDebt,
    DeliveryAddress,
    Inventory,
    Order,
    OrderApprovalHistory,
    OrderItem,
    OrderStatus,
    PriceList,
    PriceListItem,
    Product,
    RoleCode,
    Warehouse,
)
from src.backend.rbac import create_access_token


@pytest.fixture(autouse=True)
def clean_test_data():
    """Làm sạch dữ liệu giữa các test cases."""
    with SessionLocal() as db:
        db.execute(delete(OrderApprovalHistory))
        db.execute(delete(OrderItem))
        db.execute(delete(Order))
        db.execute(delete(Inventory))
        db.execute(delete(PriceListItem))
        db.execute(delete(PriceList))
        db.execute(delete(DeliveryAddress))
        db.execute(delete(CustomerDebt))
        db.execute(delete(Customer))
        db.execute(delete(Product))
        db.commit()


def make_token(role: str = "Sales Manager", username: str = "test-mgr"):
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


def setup_customer_and_product(client, credit_limit=0.0, floor_price=80.0, sale_price=100.0, initial_stock=100.0):
    """Thiết lập đại lý, sản phẩm có bảng giá và tồn kho ban đầu."""
    suffix = uuid.uuid4().hex[:6]
    mgr_headers = make_token("Sales Manager", "mgr_user")

    # 1. Tạo hoặc lấy kho mặc định
    with SessionLocal() as db:
        wh = db.query(Warehouse).first()
        if not wh:
            wh = Warehouse(id=1, code="WH-DEFAULT", name="Kho Tổng Long Biên", is_active=True)
            db.add(wh)
            db.commit()
            db.refresh(wh)
        wh_id = wh.id

    # 2. Tạo đại lý
    cust_res = client.post(
        "/api/v1/customers",
        json={
            "code": f"DL-{suffix}",
            "name": f"Đại lý Thử Nghiệm {suffix}",
            "phone": f"091{uuid.uuid4().int % 10000000:07d}",
            "customer_group": "DEALER_LEVEL_1",
            "credit_limit": credit_limit,
            "max_due_days": 30,
        },
        headers=mgr_headers,
    )
    assert cust_res.status_code == 201, cust_res.text
    customer = cust_res.json()

    # 3. Tạo sản phẩm và bảng giá có giá sàn
    sku = f"SKU-{suffix.upper()}"
    with SessionLocal() as db:
        prod = Product(
            sku=sku,
            name=f"Sản phẩm {suffix}",
            base_price=sale_price,
            base_unit="Thùng",
            status="ACTIVE",
        )
        db.add(prod)
        db.flush()
        prod_id = prod.id

        # Tồn kho ban đầu
        inv = Inventory(
            product_id=prod_id,
            warehouse_id=wh_id,
            physical_qty=initial_stock,
            reserved_qty=0.0,
            available_qty=initial_stock,
        )
        db.add(inv)
        db.commit()

    # 4. Khai báo bảng giá và phát hành
    pl_res = client.post(
        "/api/v1/price-lists",
        json={
            "code": f"PL-{suffix}",
            "customer_group": "DEALER_LEVEL_1",
            "start_date": "2020-01-01",
            "end_date": "2099-12-31",
            "items": [{"sku": sku, "sale_price": sale_price, "floor_price": floor_price}],
        },
        headers=mgr_headers,
    )
    assert pl_res.status_code == 201, pl_res.text
    pl_id = pl_res.json()["id"]
    pub_res = client.post(f"/api/v1/price-lists/{pl_id}/publish", headers=mgr_headers)
    assert pub_res.status_code == 200, pub_res.text

    return customer, prod_id, sku, wh_id


# ==============================================================================
# 1. DANH SÁCH ĐƠN CHỜ DUYỆT (PENDING APPROVAL) & MỨC ĐỘ VI PHẠM
# ==============================================================================

def test_list_pending_approval_below_floor_price(client):
    """Yêu cầu 1: Hiển thị đơn chờ duyệt do bán dưới giá sàn kèm khoảng chênh lệch."""
    customer, prod_id, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    # Tạo đơn với đơn giá 70 (dưới giá sàn 80, chênh lệch 10/đơn vị * 5 = 50)
    order_res = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [{"sku": sku, "quantity": 5, "unit_price": 70.0}],
            "note": "Xin đặc cách chiết khấu cho khách lớn",
        },
        headers=sales_headers,
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    assert order["status"] in ("PENDING", "PENDING_APPROVAL")

    # Quản lý kinh doanh xem danh sách chờ duyệt
    pending_res = client.get("/api/v1/orders/pending-approval", headers=mgr_headers)
    assert pending_res.status_code == 200
    pending_list = pending_res.json()
    assert any(o["id"] == order["id"] for o in pending_list)

    matched = next(o for o in pending_list if o["id"] == order["id"])
    assert matched["violation_type"] == "BELOW_FLOOR_PRICE"
    assert matched["floor_price_gap"] == 50.0  # (80 - 70) * 5
    assert "dưới giá sàn" in matched["approval_reason"].lower()
    assert matched["violation_details"] is not None
    assert len(matched["violation_details"]["below_floor_items"]) == 1
    assert matched["violation_details"]["below_floor_items"][0]["sku"] == sku
    assert matched["violation_details"]["below_floor_items"][0]["unit_gap"] == 10.0


def test_list_pending_approval_credit_limit_exceeded(client):
    """Yêu cầu 1: Hiển thị đơn chờ duyệt do vượt hạn mức công nợ kèm số tiền vượt."""
    # Đại lý có hạn mức 500 VND
    customer, prod_id, sku, _ = setup_customer_and_product(client, credit_limit=500.0, floor_price=50.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    # Đặt hàng 8 sản phẩm giá 100 = 800 VND -> Vượt hạn mức 300 VND
    order_res = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [{"sku": sku, "quantity": 8, "unit_price": 100.0}],
            "note": "Khách cần hàng gấp công trình",
        },
        headers=sales_headers,
    )
    assert order_res.status_code == 201, order_res.text
    order = order_res.json()
    assert order["status"] in ("PENDING", "PENDING_APPROVAL")

    pending_res = client.get("/api/v1/orders/pending-approval", headers=mgr_headers)
    assert pending_res.status_code == 200
    matched = next(o for o in pending_res.json() if o["id"] == order["id"])
    assert matched["violation_type"] == "CREDIT_LIMIT_EXCEEDED"
    assert matched["credit_limit_exceeded_amount"] == 300.0  # 800 - 500
    assert "vượt hạn mức" in matched["approval_reason"].lower()
    assert "300" in matched["approval_reason"]


def test_list_pending_approval_both_violations(client):
    """Yêu cầu 1: Đơn vi phạm đồng thời cả 2 điều kiện: vừa dưới sàn vừa vượt hạn mức."""
    customer, prod_id, sku, _ = setup_customer_and_product(client, credit_limit=200.0, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    # Đặt 5 sản phẩm giá 60 (dưới sàn 80, tổng đơn 300 > hạn mức 200)
    order_res = client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer["id"],
            "items": [{"sku": sku, "quantity": 5, "unit_price": 60.0}],
        },
        headers=sales_headers,
    )
    assert order_res.status_code == 201
    order = order_res.json()

    pending_res = client.get("/api/v1/orders/pending-approval", headers=mgr_headers)
    matched = next(o for o in pending_res.json() if o["id"] == order["id"])
    assert matched["violation_type"] == "BOTH"
    assert matched["floor_price_gap"] == 100.0  # (80 - 60) * 5
    assert matched["credit_limit_exceeded_amount"] == 100.0  # 300 - 200


# ==============================================================================
# 2. BA HÀNH ĐỘNG: DUYỆT, TỪ CHỐI, TRẢ LẠI SỬA (VALIDATION COMMENT)
# ==============================================================================

def test_reject_order_requires_comment(client):
    """Yêu cầu 2: Bắt buộc phải có lý do/ý kiến phản hồi khi Từ chối đơn."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 2, "unit_price": 50.0}]},
        headers=sales_headers,
    ).json()

    # 1. Từ chối không truyền body hoặc reason rỗng -> 400 Bad Request
    res_empty = client.post(f"/api/v1/orders/{order['id']}/reject", json={"reason": "   "}, headers=mgr_headers)
    assert res_empty.status_code == 400
    assert "bắt buộc" in res_empty.json()["detail"].lower()

    res_no_body = client.post(f"/api/v1/orders/{order['id']}/reject", json={}, headers=mgr_headers)
    assert res_no_body.status_code == 400

    # Đơn hàng vẫn giữ trạng thái chờ duyệt
    check_order = client.get(f"/api/v1/orders/{order['id']}", headers=mgr_headers).json()
    assert check_order["status"] in ("PENDING", "PENDING_APPROVAL")


def test_reject_order_success(client):
    """Yêu cầu 2: Từ chối đơn thành công khi có lý do hợp lệ."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 2, "unit_price": 50.0}]},
        headers=sales_headers,
    ).json()

    res_reject = client.post(
        f"/api/v1/orders/{order['id']}/reject",
        json={"reason": "Biên lợi nhuận quá thấp, không chấp nhận giảm dưới giá sàn"},
        headers=mgr_headers,
    )
    assert res_reject.status_code == 200
    data = res_reject.json()
    assert data["status"] == "CANCELLED"
    assert "Biên lợi nhuận quá thấp" in data["approval_reason"]


def test_return_order_requires_comment(client):
    """Yêu cầu 2: Bắt buộc phải có lý do/ý kiến phản hồi khi Trả lại sửa."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 2, "unit_price": 50.0}]},
        headers=sales_headers,
    ).json()

    # Trả lại với ý kiến rỗng -> 400 Bad Request
    res_empty = client.post(f"/api/v1/orders/{order['id']}/return", json={"comment": ""}, headers=mgr_headers)
    assert res_empty.status_code == 400
    assert "bắt buộc" in res_empty.json()["detail"].lower()

    # Kiểm tra endpoint alias request-changes cũng validate rỗng -> 400
    res_alias = client.post(f"/api/v1/orders/{order['id']}/request-changes", json={}, headers=mgr_headers)
    assert res_alias.status_code == 400


def test_return_order_switches_status_to_draft(client):
    """Yêu cầu 2: Trả lại sửa thành công chuyển đơn về trạng thái DRAFT để NVKD sửa."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 2, "unit_price": 50.0}]},
        headers=sales_headers,
    ).json()

    res_return = client.post(
        f"/api/v1/orders/{order['id']}/return",
        json={"comment": "Đề nghị nâng đơn giá lên tối thiểu 85.000đ theo chính sách quý"},
        headers=mgr_headers,
    )
    assert res_return.status_code == 200
    returned_order = res_return.json()
    assert returned_order["status"] == "DRAFT"
    assert "Trả lại sửa" in returned_order["approval_reason"]
    assert "nâng đơn giá" in returned_order["approval_reason"]


# ==============================================================================
# 3. TÍCH HỢP TỒN KHO: GIỮ CHỖ TỒN (INVENTORY RESERVATION)
# ==============================================================================

def test_approve_order_activates_inventory_reservation(client):
    """Yêu cầu 3: Đơn hàng chỉ khi Quản lý duyệt mới kích hoạt giữ chỗ tồn kho (Reserved)."""
    customer, prod_id, sku, wh_id = setup_customer_and_product(
        client, floor_price=80.0, sale_price=100.0, initial_stock=100.0
    )
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    # 1. Kiểm tra tồn trước khi tạo đơn: physical=100, reserved=0, available=100
    with SessionLocal() as db:
        inv_before = db.query(Inventory).filter(Inventory.product_id == prod_id).first()
        assert inv_before.physical_qty == 100.0
        assert inv_before.reserved_qty == 0.0
        assert inv_before.available_qty == 100.0

    # 2. Tạo đơn hàng 15 sản phẩm (chờ duyệt)
    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 15, "unit_price": 70.0}]},
        headers=sales_headers,
    ).json()
    assert order["status"] in ("PENDING", "PENDING_APPROVAL")

    # 3. Khi đơn ở trạng thái chờ duyệt: Tồn kho CHƯA BỊ GIỮ CHỖ
    with SessionLocal() as db:
        inv_pending = db.query(Inventory).filter(Inventory.product_id == prod_id).first()
        assert inv_pending.reserved_qty == 0.0
        assert inv_pending.available_qty == 100.0

    # 4. Quản lý kinh doanh duyệt đơn
    approve_res = client.post(
        f"/api/v1/orders/{order['id']}/approve",
        json={"comment": "Duyệt đặc cách cho khách hàng thân thiết"},
        headers=mgr_headers,
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "APPROVED"

    # 5. Sau khi duyệt: TỒN KHO ĐƯỢC GIỮ CHỖ (reserved=15, available=85, physical=100)
    with SessionLocal() as db:
        inv_after = db.query(Inventory).filter(Inventory.product_id == prod_id).first()
        assert inv_after.physical_qty == 100.0
        assert inv_after.reserved_qty == 15.0
        assert inv_after.available_qty == 85.0


def test_reject_does_not_reserve_inventory(client):
    """Yêu cầu 3: Đơn hàng bị từ chối tuyệt đối không giữ chỗ tồn kho."""
    customer, prod_id, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0, initial_stock=50.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 20, "unit_price": 50.0}]},
        headers=sales_headers,
    ).json()

    # Từ chối đơn
    client.post(
        f"/api/v1/orders/{order['id']}/reject",
        json={"reason": "Không đồng ý giá này"},
        headers=mgr_headers,
    )

    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == prod_id).first()
        assert inv.reserved_qty == 0.0
        assert inv.available_qty == 50.0


# ==============================================================================
# 4. TÍNH TOÀN VẸN DỮ LIỆU: AUDIT LOG BẤT BIẾN (IMMUTABLE AUDIT LOG)
# ==============================================================================

def test_order_approval_history_recorded_accurately(client):
    """Yêu cầu 4: Ghi nhận lịch sử duyệt đơn chi tiết đầy đủ thông tin."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "sales_manager_bob")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 3, "unit_price": 60.0}]},
        headers=sales_headers,
    ).json()

    # 1. Hành động trả lại sửa
    client.post(
        f"/api/v1/orders/{order['id']}/return",
        json={"comment": "Lần 1: Cần nâng giá lên 75"},
        headers=mgr_headers,
    )

    # NVKD nộp lại đơn
    client.put(
        f"/api/v1/orders/{order['id']}/status?new_status=PENDING_APPROVAL",
        headers=sales_headers,
    )

    # 2. Hành động duyệt đơn
    client.post(
        f"/api/v1/orders/{order['id']}/approve",
        json={"comment": "Lần 2: Đồng ý duyệt"},
        headers=mgr_headers,
    )

    # 3. Tra cứu lịch sử duyệt đơn
    hist_res = client.get(f"/api/v1/orders/{order['id']}/approval-history", headers=mgr_headers)
    assert hist_res.status_code == 200
    histories = hist_res.json()
    assert len(histories) == 2

    # Lịch sử 1: RETURN
    assert histories[0]["action"] == "RETURN"
    assert histories[0]["performed_by"] == "sales_manager_bob"
    assert "Lần 1" in histories[0]["comment"]
    assert histories[0]["created_at"] is not None

    # Lịch sử 2: APPROVE
    assert histories[1]["action"] == "APPROVE"
    assert histories[1]["performed_by"] == "sales_manager_bob"
    assert "Lần 2" in histories[1]["comment"]


def test_order_approval_history_blocks_modify_and_delete(client):
    """Yêu cầu 4: Tuyệt đối KHÔNG có API sửa (PUT/PATCH) hoặc xoá (DELETE) đối với lịch sử duyệt đơn (405)."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "sales_rep_01")
    mgr_headers = make_token("Sales Manager", "mgr_01")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 1, "unit_price": 70.0}]},
        headers=sales_headers,
    ).json()

    client.post(f"/api/v1/orders/{order['id']}/approve", headers=mgr_headers)
    histories = client.get(f"/api/v1/orders/{order['id']}/approval-history", headers=mgr_headers).json()
    hist_id = histories[0]["id"]

    # 1. Chặn PUT, PATCH, DELETE trên /orders/{id}/approval-history -> 405 Method Not Allowed
    put_res1 = client.put(f"/api/v1/orders/{order['id']}/approval-history", json={"comment": "fake"})
    assert put_res1.status_code == 405

    patch_res1 = client.patch(f"/api/v1/orders/{order['id']}/approval-history", json={"comment": "fake"})
    assert patch_res1.status_code == 405

    del_res1 = client.delete(f"/api/v1/orders/{order['id']}/approval-history")
    assert del_res1.status_code == 405

    # 2. Chặn PUT, PATCH, DELETE trên /orders/approval-history/{history_id} -> 405 Method Not Allowed
    put_res2 = client.put(f"/api/v1/orders/approval-history/{hist_id}", json={"comment": "fake"})
    assert put_res2.status_code == 405

    patch_res2 = client.patch(f"/api/v1/orders/approval-history/{hist_id}", json={"comment": "fake"})
    assert patch_res2.status_code == 405

    del_res2 = client.delete(f"/api/v1/orders/approval-history/{hist_id}")
    assert del_res2.status_code == 405

    # 3. Chặn cập nhật tại tầng ORM (Database listener)
    with pytest.raises(Exception) as exc_info:
        with SessionLocal() as db:
            h = db.get(OrderApprovalHistory, hist_id)
            h.comment = "Cố tình sửa đổi trái phép"
            db.commit()
    assert "immutable" in str(exc_info.value).lower() or "bất biến" in str(exc_info.value).lower()


# ==============================================================================
# 5. KIỂM THỬ PHÂN QUYỀN (RBAC PERMISSION TESTS)
# ==============================================================================

def test_rbac_approval_permissions(client):
    """Yêu cầu 5: Chỉ Quản lý kinh doanh hoặc Admin mới có quyền duyệt/từ chối/trả lại đơn."""
    customer, _, sku, _ = setup_customer_and_product(client, floor_price=80.0, sale_price=100.0)
    sales_headers = make_token("Sales Rep", "rep_01")
    wh_headers = make_token("Warehouse", "wh_staff")
    acc_headers = make_token("Accountant", "accountant_01")
    cust_headers = make_token("Customer", "dealer_01")
    admin_headers = make_token("Admin", "admin_super")

    order = client.post(
        "/api/v1/orders",
        json={"customer_id": customer["id"], "items": [{"sku": sku, "quantity": 1, "unit_price": 70.0}]},
        headers=sales_headers,
    ).json()
    order_id = order["id"]

    # 1. Chưa đăng nhập -> 401 Unauthorized
    assert client.post(f"/api/v1/orders/{order_id}/approve").status_code == 401
    assert client.post(f"/api/v1/orders/{order_id}/reject", json={"reason": "X"}).status_code == 401
    assert client.post(f"/api/v1/orders/{order_id}/return", json={"comment": "X"}).status_code == 401

    # 2. Sales Rep -> 403 Forbidden
    assert client.post(f"/api/v1/orders/{order_id}/approve", headers=sales_headers).status_code == 403
    assert client.post(f"/api/v1/orders/{order_id}/reject", json={"reason": "X"}, headers=sales_headers).status_code == 403
    assert client.post(f"/api/v1/orders/{order_id}/return", json={"comment": "X"}, headers=sales_headers).status_code == 403

    # 3. Warehouse, Accountant, Customer -> 403 Forbidden
    for unauthorized_headers in (wh_headers, acc_headers, cust_headers):
        assert client.post(f"/api/v1/orders/{order_id}/approve", headers=unauthorized_headers).status_code == 403
        assert client.post(f"/api/v1/orders/{order_id}/reject", json={"reason": "X"}, headers=unauthorized_headers).status_code == 403
        assert client.post(f"/api/v1/orders/{order_id}/return", json={"comment": "X"}, headers=unauthorized_headers).status_code == 403

    # 4. Admin -> Thành công 200
    admin_approve = client.post(
        f"/api/v1/orders/{order_id}/approve",
        json={"comment": "Admin duyệt cấp cao"},
        headers=admin_headers,
    )
    assert admin_approve.status_code == 200
    assert admin_approve.json()["status"] == "APPROVED"
