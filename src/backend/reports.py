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
    - Default Deny: only Sales Manager may view sales margin data.
    - All other roles, including Admin, receive 403 Forbidden.
    """
    return {
        "report_name": "Báo cáo Doanh số & Biên lợi nhuận Gộp",
        "generated_by": user.username,
        "role": user.role,
        "period": None,
        "total_revenue": 0,
        "total_cogs": 0,
        "gross_profit": 0,
        "margin": "0%",
        "details": [],
    }
