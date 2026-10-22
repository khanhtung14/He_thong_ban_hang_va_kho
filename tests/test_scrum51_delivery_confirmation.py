"""SCRUM-51 delivery confirmation and failed-delivery return-to-stock coverage."""
from io import BytesIO
from pathlib import Path
import shutil
from uuid import uuid4

import pytest
from PIL import Image

from src.backend.database import SessionLocal
from src.backend.models import (
    Customer, DeliveryConfirmation, DeliveryProofImage, Dispatch, DispatchItem, Inventory, InventoryLot, InventoryStock,
    InventoryTransaction, Order, Product, Warehouse,
)
from src.backend.rbac import create_access_token


def auth(role="Warehouse", warehouse_id=None):
    claims = {"sub": f"scrum51-{role}", "role": role}
    if warehouse_id is not None:
        claims["warehouse_id"] = warehouse_id
        claims["warehouse_ids"] = [warehouse_id]
    return {"Authorization": f"Bearer {create_access_token(claims)}"}


def make_dispatch(quantity=4, lot_number="LOT-S51"):
    with SessionLocal() as db:
        suffix = uuid4().hex[:10]
        customer = Customer(code=f"S51-{suffix}", name="SCRUM-51 customer")
        warehouse = Warehouse(code=f"S51-{suffix}", name="SCRUM-51 warehouse", is_active=True)
        product = Product(sku=f"S51-{suffix}", name="SCRUM-51 product", base_unit="case")
        db.add_all([customer, warehouse, product])
        db.flush()
        order = Order(order_code=f"S51-{suffix}", customer_id=customer.id)
        db.add(order)
        db.flush()
        dispatch = Dispatch(order_id=order.id, status="SHIPPED")
        db.add(dispatch)
        db.flush()
        item = DispatchItem(dispatch_id=dispatch.id, product_id=product.id, lot_number=lot_number, actual_qty=quantity)
        db.add(item)
        db.commit()
        return dispatch.id, order.id, warehouse.id, product.id, lot_number


def jpeg_bytes():
    output = BytesIO()
    Image.new("RGB", (8, 8), "white").save(output, format="JPEG")
    return output.getvalue()


def test_pending_dispatch_list_only_returns_shipped_dispatches(client):
    pending_id, pending_order_id, warehouse_id, _, _ = make_dispatch()
    completed_id, _, _, _, _ = make_dispatch()
    with SessionLocal() as db:
        db.get(Dispatch, completed_id).status = "DELIVERED"
        db.commit()

    response = client.get(
        "/api/v1/deliveries/pending-confirmations",
        headers=auth("Warehouse", warehouse_id),
    )

    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    listed = response.json()["data"]
    assert {row["dispatchId"] for row in listed} >= {pending_id}
    assert completed_id not in {row["dispatchId"] for row in listed}
    assert next(row for row in listed if row["dispatchId"] == pending_id)["orderId"] == pending_order_id


def test_pending_dispatch_list_requires_delivery_role_and_valid_limit(client):
    assert client.get("/api/v1/deliveries/pending-confirmations").status_code == 401
    assert client.get(
        "/api/v1/deliveries/pending-confirmations",
        headers=auth("Accountant"),
    ).status_code == 403
    assert client.get(
        "/api/v1/deliveries/pending-confirmations?limit=0",
        headers=auth("Warehouse"),
    ).status_code == 422


@pytest.fixture
def proof_dir(monkeypatch):
    from app.api.v1.endpoints import deliveries

    directory = Path(__file__).parent / ".scrum51_uploads"
    directory.mkdir(exist_ok=True)
    monkeypatch.setattr(deliveries, "PROOF_DIR", directory)
    yield directory
    shutil.rmtree(directory, ignore_errors=True)


