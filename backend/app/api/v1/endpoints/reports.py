"""Financial and managerial reports router with RBAC access control."""
from __future__ import annotations

import io
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW_FINANCIALS,
    AuthenticatedUser,
    require_permissions,
    require_roles,
)
from app.core.database import get_db
from app.models.models import (
    Order, OrderItem, OrderStatus, Product, Inventory, Warehouse, Category,
    Dispatch, DispatchItem, RoleCode,
)
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
            if not line.product_id:
                continue
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


# ===========================================================================
# SCRUM-74: Báo cáo tồn kho & Vòng quay hàng hóa (Phát hiện hàng chậm luân chuyển)
# ===========================================================================

def calculate_inventory_turnover_data(
    db: Session,
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    period_days: int = 90,
    threshold_days: int = 90,
    slow_moving_only: bool = False,
) -> Dict[str, Any]:
    """Tính toán báo cáo tồn kho, giá trị tồn và vòng quay hàng hóa (SCRUM-74).

    Công thức:
    - Giá trị tồn = Tồn thực tế * Đơn giá vốn (cost_price hoặc base_price)
    - Số lượng xuất trong kỳ = Tổng actual_qty đã xuất (từ phiếu xuất xác nhận hoặc đơn hoàn tất)
    - Vòng quay hàng tồn kho (Turnover) = Số lượng xuất / Tồn thực tế
    - Số ngày tồn bình quân (DSI - Days Sales of Inventory) = period_days / Turnover = Tồn thực tế / (Số lượng xuất / period_days)
    - Hàng chậm luân chuyển (is_slow_moving) = True nếu DSI >= threshold_days HOẶC không có giao dịch xuất trong kỳ (dispatched == 0 và physical > 0).
    """
    period_days = max(1, period_days)
    threshold_days = max(1, threshold_days)
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=period_days)

    # 1. Tính tổng số lượng đã xuất kho cho từng sản phẩm tại từng kho trong kỳ
    dispatched_map: Dict[tuple[int, int], float] = defaultdict(float)

    # Từ DispatchItem (phiếu xuất đã xác nhận)
    confirmed_dispatches = (
        db.query(Dispatch)
        .filter(
            Dispatch.is_confirmed == True,
            Dispatch.confirmed_at >= cutoff_date,
        )
        .all()
    )
    for d in confirmed_dispatches:
        wh_id = d.warehouse_id or 1
        for it in d.items:
            if it.product_id and it.actual_qty > 0:
                dispatched_map[(it.product_id, wh_id)] += float(it.actual_qty)

    # Từ các đơn hàng DELIVERED / COMPLETED trong kỳ (nếu chưa có bản ghi dispatch tương ứng)
    delivered_orders = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.status.in_([OrderStatus.DELIVERED, OrderStatus.COMPLETED]),
            Order.updated_at >= cutoff_date,
        )
        .all()
    )
    for o in delivered_orders:
        wh_id = o.warehouse_id or 1
        for it in o.items:
            if it.product_id:
                # Nếu chưa được đếm từ dispatch, ghi nhận số lượng đã giao
                key = (it.product_id, wh_id)
                if key not in dispatched_map:
                    deliv = float(getattr(it, "quantity_delivered", 0) or it.quantity or 0)
                    dispatched_map[key] += deliv

    # 2. Truy vấn dữ liệu tồn kho hiện tại
    inv_query = db.query(Inventory).join(Product, Inventory.product_id == Product.id)
    if warehouse_id:
        inv_query = inv_query.filter(Inventory.warehouse_id == warehouse_id)
    if category_id:
        inv_query = inv_query.filter(Product.category_id == category_id)

    inventories = inv_query.all()

    # Pre-fetch warehouses & categories & products
    warehouses_map = {w.id: w for w in db.query(Warehouse).all()}
    categories_map = {c.id: c for c in db.query(Category).all()}
    products_map = {p.id: p for p in db.query(Product).all()}

    sku_details = []
    warehouse_summary: Dict[int, Dict[str, Any]] = defaultdict(lambda: {"total_items": 0, "total_physical_qty": 0.0, "total_value": 0.0})
    category_summary: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total_items": 0, "total_physical_qty": 0.0, "total_value": 0.0})

    total_inventory_value = 0.0
    slow_moving_skus_count = 0
    slow_moving_value = 0.0

    for inv in inventories:
        prod = products_map.get(inv.product_id)
        if not prod:
            continue
        wh = warehouses_map.get(inv.warehouse_id)
        wh_name = wh.name if wh else f"Kho #{inv.warehouse_id}"
        wh_code = wh.code if wh else f"WH-{inv.warehouse_id}"

        cat = categories_map.get(prod.category_id) if prod.category_id else None
        cat_name = cat.name if cat else "Khác"
        cat_id = cat.id if cat else None

        cost_price = float(prod.cost_price if prod.cost_price and prod.cost_price > 0 else (prod.base_price or 0.0))
        physical_qty = float(inv.physical_qty or 0.0)
        reserved_qty = float(inv.reserved_qty or 0.0)
        available_qty = float(inv.available_qty or (physical_qty - reserved_qty))
        item_value = round(physical_qty * cost_price, 2)

        # Số lượng xuất trong kỳ
        dispatched_qty = float(dispatched_map.get((prod.id, inv.warehouse_id), 0.0))

        # Tính toán vòng quay & số ngày tồn kho (DSI)
        if physical_qty <= 0:
            turnover_ratio = 0.0
            days_in_inventory = 0.0
            is_slow_moving = False
            alert = "Hết hàng"
        else:
            if dispatched_qty <= 0:
                turnover_ratio = 0.0
                days_in_inventory = 999.0
                is_slow_moving = True
                alert = f"Không có xuất kho trong {period_days} ngày qua"
            else:
                daily_sales_rate = dispatched_qty / period_days
                days_in_inventory = round(physical_qty / daily_sales_rate, 1) if daily_sales_rate > 0 else 999.0
                turnover_ratio = round(dispatched_qty / physical_qty, 2)
                is_slow_moving = days_in_inventory >= threshold_days
                alert = f"Tồn kho {days_in_inventory:.0f} ngày (vượt ngưỡng {threshold_days} ngày)" if is_slow_moving else "Bình thường"

        if is_slow_moving:
            slow_moving_skus_count += 1
            slow_moving_value += item_value

        total_inventory_value += item_value

        # Tích lũy summary
        wh_agg = warehouse_summary[inv.warehouse_id]
        wh_agg["warehouse_id"] = inv.warehouse_id
        wh_agg["warehouse_code"] = wh_code
        wh_agg["warehouse_name"] = wh_name
        wh_agg["total_items"] += 1
        wh_agg["total_physical_qty"] += physical_qty
        wh_agg["total_value"] += item_value

        cat_agg = category_summary[cat_name]
        cat_agg["category_id"] = cat_id
        cat_agg["category_name"] = cat_name
        cat_agg["total_items"] += 1
        cat_agg["total_physical_qty"] += physical_qty
        cat_agg["total_value"] += item_value

        sku_row = {
            "product_id": prod.id,
            "sku": prod.sku,
            "product_name": prod.name,
            "base_unit": prod.base_unit or "Cái",
            "category_id": cat_id,
            "category_name": cat_name,
            "warehouse_id": inv.warehouse_id,
            "warehouse_code": wh_code,
            "warehouse_name": wh_name,
            "physical_qty": physical_qty,
            "reserved_qty": reserved_qty,
            "available_qty": available_qty,
            "cost_price": cost_price,
            "inventory_value": item_value,
            "dispatched_qty": dispatched_qty,
            "turnover_ratio": turnover_ratio,
            "days_in_inventory": days_in_inventory,
            "is_slow_moving": is_slow_moving,
            "alert": alert,
        }

        if not slow_moving_only or is_slow_moving:
            sku_details.append(sku_row)

    # Sort SKU theo giá trị tồn giảm dần
    sku_details.sort(key=lambda x: (not x["is_slow_moving"], -x["inventory_value"]))

    return {
        "report_name": "Báo cáo Tồn kho & Vòng quay hàng hóa (SCRUM-74)",
        "period_days": period_days,
        "threshold_days": threshold_days,
        "total_skus": len(inventories),
        "total_inventory_value": total_inventory_value,
        "slow_moving_skus_count": slow_moving_skus_count,
        "slow_moving_value": slow_moving_value,
        "slow_moving_percent": round((slow_moving_value / total_inventory_value * 100) if total_inventory_value > 0 else 0.0, 1),
        "by_warehouse": list(warehouse_summary.values()),
        "by_category": list(category_summary.values()),
        "sku_details": sku_details,
    }


