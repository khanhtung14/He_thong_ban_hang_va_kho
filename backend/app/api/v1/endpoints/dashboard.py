"""Executive Dashboard API endpoints for Sales & Inventory overview (SCRUM-70).

Implements:
- GET /api/v1/dashboard/executive: Aggregated high-level metrics for Sales Manager & Admin.
- RBAC: Sales Manager and Admin only (403 Forbidden for other roles, 401 Unauthorized for unauth).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles
from app.core.database import get_db
from app.models.models import RoleCode
from app.services.dashboard_service import ExecutiveDashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])
compat_router = APIRouter(prefix="/dashboard", tags=["Dashboard Compatibility"])


class KpiCardsModel(BaseModel):
    today_revenue: float = Field(..., description="Doanh số hôm nay (VND)")
    month_revenue: float = Field(..., description="Doanh số tháng này (VND)")
    pending_approval_orders: int = Field(..., description="Số lượng đơn chờ duyệt")
    pending_dispatch_orders: int = Field(..., description="Số lượng đơn chờ xuất kho")
    total_overdue_debt: float = Field(..., description="Tổng công nợ quá hạn (VND)")
    low_stock_sku_count: int = Field(..., description="Số lượng SKU dưới mức tồn tối thiểu")


class DailyRevenueTrendModel(BaseModel):
    date: str = Field(..., description="Ngày trong tháng YYYY-MM-DD")
    revenue: float = Field(..., description="Doanh thu phát sinh trong ngày")
    order_count: int = Field(..., description="Số lượng đơn hàng hoàn tất/duyệt trong ngày")


class RevenueByRegionModel(BaseModel):
    region: str = Field(..., description="Tên khu vực / địa bàn")
    revenue: float = Field(..., description="Doanh số theo khu vực")
    percentage: float = Field(..., description="Tỷ trọng doanh số (%)")


class OverdueDealerModel(BaseModel):
    id: int = Field(..., description="ID đại lý")
    customer_id: int = Field(..., description="Mã ID đại lý")
    code: str = Field(..., description="Mã khách hàng / đại lý")
    name: str = Field(..., description="Tên đại lý")
    phone: Optional[str] = Field(None, description="Số điện thoại")
    overdue_amount: float = Field(..., description="Số tiền nợ quá hạn (VND)")
    current_debt: float = Field(..., description="Tổng dư nợ hiện tại (VND)")
    credit_limit: float = Field(..., description="Hạn mức tín dụng được cấp (VND)")
    overdue_days: int = Field(..., description="Số ngày nợ quá hạn")
    region: Optional[str] = Field(None, description="Khu vực hoạt động")


class ExecutiveDashboardData(BaseModel):
    kpi_cards: KpiCardsModel
    today_revenue: float
    month_revenue: float
    pending_approval_orders: int
    pending_dispatch_orders: int
    total_overdue_debt: float
    low_stock_sku_count: int
    daily_revenue_trend: List[DailyRevenueTrendModel]
    revenue_by_region: List[RevenueByRegionModel]
    overdue_dealers: List[OverdueDealerModel]


class ExecutiveDashboardResponse(BaseModel):
    success: bool = True
    code: int = 200
    message: str = "Lấy dữ liệu dashboard điều hành thành công"
    data: ExecutiveDashboardData


def _handle_executive_dashboard(
    as_of_date: Optional[str],
    db: Session,
    user: AuthenticatedUser,
) -> ExecutiveDashboardResponse:
    service = ExecutiveDashboardService(db)
    summary_data = service.get_executive_summary(as_of_date=as_of_date)
    return ExecutiveDashboardResponse(
        success=True,
        code=status.HTTP_200_OK,
        message="Lấy dữ liệu dashboard điều hành thành công",
        data=ExecutiveDashboardData.model_validate(summary_data),
    )


@router.get(
    "/executive",
    response_model=ExecutiveDashboardResponse,
    summary="Dashboard điều hành bán hàng và kho (SCRUM-70)",
    description=(
        "Cung cấp các thẻ KPI tổng quan (doanh số hôm nay/tháng này, đơn chờ duyệt, "
        "đơn chờ xuất kho, công nợ quá hạn, SKU dưới mức tồn tối thiểu), biểu đồ xu hướng "
        "doanh số theo ngày và theo khu vực, cùng danh sách đại lý quá hạn nợ sắp xếp theo số tiền nợ giảm dần."
    ),
)
def get_executive_dashboard(
    as_of_date: Optional[str] = Query(None, description="Ngày mốc tham chiếu YYYY-MM-DD (mặc định hôm nay)"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles(RoleCode.SALES_MANAGER, RoleCode.ADMIN)),
) -> ExecutiveDashboardResponse:
    return _handle_executive_dashboard(as_of_date, db, user)


@compat_router.get(
    "/executive",
    response_model=ExecutiveDashboardResponse,
    include_in_schema=False,
)
def get_executive_dashboard_compat(
    as_of_date: Optional[str] = Query(None, description="Ngày mốc tham chiếu YYYY-MM-DD (mặc định hôm nay)"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles(RoleCode.SALES_MANAGER, RoleCode.ADMIN)),
) -> ExecutiveDashboardResponse:
    return _handle_executive_dashboard(as_of_date, db, user)
