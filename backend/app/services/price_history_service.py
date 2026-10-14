"""Service for recording and querying product price audit history (SCRUM-18)."""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional, Union

from sqlalchemy.orm import Session

from app.models.models import Product, ProductPriceHistory


def parse_date_boundary(val: Optional[Union[str, datetime, date]], is_end_of_day: bool = False) -> Optional[datetime]:
    """Parse date/datetime string or object into timezone-aware datetime boundary."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, date):
        t = time.max if is_end_of_day else time.min
        return datetime.combine(val, t, tzinfo=timezone.utc)
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        # Try full ISO datetime first
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
        # Try YYYY-MM-DD
        try:
            d = date.fromisoformat(val[:10])
            t = time.max if is_end_of_day else time.min
            return datetime.combine(d, t, tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def record_price_history(
    db: Session,
    product_id: int,
    new_price: float,
    old_price: Optional[float] = None,
    changed_by: Optional[str] = None,
    note: Optional[str] = None,
    reason: Optional[str] = None,
    effective_date: Optional[datetime] = None,
) -> ProductPriceHistory:
    """Record an immutable product price history audit log."""
    actual_note = note or reason
    if effective_date is None:
        effective_date = datetime.now(timezone.utc)
    elif effective_date.tzinfo is None:
        effective_date = effective_date.replace(tzinfo=timezone.utc)

    history = ProductPriceHistory(
        product_id=product_id,
        old_price=float(old_price) if old_price is not None else None,
        new_price=float(new_price),
        changed_by=changed_by or "System",
        effective_date=effective_date,
        reason=actual_note,
        note=actual_note,
    )
    db.add(history)
    return history


def get_price_history(
    db: Session,
    product_id: int,
    from_date: Optional[Union[str, datetime, date]] = None,
    to_date: Optional[Union[str, datetime, date]] = None,
) -> List[ProductPriceHistory]:
    """Query price history for a product, sorted descending by effective_date."""
    query = db.query(ProductPriceHistory).filter(ProductPriceHistory.product_id == product_id)

    dt_from = parse_date_boundary(from_date, is_end_of_day=False)
    if dt_from:
        query = query.filter(ProductPriceHistory.effective_date >= dt_from)

    dt_to = parse_date_boundary(to_date, is_end_of_day=True)
    if dt_to:
        query = query.filter(ProductPriceHistory.effective_date <= dt_to)

    return query.order_by(ProductPriceHistory.effective_date.desc(), ProductPriceHistory.id.desc()).all()


def serialize_price_history(history: ProductPriceHistory) -> Dict[str, Any]:
    """Serialize ProductPriceHistory to conform with API_SPECIFICATION.md and snake_case clients."""
    date_str = history.effective_date.isoformat() if history.effective_date else None
    display_note = history.note or history.reason
    return {
        "id": history.id,
        "productId": history.product_id,
        "product_id": history.product_id,
        "oldPrice": history.old_price,
        "old_price": history.old_price,
        "newPrice": history.new_price,
        "new_price": history.new_price,
        "changedBy": history.changed_by,
        "changed_by": history.changed_by,
        "changedAt": date_str,
        "changed_at": date_str,
        "effectiveDate": date_str,
        "effective_date": date_str,
        "note": display_note,
        "reason": display_note,
    }
