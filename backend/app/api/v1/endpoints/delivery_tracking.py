"""Customer and assigned sales-rep order delivery tracking (SCRUM-52)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, normalize_role, require_roles
from app.core.database import get_db
from app.models.models import (
    Customer, DeliveryAddress, DeliveryConfirmation, DeliveryTripDispatch,
    Dispatch, DispatchItem, Order, OrderItem, OrderStatus, OrderStatusHistory,
    PickList, Product, RoleCode, User,
)

router = APIRouter(prefix="/api/v1/deliveries/track", tags=["Delivery tracking"])

TimelineState = Literal["completed", "current", "pending", "exception"]


class TrackingStats(BaseModel):
    totalOrders: int
    processingOrders: int
    inDeliveryOrders: int
    deliveredOrders: int
    problemOrders: int


class TrackingOrderSummary(BaseModel):
    orderId: int
    orderCode: str
    createdAt: Optional[datetime]
    currentStatus: str
    lineCount: int
    deliveryProgress: Optional[int]
    lastUpdatedAt: Optional[datetime]


class TrackingOrderListData(BaseModel):
    stats: TrackingStats
    items: list[TrackingOrderSummary]
    page: int
    pageSize: int
    total: int


class TrackingOrderListResponse(BaseModel):
    success: bool
    code: int
    data: TrackingOrderListData


class TrackingTimelineMilestone(BaseModel):
    status: str
    label: str
    state: TimelineState
    occurredAt: Optional[datetime]
    note: Optional[str]


class TrackingOrderItem(BaseModel):
    orderItemId: int
    sku: Optional[str]
    productName: str
    unitName: Optional[str]
    orderedQuantity: float
    actualDeliveredQuantity: Optional[float]
    quantityDifference: Optional[float]
    note: Optional[str]


class TrackingDispatch(BaseModel):
    dispatchId: int
    status: str
    dispatchedAt: Optional[datetime]
    deliveryStatus: Optional[str]
    failureReason: Optional[str]
    confirmedAt: Optional[datetime]
    note: Optional[str]


class TrackingOrderDetailData(BaseModel):
    orderId: int
    orderCode: str
    createdAt: Optional[datetime]
    currentStatus: str
    lastUpdatedAt: Optional[datetime]
    recipientName: Optional[str]
    deliveryAddress: Optional[str]
    timeline: list[TrackingTimelineMilestone]
    items: list[TrackingOrderItem]
    dispatches: list[TrackingDispatch]


class TrackingOrderDetailResponse(BaseModel):
    success: bool
    code: int
    data: TrackingOrderDetailData


STAGES = [
    ("APPROVED", "Đã duyệt"),
    ("PREPARING", "Đang soạn"),
    ("DISPATCHED", "Đã xuất"),
    ("IN_DELIVERY", "Đang giao"),
    ("DELIVERED", "Đã giao"),
]
ORDERED_STATUSES = {"DRAFT", "PENDING", "PENDING_APPROVAL"}
PROBLEM_STATUSES = {"DELIVERY_FAILED", "CANCELLED"}


def _accessible_customer_ids(db: Session, user: AuthenticatedUser) -> list[int]:
    account = db.query(User).filter(User.username == user.username).first()
    if account is None:
        raise HTTPException(status_code=403, detail="Không tìm thấy tài khoản đang đăng nhập.")
    role = normalize_role(user.role)
    if role == RoleCode.CUSTOMER.value:
        if account.customer_id is None:
            raise HTTPException(status_code=403, detail="Tài khoản chưa được gắn với hồ sơ đại lý.")
        return [account.customer_id]
    if role == RoleCode.SALES_REP.value:
        return [customer_id for (customer_id,) in db.query(Customer.id).filter(Customer.sales_rep_id == account.id).all()]
    raise HTTPException(status_code=403, detail="Tài khoản không có quyền theo dõi đơn hàng.")


def _load_order_tracking(db: Session, order: Order) -> dict:
    order_items = db.query(OrderItem).filter(OrderItem.order_id == order.id).order_by(OrderItem.id).all()
    pick_lists = db.query(PickList).filter(PickList.order_id == order.id).order_by(PickList.id).all()
    dispatches = db.query(Dispatch).filter(Dispatch.order_id == order.id).order_by(Dispatch.id).all()
    dispatch_ids = [dispatch.id for dispatch in dispatches]
    confirmations = db.query(DeliveryConfirmation).filter(DeliveryConfirmation.dispatch_id.in_(dispatch_ids)).all() if dispatch_ids else []
    confirmation_by_dispatch = {confirmation.dispatch_id: confirmation for confirmation in confirmations}
    trip_links = db.query(DeliveryTripDispatch).filter(DeliveryTripDispatch.dispatch_id.in_(dispatch_ids)).all() if dispatch_ids else []
    histories = db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == order.id).order_by(OrderStatusHistory.created_at, OrderStatusHistory.id).all()
    dispatch_items = db.query(DispatchItem, Product).join(Product, Product.id == DispatchItem.product_id).filter(DispatchItem.dispatch_id.in_(dispatch_ids)).all() if dispatch_ids else []

    delivered_dispatches = {
        dispatch.id for dispatch in dispatches
        if confirmation_by_dispatch.get(dispatch.id) is not None
        and confirmation_by_dispatch[dispatch.id].result == "DELIVERED"
    }
    failed_dispatches = {
        dispatch.id for dispatch in dispatches
        if confirmation_by_dispatch.get(dispatch.id) is not None
        and confirmation_by_dispatch[dispatch.id].result == "FAILED"
    }
    active_dispatches = {dispatch.id for dispatch in dispatches if dispatch.status == "SHIPPED"}
    all_dispatches_delivered = bool(dispatches) and len(delivered_dispatches) == len(dispatches)
    has_failed_delivery = bool(failed_dispatches)
    has_active_trip = any(link.dispatch_id in active_dispatches for link in trip_links)

    if all_dispatches_delivered or order.status == OrderStatus.DELIVERED:
        current_status = "DELIVERED"
    elif active_dispatches and has_active_trip:
        current_status = "IN_DELIVERY"
    elif active_dispatches:
        current_status = "DISPATCHED"
    elif dispatches and has_failed_delivery:
        current_status = "DELIVERY_FAILED"
    elif pick_lists or order.status == OrderStatus.PROCESSING:
        current_status = "PREPARING"
    elif order.status == OrderStatus.APPROVED:
        current_status = "APPROVED"
    else:
        current_status = getattr(order.status, "value", str(order.status))

    latest_times = [order.updated_at, order.created_at]
    latest_times.extend(dispatch.created_at for dispatch in dispatches)
    latest_times.extend(link.created_at for link in trip_links)
    latest_times.extend(confirmation.created_at for confirmation in confirmations)
    latest_times.extend(history.created_at for history in histories)
    last_updated = max((value for value in latest_times if value is not None), default=None)

    stage_times: dict[str, Optional[datetime]] = {stage: None for stage, _ in STAGES}
    stage_notes: dict[str, Optional[str]] = {stage: None for stage, _ in STAGES}
    for history in histories:
        status = history.status.upper()
        if status == "APPROVED":
            stage_times["APPROVED"] = history.created_at
            stage_notes["APPROVED"] = history.note
        elif status == "PROCESSING":
            stage_times["PREPARING"] = history.created_at
            stage_notes["PREPARING"] = history.note
    if stage_times["PREPARING"] is None and pick_lists:
        stage_times["PREPARING"] = pick_lists[0].created_at
    if dispatches:
        stage_times["DISPATCHED"] = min((d.created_at for d in dispatches if d.created_at), default=None)
    if trip_links:
        stage_times["IN_DELIVERY"] = min((link.created_at for link in trip_links if link.created_at), default=None)
    if confirmations:
        stage_times["DELIVERED"] = min((c.created_at for c in confirmations if c.result == "DELIVERED"), default=None)

    approved_evidence = (
        stage_times["APPROVED"] is not None
        or order.status in {OrderStatus.APPROVED, OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED}
        or bool(pick_lists)
        or bool(dispatches)
    )
    preparing_evidence = bool(pick_lists) or order.status == OrderStatus.PROCESSING or bool(dispatches)
    dispatched_evidence = bool(dispatches)
    in_delivery_evidence = has_active_trip or bool(confirmations)
    evidence = {
        "APPROVED": approved_evidence,
        "PREPARING": preparing_evidence,
        "DISPATCHED": dispatched_evidence,
        "IN_DELIVERY": in_delivery_evidence,
        "DELIVERED": all_dispatches_delivered,
    }
    current_index = next((index for index, (stage, _) in enumerate(STAGES) if stage == current_status), None)
    failure_confirmation = next((confirmation for confirmation in confirmations if confirmation.result == "FAILED"), None)
    timeline = []
    for index, (stage, label) in enumerate(STAGES):
        if stage == "IN_DELIVERY" and failure_confirmation and not all_dispatches_delivered and not active_dispatches:
            state: TimelineState = "exception"
            occurred_at = failure_confirmation.created_at
            note = failure_confirmation.failure_reason or failure_confirmation.note
        elif evidence[stage] and (current_index is None or index < current_index or stage == current_status):
            state = "current" if stage == current_status else "completed"
            occurred_at = stage_times[stage]
            note = stage_notes[stage]
        else:
            state = "pending"
            occurred_at = stage_times[stage] if evidence[stage] else None
            note = stage_notes[stage]
        timeline.append(TrackingTimelineMilestone(
            status=stage, label=label, state=state, occurredAt=occurred_at, note=note,
        ))

    product_by_id = {product.id: product for _, product in dispatch_items}
    item_keys: dict[tuple[str, object], list[OrderItem]] = {}
    for item in order_items:
        product = db.get(Product, item.product_id) if item.product_id else None
        sku = (item.sku or (product.sku if product else None) or "").strip().upper()
        key = ("id", item.product_id) if item.product_id is not None else (("sku", sku) if sku else ("item", item.id))
        item_keys.setdefault(key, []).append(item)

    delivered_by_key: dict[tuple[str, object], float] = {}
    seen_data_by_key: dict[tuple[str, object], bool] = {}
    matched_dispatch_ids_by_key: dict[tuple[str, object], set[int]] = {}
    for dispatch_item, product in dispatch_items:
        product_key = ("id", dispatch_item.product_id)
        sku_key = ("sku", (product.sku or "").strip().upper())
        key = product_key if product_key in item_keys else sku_key if sku_key in item_keys else None
        if key is None:
            continue
        seen_data_by_key[key] = True
        matched_dispatch_ids_by_key.setdefault(key, set()).add(dispatch_item.dispatch_id)
        confirmation = confirmation_by_dispatch.get(dispatch_item.dispatch_id)
        if confirmation and confirmation.result == "DELIVERED":
            delivered_by_key[key] = delivered_by_key.get(key, 0.0) + float(dispatch_item.actual_qty or 0.0)

    product_name_by_id = {product.id: product.name for product in product_by_id.values()}
    tracking_items = []
    for item in order_items:
        product = db.get(Product, item.product_id) if item.product_id else None
        sku = item.sku or (product.sku if product else None)
        product_name = item.product_name or (product.name if product else None) or "Sản phẩm không xác định"
        key = ("id", item.product_id) if item.product_id is not None else (("sku", sku.strip().upper()) if sku else ("item", item.id))
        same_product_items = item_keys.get(key, [])
        matched_dispatch_ids = matched_dispatch_ids_by_key.get(key, set())
        all_matching_confirmed = bool(matched_dispatch_ids) and matched_dispatch_ids.issubset(delivered_dispatches | failed_dispatches)
        ambiguous = len(same_product_items) > 1
        has_dispatch_data = bool(seen_data_by_key.get(key))
        conversion_factor = float(item.conversion_factor or 1)
        actual_quantity: Optional[float]
        difference: Optional[float]
        note: Optional[str] = None
        if ambiguous:
            actual_quantity = None
            difference = None
            note = "Không thể đối chiếu chính xác với phiếu xuất của dòng hàng này."
        elif has_dispatch_data and matched_dispatch_ids:
            # A successful confirmation records delivery of the whole dispatch; failed dispatches were returned to stock.
            actual_quantity = delivered_by_key.get(key, 0.0) / conversion_factor
            if not all_matching_confirmed:
                difference = None
                note = "Còn phiếu chưa có kết quả giao; số chênh lệch chưa thể chốt."
            else:
                difference = actual_quantity - float(item.quantity or 0)
                if difference < 0:
                    note = "Số thực giao thấp hơn số lượng đặt."
        else:
            actual_quantity = None
            difference = None
            note = "Chưa có đủ dữ liệu phiếu xuất để xác nhận số lượng thực giao."
        tracking_items.append(TrackingOrderItem(
            orderItemId=item.id,
            sku=sku,
            productName=product_name,
            unitName=item.unit_name,
            orderedQuantity=float(item.quantity or 0),
            actualDeliveredQuantity=actual_quantity,
            quantityDifference=difference,
            note=note,
        ))

    dispatch_data = []
    for dispatch in dispatches:
        confirmation = confirmation_by_dispatch.get(dispatch.id)
        dispatch_data.append(TrackingDispatch(
            dispatchId=dispatch.id,
            status=dispatch.status,
            dispatchedAt=dispatch.created_at,
            deliveryStatus=confirmation.result if confirmation else None,
            failureReason=confirmation.failure_reason if confirmation else None,
            confirmedAt=confirmation.created_at if confirmation else None,
            note=confirmation.note if confirmation else None,
        ))

    address = db.get(DeliveryAddress, order.delivery_address_id) if order.delivery_address_id else None
    recipient_name = address.receiver_name if address else None
    delivery_address = address.address if address else None
    summary = TrackingOrderSummary(
        orderId=order.id,
        orderCode=order.order_code,
        createdAt=order.created_at,
        currentStatus=current_status,
        lineCount=len(order_items),
        deliveryProgress=(round(len(delivered_dispatches) * 100 / len(dispatches)) if dispatches else None),
        lastUpdatedAt=last_updated,
    )
    detail = TrackingOrderDetailData(
        orderId=order.id,
        orderCode=order.order_code,
        createdAt=order.created_at,
        currentStatus=current_status,
        lastUpdatedAt=last_updated,
        recipientName=recipient_name,
        deliveryAddress=delivery_address,
        timeline=timeline,
        items=tracking_items,
        dispatches=dispatch_data,
    )
    return {"summary": summary, "detail": detail}


@router.get("", response_model=TrackingOrderListResponse)
def list_tracking_orders(
    search: Optional[str] = Query(None, max_length=100),
    status_filter: Optional[str] = Query(None, alias="status", max_length=30),
    from_date: Optional[date] = Query(None, alias="fromDate"),
    to_date: Optional[date] = Query(None, alias="toDate"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    user: AuthenticatedUser = Depends(require_roles("Customer", "Sales Rep")),
    db: Session = Depends(get_db),
):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")
    customer_ids = _accessible_customer_ids(db, user)
    query = db.query(Order).filter(Order.customer_id.in_(customer_ids))
    if not customer_ids:
        query = query.filter(Order.id == -1)
    if search:
        query = query.filter(Order.order_code.ilike(f"%{search.strip()}%"))
    if from_date:
        query = query.filter(Order.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.filter(Order.created_at < datetime.combine(to_date, datetime.max.time()))
    orders = query.order_by(Order.created_at.desc(), Order.id.desc()).all()
    tracked = [_load_order_tracking(db, order)["summary"] for order in orders]
    if status_filter:
        tracked = [item for item in tracked if item.currentStatus.upper() == status_filter.upper()]
    total = len(tracked)
    start = (page - 1) * page_size
    items = tracked[start:start + page_size]
    stats = TrackingStats(
        totalOrders=total,
        processingOrders=sum(item.currentStatus in {"APPROVED", "PREPARING", "DISPATCHED"} for item in tracked),
        inDeliveryOrders=sum(item.currentStatus == "IN_DELIVERY" for item in tracked),
        deliveredOrders=sum(item.currentStatus == "DELIVERED" for item in tracked),
        problemOrders=sum(item.currentStatus in PROBLEM_STATUSES for item in tracked),
    )
    return {"success": True, "code": 200, "data": {"stats": stats, "items": items, "page": page, "pageSize": page_size, "total": total}}


@router.get("/{order_id}", response_model=TrackingOrderDetailResponse)
def get_tracking_order(
    order_id: int,
    user: AuthenticatedUser = Depends(require_roles("Customer", "Sales Rep")),
    db: Session = Depends(get_db),
):
    customer_ids = _accessible_customer_ids(db, user)
    order = db.query(Order).filter(Order.id == order_id, Order.customer_id.in_(customer_ids)).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng trong phạm vi được phép xem.")
    detail = _load_order_tracking(db, order)["detail"]
    return {"success": True, "code": 200, "data": detail}
