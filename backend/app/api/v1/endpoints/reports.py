"""Financial and managerial reports router with RBAC access control."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, List
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW_FINANCIALS,
    AuthenticatedUser,
    require_permissions,
)
from app.core.database import get_db
from app.models.models import Order, OrderStatus, Product
from pydantic import BaseModel

class ProductMarginDetail(BaseModel):
    sku: str
    name: str
    units_sold: int
    revenue: float
    cost_price: float
    margin: str

class SalesMarginReportResponse(BaseModel):
    report_name: str
    generated_by: str
    role: str
    period: str
    total_revenue: float
    total_cogs: float
    gross_profit: float
    margin: str
    details: List[ProductMarginDetail]

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])


@router.get("/sales-margin", response_model=SalesMarginReportResponse)
def get_sales_margin_report(
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW_FINANCIALS)),
    db: Session = Depends(get_db),
) -> Any:
    """Sales and Gross Margin report."""
    orders = db.execute(
        select(Order).options(selectinload(Order.items)).where(
            Order.status.in_([OrderStatus.APPROVED.value, OrderStatus.PROCESSING.value, OrderStatus.COMPLETED.value]),
            Order.created_at >= datetime(date.today().year, date.today().month, 1),
        )
    ).scalars().all()
    
    # fetch all products for quick lookup
    products_db = db.query(Product).all()
    product_map = {p.id: p for p in products_db}
    
    products_report: dict[int, dict[str, Any]] = defaultdict(lambda: {"units_sold": 0, "revenue": 0, "cost_price": 0})
    total_revenue = 0
    total_cogs = 0
    
    for order in orders:
        for line in order.items:
            product = product_map.get(line.product_id)
            if not product:
                continue
                
            revenue = line.quantity * line.unit_price
            cogs = line.quantity * (product.cost_price or 0)
            row = products_report[product.id]
            row["units_sold"] += line.quantity
            row["revenue"] += revenue
            row["cost_price"] += cogs
            total_revenue += revenue
            total_cogs += cogs
            
    details = []
    for pid, row in products_report.items():
        product = product_map.get(pid)
        if not product:
            continue
        profit = row["revenue"] - row["cost_price"]
        details.append({
            "sku": product.sku,
            "name": product.name,
            "units_sold": row["units_sold"],
            "revenue": row["revenue"],
            "cost_price": row["cost_price"],
            "margin": f"{(profit / row['revenue'] * 100):.1f}%" if row["revenue"] else "0%",
        })
        
    gross_profit = total_revenue - total_cogs
    return {
        "report_name": "Báo cáo Doanh số & Biên lợi nhuận Gộp",
        "generated_by": user.username,
        "role": user.role,
        "period": date.today().strftime("%m/%Y"),
        "total_revenue": total_revenue,
        "total_cogs": total_cogs,
        "gross_profit": gross_profit,
        "margin": f"{(gross_profit / total_revenue * 100):.1f}%" if total_revenue else "0%",
        "details": details,
    }


# =============================================================================
# SCRUM-72 (Epic SCRUM-91): Multi-dimensional Sales Analytics & Excel Export
# =============================================================================
from io import BytesIO
from typing import Dict, Optional
from fastapi import Query
from fastapi.responses import StreamingResponse
from app.api.v1.endpoints.rbac import get_current_user
from app.services.sales_report_service import (
    build_sales_analytics_report,
    generate_sales_analytics_excel,
)


def _clean_str(val: Any) -> Optional[str]:
    return str(val).strip() if isinstance(val, str) and str(val).strip() else None


def _handle_sales_analytics(
    group_by: Any,
    groupBy: Any,
    from_date: Any,
    fromDate: Any,
    to_date: Any,
    toDate: Any,
    period: Any,
    compare_to: Any,
    compareTo: Any,
    compare_from: Any,
    compare_to_date: Any,
    user: AuthenticatedUser,
    db: Session,
) -> Dict[str, Any]:
    eff_group = _clean_str(group_by) or _clean_str(groupBy)
    eff_from = _clean_str(from_date) or _clean_str(fromDate)
    eff_to = _clean_str(to_date) or _clean_str(toDate)
    eff_period = _clean_str(period)
    eff_cmp = _clean_str(compare_to) or _clean_str(compareTo)
    eff_cmp_from = _clean_str(compare_from)
    eff_cmp_to = _clean_str(compare_to_date)

    return build_sales_analytics_report(
        db=db,
        user=user,
        group_by_param=eff_group,
        from_date_str=eff_from,
        to_date_str=eff_to,
        period=eff_period,
        compare_to=eff_cmp,
        compare_from_str=eff_cmp_from,
        compare_to_str=eff_cmp_to,
    )


def _handle_sales_analytics_export(
    group_by: Optional[str],
    groupBy: Optional[str],
    from_date: Optional[str],
    fromDate: Optional[str],
    to_date: Optional[str],
    toDate: Optional[str],
    period: Optional[str],
    compare_to: Optional[str],
    compareTo: Optional[str],
    compare_from: Optional[str],
    compare_to_date: Optional[str],
    user: AuthenticatedUser,
    db: Session,
) -> StreamingResponse:
    report = _handle_sales_analytics(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=compare_from,
        compare_to_date=compare_to_date,
        user=user,
        db=db,
    )
    excel_bytes = generate_sales_analytics_excel(report, user=user)
    dimension = report.get("data", {}).get("group_by", "report")
    filename = f"sales_analytics_{dimension}_{date.today().strftime('%Y%m%d')}.xlsx"

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sales-analytics", summary="Báo cáo phân tích doanh số đa chiều (SCRUM-72)")
def get_sales_analytics(
    group_by: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    compare_to: Optional[str] = Query(None),
    compareTo: Optional[str] = Query(None),
    compare_from: Optional[str] = Query(None),
    compareFrom: Optional[str] = Query(None),
    compare_to_date: Optional[str] = Query(None),
    compareToDate: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return _handle_sales_analytics(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=compare_from or compareFrom,
        compare_to_date=compare_to_date or compareToDate,
        user=user,
        db=db,
    )


@router.get("/sales", summary="Báo cáo doanh số đa chiều (Alias API_SPEC S8-06)")
def get_sales_report_alias(
    group_by: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    compare_to: Optional[str] = Query(None),
    compareTo: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return _handle_sales_analytics(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=None,
        compare_to_date=None,
        user=user,
        db=db,
    )


@router.get("/sales-analytics/export", summary="Xuất báo cáo doanh số đa chiều ra file Excel (SCRUM-72)")
def export_sales_analytics(
    group_by: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    compare_to: Optional[str] = Query(None),
    compareTo: Optional[str] = Query(None),
    compare_from: Optional[str] = Query(None),
    compareFrom: Optional[str] = Query(None),
    compare_to_date: Optional[str] = Query(None),
    compareToDate: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    return _handle_sales_analytics_export(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=compare_from or compareFrom,
        compare_to_date=compare_to_date or compareToDate,
        user=user,
        db=db,
    )


# Compatibility router for calls directly to /reports/* without /api/v1
compat_router = APIRouter(prefix="/reports", tags=["Reports Compat"])


@compat_router.get("/sales-analytics")
def compat_get_sales_analytics(
    group_by: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    compare_to: Optional[str] = Query(None),
    compareTo: Optional[str] = Query(None),
    compare_from: Optional[str] = Query(None),
    compareFrom: Optional[str] = Query(None),
    compare_to_date: Optional[str] = Query(None),
    compareToDate: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return _handle_sales_analytics(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=compare_from or compareFrom,
        compare_to_date=compare_to_date or compareToDate,
        user=user,
        db=db,
    )


@compat_router.get("/sales-analytics/export")
def compat_export_sales_analytics(
    group_by: Optional[str] = Query(None),
    groupBy: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    fromDate: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    toDate: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    compare_to: Optional[str] = Query(None),
    compareTo: Optional[str] = Query(None),
    compare_from: Optional[str] = Query(None),
    compareFrom: Optional[str] = Query(None),
    compare_to_date: Optional[str] = Query(None),
    compareToDate: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    return _handle_sales_analytics_export(
        group_by=group_by,
        groupBy=groupBy,
        from_date=from_date,
        fromDate=fromDate,
        to_date=to_date,
        toDate=toDate,
        period=period,
        compare_to=compare_to,
        compareTo=compareTo,
        compare_from=compare_from or compareFrom,
        compare_to_date=compare_to_date or compareToDate,
        user=user,
        db=db,
    )

