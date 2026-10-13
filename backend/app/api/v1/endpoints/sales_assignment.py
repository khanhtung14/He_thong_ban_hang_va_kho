"""Sales assignment and bulk handover endpoints.

User Story:
"Là Quản lý kinh doanh, tôi muốn phân công nhân viên kinh doanh theo đại lý và khu vực
để mỗi đại lý đều có một người chịu trách nhiệm chăm sóc":
1. Gán một nhân viên phụ trách chính cho mỗi đại lý.
2. Nhân viên kinh doanh chỉ nhìn thấy danh sách đại lý mình được phân công phụ trách.
3. Chuyển giao địa bàn/đại lý hàng loạt khi nhân viên nghỉ, có ghi lịch sử bàn giao.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import (
        AccountAuditLog,
        Customer,
        HandoverHistory,
        RoleCode,
        Territory,
        User,
    )
    from app.api.v1.endpoints.rbac import (
        AuthenticatedUser,
        normalize_role,
        require_roles,
    )
except ImportError:  # pragma: no cover
    from app.core.database import get_db
    from app.models.models import (
        AccountAuditLog,
        Customer,
        HandoverHistory,
        RoleCode,
        Territory,
        User,
    )
    from app.api.v1.endpoints.rbac import (
        AuthenticatedUser,
        normalize_role,
        require_roles,
    )

router = APIRouter(tags=["Sales Assignments & Handover"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AssignSalesRequest(BaseModel):
    sales_user_id: int = Field(..., gt=0, description="ID của nhân viên kinh doanh phụ trách")
    region: Optional[str] = Field(None, max_length=100, description="Khu vực / địa bàn phân công")


class SalesAssignmentCreateRequest(BaseModel):
    customer_id: int = Field(..., gt=0, description="ID của đại lý")
    sales_user_id: int = Field(..., gt=0, description="ID của nhân viên kinh doanh phụ trách")
    region: Optional[str] = Field(None, max_length=100, description="Khu vực / địa bàn phân công")


class AssignSalesRepSpecRequest(BaseModel):
    salesRepId: Optional[int] = Field(None, description="ID NVKD (theo chuẩn camelCase của API_SPECIFICATION.md)")
    sales_user_id: Optional[int] = Field(None, description="ID NVKD (snake_case)")
    region: Optional[str] = Field(None, description="Khu vực")


class BulkHandoverRequest(BaseModel):
    from_user_id: int = Field(..., gt=0, description="ID nhân viên bàn giao")
    to_user_id: int = Field(..., gt=0, description="ID nhân viên nhận bàn giao")
    customer_ids: Optional[List[int]] = Field(None, description="Danh sách ID đại lý bàn giao (None hoặc rỗng để chuyển toàn bộ)")
    reason: str = Field(..., min_length=1, max_length=255, description="Lý do bàn giao (bắt buộc)")
    notes: Optional[str] = Field(None, max_length=1000, description="Ghi chú thêm")


class HandoverHistoryItem(BaseModel):
    id: int
    code: str
    handover_date: datetime
    created_at: datetime
    from_user_id: int
    from_user_name: str
    to_user_id: int
    to_user_name: str
    transferred_by_id: Optional[int] = None
    transferred_by_name: Optional[str] = None
    customer_count: int
    customer_ids: List[int] = Field(default_factory=list)
    reason: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _resolve_actor_id(user: AuthenticatedUser, db: Session) -> Optional[int]:
    if user.id:
        return user.id
    db_actor = db.query(User).filter(User.username == user.username).first()
    return db_actor.id if db_actor else None


def _perform_assignment(
    customer_id: int,
    sales_user_id: int,
    region: Optional[str],
    db: Session,
    actor: AuthenticatedUser,
) -> Dict[str, Any]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đại lý có ID: {customer_id}.",
        )

    sales_user = db.get(User, sales_user_id)
    if not sales_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhân viên kinh doanh có ID: {sales_user_id}.",
        )

    old_sales_rep_id = customer.sales_rep_id
    customer.sales_rep_id = sales_user.id
    if region is not None:
        customer.region = region.strip() or None
        # Tùy chọn map tên/mã khu vực vào territory_id nếu có
        territory = db.query(Territory).filter(
            (Territory.name == customer.region) | (Territory.code == customer.region)
        ).first()
        if territory:
            customer.territory_id = territory.id

    actor_id = _resolve_actor_id(actor, db)
    db.add(AccountAuditLog(
        user_id=sales_user.id,
        actor_user_id=actor_id,
        action="ASSIGN_SALES_REP",
        reason=f"Gán đại lý '{customer.name}' ({customer.code}) từ NVKD ID {old_sales_rep_id} sang NVKD '{sales_user.username}' (khu vực: {customer.region})",
    ))
    db.commit()
    db.refresh(customer)

    return {
        "id": customer.id,
        "code": customer.code,
        "name": customer.name,
        "sales_rep_id": customer.sales_rep_id,
        "sales_rep_name": sales_user.full_name or sales_user.username,
        "territory_id": customer.territory_id,
        "region": customer.region,
        "customer_group": customer.customer_group,
        "is_active": customer.is_active,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/v1/sales/reps")
@router.get("/api/v1/users/sales-reps")
@router.get("/api/v1/users")
def list_sales_reps(
    role: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin", "Accountant")),
):
    """Lấy danh sách nhân viên kinh doanh để chọn trong dropdown phân công / bàn giao."""
    users = (
        db.query(User)
        .filter(User.is_active.is_(True))
        .order_by(User.full_name.asc())
        .all()
    )
    sales_users = []
    for u in users:
        role_codes = {r.code.upper() for r in u.roles} if u.roles else set()
        if not role_codes or any(rc in role_codes for rc in ["SALES", "SALES_REP", "SALES REP", "KINH_DOANH"]):
            sales_users.append({
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name or u.username,
                "email": u.email,
                "phone": u.phone,
                "role": "Sales Rep",
            })
    if not sales_users:
        sales_users = [
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name or u.username,
                "email": u.email,
                "phone": u.phone,
                "role": "Sales Rep",
            }
            for u in users
        ]
    return {
        "success": True,
        "code": 200,
        "data": sales_users,
    }


@router.post("/api/v1/customers/{customer_id}/assign-sales")
def assign_sales_rep_for_customer(
    customer_id: int,
    payload: AssignSalesRequest,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """1. Gán / Cập nhật người phụ trách cho một đại lý theo customer_id."""
    assigned_data = _perform_assignment(
        customer_id=customer_id,
        sales_user_id=payload.sales_user_id,
        region=payload.region,
        db=db,
        actor=actor,
    )
    return {
        "success": True,
        "code": 200,
        "message": "Phân công nhân viên kinh doanh phụ trách đại lý thành công.",
        "data": assigned_data,
    }


@router.post("/api/v1/sales-assignments")
def create_sales_assignment(
    payload: SalesAssignmentCreateRequest,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """Gán / Cập nhật người phụ trách đại lý (route thay thế POST /api/v1/sales-assignments)."""
    assigned_data = _perform_assignment(
        customer_id=payload.customer_id,
        sales_user_id=payload.sales_user_id,
        region=payload.region,
        db=db,
        actor=actor,
    )
    return {
        "success": True,
        "code": 200,
        "message": "Phân công nhân viên kinh doanh phụ trách đại lý thành công.",
        "data": assigned_data,
    }


@router.patch("/api/v1/customers/{customer_id}/assign-sales-rep")
def assign_sales_rep_spec_compat(
    customer_id: int,
    payload: AssignSalesRepSpecRequest,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """Tương thích đặc tả API_SPECIFICATION.md (S3-06: PATCH /customers/{id}/assign-sales-rep)."""
    target_rep_id = payload.salesRepId or payload.sales_user_id
    if not target_rep_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải cung cấp salesRepId hoặc sales_user_id.",
        )
    assigned_data = _perform_assignment(
        customer_id=customer_id,
        sales_user_id=target_rep_id,
        region=payload.region,
        db=db,
        actor=actor,
    )
    return {
        "success": True,
        "code": 200,
        "message": "Gán NVKD phụ trách đại lý thành công.",
        "data": assigned_data,
    }


@router.post("/api/v1/sales/handover/batch")
def bulk_handover_dealers(
    payload: BulkHandoverRequest,
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """2. Chuyển giao địa bàn / danh sách đại lý hàng loạt từ nhân viên cũ sang nhân viên mới."""
    from_user = db.get(User, payload.from_user_id)
    if not from_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhân viên bàn giao có ID: {payload.from_user_id}.",
        )

    to_user = db.get(User, payload.to_user_id)
    if not to_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy nhân viên nhận bàn giao có ID: {payload.to_user_id}.",
        )

    if from_user.id == to_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhân viên nhận bàn giao phải khác nhân viên bàn giao.",
        )

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do bàn giao không được để trống.",
        )

    # Lấy danh sách đại lý cần chuyển giao
    if payload.customer_ids:
        query = select(Customer).where(
            Customer.id.in_(payload.customer_ids),
            Customer.sales_rep_id == from_user.id,
        )
        customers = db.execute(query).scalars().all()
        if not customers:
            # Kiểm tra xem có đại lý nào thuộc ID đã cho không
            all_target = db.execute(select(Customer).where(Customer.id.in_(payload.customer_ids))).scalars().all()
            if not all_target:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Không tìm thấy đại lý nào trong danh sách được chọn.",
                )
            # Nếu người dùng muốn ép chuyển giao danh sách đã chọn dù sales_rep_id trước đó là null hoặc khác
            customers = all_target
    else:
        # Chuyển giao toàn bộ đại lý đang được phân công cho nhân viên cũ
        query = select(Customer).where(Customer.sales_rep_id == from_user.id)
        customers = db.execute(query).scalars().all()
        if not customers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhân viên {from_user.full_name or from_user.username} hiện không phụ trách đại lý nào để bàn giao.",
            )

    transferred_ids: List[int] = []
    for c in customers:
        c.sales_rep_id = to_user.id
        transferred_ids.append(c.id)

    now = datetime.now(timezone.utc)
    ho_code = f"HO-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    actor_id = _resolve_actor_id(actor, db)

    history_entry = HandoverHistory(
        code=ho_code,
        from_user_id=from_user.id,
        to_user_id=to_user.id,
        transferred_by_id=actor_id,
        customer_ids=transferred_ids,
        customer_count=len(transferred_ids),
        reason=clean_reason,
        notes=payload.notes.strip() if payload.notes else None,
        created_at=now,
    )
    db.add(history_entry)

    # Ghi nhận audit log hệ thống
    db.add(AccountAuditLog(
        user_id=to_user.id,
        actor_user_id=actor_id,
        action="BULK_HANDOVER_CUSTOMERS",
        reason=(
            f"Bàn giao {len(transferred_ids)} đại lý từ '{from_user.username}' sang '{to_user.username}'. "
            f"Lý do: {clean_reason}. Ghi chú: {payload.notes or 'Không'}"
        ),
    ))

    db.commit()
    db.refresh(history_entry)

    from_name = from_user.full_name or from_user.username
    to_name = to_user.full_name or to_user.username

    return {
        "success": True,
        "code": 200,
        "message": f"Đã chuyển giao thành công {len(transferred_ids)} đại lý từ {from_name} sang {to_name}.",
        "data": {
            "handover_id": history_entry.id,
            "code": history_entry.code,
            "from_user_id": from_user.id,
            "from_user_name": from_name,
            "to_user_id": to_user.id,
            "to_user_name": to_name,
            "customer_count": len(transferred_ids),
            "customer_ids": transferred_ids,
            "reason": clean_reason,
            "notes": history_entry.notes,
            "created_at": history_entry.created_at,
        },
    }


@router.get("/api/v1/sales/handover/history")
def get_handover_history(
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    limit: int = Query(20, ge=1, le=100, description="Số bản ghi mỗi trang"),
    from_user_id: Optional[int] = Query(None, description="Lọc theo nhân viên bàn giao"),
    to_user_id: Optional[int] = Query(None, description="Lọc theo nhân viên nhận bàn giao"),
    db: Session = Depends(get_db),
    actor: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """3. Lịch sử chuyển giao: trả về danh sách các đợt bàn giao đại lý."""
    query = select(HandoverHistory)
    if from_user_id is not None:
        query = query.where(HandoverHistory.from_user_id == from_user_id)
    if to_user_id is not None:
        query = query.where(HandoverHistory.to_user_id == to_user_id)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    offset = (page - 1) * limit

    records = db.execute(
        query.order_by(HandoverHistory.created_at.desc(), HandoverHistory.id.desc())
        .offset(offset)
        .limit(limit)
    ).scalars().all()

    items = []
    for rec in records:
        from_name = rec.from_user.full_name or rec.from_user.username if rec.from_user else f"User #{rec.from_user_id}"
        to_name = rec.to_user.full_name or rec.to_user.username if rec.to_user else f"User #{rec.to_user_id}"
        actor_name = (
            rec.transferred_by.full_name or rec.transferred_by.username
            if rec.transferred_by
            else "Quản lý hệ thống"
        )
        c_ids = rec.customer_ids if isinstance(rec.customer_ids, list) else []

        items.append({
            "id": rec.id,
            "code": rec.code,
            "handover_date": rec.created_at,
            "created_at": rec.created_at,
            "from_user_id": rec.from_user_id,
            "from_user_name": from_name,
            "to_user_id": rec.to_user_id,
            "to_user_name": to_name,
            "transferred_by_id": rec.transferred_by_id,
            "transferred_by_name": actor_name,
            "customer_count": rec.customer_count,
            "customer_ids": c_ids,
            "reason": rec.reason,
            "notes": rec.notes,
        })

    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return {
        "success": True,
        "code": 200,
        "message": "Lấy lịch sử bàn giao thành công.",
        "data": items,
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total,
            "totalPages": total_pages,
        },
    }
