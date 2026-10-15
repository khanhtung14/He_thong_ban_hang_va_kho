"""Customer/Agency Management Module (SCRUM: Quản lý hồ sơ đại lý).

User Story:
"Là Kế toán công nợ, tôi muốn quản lý hồ sơ đại lý, để có một danh sách khách hàng chuẩn thay vì mỗi nhân viên giữ một file riêng."

Tiêu chí nghiệm thu:
1. Khai báo mã đại lý, tên, mã số thuế, nhóm khách hàng, khu vực, người phụ trách, trạng thái.
2. Mã đại lý là duy nhất (case-insensitive).
3. Nhóm khách hàng quyết định bảng giá được áp dụng.
4. Đại lý đã phát sinh giao dịch thì không xoá được, chỉ ngừng giao dịch.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.models import Customer, CustomerDebt, Order, OrderStatus, PriceList, PriceListItem, RoleCode, User
from app.api.v1.endpoints.price_lists import CustomerGroup
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    get_optional_current_user,
    normalize_role,
)

router = APIRouter(prefix="/api/v1/customers", tags=["Customer Management"])
agencies_router = APIRouter(prefix="/api/v1/agencies", tags=["Customer Management"])

INCOMPLETE_STATUSES = {
    OrderStatus.DRAFT,
    OrderStatus.PENDING_APPROVAL,
    OrderStatus.PROCESSING,
}


def _coerce_customer_group(value: Any) -> str:
    if value is None:
        return CustomerGroup.RETAIL.value
    if isinstance(value, str):
        normalized = value.strip().upper()
        if normalized in {member.value for member in CustomerGroup}:
            return normalized
        alias_map = {
            "LEVEL1": CustomerGroup.LEVEL_1.value,
            "LEVEL_1": CustomerGroup.LEVEL_1.value,
            "DEALER_LEVEL_1": CustomerGroup.LEVEL_1.value,
            "LEVEL2": CustomerGroup.LEVEL_2.value,
            "LEVEL_2": CustomerGroup.LEVEL_2.value,
            "DEALER_LEVEL_2": CustomerGroup.LEVEL_2.value,
            "RETAIL": CustomerGroup.RETAIL.value,
        }
        return alias_map.get(normalized, CustomerGroup.RETAIL.value)
    if isinstance(value, int):
        group_by_id = {
            1: CustomerGroup.LEVEL_1.value,
            2: CustomerGroup.LEVEL_2.value,
            3: CustomerGroup.RETAIL.value,
        }
        return group_by_id.get(value, CustomerGroup.RETAIL.value)
    return str(value).strip().upper() or CustomerGroup.RETAIL.value


def get_customer_transactions_count(db: Session, customer_id: int) -> int:
    """Đếm tổng số giao dịch đã phát sinh của đại lý (đơn hàng, hóa đơn, thanh toán...)."""
    count = 0
    try:
        count += (
            db.query(func.count(Order.id))
            .filter(Order.customer_id == customer_id)
            .scalar()
            or 0
        )
    except Exception:
        pass
    try:
        from app.models.models import Invoice

        count += (
            db.query(func.count(Invoice.id))
            .filter(Invoice.customer_id == customer_id)
            .scalar()
            or 0
        )
    except Exception:
        pass
    try:
        from app.models.models import Payment

        count += (
            db.query(func.count(Payment.id))
            .filter(Payment.customer_id == customer_id)
            .scalar()
            or 0
        )
    except Exception:
        pass
    return count


def get_effective_price_list_for_customer(db: Session, customer_group: str) -> Optional[dict]:
    """Tìm bảng giá hiện hành áp dụng cho nhóm khách hàng."""
    today = date.today()
    try:
        pl = (
            db.execute(
                select(PriceList)
                .options(selectinload(PriceList.items))
                .where(
                    PriceList.published.is_(True),
                    PriceList.customer_group == customer_group,
                    PriceList.start_date <= today,
                    PriceList.end_date >= today,
                )
                .order_by(PriceList.start_date.desc(), PriceList.version.desc())
            )
            .scalars()
            .first()
        )
        if not pl:
            pl = (
                db.execute(
                    select(PriceList)
                    .options(selectinload(PriceList.items))
                    .where(
                        PriceList.published.is_(True),
                        PriceList.customer_group == customer_group,
                    )
                    .order_by(PriceList.start_date.desc(), PriceList.version.desc())
                )
                .scalars()
                .first()
            )
        if pl:
            return {
                "id": pl.id,
                "code": pl.code,
                "version": pl.version,
                "customer_group": pl.customer_group,
                "start_date": pl.start_date.isoformat() if pl.start_date else None,
                "end_date": pl.end_date.isoformat() if pl.end_date else None,
                "published": pl.published,
                "items_count": len(pl.items) if pl.items else 0,
                "items": [
                    {
                        "sku": item.sku,
                        "sale_price": item.sale_price,
                        "floor_price": item.floor_price,
                    }
                    for item in pl.items
                ]
                if pl.items
                else [],
            }
    except Exception:
        pass
    return None


def resolve_person_in_charge(
    db: Session,
    person_in_charge: Optional[Union[str, int]],
    sales_rep_id: Optional[int],
) -> tuple[Optional[int], Optional[str]]:
    """Phân giải thông tin người phụ trách (sales_rep_id và rep_name)."""
    rep_id = sales_rep_id
    rep_name: Optional[str] = None
    if rep_id is None and person_in_charge is not None:
        if isinstance(person_in_charge, int) or (
            isinstance(person_in_charge, str) and person_in_charge.strip().isdigit()
        ):
            rep_id = int(person_in_charge)
        elif isinstance(person_in_charge, str) and person_in_charge.strip():
            u = (
                db.query(User)
                .filter(
                    (func.lower(User.full_name) == person_in_charge.strip().lower())
                    | (func.lower(User.username) == person_in_charge.strip().lower())
                )
                .first()
            )
            if u:
                rep_id = u.id
                rep_name = u.full_name
            else:
                rep_name = person_in_charge.strip()

    if rep_id is not None and not rep_name:
        u = db.get(User, rep_id)
        if u:
            rep_name = u.full_name

    return rep_id, rep_name


def serialize_customer(customer: Customer, db: Session) -> dict:
    """Chuyển đổi Customer model thành dictionary đầy đủ chuẩn camelCase và snake_case."""
    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    tx_count = get_customer_transactions_count(db, customer.id)

    rep_name = None
    if customer.sales_rep:
        rep_name = customer.sales_rep.full_name
    elif customer.sales_rep_id:
        u = db.get(User, customer.sales_rep_id)
        if u:
            rep_name = u.full_name

    status_str = "ACTIVE" if customer.is_active else "INACTIVE"
    rep_id = getattr(customer, "assigned_sales_id", None) or customer.sales_rep_id
    person = rep_name or (rep_id if rep_id else None)

    return {
        "id": customer.id,
        "code": customer.code,
        "name": customer.name,
        "tax_code": customer.tax_code,
        "taxCode": customer.tax_code,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "customer_group": customer.customer_group,
        "customerGroup": customer.customer_group,
        "region": customer.region,
        "regionId": customer.territory_id,
        "territory_id": customer.territory_id,
        "person_in_charge": person,
        "sales_rep_id": rep_id,
        "salesRepId": rep_id,
        "assigned_sales_id": rep_id,
        "status": status_str,
        "is_active": customer.is_active,
        "isActive": customer.is_active,
        "is_locked": customer.is_locked,
        "isLocked": customer.is_locked,
        "lock_reason": customer.lock_reason,
        "lockReason": customer.lock_reason,
        "locked_at": customer.locked_at,
        "locked_by_id": customer.locked_by_id,
        "current_debt": 0.0,
        "currentDebt": 0.0,
        "debt_limit": getattr(customer, "credit_limit", 0.0),
        "creditLimit": getattr(customer, "credit_limit", 0.0),
        "maxDueDays": getattr(customer, "max_due_days", 0),
        "pending_orders_count": pending_count,
        "transactions_count": tx_count,
        "created_at": customer.created_at,
        "createdAt": customer.created_at,
    }


def check_customer_management_role(user: Optional[AuthenticatedUser]) -> None:
    """Kiểm tra quyền quản lý đại lý: Accountant, Admin, Sales Manager."""
    if user is not None:
        user_norm = normalize_role(user.role)
        allowed = {
            RoleCode.ACCOUNTANT.value,
            RoleCode.ADMIN.value,
            RoleCode.SALES_MANAGER.value,
        }
        if user_norm not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Quyền bị từ chối: Vai trò '{user.role}' không được phép thực hiện thao tác quản lý đại lý.",
            )


# ---------------------------------------------------------
# Schemas
# ---------------------------------------------------------


class CustomerCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50, description="Mã đại lý (duy nhất)")
    name: str = Field(..., min_length=1, max_length=150, description="Tên đại lý")
    tax_code: Optional[str] = Field(default=None, max_length=50, alias="taxCode")
    taxCode: Optional[str] = None
    customer_group: Optional[str] = Field(default=None, alias="customerGroup")
    customerGroup: Optional[str] = None
    customer_group_id: Optional[int] = Field(default=None, alias="customerGroupId")
    customerGroupId: Optional[int] = None
    region: Optional[str] = Field(default=None, max_length=100)
    regionId: Optional[int] = Field(default=None, alias="territory_id")
    territory_id: Optional[int] = None
    person_in_charge: Optional[Union[str, int]] = None
    sales_rep_id: Optional[int] = None
    salesRepId: Optional[int] = None
    assigned_sales_id: Optional[int] = None
    status: Optional[str] = Field(default="ACTIVE")
    is_active: Optional[bool] = Field(default=True)
    phone: Optional[str] = Field(default=None, max_length=25)
    email: Optional[str] = Field(default=None, max_length=150)
    address: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @field_validator("code", "name")
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip() if value else value

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "taxCode" in normalized and "tax_code" not in normalized:
            normalized["tax_code"] = normalized["taxCode"]
        rep = normalized.get("assigned_sales_id") or normalized.get("sales_rep_id") or normalized.get("salesRepId")
        if rep is not None:
            normalized["sales_rep_id"] = rep
            normalized["salesRepId"] = rep
            normalized["assigned_sales_id"] = rep
        if "regionId" in normalized and "territory_id" not in normalized:
            normalized["territory_id"] = normalized["regionId"]
        if "customerGroupId" in normalized and "customer_group_id" not in normalized:
            normalized["customer_group_id"] = normalized["customerGroupId"]
        if "customerGroup" in normalized and "customer_group" not in normalized:
            normalized["customer_group"] = normalized["customerGroup"]
        return normalized


class CustomerUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    tax_code: Optional[str] = Field(default=None, max_length=50, alias="taxCode")
    taxCode: Optional[str] = None
    customer_group: Optional[str] = Field(default=None, alias="customerGroup")
    customerGroup: Optional[str] = None
    customer_group_id: Optional[int] = Field(default=None, alias="customerGroupId")
    customerGroupId: Optional[int] = None
    region: Optional[str] = Field(default=None, max_length=100)
    regionId: Optional[int] = Field(default=None, alias="territory_id")
    territory_id: Optional[int] = None
    person_in_charge: Optional[Union[str, int]] = None
    sales_rep_id: Optional[int] = None
    salesRepId: Optional[int] = None
    assigned_sales_id: Optional[int] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "taxCode" in normalized and "tax_code" not in normalized:
            normalized["tax_code"] = normalized["taxCode"]
        rep = normalized.get("assigned_sales_id") or normalized.get("sales_rep_id") or normalized.get("salesRepId")
        if rep is not None:
            normalized["sales_rep_id"] = rep
            normalized["salesRepId"] = rep
            normalized["assigned_sales_id"] = rep
        if "regionId" in normalized and "territory_id" not in normalized:
            normalized["territory_id"] = normalized["regionId"]
        if "customerGroupId" in normalized and "customer_group_id" not in normalized:
            normalized["customer_group_id"] = normalized["customerGroupId"]
        if "customerGroup" in normalized and "customer_group" not in normalized:
            normalized["customer_group"] = normalized["customerGroup"]
        return normalized


class CustomerStatusUpdate(BaseModel):
    is_active: Optional[bool] = None
    status: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class CustomerResponse(BaseModel):
    id: int
    code: str
    name: str
    tax_code: Optional[str] = None
    taxCode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customer_group: str = "RETAIL"
    customerGroup: str = "RETAIL"
    region: Optional[str] = None
    regionId: Optional[int] = None
    territory_id: Optional[int] = None
    person_in_charge: Optional[Union[str, int]] = None
    sales_rep_id: Optional[int] = None
    salesRepId: Optional[int] = None
    status: str = "ACTIVE"
    is_active: bool = True
    isActive: bool = True
    is_locked: bool = False
    isLocked: bool = False
    lock_reason: Optional[str] = None
    lockReason: Optional[str] = None
    current_debt: float = 0.0
    currentDebt: float = 0.0
    debt_limit: float = 0.0
    creditLimit: float = 0.0
    pending_orders_count: int = 0
    transactions_count: int = 0
    created_at: Optional[Any] = None
    createdAt: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---------------------------------------------------------
# Core Handlers
# ---------------------------------------------------------


def handle_list_customers(
    keyword: Optional[str] = None,
    search: Optional[str] = None,
    sales_rep_id: Optional[int] = None,
    region: Optional[str] = None,
    region_id: Optional[int] = None,
    customer_group: Optional[str] = None,
    is_active: Optional[bool] = None,
    status_filter: Optional[str] = None,
    is_locked: Optional[bool] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = None,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Truy vấn danh sách đại lý có hỗ trợ bộ lọc và phân trang."""
    query = select(Customer)

    # Tìm kiếm theo mã đại lý, tên, mã số thuế
    search_term = ""
    if isinstance(keyword, str) and keyword.strip():
        search_term = keyword.strip()
    elif isinstance(search, str) and search.strip():
        search_term = search.strip()

    if search_term:
        kw = f"%{search_term}%"
        query = query.where(
            (Customer.code.ilike(kw))
            | (Customer.name.ilike(kw))
            | (Customer.tax_code.ilike(kw))
        )

    # Lọc khu vực
    if isinstance(region, str) and region.strip() and region.strip().upper() != "ALL":
        query = query.where(Customer.region == region.strip())
    if isinstance(region_id, int):
        query = query.where(Customer.territory_id == region_id)

    # Lọc nhóm khách hàng
    if isinstance(customer_group, str) and customer_group.strip() and customer_group.strip().upper() != "ALL":
        query = query.where(
            Customer.customer_group == _coerce_customer_group(customer_group)
        )

    # Lọc trạng thái hoạt động
    if isinstance(is_active, bool):
        query = query.where(Customer.is_active == is_active)
    elif isinstance(status_filter, str) and status_filter.strip():
        st = status_filter.strip().upper()
        if st in ["ACTIVE", "HOẠT ĐỘNG"]:
            query = query.where(Customer.is_locked == False, Customer.is_active == True)
        elif st in ["INACTIVE", "NGỪNG GIAO DỊCH"]:
            query = query.where(Customer.is_active == False)
        elif st in ["LOCKED", "ĐÃ KHÓA", "BỊ KHÓA"]:
            query = query.where(Customer.is_locked == True)

    # Lọc trạng thái khóa
    if isinstance(is_locked, bool):
        query = query.where(Customer.is_locked == is_locked)

    # Phân quyền Sales Rep: chỉ xem đại lý do mình phụ trách
    if user:
        norm_role = normalize_role(user.role)
        if norm_role == RoleCode.SALES_REP.value:
            rep_id = user.id
            if rep_id is None:
                db_user = (
                    db.execute(select(User).where(User.username == user.username))
                    .scalar_one_or_none()
                )
                if db_user:
                    rep_id = db_user.id
            if rep_id is not None:
                query = query.where(Customer.sales_rep_id == rep_id)
            else:
                query = query.where(Customer.sales_rep_id == -1)
        elif isinstance(sales_rep_id, int):
            query = query.where(Customer.sales_rep_id == sales_rep_id)
    elif isinstance(sales_rep_id, int):
        query = query.where(Customer.sales_rep_id == sales_rep_id)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordered_query = query.order_by(Customer.id.asc())

    if isinstance(page, int) or isinstance(limit, int):
        p = max(1, page if isinstance(page, int) else 1)
        l = max(1, limit if isinstance(limit, int) else 20)
        items = db.execute(ordered_query.offset((p - 1) * l).limit(l)).scalars().all()
        serialized_items = [serialize_customer(it, db) for it in items]
        total_pages = (total + l - 1) // l if l > 0 else 1
        return {
            "success": True,
            "code": 200,
            "message": "Thành công",
            "data": serialized_items,
            "pagination": {
                "page": p,
                "limit": l,
                "totalRecords": total,
                "totalPages": total_pages,
                "total_records": total,
                "total_pages": total_pages,
            },
        }

    # Trả về list trực tiếp khi không yêu cầu phân trang
    items = db.execute(ordered_query).scalars().all()
    return [serialize_customer(it, db) for it in items]