def generate_inventory_turnover_excel(report_data: Dict[str, Any]) -> io.BytesIO:
    """Tạo file Excel chuyên nghiệp với 2 sheets cho SCRUM-74."""
    wb = openpyxl.Workbook()

    # Font và Style định dạng
    header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Calibri", size=14, bold=True, color="1F497D")
    sub_font = Font(name="Calibri", size=10, italic=True)
    slow_fill = PatternFill(start_color="FDE9D9", end_color="FDE9D9", fill_type="solid")  # Màu cam nhạt cảnh báo
    border_thin = Border(
        left=Side(style="thin", color="D9D9D9"),
        right=Side(style="thin", color="D9D9D9"),
        top=Side(style="thin", color="D9D9D9"),
        bottom=Side(style="thin", color="D9D9D9"),
    )

    # -------------------------------------------------------------
    # Sheet 1: Chi tiết tồn kho & Vòng quay từng SKU
    # -------------------------------------------------------------
    ws1 = wb.active
    assert ws1 is not None
    ws1.title = "Chi tiết SKU & Vòng quay"

    ws1.append(["BÁO CÁO TỒN KHO VÀ VÒNG QUAY HÀNG HÓA"])
    ws1["A1"].font = title_font
    ws1.append([
        f"Kỳ phân tích: {report_data['period_days']} ngày | "
        f"Ngưỡng chậm luân chuyển: {report_data['threshold_days']} ngày | "
        f"Tổng giá trị tồn: {report_data['total_inventory_value']:,.0f} VND | "
        f"Giá trị chậm luân chuyển: {report_data['slow_moving_value']:,.0f} VND ({report_data['slow_moving_percent']}%)"
    ])
    ws1["A2"].font = sub_font
    ws1.append([])  # blank row

    headers_ws1 = [
        "STT", "Mã SKU", "Tên sản phẩm", "ĐVT", "Nhóm hàng", "Kho hàng",
        "Tồn thực tế", "Tồn giữ chỗ", "Tồn khả dụng", "Đơn giá vốn (VND)",
        "Giá trị tồn (VND)", "Xuất trong kỳ", "Vòng quay (lần)", "Số ngày tồn (DSI)", "Cảnh báo"
    ]
    ws1.append(headers_ws1)
    header_row_idx = 4
    for col_idx in range(1, len(headers_ws1) + 1):
        cell = ws1.cell(row=header_row_idx, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for idx, item in enumerate(report_data["sku_details"], 1):
        row_values = [
            idx,
            item["sku"],
            item["product_name"],
            item["base_unit"],
            item["category_name"],
            item["warehouse_name"],
            item["physical_qty"],
            item["reserved_qty"],
            item["available_qty"],
            item["cost_price"],
            item["inventory_value"],
            item["dispatched_qty"],
            item["turnover_ratio"],
            item["days_in_inventory"] if item["days_in_inventory"] < 999 else "Chưa xuất",
            item["alert"],
        ]
        ws1.append(row_values)
        current_row = ws1.max_row
        is_slow = item["is_slow_moving"]
        for c in range(1, len(row_values) + 1):
            cell = ws1.cell(row=current_row, column=c)
            cell.border = border_thin
            if is_slow:
                cell.fill = slow_fill
            # Format số
            if c in (7, 8, 9, 12):
                cell.number_format = "#,##0"
            elif c in (10, 11):
                cell.number_format = "#,##0"
            elif c in (13, 14):
                cell.number_format = "0.0"

    # Auto-adjust column widths
    for col in ws1.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_idx = col[0].column
        if isinstance(col_idx, int):
            col_letter = get_column_letter(col_idx)
            ws1.column_dimensions[col_letter].width = min(max(max_len + 3, 11), 40)

    # -------------------------------------------------------------
    # Sheet 2: Tổng hợp theo Kho & Nhóm hàng
    # -------------------------------------------------------------
    ws2 = wb.create_sheet(title="Giá trị theo Kho & Nhóm")

    ws2.append(["TỔNG HỢP GIÁ TRỊ TỒN KHO THEO KHO HÀNG"])
    ws2["A1"].font = title_font
    ws2.append([])

    headers_wh = ["Mã kho", "Tên kho hàng", "Số lượng mặt hàng (SKU)", "Tổng số lượng tồn", "Tổng giá trị tồn (VND)"]
    ws2.append(headers_wh)
    wh_head_idx = 3
    for c in range(1, len(headers_wh) + 1):
        cell = ws2.cell(row=wh_head_idx, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for wh_row in report_data["by_warehouse"]:
        ws2.append([
            wh_row["warehouse_code"],
            wh_row["warehouse_name"],
            wh_row["total_items"],
            wh_row["total_physical_qty"],
            wh_row["total_value"],
        ])
        curr = ws2.max_row
        for c in range(1, len(headers_wh) + 1):
            cell = ws2.cell(row=curr, column=c)
            cell.border = border_thin
            if c == 4:
                cell.number_format = "#,##0"
            elif c == 5:
                cell.number_format = "#,##0"

    ws2.append([])
    ws2.append([])

    ws2.append(["TỔNG HỢP GIÁ TRỊ TỒN KHO THEO NHÓM HÀNG"])
    cat_title_idx = ws2.max_row
    ws2[f"A{cat_title_idx}"].font = title_font
    ws2.append([])

    headers_cat = ["Nhóm sản phẩm", "Số lượng mặt hàng (SKU)", "Tổng số lượng tồn", "Tổng giá trị tồn (VND)"]
    ws2.append(headers_cat)
    cat_head_idx = ws2.max_row
    for c in range(1, len(headers_cat) + 1):
        cell = ws2.cell(row=cat_head_idx, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for cat_row in report_data["by_category"]:
        ws2.append([
            cat_row["category_name"],
            cat_row["total_items"],
            cat_row["total_physical_qty"],
            cat_row["total_value"],
        ])
        curr = ws2.max_row
        for c in range(1, len(headers_cat) + 1):
            cell = ws2.cell(row=curr, column=c)
            cell.border = border_thin
            if c == 3:
                cell.number_format = "#,##0"
            elif c == 4:
                cell.number_format = "#,##0"

    for col in ws2.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_idx = col[0].column
        if isinstance(col_idx, int):
            col_letter = get_column_letter(col_idx)
            ws2.column_dimensions[col_letter].width = min(max(max_len + 3, 15), 45)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream


@router.get("/inventory-turnover")
def get_inventory_turnover_report(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    category_id: Optional[int] = Query(None, description="Lọc theo nhóm hàng"),
    period_days: int = Query(90, ge=1, le=365, description="Kỳ báo cáo phân tích (số ngày, mặc định 90)"),
    threshold_days: int = Query(90, ge=1, le=365, description="Ngưỡng xác định hàng chậm luân chuyển (số ngày tồn, mặc định 90)"),
    slow_moving_only: bool = Query(False, description="Chỉ xem các mặt hàng chậm luân chuyển"),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Manager", "WH Manager", "Warehouse Staff", "Warehouse", "Admin", "Sales Manager")),
):
    """Báo cáo tồn kho và vòng quay hàng để phát hiện hàng chậm luân chuyển đang chôn vốn (SCRUM-74)."""
    data = calculate_inventory_turnover_data(
        db=db,
        warehouse_id=warehouse_id,
        category_id=category_id,
        period_days=period_days,
        threshold_days=threshold_days,
        slow_moving_only=slow_moving_only,
    )
    return {
        "success": True,
        "code": 200,
        "data": data,
    }


@router.get("/inventory-turnover/export")
def export_inventory_turnover_excel(
    warehouse_id: Optional[int] = Query(None, description="Lọc theo kho hàng"),
    category_id: Optional[int] = Query(None, description="Lọc theo nhóm hàng"),
    period_days: int = Query(90, ge=1, le=365, description="Kỳ báo cáo phân tích (số ngày)"),
    threshold_days: int = Query(90, ge=1, le=365, description="Ngưỡng xác định hàng chậm luân chuyển"),
    slow_moving_only: bool = Query(False, description="Chỉ xuất các mặt hàng chậm luân chuyển"),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Warehouse Manager", "WH Manager", "Warehouse Staff", "Warehouse", "Admin", "Sales Manager")),
):
    """Xuất báo cáo tồn kho & vòng quay hàng ra định dạng Excel (.xlsx) chuẩn (SCRUM-74)."""
    data = calculate_inventory_turnover_data(
        db=db,
        warehouse_id=warehouse_id,
        category_id=category_id,
        period_days=period_days,
        threshold_days=threshold_days,
        slow_moving_only=slow_moving_only,
    )
    excel_stream = generate_inventory_turnover_excel(data)
    filename = f"Bao_cao_ton_kho_vong_quay_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=excel_stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
