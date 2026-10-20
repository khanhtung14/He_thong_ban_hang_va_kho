"""Sales target (quota) management, real-time progress tracking, and audit logging (SCRUM-67)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_current_user,
    normalize_role,
    require_roles,
    PERM_TARGETS_MANAGE,
    PERM_TARGETS_VIEW,
)
from app.core.database import get_db
from app.models.models import Customer, Order, OrderStatus, Payment, SalesTarget, TargetAuditLog, Territory, User

router = APIRouter(prefix="/api/v1/reports/sales-targets", tags=["Sales Targets"])
compat_router = APIRouter(prefix="/reports/sales-targets", tags=["Sales Targets Compat"])
direct_router = APIRouter(prefix="/api/v1/sales-targets", tags=["Sales Targets Direct"])
direct_compat_router = APIRouter(prefix="/sales-targets", tags=["Sales Targets Direct Compat"])


# ============================================================================
# Schemas
# ============================================================================

class SalesTargetCreate(BaseModel):
    staffId: Optional[int] = Field(None, alias="staffId")
    staff_id: Optional[int] = Field(None, alias="staff_id")
    salesRepId: Optional[int] = Field(None, alias="salesRepId")
    sales_rep_id: Optional[int] = Field(None, alias="sales_rep_id")
    userId: Optional[int] = Field(None, alias="userId")
    user_id: Optional[int] = Field(None, alias="user_id")

    region: Optional[str] = Field(None, alias="region")
    area: Optional[str] = Field(None, alias="area")
    territoryId: Optional[int] = Field(None, alias="territoryId")
    territory_id: Optional[int] = Field(None, alias="territory_id")

    month: Union[int, str] = Field(..., description="Tháng (1-12) hoặc dạng 'YYYY-MM'")
    year: Optional[int] = Field(None, description="Năm áp dụng (mặc định lấy theo năm hiện tại nếu month là int)")

    targetAmount: Optional[float] = Field(None, alias="targetAmount")
    target_amount: Optional[float] = Field(None, alias="target_amount")
    note: Optional[str] = None

    def get_staff_id(self) -> int:
        val = (
            self.staffId
            or self.staff_id
            or self.salesRepId
            or self.sales_rep_id
            or self.userId
            or self.user_id
        )
        if not val or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã nhân viên kinh doanh (staff_id / salesRepId) là bắt buộc và phải > 0.",
            )
        return val

    def get_target_amount(self) -> float:
        val = self.targetAmount if self.targetAmount is not None else self.target_amount
        if val is None or val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mức doanh số mục tiêu (targetAmount) là bắt buộc và phải lớn hơn 0.",
            )
        return float(val)

    def get_month_year(self) -> tuple[int, int]:
        current_year = date.today().year
        raw_m = self.month
        if isinstance(raw_m, str) and "-" in raw_m:
            parts = raw_m.strip().split("-")
            try:
                y = int(parts[0])
                m = int(parts[1])
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Định dạng kỳ tháng không hợp lệ: {raw_m}. Cần dạng 'YYYY-MM'.",
                )
        else:
            try:
                m = int(raw_m)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tháng không hợp lệ: {raw_m}.",
                )
            y = self.year or current_year

        if m < 1 or m > 12:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tháng phải nằm trong khoảng 1 đến 12 (nhận được: {m}).",
            )
        return m, y

    def get_region(self) -> Optional[str]:
        return (self.region or self.area or "").strip() or None

    def get_territory_id(self) -> Optional[int]:
        return self.territoryId or self.territory_id


class SalesTargetUpdate(BaseModel):
    targetAmount: Optional[float] = Field(None, alias="targetAmount")
    target_amount: Optional[float] = Field(None, alias="target_amount")
    region: Optional[str] = Field(None, alias="region")
    area: Optional[str] = Field(None, alias="area")
    territoryId: Optional[int] = Field(None, alias="territoryId")
    territory_id: Optional[int] = Field(None, alias="territory_id")
    note: Optional[str] = None
    reason: Optional[str] = Field(None, alias="reason")
    changeReason: Optional[str] = Field(None, alias="changeReason")
    change_reason: Optional[str] = Field(None, alias="change_reason")

    def get_new_amount(self) -> Optional[float]:
        val = self.targetAmount if self.targetAmount is not None else self.target_amount
        if val is not None and val <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doanh số mục tiêu mới phải lớn hơn 0.",
            )
        return float(val) if val is not None else None

    def get_reason(self) -> Optional[str]:
        val = self.reason or self.changeReason or self.change_reason or self.note
        return val.strip() if val and val.strip() else None


class SalesTargetLockRequest(BaseModel):
    isLocked: bool = Field(True, alias="isLocked")
    is_locked: Optional[bool] = Field(None, alias="is_locked")
    reason: Optional[str] = None

    def get_is_locked(self) -> bool:
        if self.is_locked is not None:
            return self.is_locked
        return self.isLocked


# ============================================================================
# Helpers
# ============================================================================

def _is_period_locked(target: SalesTarget, now: Optional[datetime] = None) -> bool:
    """Kiểm tra chỉ tiêu đã bị khóa hay chưa (chủ động khóa hoặc kỳ tháng đã qua)."""
    if target.is_locked:
        return True
    if now is None:
        now = datetime.now()
    # Nếu (year, month) < (now.year, now.month) thì tự động coi là kỳ đã qua -> Khóa
    if (target.year, target.month) < (now.year, now.month):
        return True
    return False


def _calculate_actual_sales(db: Session, staff_id: int, year: int, month: int) -> float:
    """Tính toán doanh số thực tế đã hoàn thành theo thời gian thực trong kỳ (tháng/năm)."""
    start_dt = datetime(year, month, 1, 0, 0, 0)
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, 0, 0, 0)
    else:
        end_dt = datetime(year, month + 1, 1, 0, 0, 0)

    # 1. Doanh số từ đơn hàng hợp lệ (không bị hủy)
    order_query = db.query(Order).filter(
        Order.created_by_id == staff_id,
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
        Order.status != OrderStatus.CANCELLED,
    )
    orders = order_query.all()
    order_total = round(sum(o.total_amount for o in orders), 2)

    # Nếu nhân viên chưa tạo trực tiếp đơn mà được gán đại lý
    if order_total == 0:
        assigned_orders = (
            db.query(Order)
            .join(Customer, Order.customer_id == Customer.id)
            .filter(
                or_(Customer.sales_rep_id == staff_id, Customer.assigned_sales_id == staff_id),
                Order.created_at >= start_dt,
                Order.created_at < end_dt,
                Order.status != OrderStatus.CANCELLED,
            )
            .all()
        )
        if assigned_orders:
            order_total = round(sum(o.total_amount for o in assigned_orders), 2)

    # 2. Doanh số từ các khoản thu hợp lệ (payments) đã thu trong kỳ
    payment_total = 0.0
    if hasattr(Payment, "sales_id"):
        payment_query = db.query(Payment).filter(
            Payment.sales_id == staff_id,
            Payment.payment_date >= start_dt,
            Payment.payment_date < end_dt,
        )
        if hasattr(Payment, "status"):
            payment_query = payment_query.filter(Payment.status != "REJECTED")
        payments = payment_query.all()
        payment_total = round(sum(p.amount for p in payments), 2)
    else:
        assigned_cust_ids = [
            c.id
            for c in db.query(Customer)
            .filter(or_(Customer.sales_rep_id == staff_id, Customer.assigned_sales_id == staff_id))
            .all()
        ]
        if assigned_cust_ids:
            payments = (
                db.query(Payment)
                .filter(
                    Payment.customer_id.in_(assigned_cust_ids),
                    Payment.payment_date >= start_dt,
                    Payment.payment_date < end_dt,
                )
                .all()
            )
            payment_total = round(sum(p.amount for p in payments), 2)

    # Doanh số thực tế tính theo nguồn doanh số có phát sinh trong kỳ
    return max(order_total, payment_total)


def _format_target(target: SalesTarget, db: Session, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Format đối tượng SalesTarget kèm số liệu tiến độ thời gian thực."""
    actual_amount = _calculate_actual_sales(db, target.sales_rep_id, target.year, target.month)
    target_amount = float(target.target_amount)
    is_locked = _is_period_locked(target, now)

    rate = round((actual_amount / target_amount) * 100, 2) if target_amount > 0 else 0.0
    remaining = max(0.0, round(target_amount - actual_amount, 2))

    sales_user = target.sales_rep or db.query(User).filter(User.id == target.sales_rep_id).first()
    sales_name = (sales_user.full_name or sales_user.username) if sales_user else None

    # Xác định trạng thái tiến độ
    if actual_amount > target_amount:
        status_str = "EXCEEDED"
    elif actual_amount == target_amount and target_amount > 0:
        status_str = "COMPLETED"
    else:
        status_str = "IN_PROGRESS"

    # Lịch sử audit logs
    audit_logs = [
        {
            "id": log.id,
            "targetId": log.target_id,
            "changedById": log.changed_by_id,
            "changedByName": (log.changed_by.full_name or log.changed_by.username) if log.changed_by else None,
            "oldAmount": float(log.old_amount),
            "newAmount": float(log.new_amount),
            "reason": log.reason,
            "changedAt": log.changed_at.isoformat() if log.changed_at else None,
        }
        for log in target.audit_logs
    ]

    return {
        "id": target.id,
        "salesRepId": target.sales_rep_id,
        "sales_rep_id": target.sales_rep_id,
        "staffId": target.sales_rep_id,
        "staff_id": target.sales_rep_id,
        "salesRepName": sales_name,
        "sales_rep_name": sales_name,
        "region": target.region,
        "territoryId": target.territory_id,
        "territory_id": target.territory_id,
        "month": target.month,
        "year": target.year,
        "period": target.period,
        "targetAmount": target_amount,
        "target_amount": target_amount,
        "actualAmount": actual_amount,
        "actual_amount": actual_amount,
        "completionRate": rate,
        "completion_rate": rate,
        "remainingAmount": remaining,
        "remaining_amount": remaining,
        "isLocked": is_locked,
        "is_locked": is_locked,
        "status": status_str,
        "note": target.note,
        "auditLogs": audit_logs,
        "audit_logs": audit_logs,
        "createdAt": target.created_at.isoformat() if target.created_at else None,
        "updatedAt": target.updated_at.isoformat() if target.updated_at else None,
    }


