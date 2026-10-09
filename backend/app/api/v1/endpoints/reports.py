"""Financial and managerial reports router with RBAC access control."""

from collections import defaultdict
from datetime import date, datetime
from typing import Any
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

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])


@router.get("/sales-margin")
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
