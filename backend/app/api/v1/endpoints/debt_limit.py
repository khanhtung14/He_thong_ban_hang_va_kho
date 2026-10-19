"""Debt Limit Control endpoints (Kiểm soát hạn mức công nợ - SCRUM-21).

Yêu cầu nghiệp vụ:
1. Cho phép Kế toán công nợ (RoleCode.ACCOUNTANT) và Quản lý kinh doanh (RoleCode.SALES_MANAGER),
   cùng Quản trị hệ thống (RoleCode.ADMIN) cập nhật hạn mức công nợ (số tiền và số ngày) cho Đại lý/Khách hàng.
2. Kiểm tra phân quyền chặt chẽ (Default-Deny) - các vai trò khác (Sales Rep, Warehouse, WH Manager, Customer) bị từ chối 403 Forbidden.
3. Sử dụng Database Transaction nguyên tử để đồng thời:
   - Cập nhật credit_limit, max_debt_days, max_due_days trên bản ghi Agency/Customer.
   - Ghi bản ghi log mới vào bảng credit_limit_logs (DebtLimitHistory).
4. Bắt buộc nhập lý do thay đổi (reason) - trả về 400 Bad Request nếu để trống hoặc chỉ chứa khoảng trắng.
5. Hỗ trợ đầy đủ các routes theo chuẩn RESTful API:
   - PUT /api/v1/customers/{id}/credit-limit (API_SPECIFICATION EP-03)
   - PUT /api/v1/customers/{id}/debt-limit
   - PUT /api/v1/agencies/{id}/credit-limit
   - PUT /api/v1/agencies/{id}/debt-limit
   - PUT /api/agencies/{id}/credit-limit
   - GET /api/v1/customers/{id}/credit-limit
   - GET /api/v1/customers/{id}/debt-limit/history
   - GET /api/v1/agencies/{id}/credit-limit/history
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Agency, Customer, CreditLimitLog, DebtLimitHistory, RoleCode, User
from app.api.v1.endpoints.rbac import AuthenticatedUser, normalize_role, require_roles

router = APIRouter(prefix="/api/v1", tags=["Kiểm soát hạn mức công nợ"])
compat_router = APIRouter(prefix="/api", tags=["Kiểm soát hạn mức công nợ (Alias)"])

# Tập hợp vai trò được phép cập nhật hạn mức công nợ:
# Chỉ role Kế toán công nợ (Accountant) và Quản lý kinh doanh (Sales Manager).
ALLOWED_DEBT_ROLES = {
    RoleCode.ACCOUNTANT.value,
    RoleCode.SALES_MANAGER.value,
}


def require_debt_limit_permission(
    user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager")),
) -> AuthenticatedUser:
    """Xác thực người dùng có vai trò Kế toán công nợ hoặc Quản lý kinh doanh."""
    norm_role = normalize_role(user.role)
    if norm_role not in ALLOWED_DEBT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quyền bị từ chối: Chỉ vai trò Kế toán công nợ hoặc Quản lý kinh doanh mới có quyền cập nhật hạn mức công nợ.",
        )
    return user


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class DebtLimitUpdateRequest(BaseModel):
    # Hỗ trợ cả hai định dạng đặt tên: max_debt_amount / credit_limit / creditLimit / new_limit
    credit_limit: Optional[float] = Field(
        None,
        ge=0,
        description="Hạn mức tiền nợ tối đa (VND)",
        json_schema_extra={"example": 50000000.0},
    )
    creditLimit: Optional[float] = Field(
        None,
        ge=0,
        description="Alias camelCase theo API Specification",
    )
    max_debt_amount: Optional[float] = Field(
        None,
        ge=0,
        description="Alias tương thích ngược cho hạn mức tiền nợ (VND)",
    )
    new_limit: Optional[float] = Field(
        None,
        ge=0,
        description="Alias tương thích cho credit_limit",
    )

    # Hỗ trợ cả hai định dạng đặt tên cho số ngày nợ: max_debt_days / max_due_days / maxDueDays / new_days
    max_debt_days: Optional[int] = Field(
        None,
        ge=0,
        description="Số ngày cho phép nợ tối đa",
        json_schema_extra={"example": 30},
    )
    max_due_days: Optional[int] = Field(
        None,
        ge=0,
        description="Alias tương thích cho max_debt_days",
    )
    maxDueDays: Optional[int] = Field(
        None,
        ge=0,
        description="Alias camelCase theo API Specification",
    )
    new_days: Optional[int] = Field(
        None,
        ge=0,
        description="Alias tương thích cho max_debt_days",
    )

    # Ngưỡng cảnh báo nợ (%)
    warning_threshold_percent: Optional[float] = Field(
        80.0,
        ge=0,
        le=100,
        description="Ngưỡng phần trăm cảnh báo chạm hạn mức",
    )
    warningThresholdPercent: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Alias camelCase cho warning_threshold_percent",
    )

    # Lý do thay đổi (bắt buộc)
    reason: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Lý do thay đổi hạn mức (bắt buộc nhập)",
        json_schema_extra={"example": "Nâng hạn mức sau thẩm định hồ sơ tín dụng đại lý"},
    )

    @field_validator("credit_limit", "creditLimit", "max_debt_amount", "new_limit")
    @classmethod
    def validate_debt_amount(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
        return v

    @field_validator("max_debt_days", "max_due_days", "maxDueDays", "new_days")
    @classmethod
    def validate_debt_days(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
        return v


class DebtLimitHistoryItem(BaseModel):
    id: int
    agency_id: int
    old_limit: float
    new_limit: float
    old_credit_limit: Optional[float] = None
    new_credit_limit: Optional[float] = None
    old_debt_days: Optional[int] = 0
    new_debt_days: Optional[int] = 0
    old_max_debt_days: Optional[int] = 0
    new_max_debt_days: Optional[int] = 0
    reason: str
    changed_by: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DebtLimitDetailResponse(BaseModel):
    agency_id: int
    customer_code: str
    customer_name: str
    credit_limit: float
    max_debt_amount: float
    max_debt_days: int
    max_due_days: int
    current_debt: float = 0.0
    warning_threshold_percent: float = 80.0
    usage_percent: float = 0.0
    history: List[DebtLimitHistoryItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Core Service Logic: Transactional Update (SCRUM-21)
# ---------------------------------------------------------------------------

def _execute_debt_limit_update(
    agency_id: int,
    payload: DebtLimitUpdateRequest,
    user: AuthenticatedUser,
    db: Session,
) -> Dict[str, Any]:
    """Cập nhật nguyên tử hạn mức công nợ và ghi log lịch sử."""
    # 1. Validate lý do (BẮT BUỘC - Không được rỗng hoặc chỉ có khoảng trắng)
    clean_reason = (payload.reason or "").strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do thay đổi hạn mức (reason không được để trống).",
        )

    # 2. Xác định giá trị tiền hạn mức mới
    amount_val = None
    for candidate in [payload.credit_limit, payload.creditLimit, payload.max_debt_amount, payload.new_limit]:
        if candidate is not None:
            amount_val = candidate
            break

    if amount_val is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp số tiền hạn mức công nợ (credit_limit).",
        )

    # 3. Xác định số ngày nợ mới
    days_val = None
    for candidate in [payload.max_debt_days, payload.maxDueDays, payload.max_due_days, payload.new_days]:
        if candidate is not None:
            days_val = candidate
            break
    if days_val is None:
        days_val = 0

    if amount_val < 0 or days_val < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0",
        )

    # 4. Xác định ngưỡng cảnh báo
    warning_val = payload.warningThresholdPercent if payload.warningThresholdPercent is not None else payload.warning_threshold_percent
    if warning_val is None:
        warning_val = 80.0

    # 5. Tìm bản ghi Đại lý (Customer / Agency)
    customer = db.get(Customer, agency_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý có ID {agency_id}!",
        )

    # 6. Lưu lại hạn mức và số ngày nợ cũ trước khi cập nhật
    old_amount = float(getattr(customer, "credit_limit", 0.0) or 0.0)
    old_days = int(getattr(customer, "max_debt_days", 0) or getattr(customer, "max_due_days", 0) or 0)

    # Chặn lưu khi không có thay đổi dữ liệu (tránh rác audit log)
    if float(amount_val) == old_amount and days_val == old_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không có thay đổi nào so với hạn mức hiện tại.",
        )

    actor_display = getattr(user, "full_name", None) or user.username

    # 7. DATABASE TRANSACTION: Cập nhật thông tin đại lý và ghi credit_limit_logs đồng thời
    try:
        # Cập nhật thông tin đại lý
        customer.credit_limit = float(amount_val)
        customer.max_debt_days = days_val
        customer.max_due_days = days_val
        customer.warning_threshold_percent = float(warning_val)
        customer.warning_threshold = float(warning_val)

        # Ghi log lịch sử vào bảng credit_limit_logs (CreditLimitLog)
        log_entry = CreditLimitLog(
            agency_id=customer.id,
            old_credit_limit=old_amount,
            new_credit_limit=float(amount_val),
            old_max_debt_days=old_days,
            new_max_debt_days=days_val,
            reason=clean_reason,
            changed_by_user_id=getattr(user, "id", None),
            changed_by_name=actor_display,
            created_by=actor_display,
        )
        db.add(log_entry)
        db.commit()
        db.refresh(customer)
        db.refresh(log_entry)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Giao dịch thất bại khi cập nhật hạn mức: {str(exc)}",
        ) from exc

    iso_created_at = (
        (log_entry.created_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"))
        if log_entry.created_at and log_entry.created_at.tzinfo is None
        else (log_entry.created_at.isoformat() if log_entry.created_at else None)
    )

    return {
        "success": True,
        "code": 200,
        "message": "Cập nhật hạn mức công nợ thành công.",
        "data": {
            "agency_id": customer.id,
            "customer_code": customer.code,
            "customer_name": customer.name,
            "old_limit": old_amount,
            "new_limit": customer.credit_limit,
            "old_credit_limit": old_amount,
            "new_credit_limit": customer.credit_limit,
            "old_debt_days": old_days,
            "new_debt_days": customer.max_debt_days,
            "old_max_debt_days": old_days,
            "new_max_debt_days": customer.max_debt_days,
            "max_debt_amount": customer.credit_limit,
            "max_debt_days": customer.max_debt_days,
            "credit_limit": customer.credit_limit,
            "max_due_days": customer.max_due_days,
            "current_debt": getattr(customer, "current_debt", 0.0) or 0.0,
            "warning_threshold_percent": customer.warning_threshold_percent,
            "reason": clean_reason,
            "changed_by": actor_display,
            "changed_by_name": actor_display,
            "created_by": actor_display,
            "history_id": log_entry.id,
            "created_at": iso_created_at,
            "log": {
                "id": log_entry.id,
                "old_credit_limit": log_entry.old_credit_limit,
                "new_credit_limit": log_entry.new_credit_limit,
                "old_max_debt_days": log_entry.old_max_debt_days,
                "new_max_debt_days": log_entry.new_max_debt_days,
                "reason": log_entry.reason,
                "changed_by_user_id": getattr(user, "id", None),
                "changed_by_name": actor_display,
                "created_at": iso_created_at,
            },
        },
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.put("/customers/{customer_id}/credit-limit", operation_id="update_customer_credit_limit_v2")
@router.put("/customers/{customer_id}/debt-limit", operation_id="update_customer_debt_limit")
def update_customer_credit_limit(
    customer_id: int,
    payload: DebtLimitUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_debt_limit_permission),
):
    """Cập nhật hạn mức công nợ và số ngày nợ cho Đại lý / Khách hàng (SCRUM-21)."""
    return _execute_debt_limit_update(agency_id=customer_id, payload=payload, user=user, db=db)


@router.put("/agencies/{agency_id}/credit-limit")
@router.put("/agencies/{agency_id}/debt-limit")
def update_agency_credit_limit_alias(
    agency_id: int,
    payload: DebtLimitUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_debt_limit_permission),
):
    """Alias endpoint hỗ trợ URI /api/v1/agencies/{agency_id}/credit-limit."""
    return _execute_debt_limit_update(agency_id=agency_id, payload=payload, user=user, db=db)


@compat_router.put("/agencies/{agency_id}/credit-limit")
@compat_router.put("/customers/{agency_id}/credit-limit")
def update_agency_credit_limit_direct(
    agency_id: int,
    payload: DebtLimitUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_debt_limit_permission),
):
    """Hỗ trợ trực tiếp URI /api/agencies/{agency_id}/credit-limit."""
    return _execute_debt_limit_update(agency_id=agency_id, payload=payload, user=user, db=db)


@router.get("/customers/{customer_id}/credit-limit")
@router.get("/customers/{customer_id}/debt-limit")
def get_customer_debt_limit_info(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Sales Rep", "Admin", "Customer")),
):
    """Lấy thông tin hạn mức công nợ hiện tại của đại lý."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    credit_limit = getattr(customer, "credit_limit", 0.0) or 0.0
    max_debt_days = getattr(customer, "max_debt_days", 0) or getattr(customer, "max_due_days", 0) or 0
    current_debt = getattr(customer, "current_debt", 0.0) or 0.0
    warning_pct = getattr(customer, "warning_threshold_percent", 80.0) or 80.0

    return {
        "success": True,
        "code": 200,
        "data": {
            "agency_id": customer.id,
            "customer_code": customer.code,
            "customer_name": customer.name,
            "credit_limit": credit_limit,
            "max_debt_amount": credit_limit,
            "max_due_days": max_debt_days,
            "max_debt_days": max_debt_days,
            "current_debt": current_debt,
            "warning_threshold_percent": warning_pct,
            "usage_percent": round((current_debt / credit_limit * 100) if credit_limit > 0 else 0.0, 1),
        },
    }