def handle_get_customer_detail(
    customer_id: int,
    db: Session,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Lấy chi tiết hồ sơ một đại lý và bảng giá tương ứng theo nhóm khách hàng."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý")

    data = serialize_customer(customer, db)
    price_list = get_effective_price_list_for_customer(db, customer.customer_group)
    data["price_list"] = price_list
    data["effective_price_list"] = price_list

    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": data,
        **data,
    }


def handle_create_customer(
    payload: CustomerCreate,
    db: Session,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Tạo mới hồ sơ đại lý kèm kiểm tra trùng mã duy nhất (case-insensitive)."""
    check_customer_management_role(user)

    code_clean = payload.code.strip()
    if not code_clean:
        raise HTTPException(status_code=400, detail="Mã đại lý không được để trống!")

    # BẮT BUỘC: Mã đại lý là DUY NHẤT (case-insensitive)
    existing_code = (
        db.execute(
            select(Customer).where(func.lower(Customer.code) == code_clean.lower())
        )
        .scalars()
        .first()
    )
    if existing_code:
        raise HTTPException(
            status_code=400,
            detail="Mã đại lý đã tồn tại trên hệ thống",
        )

    tax_val = payload.tax_code or payload.taxCode
    if tax_val and tax_val.strip():
        existing_tax = (
            db.execute(
                select(Customer).where(
                    func.lower(Customer.tax_code) == tax_val.strip().lower()
                )
            )
            .scalars()
            .first()
        )
        if existing_tax:
            raise HTTPException(status_code=400, detail="Mã số thuế đã tồn tại!")

    group_raw = (
        payload.customer_group
        or payload.customerGroup
        or payload.customer_group_id
        or payload.customerGroupId
    )
    group_str = _coerce_customer_group(group_raw)

    rep_to_resolve = (
        payload.assigned_sales_id
        if payload.assigned_sales_id is not None
        else payload.sales_rep_id
        if payload.sales_rep_id is not None
        else payload.salesRepId
    )

    # Kiểm tra xem user_id có tồn tại trong bảng users không
    if rep_to_resolve is not None:
        user_exists = db.get(User, rep_to_resolve)
        if not user_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhân viên kinh doanh có ID '{rep_to_resolve}' không tồn tại trên hệ thống.",
            )

    rep_id, _ = resolve_person_in_charge(
        db, payload.person_in_charge, rep_to_resolve
    )
    reg_id = payload.territory_id or payload.regionId

    is_active_val = payload.is_active if payload.is_active is not None else True
    if payload.status:
        st = payload.status.strip().upper()
        if st in ["ACTIVE", "HOẠT ĐỘNG"]:
            is_active_val = True
        elif st in ["INACTIVE", "NGỪNG GIAO DỊCH"]:
            is_active_val = False

    customer = Customer(
        code=code_clean,
        name=payload.name.strip(),
        tax_code=tax_val.strip() if tax_val else None,
        phone=payload.phone.strip() if payload.phone else None,
        email=payload.email.strip() if payload.email else None,
        address=payload.address.strip() if payload.address else None,
        region=payload.region.strip() if payload.region else None,
        territory_id=reg_id,
        sales_rep_id=rep_id,
        assigned_sales_id=rep_id,
        customer_group=group_str,
        is_active=is_active_val,
        is_locked=False,
    )
    try:
        db.add(customer)
        db.commit()
        db.refresh(customer)
    except IntegrityError as exc:
        db.rollback()
        err_msg = str(exc.orig) if hasattr(exc, "orig") else str(exc)
        if "code" in err_msg.lower() or "unique" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã đại lý đã tồn tại trên hệ thống",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi ràng buộc dữ liệu khi lưu đại lý: {err_msg}",
        )

    c_data = serialize_customer(customer, db)
    price_list = get_effective_price_list_for_customer(db, customer.customer_group)
    c_data["price_list"] = price_list
    c_data["effective_price_list"] = price_list

    return {
        "success": True,
        "code": 201,
        "message": f"Tạo mới hồ sơ đại lý '{customer.name}' thành công.",
        "data": c_data,
        **c_data,
    }


def handle_update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Cập nhật hồ sơ đại lý, kiểm tra mã duy nhất nếu thay đổi."""
    check_customer_management_role(user)

    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý")

    if payload.code is not None:
        new_code = payload.code.strip()
        if not new_code:
            raise HTTPException(status_code=400, detail="Mã đại lý không được để trống!")
        if new_code.lower() != customer.code.lower():
            conflict = (
                db.execute(
                    select(Customer).where(
                        func.lower(Customer.code) == new_code.lower(),
                        Customer.id != customer.id,
                    )
                )
                .scalars()
                .first()
            )
            if conflict:
                raise HTTPException(
                    status_code=400,
                    detail=f"Mã đại lý '{new_code}' đã tồn tại trên hệ thống!",
                )
            customer.code = new_code

    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Tên đại lý không được để trống!")
        customer.name = new_name

    tax_val = payload.tax_code or payload.taxCode
    if tax_val is not None:
        clean_tax = tax_val.strip() if tax_val.strip() else None
        if clean_tax and clean_tax.lower() != (customer.tax_code or "").lower():
            conflict_tax = (
                db.execute(
                    select(Customer).where(
                        func.lower(Customer.tax_code) == clean_tax.lower(),
                        Customer.id != customer.id,
                    )
                )
                .scalars()
                .first()
            )
            if conflict_tax:
                raise HTTPException(status_code=400, detail="Mã số thuế đã tồn tại!")
        customer.tax_code = clean_tax

    group_raw = (
        payload.customer_group
        or payload.customerGroup
        or payload.customer_group_id
        or payload.customerGroupId
    )
    if group_raw is not None:
        customer.customer_group = _coerce_customer_group(group_raw)

    if payload.region is not None:
        customer.region = payload.region.strip() if payload.region.strip() else None

    reg_id = payload.territory_id or payload.regionId
    if reg_id is not None:
        customer.territory_id = reg_id

    if (
        "person_in_charge" in payload.model_fields_set
        or "sales_rep_id" in payload.model_fields_set
        or "salesRepId" in payload.model_fields_set
        or "assigned_sales_id" in payload.model_fields_set
        or payload.person_in_charge is not None
        or payload.sales_rep_id is not None
        or payload.salesRepId is not None
        or payload.assigned_sales_id is not None
    ):
        rep_to_resolve = (
            payload.assigned_sales_id
            if payload.assigned_sales_id is not None
            else payload.sales_rep_id
            if payload.sales_rep_id is not None
            else payload.salesRepId
        )
        if rep_to_resolve is not None:
            user_exists = db.get(User, rep_to_resolve)
            if not user_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Nhân viên kinh doanh có ID '{rep_to_resolve}' không tồn tại trên hệ thống.",
                )

        rep_id, _ = resolve_person_in_charge(
            db, payload.person_in_charge, rep_to_resolve
        )
        customer.sales_rep_id = rep_id
        customer.assigned_sales_id = rep_id

    if payload.status is not None:
        st = payload.status.strip().upper()
        if st in ["ACTIVE", "HOẠT ĐỘNG"]:
            customer.is_active = True
        elif st in ["INACTIVE", "NGỪNG GIAO DỊCH"]:
            customer.is_active = False

    if payload.is_active is not None:
        customer.is_active = payload.is_active

    if payload.phone is not None:
        customer.phone = payload.phone.strip() if payload.phone.strip() else None
    if payload.email is not None:
        customer.email = payload.email.strip() if payload.email.strip() else None
    if payload.address is not None:
        customer.address = payload.address.strip() if payload.address.strip() else None

    try:
        db.commit()
        db.refresh(customer)
    except IntegrityError as exc:
        db.rollback()
        err_msg = str(exc.orig) if hasattr(exc, "orig") else str(exc)
        if "code" in err_msg.lower() or "unique" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã đại lý đã tồn tại trên hệ thống",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi ràng buộc dữ liệu khi lưu đại lý: {err_msg}",
        )

    c_data = serialize_customer(customer, db)
    price_list = get_effective_price_list_for_customer(db, customer.customer_group)
    c_data["price_list"] = price_list
    c_data["effective_price_list"] = price_list

    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật hồ sơ đại lý '{customer.name}' thành công.",
        "data": c_data,
        **c_data,
    }


