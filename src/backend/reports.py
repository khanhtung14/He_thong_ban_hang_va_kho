"""Financial and managerial reports router with RBAC access control."""

from typing import Any
from fastapi import APIRouter, Depends

try:
    from src.backend.rbac import (
        PERM_PRODUCTS_VIEW_FINANCIALS,
        AuthenticatedUser,
        require_permissions,
    )
except ModuleNotFoundError:  # pragma: no cover
    from rbac import (
        PERM_PRODUCTS_VIEW_FINANCIALS,
        AuthenticatedUser,
        require_permissions,
    )

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])


@router.get("/sales-margin")
def get_sales_margin_report(
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW_FINANCIALS)),
) -> Any:
    """Sales and Gross Margin report.

    Strict security constraint:
    - Default Deny: Chặn toàn bộ vai trò trừ Sales Manager và Admin.
    - Sales Rep, Warehouse, WH Manager, Accountant, Customer -> 403 Forbidden.
    """
    return {
        "report_name": "Báo cáo Doanh số & Biên lợi nhuận Gộp",
        "generated_by": user.username,
        "role": user.role,
        "period": "2026-Q3",
        "total_revenue": 150_000_000,
        "total_cogs": 105_000_000,
        "gross_profit": 45_000_000,
        "margin": "30.0%",
        "details": [
            {
                "sku": "SKU-001",
                "name": "Nước tăng lực Red Bull 250ml",
                "units_sold": 200,
                "revenue": 100_000_000,
                "cost_price": 70_000_000,
                "margin": "30.0%",
            },
            {
                "sku": "SKU-002",
                "name": "Cà phê lon Highlands 235ml",
                "units_sold": 200,
                "revenue": 50_000_000,
                "cost_price": 35_000_000,
                "margin": "30.0%",
            },
        ],
    }
