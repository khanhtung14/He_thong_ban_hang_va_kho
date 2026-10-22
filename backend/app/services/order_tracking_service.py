"""Persist order status transitions used by customer delivery tracking."""
from sqlalchemy.orm import Session

from app.models.models import Order, OrderStatusHistory


def record_order_status_transition(
    db: Session,
    order: Order,
    status: object,
    *,
    note: str | None = None,
    actor_username: str | None = None,
) -> None:
    value = getattr(status, "value", status)
    db.add(OrderStatusHistory(
        order_id=order.id,
        status=str(value),
        note=note,
        actor_username=actor_username,
    ))
