"""Executive dashboard service for sales and inventory overview (SCRUM-70).

Provides high-performance aggregated metrics, daily revenue trends,
regional breakdown, and prioritized overdue dealer lists for executive management.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.models import (
    Customer,
    Inventory,
    Invoice,
    InvoicePayment,
    Order,
    OrderStatus,
    Product,
    Territory,
)

REVENUE_STATUSES = [
    OrderStatus.APPROVED,
    OrderStatus.PROCESSING,
    OrderStatus.COMPLETED,
    "APPROVED",
    "PROCESSING",
    "COMPLETED",
]

APPROVAL_STATUSES = [
    OrderStatus.PENDING,
    OrderStatus.PENDING_APPROVAL,
    "PENDING",
    "PENDING_APPROVAL",
]

DISPATCH_STATUSES = [
    OrderStatus.APPROVED,
    OrderStatus.PROCESSING,
    "APPROVED",
    "PROCESSING",
]


class ExecutiveDashboardService:
    """Service to aggregate and compute executive dashboard metrics."""

    def __init__(self, db: Session):
        self.db = db

    def get_executive_summary(self, as_of_date: Optional[str] = None) -> Dict[str, Any]:
        """Aggregate all KPI cards, chart trends, and overdue dealer metrics.

        Parameters:
            as_of_date: Optional reference date string (YYYY-MM-DD), defaults to date.today().

        Returns:
            Dictionary matching the API specification envelope data for SCRUM-70.
        """
        if as_of_date:
            try:
                ref_date = datetime.strptime(as_of_date.strip(), "%Y-%m-%d").date()
            except ValueError:
                ref_date = date.today()
        else:
            ref_date = date.today()

        start_of_today = datetime(ref_date.year, ref_date.month, ref_date.day, 0, 0, 0)
        end_of_today = datetime(ref_date.year, ref_date.month, ref_date.day, 23, 59, 59, 999999)
        start_of_month = datetime(ref_date.year, ref_date.month, 1, 0, 0, 0)

        # 1. KPI Cards: Revenue metrics
        today_revenue = float(
            self.db.query(func.coalesce(func.sum(Order.total_amount), 0.0))
            .filter(
                Order.status.in_(REVENUE_STATUSES),
                Order.created_at >= start_of_today,
                Order.created_at <= end_of_today,
            )
            .scalar()
            or 0.0
        )

        month_revenue = float(
            self.db.query(func.coalesce(func.sum(Order.total_amount), 0.0))
            .filter(
                Order.status.in_(REVENUE_STATUSES),
                Order.created_at >= start_of_month,
                Order.created_at <= end_of_today,
            )
            .scalar()
            or 0.0
        )

        # 2. KPI Cards: Pending order counts
        pending_approval_orders = int(
            self.db.query(func.count(Order.id))
            .filter(Order.status.in_(APPROVAL_STATUSES))
            .scalar()
            or 0
        )

        pending_dispatch_orders = int(
            self.db.query(func.count(Order.id))
            .filter(Order.status.in_(DISPATCH_STATUSES))
            .scalar()
            or 0
        )

        # 3. KPI Cards: Low stock SKU count (available stock < min_stock)
        inv_subquery = (
            self.db.query(
                Inventory.product_id,
                func.coalesce(
                    func.sum(Inventory.physical_qty - Inventory.reserved_qty), 0.0
                ).label("total_available"),
            )
            .group_by(Inventory.product_id)
            .subquery()
        )

        low_stock_sku_count = int(
            self.db.query(func.count(Product.id))
            .outerjoin(inv_subquery, Product.id == inv_subquery.c.product_id)
            .filter(
                Product.status == "ACTIVE",
                Product.min_stock > 0,
                func.coalesce(inv_subquery.c.total_available, 0.0) < Product.min_stock,
            )
            .scalar()
            or 0
        )

        # 4. Overdue Dealers and Total Overdue Debt
        overdue_dealers, total_overdue_debt = self._compute_overdue_dealers(ref_date)

        # 5. Charts Data: Daily revenue trend in current month
        daily_revenue_trend = self._compute_daily_trend(start_of_month, end_of_today, ref_date)

        # 6. Charts Data: Revenue by region in current month
        revenue_by_region = self._compute_revenue_by_region(start_of_month, end_of_today, month_revenue)

        kpi_cards = {
            "today_revenue": round(today_revenue, 2),
            "month_revenue": round(month_revenue, 2),
            "pending_approval_orders": pending_approval_orders,
            "pending_dispatch_orders": pending_dispatch_orders,
            "total_overdue_debt": round(total_overdue_debt, 2),
            "low_stock_sku_count": low_stock_sku_count,
        }

        return {
            "kpi_cards": kpi_cards,
            # Also provide flat keys for convenience
            "today_revenue": kpi_cards["today_revenue"],
            "month_revenue": kpi_cards["month_revenue"],
            "pending_approval_orders": kpi_cards["pending_approval_orders"],
            "pending_dispatch_orders": kpi_cards["pending_dispatch_orders"],
            "total_overdue_debt": kpi_cards["total_overdue_debt"],
            "low_stock_sku_count": kpi_cards["low_stock_sku_count"],
            "daily_revenue_trend": daily_revenue_trend,
            "revenue_by_region": revenue_by_region,
            "overdue_dealers": overdue_dealers,
        }

    def _compute_overdue_dealers(self, ref_date: date) -> Tuple[List[Dict[str, Any]], float]:
        """Find all dealers with overdue debt, sorted by overdue_amount DESC."""
        # Map customer_id -> {"overdue_amount": float, "overdue_days": int}
        customer_overdue_map: Dict[int, Dict[str, Any]] = defaultdict(
            lambda: {"overdue_amount": 0.0, "overdue_days": 0}
        )

        # 1. Inspect Invoices with status != 'PAID'
        unpaid_invoices = (
            self.db.query(Invoice)
            .filter(Invoice.status != "PAID")
            .all()
        )

        # Pre-fetch payment applications grouped by invoice_id to avoid N+1 queries
        payment_sums: Dict[int, float] = {}
        for row in (
            self.db.query(
                InvoicePayment.invoice_id,
                func.coalesce(func.sum(InvoicePayment.amount_applied), 0.0),
            )
            .group_by(InvoicePayment.invoice_id)
            .all()
        ):
            payment_sums[row[0]] = float(row[1])

        invoice_customer_ids = set()
        for inv in unpaid_invoices:
            invoice_customer_ids.add(inv.customer_id)
            inv_date = inv.invoice_date.date() if hasattr(inv.invoice_date, "date") else inv.invoice_date
            if not inv_date:
                inv_date = ref_date
            term_days = inv.payment_term_days or 0
            due_date = inv_date + timedelta(days=term_days)

            if due_date < ref_date:
                paid = payment_sums.get(inv.id, 0.0)
                remaining = max(0.0, float(inv.total_amount or 0.0) - paid)
                if remaining > 0.0:
                    overdue_days = max(1, (ref_date - due_date).days)
                    entry = customer_overdue_map[inv.customer_id]
                    entry["overdue_amount"] += remaining
                    entry["overdue_days"] = max(entry["overdue_days"], overdue_days)

        # 2. Check Customers with current_debt > 0 that might not have Invoice rows
        all_customers = self.db.query(Customer).filter(Customer.is_active.is_(True)).all()
        for cust in all_customers:
            if cust.id not in customer_overdue_map and cust.current_debt > 0:
                # Determine overdue status based on max_debt_days / max_due_days
                created_dt = cust.created_at.date() if cust.created_at else ref_date
                days_active = (ref_date - created_dt).days
                max_days = cust.max_debt_days or cust.max_due_days or 30
                if days_active > max_days or cust.is_locked:
                    overdue_days = max(1, days_active - max_days) if not cust.is_locked else max(1, days_active)
                    customer_overdue_map[cust.id]["overdue_amount"] = float(cust.current_debt)
                    customer_overdue_map[cust.id]["overdue_days"] = overdue_days

        # 3. Assemble and sort overdue dealers
        cust_lookup = {c.id: c for c in all_customers}
        overdue_dealers: List[Dict[str, Any]] = []

        for cid, debt_info in customer_overdue_map.items():
            if debt_info["overdue_amount"] <= 0:
                continue
            cust = cust_lookup.get(cid)
            if not cust:
                cust = self.db.get(Customer, cid)
            if not cust:
                continue

            overdue_dealers.append({
                "id": cust.id,
                "customer_id": cust.id,
                "code": cust.code,
                "name": cust.name,
                "phone": cust.phone,
                "overdue_amount": round(debt_info["overdue_amount"], 2),
                "current_debt": round(float(cust.current_debt or debt_info["overdue_amount"]), 2),
                "credit_limit": round(float(cust.credit_limit or 0.0), 2),
                "overdue_days": int(debt_info["overdue_days"]),
                "region": cust.region or "Chưa xác định",
            })

        # Sort descending by overdue_amount (sorted by overdue_amount DESC)
        overdue_dealers.sort(key=lambda d: d["overdue_amount"], reverse=True)
        total_overdue_debt = round(sum(d["overdue_amount"] for d in overdue_dealers), 2)

        return overdue_dealers, total_overdue_debt

    def _compute_daily_trend(
        self, start_of_month: datetime, end_of_today: datetime, ref_date: date
    ) -> List[Dict[str, Any]]:
        """Compute chronological daily revenue and order counts for current month."""
        month_orders = (
            self.db.query(Order.created_at, Order.total_amount)
            .filter(
                Order.status.in_(REVENUE_STATUSES),
                Order.created_at >= start_of_month,
                Order.created_at <= end_of_today,
            )
            .all()
        )

        daily_data: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"revenue": 0.0, "order_count": 0}
        )

        for created_at, amount in month_orders:
            if created_at:
                date_key = created_at.strftime("%Y-%m-%d")
                daily_data[date_key]["revenue"] += float(amount or 0.0)
                daily_data[date_key]["order_count"] += 1

        trend: List[Dict[str, Any]] = []
        for day in range(1, ref_date.day + 1):
            date_str = f"{ref_date.year:04d}-{ref_date.month:02d}-{day:02d}"
            info = daily_data.get(date_str, {"revenue": 0.0, "order_count": 0})
            trend.append({
                "date": date_str,
                "revenue": round(info["revenue"], 2),
                "order_count": int(info["order_count"]),
            })

        return trend

    def _compute_revenue_by_region(
        self, start_of_month: datetime, end_of_today: datetime, total_revenue: float
    ) -> List[Dict[str, Any]]:
        """Compute distribution of sales revenue across regions for the current month."""
        orders_data = (
            self.db.query(Order.total_amount, Customer.region, Customer.territory_id)
            .join(Customer, Order.customer_id == Customer.id)
            .filter(
                Order.status.in_(REVENUE_STATUSES),
                Order.created_at >= start_of_month,
                Order.created_at <= end_of_today,
            )
            .all()
        )

        territory_names: Dict[int, str] = {
            t.id: t.name for t in self.db.query(Territory).all()
        }

        region_revenue_map: Dict[str, float] = defaultdict(float)
        for amount, region, territory_id in orders_data:
            resolved_region = (region or "").strip()
            if not resolved_region and territory_id and territory_id in territory_names:
                resolved_region = territory_names[territory_id]
            if not resolved_region:
                resolved_region = "Khác"
            region_revenue_map[resolved_region] += float(amount or 0.0)

        result: List[Dict[str, Any]] = []
        for reg, rev in region_revenue_map.items():
            percentage = round((rev / total_revenue * 100), 2) if total_revenue > 0 else 0.0
            result.append({
                "region": reg,
                "revenue": round(rev, 2),
                "percentage": percentage,
            })

        # Sort descending by revenue
        result.sort(key=lambda r: r["revenue"], reverse=True)
        return result
