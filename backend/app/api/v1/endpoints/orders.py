"""Bridge module for app.api.v1.endpoints.orders redirecting to src.backend.orders."""

from src.backend.orders import (
    router,
    OrderCreate,
    get_my_orders,
    get_my_order_detail,
)

__all__ = [
    "router",
    "OrderCreate",
    "get_my_orders",
    "get_my_order_detail",
]