# ============================================================================
# Handlers
# ============================================================================

def handle_create_sales_target(
    payload: SalesTargetCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Thiết lập chỉ tiêu doanh số theo tháng cho nhân viên kinh doanh & khu vực (SCRUM-67)."""
    role = normalize_role(user.role)
    if role not in {"Sales Manager", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh hoặc Quản trị viên mới có quyền thiết lập chỉ tiêu doanh số.",
        )

    staff_id = payload.get_staff_id()
    staff_user = db.query(User).filter(User.id == staff_id).first()
    if not staff_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhân viên #{staff_id} trong hệ thống.",
        )

    month, year = payload.get_month_year()
    target_amount = payload.get_target_amount()
    region = payload.get_region()
    territory_id = payload.get_territory_id()

    # Kiểm tra chỉ tiêu đã tồn tại cho nhân viên trong cùng tháng/năm hay chưa
    existing = (
        db.query(SalesTarget)
        .filter(
            SalesTarget.sales_rep_id == staff_id,
            SalesTarget.month == month,
            SalesTarget.year == year,
        )
        .first()
    )

    if existing:
        # Nếu đã có, cập nhật lại chỉ tiêu
        existing.target_amount = target_amount
        if region is not None:
            existing.region = region
        if territory_id is not None:
            existing.territory_id = territory_id
        if payload.note is not None:
            existing.note = payload.note
        existing.updated_at = datetime.now()
        target = existing
    else:
        target = SalesTarget(
            sales_rep_id=staff_id,
            month=month,
            year=year,
            target_amount=target_amount,
            region=region,
            territory_id=territory_id,
            note=payload.note,
            created_by_id=user.id,
            is_locked=False,
        )
        db.add(target)

    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "code": 201,
        "message": "Thiết lập chỉ tiêu doanh số thành công",
        "data": _format_target(target, db),
    }


def handle_list_sales_targets(
    month: Optional[Union[int, str]] = Query(None),
    year: Optional[int] = Query(None),
    period: Optional[str] = Query(None),
    sales_rep_id: Optional[int] = Query(None, alias="salesRepId"),
    staff_id: Optional[int] = Query(None, alias="staffId"),
    user_id: Optional[int] = Query(None, alias="userId"),
    region: Optional[str] = Query(None),
    territory_id: Optional[int] = Query(None, alias="territoryId"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Danh sách và tiến độ thực hiện chỉ tiêu doanh số thời gian thực (SCRUM-67)."""
    role = normalize_role(user.role)
    target_staff_id = sales_rep_id or staff_id or user_id

    # Phân quyền: NVKD chỉ được xem tiến độ của chính mình
    if role in {"Sales Rep", "Sales"}:
        if target_staff_id is not None and target_staff_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nhân viên kinh doanh chỉ có quyền xem tiến độ của chính mình.",
            )
        target_staff_id = user.id
    elif role not in {"Sales Manager", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem báo cáo chỉ tiêu doanh số.",
        )

    query = db.query(SalesTarget)

    if target_staff_id:
        query = query.filter(SalesTarget.sales_rep_id == target_staff_id)

    if region:
        query = query.filter(SalesTarget.region == region.strip())

    if territory_id:
        query = query.filter(SalesTarget.territory_id == territory_id)

    # Lọc theo kỳ / tháng / năm
    filter_month = None
    filter_year = year

    if period and "-" in period:
        parts = period.strip().split("-")
        try:
            filter_year = int(parts[0])
            filter_month = int(parts[1])
        except ValueError:
            pass
    elif month is not None:
        if isinstance(month, str) and "-" in month:
            parts = month.strip().split("-")
            try:
                filter_year = int(parts[0])
                filter_month = int(parts[1])
            except ValueError:
                pass
        else:
            try:
                filter_month = int(month)
            except ValueError:
                pass

    if filter_month:
        query = query.filter(SalesTarget.month == filter_month)
    if filter_year:
        query = query.filter(SalesTarget.year == filter_year)

    targets = query.order_by(SalesTarget.year.desc(), SalesTarget.month.desc(), SalesTarget.id.desc()).all()
    formatted = [_format_target(t, db) for t in targets]

    total_target = round(sum(item["targetAmount"] for item in formatted), 2)
    total_actual = round(sum(item["actualAmount"] for item in formatted), 2)
    overall_rate = round((total_actual / total_target) * 100, 2) if total_target > 0 else 0.0

    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách và tiến độ chỉ tiêu doanh số thành công",
        "data": formatted,
        "summary": {
            "totalTargets": total_target,
            "totalActual": total_actual,
            "overallCompletionRate": overall_rate,
            "count": len(formatted),
        },
    }