def test_successful_delivery_saves_pod_and_allows_invoice(client, proof_dir):
    dispatch_id, order_id, warehouse_id, _, _ = make_dispatch()
    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={
            "receiverName": "Receiver B",
            "receivedDate": "2026-10-20T10:30:00+07:00",
            "note": "Đã ký nhận",
            "deliveryStatus": "DELIVERED",
        },
        files=[("proofImages", ("proof.jpg", jpeg_bytes(), "image/jpeg"))],
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["deliveryStatus"] == "DELIVERED"
    assert len(response.json()["data"]["proofImages"]) == 1
    assert list(proof_dir.rglob("*.jpg"))
    proof = client.get(response.json()["data"]["proofImages"][0], headers=auth("Warehouse", warehouse_id))
    assert proof.status_code == 200
    with SessionLocal() as db:
        dispatch = db.get(Dispatch, dispatch_id)
        order = db.get(Order, order_id)
        confirmation = db.query(DeliveryConfirmation).filter_by(dispatch_id=dispatch_id).one()
        proof_image = db.query(DeliveryProofImage).filter_by(confirmation_id=confirmation.id).one()
        assert dispatch.status == "DELIVERED"
        assert order.status.value == "DELIVERED"
        assert confirmation.receiver_name == "Receiver B"
        assert confirmation.received_date.isoformat().startswith("2026-10-20T10:30:00")
        assert proof_image.file_name.startswith(f"{dispatch_id}/")
    # A separate request simulates a page reload and verifies the persisted URL still serves the proof.
    reloaded_proof = client.get(response.json()["data"]["proofImages"][0], headers=auth("Warehouse", warehouse_id))
    assert reloaded_proof.status_code == 200
    assert Image.open(BytesIO(reloaded_proof.content)).format == "JPEG"
    reloaded_confirmation = client.get(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
    )
    assert reloaded_confirmation.status_code == 200
    assert reloaded_confirmation.json()["data"]["orderId"] == order_id
    assert reloaded_confirmation.json()["data"]["receiverName"] == "Receiver B"
    assert reloaded_confirmation.json()["data"]["proofImages"] == response.json()["data"]["proofImages"]
    invoice = client.post(
        "/api/v1/invoices/from-dispatch",
        headers=auth("Accountant"),
        json={"dispatch_id": dispatch_id, "invoice_date": "2026-10-20", "payment_term_days": 30},
    )
    assert invoice.status_code == 200, invoice.text


def test_success_requires_signed_proof_image(client):
    dispatch_id, _, warehouse_id, _, _ = make_dispatch()
    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"receiverName": "Người nhận", "receivedDate": "2026-10-20T10:30:00+07:00"},
    )
    assert response.status_code == 422
    with SessionLocal() as db:
        assert db.get(Dispatch, dispatch_id).status == "SHIPPED"


def test_success_requires_non_blank_receiver_and_delivery_time(client):
    for data in (
        {"receiverName": "   ", "receivedDate": "2026-10-20T10:30:00+07:00"},
        {"receiverName": "NgÆ°á»i nháº­n"},
    ):
        dispatch_id, _, warehouse_id, _, _ = make_dispatch()
        response = client.post(
            f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
            headers=auth("Warehouse", warehouse_id),
            data=data,
            files=[("proofImages", ("proof.jpg", jpeg_bytes(), "image/jpeg"))],
        )
        assert response.status_code == 422
        with SessionLocal() as db:
            assert db.get(Dispatch, dispatch_id).status == "SHIPPED"


def test_invalid_proof_image_is_rejected_without_changing_dispatch(client):
    dispatch_id, _, warehouse_id, _, _ = make_dispatch()
    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"receiverName": "Người nhận", "receivedDate": "2026-10-20T10:30:00+07:00"},
        files=[("proofImages", ("proof.txt", b"not an image", "text/plain"))],
    )
    assert response.status_code == 400
    with SessionLocal() as db:
        assert db.get(Dispatch, dispatch_id).status == "SHIPPED"


def test_oversized_and_too_many_proof_images_are_rejected(client):
    dispatch_id, _, warehouse_id, _, _ = make_dispatch()
    data = {"receiverName": "NgÆ°á»i nháº­n", "receivedDate": "2026-10-20T10:30:00+07:00"}
    oversized = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data=data,
        files=[("proofImages", ("large.jpg", b"x" * (5 * 1024 * 1024 + 1), "image/jpeg"))],
    )
    assert oversized.status_code == 400
    too_many = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data=data,
        files=[("proofImages", (f"proof-{index}.jpg", jpeg_bytes(), "image/jpeg")) for index in range(6)],
    )
    assert too_many.status_code == 400
    with SessionLocal() as db:
        assert db.get(Dispatch, dispatch_id).status == "SHIPPED"


