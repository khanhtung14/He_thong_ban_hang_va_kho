"""Schemas package for src.backend."""
from __future__ import annotations

try:
    from app.schemas.schemas import *  # noqa: F401,F403
except Exception:
    pass

from src.backend.schemas.sales import (
    PurchaseHistoryItemResponse,
    LastOrderItemResponse,
    LastOrderGroupResponse,
)
from src.backend.schemas.inbound_receipt import (
    InboundReceiptDetailBase,
    InboundReceiptDetailCreate,
    InboundReceiptDetailResponse,
    InboundReceiptBase,
    InboundReceiptCreate,
    InboundReceiptUpdate,
    InboundReceiptResponse,
    InboundReceiptListResponse,
)

__all__ = [
    "PurchaseHistoryItemResponse",
    "LastOrderItemResponse",
    "LastOrderGroupResponse",
    "InboundReceiptDetailBase",
    "InboundReceiptDetailCreate",
    "InboundReceiptDetailResponse",
    "InboundReceiptBase",
    "InboundReceiptCreate",
    "InboundReceiptUpdate",
    "InboundReceiptResponse",
    "InboundReceiptListResponse",
]
