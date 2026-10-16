"""Trip planning and active delivery tracking endpoints (SCRUM-47)."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles
from app.core.database import get_db
from app.models.models import (
    Customer,
    DeliveryAddress,
    DeliveryTrip,
    DeliveryTripDispatch,
    Dispatch,
    Order,
    Territory,
)


warehouse_router = APIRouter(prefix="/api/v1/warehouse/dispatches", tags=["Delivery Trips"])
delivery_router = APIRouter(prefix="/api/v1/deliveries", tags=["Delivery Trips"])


class DeliveryTripCreate(BaseModel):
    driverName: str = Field(..., min_length=1, max_length=150)
    vehicleNumber: str = Field(..., min_length=1, max_length=50)
    dispatchIds: List[int] = Field(..., min_length=1)
    routeName: str = Field(..., min_length=1, max_length=150)


class ApiEnvelope(BaseModel):
    success: bool
    code: int
    message: str


class AvailableDispatch(BaseModel):
    dispatchId: int
    orderId: int
    orderCode: str
    customerName: str
    regionName: str
    receiverName: str
    phone: str
    address: str
    status: str


class CreatedTrip(BaseModel):
    id: int
    driverName: str
    vehicleNumber: str
    routeName: str
    status: str
    dispatchIds: List[int]
    deliveredStops: int
    remainingStops: int


class ActiveStop(AvailableDispatch):
    deliveryStatus: str


class ActiveTrip(BaseModel):
    id: int
    driverName: str
    vehicleNumber: str
    routeName: str
    status: str
    deliveredStops: int
    remainingStops: int
    stops: List[ActiveStop]


class AvailableDispatchResponse(ApiEnvelope):
    data: List[AvailableDispatch]


class CreatedTripResponse(ApiEnvelope):
    data: CreatedTrip


class ActiveTripsResponse(ApiEnvelope):
    data: List[ActiveTrip]


def _format_stop(db: Session, dispatch: Dispatch) -> dict:
    order = db.get(Order, dispatch.order_id)
    if order is None:
        raise HTTPException(status_code=409, detail=f"Đơn hàng của phiếu xuất {dispatch.id} không còn tồn tại.")
    customer = db.get(Customer, order.customer_id)
    address = (
        db.query(DeliveryAddress)
        .filter(DeliveryAddress.customer_id == order.customer_id)
        .order_by(DeliveryAddress.is_default.desc(), DeliveryAddress.id.asc())
        .first()
    )
    territory = db.get(Territory, customer.territory_id) if customer and customer.territory_id else None
    return {
        "dispatchId": dispatch.id,
        "orderId": order.id,
        "orderCode": order.order_code,
        "customerName": customer.name if customer else "",
        "regionName": territory.name if territory else "Chưa phân khu",
        "receiverName": address.receiver_name if address else "",
        "phone": (address.phone if address else None) or (customer.phone if customer else "") or "",
        "address": address.address if address else "",
        "status": dispatch.status,
    }


@warehouse_router.get("/available", response_model=AvailableDispatchResponse)
def list_available_dispatches(
    _user: AuthenticatedUser = Depends(require_roles("WH Manager")),
    db: Session = Depends(get_db),
):
    assigned_dispatch_ids = db.query(DeliveryTripDispatch.dispatch_id)
    dispatches = (
        db.query(Dispatch)
        .filter(
            Dispatch.status == "SHIPPED",
            ~Dispatch.id.in_(assigned_dispatch_ids),
        )
        .order_by(Dispatch.id.asc())
        .all()
    )
    stops = [_format_stop(db, dispatch) for dispatch in dispatches]
    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách phiếu xuất chưa xếp chuyến thành công.",
        "data": stops,
    }


@delivery_router.post("/trips", status_code=201, response_model=CreatedTripResponse)
def create_delivery_trip(
    data: DeliveryTripCreate,
    _user: AuthenticatedUser = Depends(require_roles("WH Manager")),
    db: Session = Depends(get_db),
):
    if len(set(data.dispatchIds)) != len(data.dispatchIds):
        raise HTTPException(status_code=422, detail="dispatchIds không được chứa mã trùng lặp.")

    dispatches = (
        db.query(Dispatch)
        .filter(Dispatch.id.in_(data.dispatchIds))
        .with_for_update()
        .all()
    )
    if len(dispatches) != len(data.dispatchIds):
        found_ids = {dispatch.id for dispatch in dispatches}
        missing_ids = [dispatch_id for dispatch_id in data.dispatchIds if dispatch_id not in found_ids]
        raise HTTPException(status_code=404, detail={"missingDispatchIds": missing_ids})

    assigned_dispatch_ids = {
        row[0]
        for row in db.query(DeliveryTripDispatch.dispatch_id)
        .filter(DeliveryTripDispatch.dispatch_id.in_(data.dispatchIds))
        .all()
    }
    not_ready = [
        dispatch.id
        for dispatch in dispatches
        if dispatch.status != "SHIPPED" or dispatch.id in assigned_dispatch_ids
    ]
    if not_ready:
        raise HTTPException(
            status_code=409,
            detail={"dispatchIds": not_ready, "message": "Phiếu xuất chưa sẵn sàng hoặc đã thuộc chuyến giao khác."},
        )

    territory_ids = set()
    for dispatch in dispatches:
        order = db.get(Order, dispatch.order_id)
        customer = db.get(Customer, order.customer_id) if order else None
        territory_ids.add(customer.territory_id if customer else None)
    if len(territory_ids) > 1:
        raise HTTPException(status_code=422, detail="Chỉ có thể gom phiếu xuất thuộc cùng một địa bàn giao.")

    trip = DeliveryTrip(
        driver_name=data.driverName.strip(),
        vehicle_number=data.vehicleNumber.strip(),
        route_name=data.routeName.strip(),
        status="IN_PROGRESS",
    )
    db.add(trip)
    db.flush()
    for dispatch_id in data.dispatchIds:
        db.add(DeliveryTripDispatch(trip_id=trip.id, dispatch_id=dispatch_id))
    db.commit()
    db.refresh(trip)

    return {
        "success": True,
        "code": 201,
        "message": "Đã tạo chuyến giao hàng.",
        "data": {
            "id": trip.id,
            "driverName": trip.driver_name,
            "vehicleNumber": trip.vehicle_number,
            "routeName": trip.route_name,
            "status": trip.status,
            "dispatchIds": data.dispatchIds,
            "deliveredStops": 0,
            "remainingStops": len(data.dispatchIds),
        },
    }


@delivery_router.get("/trips/active", response_model=ActiveTripsResponse)
def list_active_delivery_trips(
    _user: AuthenticatedUser = Depends(require_roles("WH Manager", "Sales Manager")),
    db: Session = Depends(get_db),
):
    trips = (
        db.query(DeliveryTrip)
        .filter(DeliveryTrip.status == "IN_PROGRESS")
        .order_by(DeliveryTrip.id.desc())
        .all()
    )
    active_trips = []
    for trip in trips:
        links = (
            db.query(DeliveryTripDispatch)
            .filter(DeliveryTripDispatch.trip_id == trip.id)
            .order_by(DeliveryTripDispatch.id.asc())
            .all()
        )
        stops = []
        for link in links:
            dispatch = db.get(Dispatch, link.dispatch_id)
            if dispatch is not None:
                stop = _format_stop(db, dispatch)
                stop["deliveryStatus"] = dispatch.status
                stops.append(stop)
        delivered = sum(stop["deliveryStatus"] == "DELIVERED" for stop in stops)
        active_trips.append({
            "id": trip.id,
            "driverName": trip.driver_name,
            "vehicleNumber": trip.vehicle_number,
            "routeName": trip.route_name or "",
            "status": trip.status,
            "deliveredStops": delivered,
            "remainingStops": len(stops) - delivered,
            "stops": stops,
        })

    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách chuyến đang giao thành công.",
        "data": active_trips,
    }