@router.get("/agencies/{agency_id}/credit-limit")
@router.get("/agencies/{agency_id}/debt-limit")
@compat_router.get("/agencies/{agency_id}/credit-limit")
def get_agency_debt_limit_info_alias(
    agency_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Sales Rep", "Admin", "Customer")),
):
    """Alias cho /api/v1/customers/{customer_id}/credit-limit."""
    return get_customer_debt_limit_info(customer_id=agency_id, db=db, user=user)


@router.get("/customers/{customer_id}/credit-limit/history")
@router.get("/customers/{customer_id}/debt-limit/history")
def get_customer_debt_limit_history(
    customer_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Sales Rep", "Admin")),
):
    """Lấy danh sách nhật ký thay đổi hạn mức công nợ (credit_limit_logs)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    logs = (
        db.query(CreditLimitLog)
        .filter(CreditLimitLog.agency_id == customer_id)
        .order_by(desc(CreditLimitLog.id))
        .limit(limit)
        .all()
    )

    items = [
        {
            "id": log.id,
            "agency_id": log.agency_id,
            "old_limit": log.old_credit_limit,
            "new_limit": log.new_credit_limit,
            "old_credit_limit": log.old_credit_limit,
            "new_credit_limit": log.new_credit_limit,
            "old_debt_days": log.old_max_debt_days,
            "new_debt_days": log.new_max_debt_days,
            "old_max_debt_days": log.old_max_debt_days,
            "new_max_debt_days": log.new_max_debt_days,
            "reason": log.reason,
            "changed_by": log.created_by,
            "created_by": log.created_by,
            "created_at": (
                (log.created_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"))
                if log.created_at and log.created_at.tzinfo is None
                else (log.created_at.isoformat() if log.created_at else None)
            ),
        }
        for log in logs
    ]

    return {
        "success": True,
        "code": 200,
        "data": items,
        "total": len(items),
    }


@router.get("/agencies/{agency_id}/credit-limit/history")
@router.get("/agencies/{agency_id}/debt-limit/history")
@compat_router.get("/agencies/{agency_id}/credit-limit/history")
def get_agency_debt_limit_history_alias(
    agency_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Sales Rep", "Admin")),
):
    """Alias cho /api/v1/customers/{customer_id}/credit-limit/history."""
    return get_customer_debt_limit_history(customer_id=agency_id, limit=limit, db=db, user=user)


# ===========================================================================
# SCRUM-42: Hệ thống tự cảnh báo & khóa bán theo công nợ
# ===========================================================================

# Cấu hình chính sách xử lý đơn mới khi đại lý bị gắn cờ: BLOCK hoặc REQUIRE_APPROVAL
_DEBT_POLICY: Dict[str, str] = {"action": "BLOCK"}


def get_debt_policy() -> Dict[str, str]:
    return _DEBT_POLICY


def set_debt_policy(action: str) -> Dict[str, str]:
    normalized = action.strip().upper()
    if normalized not in ("BLOCK", "REQUIRE_APPROVAL"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chính sách chỉ chấp nhận 'BLOCK' (chặn đơn mới) hoặc 'REQUIRE_APPROVAL' (chuyển sang cần duyệt).",
        )
    _DEBT_POLICY["action"] = normalized
    return _DEBT_POLICY


def evaluate_customer_debt_status(db: Session, customer_id: int) -> Dict[str, Any]:
    """Đánh giá trạng thái công nợ của một đại lý (SCRUM-42).
    - Vượt hạn mức tiền nợ (current_debt > credit_limit).
    - Hoặc có khoản nợ quá số ngày cho phép (oldest_debt_days > max_debt_days).
    => Tự động gắn cờ is_debt_flagged = True kèm lý do.
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        return {"error": "Không tìm thấy đại lý"}

    credit_limit = float(getattr(customer, "credit_limit", 0.0) or 0.0)
    current_debt = float(getattr(customer, "current_debt", 0.0) or 0.0)
    max_debt_days = int(getattr(customer, "max_debt_days", None) or getattr(customer, "max_due_days", None) or 0)
    oldest_debt_days = int(getattr(customer, "oldest_debt_days", 0) or getattr(customer, "overdue_days", 0) or 0)

    exceeded_amount = (credit_limit > 0) and (current_debt > credit_limit)
    exceeded_days = (max_debt_days > 0) and (oldest_debt_days > max_debt_days)

    reasons = []
    if exceeded_amount:
        reasons.append(f"Vượt hạn mức nợ ({current_debt:,.0f} > {credit_limit:,.0f} VND)")
    if exceeded_days:
        reasons.append(f"Quá hạn số ngày nợ ({oldest_debt_days} ngày > {max_debt_days} ngày)")

    was_flagged = getattr(customer, "is_debt_flagged", False)

    if exceeded_amount or exceeded_days:
        customer.is_debt_flagged = True
        customer.debt_flag_reason = "; ".join(reasons)
        customer.debt_flagged_at = datetime.now(timezone.utc)
        if _DEBT_POLICY.get("action") == "BLOCK":
            customer.is_locked = True
            customer.lock_reason = customer.debt_flag_reason
    else:
        # Nếu đã trả nợ hoặc không còn vi phạm hạn mức -> gỡ cờ
        if was_flagged:
            customer.is_debt_flagged = False
            customer.debt_flag_reason = None
            customer.debt_flagged_at = None
            if customer.is_locked and ("Vượt hạn mức" in (customer.lock_reason or "") or "Quá hạn" in (customer.lock_reason or "")):
                customer.is_locked = False
                customer.lock_reason = None

    db.flush()
    return {
        "customer_id": customer.id,
        "customer_code": customer.code,
        "customer_name": customer.name,
        "is_debt_flagged": customer.is_debt_flagged,
        "debt_flag_reason": customer.debt_flag_reason,
        "current_debt": current_debt,
        "credit_limit": credit_limit,
        "oldest_debt_days": oldest_debt_days,
        "max_debt_days": max_debt_days,
    }


