"""Pydantic schemas for Sales Dealer History (SCRUM-11 & S4-04)."""
from typing import List, Optional
from pydantic import BaseModel, Field


class PurchaseHistoryItemResponse(BaseModel):
    product_id: int
    product_name: str
    total_quantity: float
    average_quantity: float


class LastOrderItemResponse(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float = 0.0


class LastOrderGroupResponse(BaseModel):
    order_id: Optional[int] = None
    order_code: Optional[str] = None
    items: List[LastOrderItemResponse] = Field(default_factory=list)