def test_failed_delivery_requires_reason_and_returns_all_goods_to_selected_warehouse(client):
    dispatch_id, order_id, warehouse_id, product_id, lot_number = make_dispatch()
    missing_reason = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"deliveryStatus": "FAILED", "returnWarehouseId": str(warehouse_id)},
    )
    assert missing_reason.status_code == 422

    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={
            "deliveryStatus": "FAILED",
            "failureReason": "CUSTOMER_CLOSED",
            "returnWarehouseId": str(warehouse_id),
            "note": "Đóng cửa trong giờ giao",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["deliveryStatus"] == "FAILED"
    persisted_result = client.get(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
    )
    assert persisted_result.status_code == 200
    assert persisted_result.json()["data"]["failureReason"] == "CUSTOMER_CLOSED"
    assert persisted_result.json()["data"]["proofImages"] == []
    with SessionLocal() as db:
        dispatch = db.get(Dispatch, dispatch_id)
        order = db.get(Order, order_id)
        inventory = db.query(Inventory).filter_by(product_id=product_id, warehouse_id=warehouse_id).one()
        lot = db.query(InventoryLot).filter_by(product_id=product_id, warehouse_id=warehouse_id, lot_number=lot_number).one()
        stock = db.query(InventoryStock).filter_by(product_id=product_id, warehouse_id=warehouse_id).one()
        transaction = db.query(InventoryTransaction).filter_by(product_id=product_id, warehouse_id=warehouse_id).one()
        assert dispatch.status == "DELIVERY_FAILED"
        assert order.status.value == "DELIVERY_FAILED"
        assert inventory.physical_qty == inventory.available_qty == 4
        assert lot.quantity == 4
        assert stock.base_quantity == 4
        assert transaction.transaction_type == "IN"
        assert transaction.base_quantity == 4
    invoice = client.post(
        "/api/v1/invoices/from-dispatch",
        headers=auth("Accountant"),
        json={"dispatch_id": dispatch_id, "invoice_date": "2026-10-20", "payment_term_days": 30},
    )
    assert invoice.status_code == 409


def test_delivery_confirmation_enforces_role_and_is_idempotent(client):
    dispatch_id, _, warehouse_id, _, _ = make_dispatch()
    forbidden = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Customer"),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": str(warehouse_id)},
    )
    assert forbidden.status_code == 403

    first = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": str(warehouse_id)},
    )
    assert first.status_code == 200
    repeated = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": str(warehouse_id)},
    )
    assert repeated.status_code == 409


def test_warehouse_cannot_return_goods_to_an_unassigned_warehouse(client):
    dispatch_id, _, warehouse_id, product_id, _ = make_dispatch()
    other_warehouse = Warehouse(code=f"S51-OTHER-{uuid4().hex[:8]}", name="Other warehouse", is_active=True)
    with SessionLocal() as db:
        db.add(other_warehouse)
        db.commit()
        other_warehouse_id = other_warehouse.id
    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": str(other_warehouse_id)},
    )
    assert response.status_code == 403
    with SessionLocal() as db:
        assert db.get(Dispatch, dispatch_id).status == "SHIPPED"
        assert db.query(Inventory).filter_by(product_id=product_id, warehouse_id=other_warehouse_id).first() is None


def test_missing_or_already_completed_dispatch_is_rejected(client):
    missing = client.post(
        "/api/v1/deliveries/99999999/confirm-pod",
        headers=auth("Warehouse"),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": "1"},
    )
    assert missing.status_code == 404

    dispatch_id, _, warehouse_id, _, _ = make_dispatch()
    with SessionLocal() as db:
        dispatch = db.get(Dispatch, dispatch_id)
        dispatch.status = "DELIVERED"
        db.commit()
    completed = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        headers=auth("Warehouse", warehouse_id),
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": str(warehouse_id)},
    )
    assert completed.status_code == 409


def test_confirmation_requires_authentication(client):
    dispatch_id, _, _, _, _ = make_dispatch()
    response = client.post(
        f"/api/v1/deliveries/{dispatch_id}/confirm-pod",
        data={"deliveryStatus": "FAILED", "failureReason": "OTHER", "returnWarehouseId": "1"},
    )
    assert response.status_code in {401, 403}
