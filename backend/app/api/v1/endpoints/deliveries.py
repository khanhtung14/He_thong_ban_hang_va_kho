"""Delivery result confirmation and proof of delivery."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
import math
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, normalize_role, require_roles
from app.core.database import get_db
from app.models.models import (
    DeliveryConfirmation, DeliveryProofImage, Dispatch, DispatchItem,
    Inventory, InventoryLot, InventoryStock, InventoryTransaction, Order,
    OrderStatus, Product, User, Warehouse,
)
from app.services.order_tracking_service import record_order_status_transition

router = APIRouter(prefix="/api/v1/deliveries", tags=["Deliveries"])
PROOF_DIR = Path("uploads/delivery-proofs")
MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGES = 5
FAILURE_REASONS = {
    "CUSTOMER_CLOSED", "CUSTOMER_REFUSED", "NO_CONTACT", "ADDRESS_NOT_FOUND", "OTHER"
}


class DeliveryConfirmationData(BaseModel):
    dispatchId: int
    orderId: int
    deliveryStatus: Literal["DELIVERED", "FAILED"]
    proofImages: list[str]
    returnWarehouseId: Optional[int]


class DeliveryConfirmationResponse(BaseModel):
    success: bool
    code: int
    data: DeliveryConfirmationData


class DeliveryConfirmationRecord(BaseModel):
    dispatchId: int
    orderId: int
    deliveryStatus: Literal["DELIVERED", "FAILED"]
    receiverName: Optional[str]
    receivedDate: Optional[datetime]
    note: Optional[str]
    failureReason: Optional[str]
    proofImages: list[str]
    returnWarehouseId: Optional[int]


class DeliveryConfirmationRecordResponse(BaseModel):
    success: bool
    code: int
    data: DeliveryConfirmationRecord


class PendingDispatchData(BaseModel):
    dispatchId: int
    orderId: int


class PendingDispatchesResponse(BaseModel):
    success: bool
    code: int
    data: list[PendingDispatchData]


def _warehouse_scope(user: AuthenticatedUser, db: Session) -> list[int]:
    if user.warehouse_ids:
        return user.warehouse_ids
    account = db.query(User).filter(User.username == user.username).first()
    return [warehouse.id for warehouse in account.warehouses if warehouse.is_active] if account else []


def _validated_images(files: list[UploadFile]) -> list[tuple[UploadFile, bytes]]:
    if len(files) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Tối đa {MAX_IMAGES} ảnh chứng từ.")
    validated = []
    for file in files:
        content = file.file.read(MAX_IMAGE_SIZE + 1)
        file.file.seek(0)
        if not content or len(content) > MAX_IMAGE_SIZE:
            raise HTTPException(status_code=400, detail="Mỗi ảnh phải có dung lượng từ 1 byte đến 5 MB.")
        try:
            image = Image.open(BytesIO(content))
            image.verify()
            if image.format not in {"JPEG", "PNG"}:
                raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh JPG hoặc PNG.")
            if image.width * image.height > 40_000_000:
                raise HTTPException(status_code=400, detail="Kích thước ảnh quá lớn để xử lý.")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise HTTPException(status_code=400, detail="File tải lên không phải ảnh hợp lệ.")
        validated.append((file, content))
    return validated


@router.post("/{dispatch_id}/confirm-pod", response_model=DeliveryConfirmationResponse)
async def confirm_delivery(
    dispatch_id: int,
    receiver_name: Optional[str] = Form(None, alias="receiverName", max_length=150),
    received_date: Optional[datetime] = Form(None, alias="receivedDate"),
    note: Optional[str] = Form(None, max_length=2000),
    proof_images: list[UploadFile] = File(default=[], alias="proofImages"),
    delivery_status: Literal["DELIVERED", "FAILED"] = Form("DELIVERED", alias="deliveryStatus"),
    failure_reason: Optional[Literal["CUSTOMER_CLOSED", "CUSTOMER_REFUSED", "NO_CONTACT", "ADDRESS_NOT_FOUND", "OTHER"]] = Form(None, alias="failureReason"),
    return_warehouse_id: Optional[int] = Form(None, alias="returnWarehouseId", gt=0),
    user: AuthenticatedUser = Depends(require_roles("Warehouse", "Sales Rep")),
    db: Session = Depends(get_db),
):
    """Confirm successful delivery or record a failed delivery and return goods."""
    role = normalize_role(user.role)
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất.")
    if dispatch.status != "SHIPPED":
        raise HTTPException(status_code=409, detail="Phiếu xuất không ở trạng thái đang giao hoặc đã được xác nhận.")
    if db.query(DeliveryConfirmation).filter_by(dispatch_id=dispatch_id).first():
        raise HTTPException(status_code=409, detail="Phiếu xuất đã có kết quả giao hàng.")

    if delivery_status == "DELIVERED":
        receiver_name = (receiver_name or "").strip()
        if not receiver_name:
            raise HTTPException(status_code=422, detail="Vui lòng nhập người nhận.")
        if received_date is None:
            raise HTTPException(status_code=422, detail="Vui lòng nhập thời điểm giao hàng.")
        if not proof_images:
            raise HTTPException(status_code=422, detail="Vui lòng tải lên ít nhất một ảnh chứng từ có chữ ký.")
        if failure_reason or return_warehouse_id:
            raise HTTPException(status_code=422, detail="Không gửi thông tin giao thất bại khi giao thành công.")
    else:
        if failure_reason not in FAILURE_REASONS:
            raise HTTPException(status_code=422, detail="Vui lòng chọn lý do giao không thành công hợp lệ.")
        if return_warehouse_id is None:
            raise HTTPException(status_code=422, detail="Vui lòng chọn kho nhận lại hàng.")
        if receiver_name or received_date or proof_images:
            raise HTTPException(status_code=422, detail="Thông tin người nhận và ảnh chứng từ chỉ áp dụng khi giao thành công.")
        warehouse = db.get(Warehouse, return_warehouse_id)
        if warehouse is None or not warehouse.is_active:
            raise HTTPException(status_code=422, detail="Kho nhận hàng không tồn tại hoặc đã ngừng hoạt động.")
        if role == "Warehouse" and return_warehouse_id not in _warehouse_scope(user, db):
            raise HTTPException(status_code=403, detail="Bạn không được thao tác ngoài kho đã được phân công.")

    images = _validated_images(proof_images) if proof_images else []
    items = db.query(DispatchItem).filter(DispatchItem.dispatch_id == dispatch_id).all()
    if not items:
        raise HTTPException(status_code=409, detail="Phiếu xuất chưa có mặt hàng để xác nhận.")
    if any(not math.isfinite(item.actual_qty) or item.actual_qty <= 0 for item in items):
        raise HTTPException(status_code=409, detail="Phiếu xuất có số lượng thực tế không hợp lệ.")
    return_quantities: dict[tuple[int, Optional[str]], float] = {}
    if delivery_status == "FAILED":
        for item in items:
            key = (item.product_id, item.lot_number)
            return_quantities[key] = return_quantities.get(key, 0.0) + item.actual_qty
    order = db.get(Order, dispatch.order_id)
    if order is None:
        raise HTTPException(status_code=409, detail="Đơn hàng liên kết với phiếu xuất không tồn tại.")

    saved_paths: list[Path] = []
    try:
        confirmation = DeliveryConfirmation(
            dispatch_id=dispatch.id,
            result=delivery_status,
            receiver_name=receiver_name if delivery_status == "DELIVERED" else None,
            received_date=received_date if delivery_status == "DELIVERED" else None,
            note=(note or "").strip() or None,
            failure_reason=failure_reason if delivery_status == "FAILED" else None,
            return_warehouse_id=return_warehouse_id if delivery_status == "FAILED" else None,
            confirmed_by=user.username,
        )
        db.add(confirmation)
        db.flush()

        if delivery_status == "DELIVERED":
            dispatch.status = "DELIVERED"
            order.status = OrderStatus.DELIVERED
            record_order_status_transition(
                db, order, order.status,
                note=(note or "").strip() or "Đã xác nhận giao thành công.",
                actor_username=user.username,
            )
            directory = PROOF_DIR / str(dispatch.id)
            directory.mkdir(parents=True, exist_ok=True)
            for _, content in images:
                filename = f"{uuid4().hex}.jpg"
                path = directory / filename
                with Image.open(BytesIO(content)) as image:
                    image.convert("RGB").save(path, format="JPEG", quality=90)
                saved_paths.append(path)
                db.add(DeliveryProofImage(confirmation_id=confirmation.id, file_name=f"{dispatch.id}/{filename}"))
        else:
            dispatch.status = "DELIVERY_FAILED"
            order.status = OrderStatus.DELIVERY_FAILED
            record_order_status_transition(
                db, order, order.status,
                note=failure_reason or "Giao hàng không thành công.",
                actor_username=user.username,
            )
            for (product_id, lot_number), quantity in return_quantities.items():
                inventory = (
                    db.query(Inventory)
                    .filter_by(product_id=product_id, warehouse_id=return_warehouse_id)
                    .with_for_update()
                    .first()
                )
                if inventory is None:
                    inventory = Inventory(product_id=product_id, warehouse_id=return_warehouse_id)
                    db.add(inventory)
                    db.flush()
                inventory.physical_qty += quantity
                inventory.available_qty = max(0, inventory.physical_qty - inventory.reserved_qty)

                if lot_number:
                    lot = (
                        db.query(InventoryLot)
                        .filter_by(product_id=product_id, warehouse_id=return_warehouse_id, lot_number=lot_number)
                        .with_for_update()
                        .first()
                    )
                    if lot is None:
                        source_lot = (
                            db.query(InventoryLot)
                            .filter_by(product_id=product_id, lot_number=lot_number)
                            .first()
                        )
                        lot = InventoryLot(
                            product_id=product_id,
                            warehouse_id=return_warehouse_id,
                            lot_number=lot_number,
                            mfg_date=source_lot.mfg_date if source_lot else None,
                            exp_date=source_lot.exp_date if source_lot else None,
                            quantity=0,
                        )
                        db.add(lot)
                    lot.quantity += quantity

                product = db.get(Product, product_id)
                stock = (
                    db.query(InventoryStock)
                    .filter_by(product_id=product_id, warehouse_id=return_warehouse_id)
                    .with_for_update()
                    .first()
                )
                if stock is None:
                    stock = InventoryStock(product_id=product_id, warehouse_id=return_warehouse_id, base_quantity=0)
                    db.add(stock)
                stock.base_quantity += quantity
                db.add(InventoryTransaction(
                    product_id=product_id,
                    warehouse_id=return_warehouse_id,
                    transaction_type="IN",
                    unit_name=product.base_unit if product else "Đơn vị cơ sở",
                    input_quantity=quantity,
                    conversion_rate_snapshot=1,
                    base_quantity=quantity,
                ))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="Phiếu xuất vừa được xác nhận ở một thao tác khác.") from exc
    except Exception as exc:
        db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Không thể lưu kết quả giao hàng.") from exc

    proof_urls = [f"/api/v1/deliveries/proofs/{Path(filename).name}" for filename in (
        proof.file_name for proof in db.query(DeliveryProofImage).filter_by(confirmation_id=confirmation.id).all()
    )]
    return {
        "success": True,
        "code": 200,
        "data": {
            "dispatchId": dispatch.id,
            "orderId": order.id,
            "deliveryStatus": delivery_status,
            "proofImages": proof_urls,
            "returnWarehouseId": return_warehouse_id,
        },
    }


@router.get("/pending-confirmations", response_model=PendingDispatchesResponse)
def list_pending_delivery_confirmations(
    limit: int = Query(100, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_roles("Warehouse", "Sales Rep")),
    db: Session = Depends(get_db),
):
    """List shipped dispatches that are ready for a delivery result."""
    confirmed_dispatch_ids = db.query(DeliveryConfirmation.dispatch_id)
    dispatches = (
        db.query(Dispatch)
        .filter(Dispatch.status == "SHIPPED", ~Dispatch.id.in_(confirmed_dispatch_ids))
        .order_by(Dispatch.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "code": 200,
        "data": [{"dispatchId": dispatch.id, "orderId": dispatch.order_id} for dispatch in dispatches],
    }


@router.get("/{dispatch_id}/confirm-pod", response_model=DeliveryConfirmationRecordResponse)
def get_delivery_confirmation(
    dispatch_id: int,
    user: AuthenticatedUser = Depends(require_roles("Warehouse", "Sales Rep")),
    db: Session = Depends(get_db),
):
    """Retrieve a persisted delivery result and its proof URLs by dispatch."""
    dispatch = db.get(Dispatch, dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu xuất.")
    confirmation = db.query(DeliveryConfirmation).filter_by(dispatch_id=dispatch_id).first()
    if confirmation is None:
        raise HTTPException(status_code=404, detail="Phiếu xuất chưa có kết quả giao hàng.")
    proof_images = db.query(DeliveryProofImage).filter_by(confirmation_id=confirmation.id).all()
    return {
        "success": True,
        "code": 200,
        "data": {
            "dispatchId": dispatch.id,
            "orderId": dispatch.order_id,
            "deliveryStatus": confirmation.result,
            "receiverName": confirmation.receiver_name,
            "receivedDate": confirmation.received_date,
            "note": confirmation.note,
            "failureReason": confirmation.failure_reason,
            "proofImages": [f"/api/v1/deliveries/proofs/{Path(image.file_name).name}" for image in proof_images],
            "returnWarehouseId": confirmation.return_warehouse_id,
        },
    }


@router.get("/proofs/{filename}")
def get_delivery_proof(
    filename: str,
    _: AuthenticatedUser = Depends(require_roles("Warehouse", "Sales Rep")),
):
    """Return a stored JPEG proof image for the URLs returned by confirm-pod."""
    safe_name = Path(filename).name
    match = next((path for path in PROOF_DIR.glob(f"*/{safe_name}") if path.is_file()), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh chứng từ.")
    return FileResponse(match, media_type="image/jpeg")

