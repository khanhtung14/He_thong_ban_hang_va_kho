"""Delivery trip creation and live tracking (SCRUM-52)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles
from app.core.database import get_db
from app.models.models import (
    Customer, DeliveryTrip, DeliveryTripDispatch,
    Dispatch, Order,
)

router = APIRouter(prefix="/api/v1/deliveries/trips", tags=["Delivery trips"])


class CreateDeliveryTripRequest(BaseModel):
    driverName: str = Field(min_length=1, max_length=150)
    vehicleNumber: str = Field(min_length=1, max_length=50)
    dispatchIds: list[int] = Field(min_length=1)
    routeName: Optional[str] = Field(default=None, max_length=150)
    expectedCompletionAt: datetime


class DeliveryTripDispatchData(BaseModel):
    dispatchId: int
    orderId: int
    status: str
    customerName: str
    desiredDeliveryDate: Optional[str]


class ActiveDeliveryTripData(BaseModel):
    tripId: int
    driverName: str
    vehicleNumber: str
    routeName: Optional[str]
    expectedCompletionAt: Optional[datetime]
    isOverdue: bool
    deliveredStops: int
    remainingStops: int
    onRoadAmount: float
    dispatches: list[DeliveryTripDispatchData]


class DeliveryTripListResponse(BaseModel):
    success: bool
    code: int
    data: list[ActiveDeliveryTripData]


class DeliveryTripResponse(BaseModel):
    success: bool
    code: int
    data: ActiveDeliveryTripData


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _trip_data(db: Session, trip: DeliveryTrip) -> ActiveDeliveryTripData:
    rows = (
        db.query(Dispatch, Order, Customer)
        .join(DeliveryTripDispatch, DeliveryTripDispatch.dispatch_id == Dispatch.id)
        .join(Order, Order.id == Dispatch.order_id)
        .join(Customer, Customer.id == Order.customer_id)
        .filter(DeliveryTripDispatch.trip_id == trip.id)
        .order_by(Dispatch.id)
        .all()
    )
    delivered = 0
    remaining = 0
    amount = 0.0
    valued_order_ids: set[int] = set()
    dispatch_data = []
    for dispatch, order, customer in rows:
        if dispatch.status == "DELIVERED":
            delivered += 1
        elif dispatch.status == "SHIPPED":
            remaining += 1
            if order.id not in valued_order_ids:
                amount += float(order.total_amount or 0)
                valued_order_ids.add(order.id)
        dispatch_data.append(DeliveryTripDispatchData(
            dispatchId=dispatch.id,
            orderId=order.id,
            status=dispatch.status,
            customerName=customer.name,
            desiredDeliveryDate=order.desired_delivery_date.isoformat() if order.desired_delivery_date else None,
        ))
    expected = _as_utc(trip.expected_completion_at) if trip.expected_completion_at else None
    return ActiveDeliveryTripData(
        tripId=trip.id,
        driverName=trip.driver_name,
        vehicleNumber=trip.vehicle_number,
        routeName=trip.route_name,
        expectedCompletionAt=expected,
        isOverdue=remaining > 0 and expected is not None and datetime.now(timezone.utc) > expected,
        deliveredStops=delivered,
        remainingStops=remaining,
        onRoadAmount=amount,
        dispatches=dispatch_data,
    )


@router.post("", response_model=DeliveryTripResponse, status_code=status.HTTP_201_CREATED)
def create_delivery_trip(
    payload: CreateDeliveryTripRequest,
    _: AuthenticatedUser = Depends(require_roles("WH Manager")),
    db: Session = Depends(get_db),
):
    dispatch_ids = list(dict.fromkeys(payload.dispatchIds))
    if len(dispatch_ids) != len(payload.dispatchIds):
        raise HTTPException(status_code=422, detail="Mã phiếu xuất bị lặp.")
    dispatches = db.query(Dispatch).filter(Dispatch.id.in_(dispatch_ids)).all()
    if len(dispatches) != len(dispatch_ids):
        raise HTTPException(status_code=404, detail="Không tìm thấy một hoặc nhiều phiếu xuất.")
    if any(dispatch.status != "SHIPPED" for dispatch in dispatches):
        raise HTTPException(status_code=409, detail="Chỉ thêm được phiếu xuất đang giao vào chuyến.")
    already_assigned = {
        dispatch_id for (dispatch_id,) in db.query(DeliveryTripDispatch.dispatch_id)
        .filter(DeliveryTripDispatch.dispatch_id.in_(dispatch_ids)).all()
    }
    if already_assigned:
        raise HTTPException(status_code=409, detail="Một hoặc nhiều phiếu xuất đã thuộc chuyến khác.")
    expected = _as_utc(payload.expectedCompletionAt)
    if expected <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Thời điểm dự kiến phải ở tương lai.")
    trip = DeliveryTrip(
        driver_name=payload.driverName.strip(),
        vehicle_number=payload.vehicleNumber.strip(),
        route_name=payload.routeName.strip() if payload.routeName else None,
        expected_completion_at=expected,
        status="IN_PROGRESS",
    )
    db.add(trip)
    db.flush()
    db.add_all([DeliveryTripDispatch(trip_id=trip.id, dispatch_id=dispatch_id) for dispatch_id in dispatch_ids])
    db.commit()
    db.refresh(trip)
    return {"success": True, "code": 201, "data": _trip_data(db, trip)}


@router.get("/active", response_model=DeliveryTripListResponse)
def list_active_delivery_trips(
    _: AuthenticatedUser = Depends(require_roles("WH Manager", "Sales Manager")),
    db: Session = Depends(get_db),
):
    trips = (
        db.query(DeliveryTrip)
        .join(DeliveryTripDispatch, DeliveryTripDispatch.trip_id == DeliveryTrip.id)
        .join(Dispatch, Dispatch.id == DeliveryTripDispatch.dispatch_id)
        .filter(DeliveryTrip.status == "IN_PROGRESS", Dispatch.status == "SHIPPED")
        .distinct()
        .order_by(DeliveryTrip.id.desc())
        .all()
    )
    return {"success": True, "code": 200, "data": [_trip_data(db, trip) for trip in trips]}