def handle_get_sales_target_progress(
    period: Optional[str] = Query(None),
    month: Optional[Union[int, str]] = Query(None),
    year: Optional[int] = Query(None),
    sales_rep_id: Optional[int] = Query(None, alias="salesRepId"),
    staff_id: Optional[int] = Query(None, alias="staffId"),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Endpoint chuyên biệt xem tiến độ thực hiện chỉ tiêu theo thời gian thực (SCRUM-67)."""
    return handle_list_sales_targets(
        month=month,
        year=year,
        period=period,
        sales_rep_id=sales_rep_id,
        staff_id=staff_id,
        user_id=None,
        region=region,
        territory_id=None,
        db=db,
        user=user,
    )


def handle_get_sales_target_detail(
    id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Chi tiết một chỉ tiêu doanh số kèm tiến độ và lịch sử chỉnh sửa."""
    target = db.query(SalesTarget).filter(SalesTarget.id == id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chỉ tiêu #{id}.",
        )

    role = normalize_role(user.role)
    if role in {"Sales Rep", "Sales"} and target.sales_rep_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nhân viên kinh doanh chỉ có quyền xem chỉ tiêu của chính mình.",
        )

    return {
        "success": True,
        "code": 200,
        "data": _format_target(target, db),
    }


def handle_update_sales_target(
    id: int,
    payload: SalesTargetUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Chỉnh sửa chỉ tiêu doanh số.
    
    Yêu cầu nghiệp vụ:
    - NVKD không được tự ý sửa chỉ tiêu (403 Forbidden).
    - Chỉ tiêu của kỳ đã qua tự động bị khóa.
    - Nếu chỉ tiêu đã bị khóa, bắt buộc phải có lý do điều chỉnh (reason/note).
    - Mọi thao tác sửa đổi đều được lưu vào nhật ký kiểm toán (TargetAuditLog).
    """
    role = normalize_role(user.role)
    if role not in {"Sales Manager", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nhân viên kinh doanh không có quyền sửa chỉ tiêu doanh số.",
        )

    target = db.query(SalesTarget).filter(SalesTarget.id == id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chỉ tiêu #{id}.",
        )

    is_locked = _is_period_locked(target)
    reason = payload.get_reason()

    # Ràng buộc: nếu kỳ đã khóa, bắt buộc phải có lý do điều chỉnh
    if is_locked and not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ tiêu thuộc kỳ đã khóa. Bắt buộc phải nhập lý do điều chỉnh.",
        )

    new_amount = payload.get_new_amount()
    old_amount = float(target.target_amount)

    # Ghi nhận Audit Log nếu có thay đổi chỉ tiêu số tiền
    if new_amount is not None and new_amount != old_amount:
        audit_log = TargetAuditLog(
            target_id=target.id,
            changed_by_id=user.id,
            old_amount=old_amount,
            new_amount=new_amount,
            reason=reason or "Điều chỉnh chỉ tiêu doanh số",
            changed_at=datetime.now(),
        )
        db.add(audit_log)
        target.target_amount = new_amount

    if payload.region is not None or payload.area is not None:
        target.region = (payload.region or payload.area or "").strip() or None

    if payload.territoryId is not None or payload.territory_id is not None:
        target.territory_id = payload.territoryId or payload.territory_id

    if payload.note is not None:
        target.note = payload.note

    target.updated_at = datetime.now()
    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "code": 200,
        "message": "Cập nhật chỉ tiêu doanh số thành công",
        "data": _format_target(target, db),
    }


def handle_get_target_audit_logs(
    id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Xem nhật ký kiểm toán (audit logs) các lần điều chỉnh chỉ tiêu."""
    target = db.query(SalesTarget).filter(SalesTarget.id == id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chỉ tiêu #{id}.",
        )

    role = normalize_role(user.role)
    if role in {"Sales Rep", "Sales"} and target.sales_rep_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem nhật ký chỉ tiêu của nhân viên khác.",
        )

    logs = (
        db.query(TargetAuditLog)
        .filter(TargetAuditLog.target_id == id)
        .order_by(TargetAuditLog.id.desc())
        .all()
    )

    data = [
        {
            "id": log.id,
            "targetId": log.target_id,
            "changedById": log.changed_by_id,
            "changedByName": (log.changed_by.full_name or log.changed_by.username) if log.changed_by else None,
            "oldAmount": float(log.old_amount),
            "newAmount": float(log.new_amount),
            "reason": log.reason,
            "changedAt": log.changed_at.isoformat() if log.changed_at else None,
        }
        for log in logs
    ]

    return {
        "success": True,
        "code": 200,
        "data": data,
    }