def handle_update_customer_status(
    customer_id: int,
    payload: CustomerStatusUpdate,
    db: Session,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Chuyển đổi trạng thái hoạt động (is_active / status) của đại lý."""
    check_customer_management_role(user)

    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý")

    next_active = customer.is_active
    if payload.status is not None:
        st = payload.status.strip().upper()
        if st in ["ACTIVE", "HOẠT ĐỘNG"]:
            next_active = True
        elif st in ["INACTIVE", "NGỪNG GIAO DỊCH"]:
            next_active = False
        else:
            raise HTTPException(
                status_code=400,
                detail="Trạng thái không hợp lệ (chỉ chấp nhận ACTIVE hoặc INACTIVE).",
            )

    if payload.is_active is not None:
        next_active = payload.is_active

    customer.is_active = next_active
    db.commit()
    db.refresh(customer)

    c_data = serialize_customer(customer, db)
    status_label = "Hoạt động" if customer.is_active else "Ngừng giao dịch"
    return {
        "success": True,
        "code": 200,
        "message": f"Chuyển trạng thái đại lý '{customer.name}' sang '{status_label}' thành công.",
        "data": c_data,
        **c_data,
    }


def handle_delete_customer(
    customer_id: int,
    db: Session,
    user: Optional[AuthenticatedUser] = None,
) -> Any:
    """Xóa hồ sơ đại lý với ràng buộc: Đã phát sinh giao dịch thì không được xóa."""
    check_customer_management_role(user)

    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý")

    tx_count = get_customer_transactions_count(db, customer.id)
    if tx_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đại lý đã phát sinh giao dịch thì không xoá được, chỉ ngừng giao dịch.",
        )

    cust_name = customer.name
    db.delete(customer)
    db.commit()
    return {
        "success": True,
        "code": 200,
        "message": f"Xóa đại lý '{cust_name}' thành công.",
        "data": {"id": customer_id},
    }


# ---------------------------------------------------------
# Router Routes (/api/v1/customers)
# ---------------------------------------------------------


@router.get("", operation_id="customers_list_endpoint")
@router.get("/", operation_id="customers_list_slash_endpoint", include_in_schema=False)
def list_customers(
    keyword: Optional[str] = None,
    search: Optional[str] = None,
    sales_rep_id: Optional[int] = Query(default=None, alias="salesRepId"),
    region: Optional[str] = Query(default=None),
    region_id: Optional[int] = Query(default=None, alias="regionId"),
    customer_group: Optional[str] = Query(default=None, alias="customerGroup"),
    is_active: Optional[bool] = Query(default=None),
    status: Optional[str] = Query(default=None),
    is_locked: Optional[bool] = Query(default=None),
    page: Optional[int] = Query(default=None, ge=1),
    limit: Optional[int] = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_list_customers(
        keyword=keyword,
        search=search,
        sales_rep_id=sales_rep_id,
        region=region,
        region_id=region_id,
        customer_group=customer_group,
        is_active=is_active,
        status_filter=status,
        is_locked=is_locked,
        page=page,
        limit=limit,
        db=db,
        user=user,
    )


@router.get("/{customer_id}", operation_id="customers_get_endpoint")
def get_customer_detail(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_get_customer_detail(customer_id, db, user)


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="customers_create_endpoint")
@router.post("/", status_code=status.HTTP_201_CREATED, operation_id="customers_create_slash_endpoint", include_in_schema=False)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_create_customer(payload, db, user)


@router.put("/{customer_id}", operation_id="customers_update_endpoint")
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer(customer_id, payload, db, user)


@router.patch("/{customer_id}/status", operation_id="customers_update_status_endpoint")
def update_customer_status(
    customer_id: int,
    payload: CustomerStatusUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer_status(customer_id, payload, db, user)


@router.delete("/{customer_id}", operation_id="customers_delete_endpoint")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_delete_customer(customer_id, db, user)


# ---------------------------------------------------------
# Router Routes Alias (/api/v1/agencies)
# ---------------------------------------------------------


@agencies_router.get("", operation_id="agencies_list_endpoint")
@agencies_router.get("/", operation_id="agencies_list_slash_endpoint", include_in_schema=False)
def list_agencies(
    keyword: Optional[str] = None,
    search: Optional[str] = None,
    sales_rep_id: Optional[int] = Query(default=None, alias="salesRepId"),
    region: Optional[str] = Query(default=None),
    region_id: Optional[int] = Query(default=None, alias="regionId"),
    customer_group: Optional[str] = Query(default=None, alias="customerGroup"),
    is_active: Optional[bool] = Query(default=None),
    status: Optional[str] = Query(default=None),
    is_locked: Optional[bool] = Query(default=None),
    page: Optional[int] = Query(default=None, ge=1),
    limit: Optional[int] = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_list_customers(
        keyword=keyword,
        search=search,
        sales_rep_id=sales_rep_id,
        region=region,
        region_id=region_id,
        customer_group=customer_group,
        is_active=is_active,
        status_filter=status,
        is_locked=is_locked,
        page=page,
        limit=limit,
        db=db,
        user=user,
    )


@agencies_router.get("/{customer_id}", operation_id="agencies_get_endpoint")
def get_agency_detail(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_get_customer_detail(customer_id, db, user)


@agencies_router.post("", status_code=status.HTTP_201_CREATED, operation_id="agencies_create_endpoint")
@agencies_router.post("/", status_code=status.HTTP_201_CREATED, operation_id="agencies_create_slash_endpoint", include_in_schema=False)
def create_agency(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_create_customer(payload, db, user)


@agencies_router.put("/{customer_id}", operation_id="agencies_update_endpoint")
def update_agency(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer(customer_id, payload, db, user)


@agencies_router.patch("/{customer_id}/status", operation_id="agencies_update_status_endpoint")
def update_agency_status(
    customer_id: int,
    payload: CustomerStatusUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer_status(customer_id, payload, db, user)


@agencies_router.delete("/{customer_id}", operation_id="agencies_delete_endpoint")
def delete_agency(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_delete_customer(customer_id, db, user)