def evaluate_all_customers_debt_status(db: Session) -> Dict[str, Any]:
    """Đánh giá lại toàn bộ đại lý đang hoạt động (chạy định kỳ hàng ngày hoặc sau khi thu tiền)."""
    customers = db.query(Customer).filter(Customer.is_active == True).all()
    flagged_count = 0
    clean_count = 0
    results = []

    for cust in customers:
        res = evaluate_customer_debt_status(db, cust.id)
        if res.get("is_debt_flagged"):
            flagged_count += 1
        else:
            clean_count += 1
        results.append(res)

    db.commit()
    return {
        "total_evaluated": len(customers),
        "flagged_count": flagged_count,
        "clean_count": clean_count,
        "results": results,
    }


class DebtPolicyRequest(BaseModel):
    action: str = Field(..., description="'BLOCK' hoặc 'REQUIRE_APPROVAL'")


@router.get("/accounting/debt-config")
def get_debt_config(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Lấy cấu hình chính sách khi đại lý bị gắn cờ công nợ (SCRUM-42)."""
    return {
        "success": True,
        "code": 200,
        "data": get_debt_policy(),
    }


@router.put("/accounting/debt-config")
def update_debt_config(
    payload: DebtPolicyRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Admin")),
):
    """Cập nhật chính sách xử lý đơn khi đại lý bị gắn cờ nợ: BLOCK hoặc REQUIRE_APPROVAL."""
    updated = set_debt_policy(payload.action)
    return {
        "success": True,
        "code": 200,
        "message": f"Đã cập nhật chính sách công nợ sang '{updated['action']}'.",
        "data": updated,
    }


@router.post("/accounting/debt/evaluate-all")
def trigger_evaluate_all_debts(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Kích hoạt tác vụ đánh giá lại công nợ toàn bộ đại lý (chạy mỗi ngày một lần hoặc theo nhu cầu)."""
    res = evaluate_all_customers_debt_status(db)
    return {
        "success": True,
        "code": 200,
        "message": f"Đã hoàn thành đánh giá lại {res['total_evaluated']} đại lý. Số đại lý bị gắn cờ: {res['flagged_count']}.",
        "data": res,
    }


@router.post("/accounting/debt/evaluate/{customer_id}")
def trigger_evaluate_customer_debt(
    customer_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Đánh giá lại công nợ cho một đại lý cụ thể."""
    res = evaluate_customer_debt_status(db, customer_id)
    db.commit()
    return {
        "success": True,
        "code": 200,
        "data": res,
    }


@router.get("/accounting/debt-flagged-agencies")
def get_debt_flagged_agencies(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Danh sách các đại lý đang bị gắn cờ cảnh báo công nợ."""
    customers = db.query(Customer).filter(Customer.is_debt_flagged == True).all()
    results = [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "phone": c.phone,
            "current_debt": float(c.current_debt or 0.0),
            "credit_limit": float(c.credit_limit or 0.0),
            "max_debt_days": int(getattr(c, "max_debt_days", 0) or 0),
            "oldest_debt_days": int(getattr(c, "oldest_debt_days", 0) or 0),
            "is_debt_flagged": c.is_debt_flagged,
            "debt_flag_reason": c.debt_flag_reason,
            "debt_flagged_at": c.debt_flagged_at.isoformat() if c.debt_flagged_at else None,
            "is_locked": c.is_locked,
        }
        for c in customers
    ]
    return {
        "success": True,
        "code": 200,
        "total": len(results),
        "data": results,
    }