def handle_toggle_lock_target(
    id: int,
    payload: Optional[SalesTargetLockRequest] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Khóa hoặc mở khóa thủ công chỉ tiêu doanh số (chỉ dành cho Quản lý / Admin)."""
    role = normalize_role(user.role)
    if role not in {"Sales Manager", "Admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh hoặc Quản trị viên mới có quyền khóa/mở khóa chỉ tiêu.",
        )

    target = db.query(SalesTarget).filter(SalesTarget.id == id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy chỉ tiêu #{id}.",
        )

    is_locked = payload.get_is_locked() if payload else True
    target.is_locked = is_locked
    target.updated_at = datetime.now()
    db.commit()
    db.refresh(target)

    msg = "Đã khóa chỉ tiêu doanh số" if is_locked else "Đã mở khóa chỉ tiêu doanh số"
    return {
        "success": True,
        "code": 200,
        "message": msg,
        "data": _format_target(target, db),
    }


# ============================================================================
# Route Registrations
# ============================================================================

# 1. Primary router: /api/v1/reports/sales-targets (Theo spec EP-09)
router.add_api_route("", handle_create_sales_target, methods=["POST"], status_code=201)
router.add_api_route("/", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
router.add_api_route("", handle_list_sales_targets, methods=["GET"])
router.add_api_route("/", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
router.add_api_route("/progress", handle_get_sales_target_progress, methods=["GET"])
router.add_api_route("/my-progress", handle_get_sales_target_progress, methods=["GET"], include_in_schema=False)
router.add_api_route("/{id}", handle_get_sales_target_detail, methods=["GET"])
router.add_api_route("/{id}", handle_update_sales_target, methods=["PUT"])
router.add_api_route("/{id}", handle_update_sales_target, methods=["PATCH"], include_in_schema=False)
router.add_api_route("/{id}/audit-logs", handle_get_target_audit_logs, methods=["GET"])
router.add_api_route("/{id}/lock", handle_toggle_lock_target, methods=["POST"])

# 2. Compat router: /reports/sales-targets (Tương thích không prefix /api/v1)
compat_router.add_api_route("", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
compat_router.add_api_route("/", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
compat_router.add_api_route("", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/progress", handle_get_sales_target_progress, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/my-progress", handle_get_sales_target_progress, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}", handle_get_sales_target_detail, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}", handle_update_sales_target, methods=["PUT"], include_in_schema=False)
compat_router.add_api_route("/{id}", handle_update_sales_target, methods=["PATCH"], include_in_schema=False)
compat_router.add_api_route("/{id}/audit-logs", handle_get_target_audit_logs, methods=["GET"], include_in_schema=False)
compat_router.add_api_route("/{id}/lock", handle_toggle_lock_target, methods=["POST"], include_in_schema=False)

# 3. Direct router: /api/v1/sales-targets
direct_router.add_api_route("", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
direct_router.add_api_route("/", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
direct_router.add_api_route("", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
direct_router.add_api_route("/", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
direct_router.add_api_route("/progress", handle_get_sales_target_progress, methods=["GET"], include_in_schema=False)
direct_router.add_api_route("/{id}", handle_get_sales_target_detail, methods=["GET"], include_in_schema=False)
direct_router.add_api_route("/{id}", handle_update_sales_target, methods=["PUT"], include_in_schema=False)
direct_router.add_api_route("/{id}", handle_update_sales_target, methods=["PATCH"], include_in_schema=False)
direct_router.add_api_route("/{id}/audit-logs", handle_get_target_audit_logs, methods=["GET"], include_in_schema=False)
direct_router.add_api_route("/{id}/lock", handle_toggle_lock_target, methods=["POST"], include_in_schema=False)

# 4. Direct compat router: /sales-targets
direct_compat_router.add_api_route("", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
direct_compat_router.add_api_route("/", handle_create_sales_target, methods=["POST"], status_code=201, include_in_schema=False)
direct_compat_router.add_api_route("", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
direct_compat_router.add_api_route("/", handle_list_sales_targets, methods=["GET"], include_in_schema=False)
direct_compat_router.add_api_route("/progress", handle_get_sales_target_progress, methods=["GET"], include_in_schema=False)
direct_compat_router.add_api_route("/{id}", handle_get_sales_target_detail, methods=["GET"], include_in_schema=False)
direct_compat_router.add_api_route("/{id}", handle_update_sales_target, methods=["PUT"], include_in_schema=False)
direct_compat_router.add_api_route("/{id}", handle_update_sales_target, methods=["PATCH"], include_in_schema=False)
direct_compat_router.add_api_route("/{id}/audit-logs", handle_get_target_audit_logs, methods=["GET"], include_in_schema=False)
direct_compat_router.add_api_route("/{id}/lock", handle_toggle_lock_target, methods=["POST"], include_in_schema=False)
