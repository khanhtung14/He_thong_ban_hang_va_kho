"""Customer and Order endpoints for SCRUM-85:
Khóa hoặc mở giao dịch với đại lý cho Kế toán công nợ.

Yêu cầu nghiệp vụ:
1. Thêm trường is_locked (Boolean) và lock_reason (String) vào đại lý.
2. API cho phép kế toán khóa đại lý (bắt buộc nhập lý do) và mở khóa đại lý.
3. Chặn tạo đơn hàng mới khi đại lý đang bị khóa (is_locked == True) và báo lỗi.
4. Cảnh báo đối với các đơn hàng dở dang (DRAFT, PENDING, PROCESSING) của đại lý đang bị khóa.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PHONE_REGEX = re.compile(r"^0[1235789]\d{8}$")
from sqlalchemy.orm import selectinload
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import (
        Customer,
        CustomerDebt,
        CustomerHandoverHistory,
        CreditLimitLog,
        DeliveryAddress,
        Order,
        OrderItem,
        OrderStatus,
        Product,
        Role,
        RoleCode,
        Territory,
        User,
        Warehouse,
        Inventory,
    )
    from app.services.inventory_service import (
        calculate_available_qty,
        get_customer_serving_warehouse,
        get_available_stock_info,
        reserve_stock_atomic,
        release_reserved_stock,
        _inventory_lock,
    )
    from app.api.v1.endpoints.price_lists import CustomerGroup, resolve_effective_price
    from app.api.v1.endpoints.discount_policy_routes import calculate_best_discount
    from app.api.v1.endpoints.rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        bearer_scheme,
        get_current_user,
        get_optional_current_user,
        normalize_role,
        require_permissions,
        require_roles,
    )
except ImportError:  # pragma: no cover
    from app.core.database import get_db
    from app.models.models import (
        Customer,
        CustomerDebt,
        CustomerHandoverHistory,
        CreditLimitLog,
        DeliveryAddress,
        Order,
        OrderItem,
        OrderStatus,
        Role,
        RoleCode,
        Territory,
        User,
    )
    from app.api.v1.endpoints.price_lists import CustomerGroup, resolve_effective_price
    from app.api.v1.endpoints.rbac import (
        PERM_CUSTOMERS_LOCK,
        PERM_ORDERS_CREATE,
        AuthenticatedUser,
        bearer_scheme,
        get_current_user,
        get_optional_current_user,
        normalize_role,
        require_permissions,
        require_roles,
    )

from app.api.v1.endpoints.products import MOCK_PRODUCTS
from app.services.credit_risk_service import CreditRiskService

router = APIRouter(prefix="/api/v1", tags=["Customers & Orders (SCRUM-85)"])


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class CustomerLockRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255, description="Lý do khóa đại lý (bắt buộc)")


class CustomerTransactionStatusRequest(BaseModel):
    status: str = Field(..., description="Trạng thái giao dịch: ACTIVE hoặc LOCKED_FOR_DEBT")
    reason: Optional[str] = Field(None, max_length=255, description="Lý do khóa (bắt buộc nếu khóa)")


class CustomerResponse(BaseModel):
    id: int
    code: str
    name: str
    tax_code: Optional[str] = None
    taxCode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    sales_rep_id: Optional[int] = None
    salesRepId: Optional[int] = None
    sales_rep_name: Optional[str] = None
    region: Optional[str] = None
    regionId: Optional[int] = None
    territory_name: Optional[str] = None
    customer_group: str = "RETAIL"
    customerGroup: str = "RETAIL"
    person_in_charge: Optional[Union[str, int]] = None
    status: str = "ACTIVE"
    is_active: bool = True
    isActive: bool = True
    is_locked: bool = False
    isLocked: bool = False
    lock_reason: Optional[str] = None
    lockReason: Optional[str] = None
    locked_at: Optional[datetime] = None
    locked_by_id: Optional[int] = None
    current_debt: float = 0.0
    currentDebt: float = 0.0
    credit_limit: float = 0.0
    creditLimit: float = 0.0
    debt_limit: float = 0.0
    max_debt_amount: float = 0.0
    max_debt_days: int = 0
    max_due_days: int = 0
    maxDebtDays: int = 0
    maxDueDays: int = 0
    warning_threshold_percent: float = 80.0
    warning_threshold: float = 80.0
    overdue_days: int = 0
    # SCRUM-42: Automated Credit Risk Evaluation fields
    is_credit_flagged: bool = False
    isCreditFlagged: bool = False
    credit_flag_reason: Optional[str] = None
    creditFlagReason: Optional[str] = None
    credit_flagged_at: Optional[datetime] = None
    credit_action_mode: str = "BLOCK"
    creditActionMode: str = "BLOCK"
    is_manually_locked: bool = False
    isManuallyLocked: bool = False
    pending_orders_count: int = 0  # Số đơn hàng dở dang
    transactions_count: int = 0
    price_list: Optional[Any] = None
    effective_price_list: Optional[Any] = None
    created_at: Optional[datetime] = None
    createdAt: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


def _customer_group_from_value(value: Any) -> str:
    if value is None:
        return CustomerGroup.RETAIL.value
    if isinstance(value, str):
        normalized = value.strip().upper()
        if normalized in {member.value for member in CustomerGroup}:
            return normalized
        alias_map = {
            "LEVEL1": CustomerGroup.LEVEL_1.value,
            "LEVEL_1": CustomerGroup.LEVEL_1.value,
            "LEVEL2": CustomerGroup.LEVEL_2.value,
            "LEVEL_2": CustomerGroup.LEVEL_2.value,
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


class AssignSalesRepRequest(BaseModel):
    sales_rep_id: int = Field(..., alias="salesRepId", description="ID nhân viên kinh doanh phụ trách")

    model_config = ConfigDict(populate_by_name=True)


class CustomerHandoverRequest(BaseModel):
    from_sales_rep_id: Optional[int] = Field(None, alias="frOMSalesRepId", description="ID nhân viên nghỉ việc / cần bàn giao")
    to_sales_rep_id: int = Field(..., alias="toSalesRepId", description="ID nhân viên mới tiếp nhận")
    customer_ids: Optional[List[int]] = Field(None, alias="customerIds", description="Danh sách ID đại lý cần chuyển giao (nếu để trống sẽ chuyển toàn bộ)")
    reason: str = Field(..., min_length=1, max_length=255, description="Lý do chuyển giao bàn giao")

    model_config = ConfigDict(populate_by_name=True)


class CustomerHandoverHistoryResponse(BaseModel):
    id: int
    customer_id: int
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    from_sales_rep_id: Optional[int] = None
    from_sales_rep_name: Optional[str] = None
    to_sales_rep_id: int
    to_sales_rep_name: Optional[str] = None
    transferred_by_id: Optional[int] = None
    transferred_by_name: Optional[str] = None
    reason: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)



class CustomerCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=150)
    tax_code: Optional[str] = Field(default=None, alias="taxCode")
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    sales_rep_id: Optional[int] = Field(default=None, alias="salesRepId")
    assigned_sales_id: Optional[int] = None
    territory_id: Optional[int] = Field(default=None, alias="territoryId")
    region_id: Optional[int] = Field(default=None, alias="regionId")
    region: Optional[str] = None
    customer_group: Optional[Any] = Field(default="RETAIL", alias="customerGroup")
    customer_group_id: Optional[Any] = Field(default=None, alias="customerGroupId")
    credit_limit: Optional[float] = Field(0.0, alias="creditLimit", ge=0)
    max_due_days: Optional[int] = Field(0, alias="maxDueDays", ge=0)
    warning_threshold_percent: Optional[float] = Field(80.0, alias="warningThresholdPercent", ge=0, le=100)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @field_validator("code", "name")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        if value is None:
            return value
        return value.strip()

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
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
        if "territoryId" in normalized and "territory_id" not in normalized:
            normalized["territory_id"] = normalized["territoryId"]
        if "customerGroupId" in normalized and "customer_group" not in normalized and "customer_group_id" not in normalized:
            normalized["customer_group_id"] = normalized["customerGroupId"]
        if "customerGroup" in normalized and "customer_group" not in normalized:
            normalized["customer_group"] = normalized["customerGroup"]
        return normalized

    @model_validator(mode="after")
    def resolve_customer_group(self):
        group_value = self.customer_group or _customer_group_from_value(self.customer_group_id)
        self.customer_group = _customer_group_from_value(group_value)
        return self


class CustomerPricingGroupRequest(BaseModel):
    customer_group: CustomerGroup


class OrderItemCreate(BaseModel):
    sku: Optional[str] = Field(default=None, max_length=50)
    product_name: Optional[str] = Field(default=None, max_length=255)
    product_id: Optional[int] = Field(default=None, alias="productId")
    quantity: int = Field(default=1, gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0, alias="unitPrice")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class DeliveryAddressBriefResponse(BaseModel):
    id: int
    customer_id: int
    receiver_name: str
    phone: str
    address: str
    is_default: bool
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OrderCreateRequest(BaseModel):
    customer_id: int = Field(..., alias="customerId", description="ID của đại lý đặt hàng")
    warehouse_id: Optional[int] = Field(default=None, alias="warehouseId", description="ID kho hàng xuất")
    delivery_address_id: Optional[int] = Field(None, alias="deliveryAddressId", description="ID điểm giao hàng")
    items: List[OrderItemCreate] = Field(default_factory=list, min_length=1, description="Danh sách sản phẩm trong đơn")
    note: Optional[str] = None
    status: Optional[OrderStatus] = Field(None, description="Trạng thái đơn hàng khởi tạo (ví dụ: PENDING_APPROVAL)")
    submit_for_approval: Optional[bool] = Field(None, alias="submitForApproval", description="Gửi duyệt ngay")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class OrderItemResponse(BaseModel):
    id: int
    sku: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = "Cái"
    unit_name: Optional[str] = "Cái"
    quantity: int
    ordered_quantity: Optional[int] = None
    delivered_quantity: Optional[int] = None
    actual_quantity: Optional[int] = None
    unit_price: float
    total_price: Optional[float] = None
    subtotal: Optional[float] = None
    floor_price: Optional[float] = None
    price_list_id: Optional[int] = None
    available_qty: Optional[float] = None
    availableQty: Optional[float] = None
    is_partially_delivered: bool = False
    discount_percent: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    line_subtotal: Optional[float] = None
    line_total: Optional[float] = None
    applied_policy_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class OrderResponse(BaseModel):
    id: int
    order_code: str
    customer_id: int
    customer_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    delivery_address_id: Optional[int] = None
    delivery_address: Optional[Union[DeliveryAddressBriefResponse, str, dict]] = None
    delivery_point_name: Optional[str] = None
    expected_delivery_date: Optional[Union[date, str, datetime]] = None
    status: OrderStatus
    subtotal_amount: Optional[float] = None
    discount_amount: Optional[float] = 0.0
    total_amount: float
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    is_partially_delivered: bool = False
    
    # SCRUM-85 Warning fields
    has_warning: bool = False
    warning_message: Optional[str] = None
    approval_reason: Optional[str] = None
    items: List[OrderItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PortalOrderItemResponse(BaseModel):
    id: Optional[int] = None
    sku: str = ""
    product_name: str = ""
    unit: str = "Cái"
    unit_name: Optional[str] = "Cái"
    ordered_quantity: int = 0
    quantity: int = 0
    delivered_quantity: Optional[int] = None
    actual_quantity: Optional[int] = None
    unit_price: float = 0.0
    discount_percent: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    line_subtotal: Optional[float] = None
    line_total: Optional[float] = None
    total_price: float = 0.0
    subtotal: Optional[float] = None
    is_partially_delivered: bool = False

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PortalOrderDetailResponse(BaseModel):
    id: int
    order_code: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    created_at: Optional[datetime] = None
    expected_delivery_date: Optional[Union[date, str, datetime]] = None
    subtotal_amount: Optional[float] = None
    discount_amount: Optional[float] = 0.0
    total_amount: float = 0.0
    status: str
    delivery_point_name: Optional[str] = None
    delivery_address: Optional[Union[str, dict, DeliveryAddressBriefResponse]] = None
    delivery_address_id: Optional[int] = None
    delivery_address_detail: Optional[DeliveryAddressBriefResponse] = None
    note: Optional[str] = None
    approval_reason: Optional[str] = None
    is_partially_delivered: bool = False
    items: List[PortalOrderItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)



class OrderSimulateItem(BaseModel):
    product_id: Optional[int] = Field(default=None, alias="productId")
    sku: Optional[str] = None
    unit_id: Optional[int] = Field(default=None, alias="unitId")
    quantity: int = Field(default=1, gt=0)
    unit_price: Optional[float] = Field(default=None, alias="unitPrice")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class OrderSimulateRequest(BaseModel):
    customer_id: int = Field(..., alias="customerId")
    warehouse_id: Optional[int] = Field(default=None, alias="warehouseId")
    items: List[OrderSimulateItem] = Field(default_factory=list, min_length=1)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

INCOMPLETE_STATUSES = {OrderStatus.DRAFT, OrderStatus.PENDING_APPROVAL, OrderStatus.PROCESSING, OrderStatus.PENDING}


def _check_and_build_warning(order: Order, customer: Optional[Customer]) -> tuple[bool, Optional[str]]:
    """Kiểm tra và trả về cờ cảnh báo nếu đơn hàng đang dở dang và đại lý bị khóa."""
    if customer and customer.is_locked and order.status in INCOMPLETE_STATUSES:
        return (
            True,
            f"CẢNH BÁO: Đại lý '{customer.name}' ({customer.code}) hiện đang bị KHÓA GIAO DỊCH! "
            f"Lý do: {customer.lock_reason or 'Không có lý do'}. Cần lưu ý khi tiếp tục xử lý đơn dở dang này."
        )
    return (False, None)


def _build_full_order_response(order: Order, db: Session, cust: Optional[Customer] = None) -> OrderResponse:
    if cust is None and order.customer_id:
        cust = db.get(Customer, order.customer_id)
    has_warn, warn_msg = _check_and_build_warning(order, cust)
    wh = (
        order.warehouse
        or (db.get(Warehouse, order.warehouse_id) if getattr(order, "warehouse_id", None) else None)
        or (get_customer_serving_warehouse(db, order.customer_id, getattr(order, "warehouse_id", None)) if cust else None)
    )
    resp = OrderResponse.model_validate(order)
    resp.customer_name = cust.name if cust else None
    resp.warehouse_id = wh.id if wh else getattr(order, "warehouse_id", None)
    resp.warehouse_name = wh.name if wh else None
    resp.has_warning = has_warn
    resp.warning_message = warn_msg

    # Delivery address & point info
    deliv_addr = getattr(order, "delivery_address", None)
    if not deliv_addr and getattr(order, "delivery_address_id", None):
        deliv_addr = db.get(DeliveryAddress, order.delivery_address_id)

    if deliv_addr:
        resp.delivery_address_id = deliv_addr.id
        resp.delivery_address = DeliveryAddressBriefResponse.model_validate(deliv_addr)
        resp.delivery_point_name = deliv_addr.receiver_name or f"Điểm giao #{deliv_addr.id}"
    else:
        resp.delivery_point_name = "Địa chỉ chính"
        if cust and cust.address:
            resp.delivery_point_name = "Địa chỉ chính"

    exp_date = getattr(order, "expected_delivery_date", None) or getattr(order, "desired_delivery_date", None)
    resp.expected_delivery_date = exp_date

    status_str = (str(order.status.value if hasattr(order.status, "value") else order.status)).upper()
    is_delivering_or_delivered = status_str in ("SHIPPING", "IN_TRANSIT", "DELIVERED", "COMPLETED", "PROCESSING")

    any_partially_delivered = False
    for it_res, it_db in zip(resp.items, order.items):
        avail = getattr(it_db, "available_qty", None)
        if avail is None and wh and it_db.sku:
            st = get_available_stock_info(db, it_db.sku, wh.id)
            avail = st["available_qty"]
        it_res.available_qty = avail
        it_res.availableQty = avail

        unit_str = getattr(it_db, "unit_name", None) or "Cái"
        it_res.unit = unit_str
        it_res.unit_name = unit_str

        ord_qty = int(it_db.quantity)
        it_res.ordered_quantity = ord_qty

        deliv_qty = getattr(it_db, "quantity_delivered", None)
        if deliv_qty is None:
            deliv_qty = getattr(it_db, "delivered_quantity", None)
        if status_str in ("COMPLETED", "DELIVERED"):
            if deliv_qty is None or deliv_qty == 0:
                deliv_qty = ord_qty
            else:
                deliv_qty = int(deliv_qty)
        elif status_str in ("SHIPPING", "IN_TRANSIT", "PROCESSING"):
            if deliv_qty is None or deliv_qty == 0:
                deliv_qty = ord_qty
            else:
                deliv_qty = int(deliv_qty)
        else:
            deliv_qty = int(deliv_qty or 0)

        it_res.delivered_quantity = deliv_qty
        it_res.actual_quantity = deliv_qty

        tot_p = getattr(it_db, "line_total", None)
        if tot_p is None:
            tot_p = ord_qty * it_db.unit_price
        it_res.total_price = float(tot_p)
        it_res.subtotal = float(tot_p)
        it_res.line_total = float(tot_p)
        it_res.discount_percent = float(getattr(it_db, "discount_percent", 0.0) or 0.0)
        it_res.discount_amount = float(getattr(it_db, "discount_amount", 0.0) or 0.0)
        it_res.line_subtotal = float(getattr(it_db, "line_subtotal", None) or (ord_qty * it_db.unit_price))

        item_is_partial = bool(is_delivering_or_delivered and (deliv_qty < ord_qty))
        it_res.is_partially_delivered = item_is_partial
        if item_is_partial:
            any_partially_delivered = True

    resp.is_partially_delivered = any_partially_delivered
    resp.subtotal_amount = float(getattr(order, "subtotal_amount", None) or order.total_amount)
    resp.discount_amount = float(getattr(order, "discount_amount", 0.0) or 0.0)
    return resp


# ---------------------------------------------------------
# Customer Endpoints (SCRUM-85)
# ---------------------------------------------------------

def _get_optional_authenticated_user(
    auth: Optional[Any] = Depends(bearer_scheme),
) -> Optional[AuthenticatedUser]:
    if auth and getattr(auth, "credentials", None):
        try:
            return get_current_user(auth)
        except Exception:
            return None
    return None


@router.get("/customers", response_model=Any)
def list_customers(
    is_locked: Optional[bool] = Query(None, description="Lọc theo trạng thái khóa"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái hoạt động: ACTIVE, LOCKED, ALL"),
    search: Optional[str] = Query(None, description="Tìm kiếm theo mã, tên hoặc SĐT"),
    keyword: Optional[str] = Query(None, description="Từ khóa tìm kiếm"),
    sales_rep_id: Optional[Union[int, str]] = Query(None, description="Lọc theo ID NVKD phụ trách"),
    assigned_rep_id: Optional[Union[int, str]] = Query(None, alias="assignedRepId", description="Lọc theo NVKD phụ trách"),
    region_id: Optional[Union[int, str]] = Query(None, alias="regionId", description="Lọc theo địa bàn/khu vực"),
    region: Optional[str] = Query(None, description="Lọc theo khu vực"),
    customer_group: Optional[str] = Query(None, alias="customerGroup", description="Lọc theo phân nhóm đại lý"),
    customer_group_id: Optional[str] = Query(None, alias="customerGroupId", description="Lọc theo phân nhóm đại lý (alias)"),
    is_active: Optional[bool] = Query(None),
    page: Optional[int] = Query(None, description="Trang (1-indexed)"),
    limit: Optional[int] = Query(None, description="Số lượng bản ghi mỗi trang"),
    page_size: Optional[int] = Query(None, alias="pageSize", description="Số lượng bản ghi mỗi trang"),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: Optional[AuthenticatedUser] = Depends(_get_optional_authenticated_user),
    user: Optional[AuthenticatedUser] = None,
):
    """Lấy danh sách đại lý cùng trạng thái khóa và số lượng đơn dở dang, hỗ trợ tìm kiếm và lọc đa điều kiện từ server."""
    query = select(Customer)

    active_user = current_user or user
    # Scoping: Nhân viên kinh doanh chỉ nhìn thấy đại lý mình phụ trách
    if active_user and getattr(active_user, "role", None):
        user_role = normalize_role(active_user.role)
        if user_role == RoleCode.SALES_REP.value:
            rep_user = db.query(User).filter(User.username == active_user.username).first()
            if rep_user:
                query = query.where(Customer.sales_rep_id == rep_user.id)
            else:
                return []

    # 1. Lọc theo NVKD phụ trách (hỗ trợ ID, UNASSIGNED, -1)
    effective_rep_id = assigned_rep_id if (assigned_rep_id is not None and isinstance(assigned_rep_id, (int, str))) else (sales_rep_id if (sales_rep_id is not None and isinstance(sales_rep_id, (int, str))) else None)
    if effective_rep_id is not None:
        rep_str = str(effective_rep_id).strip()
        if rep_str in ("-1", "0", "UNASSIGNED"):
            query = query.where(Customer.sales_rep_id.is_(None))
        elif rep_str not in ("ALL", "", "None"):
            try:
                rep_id_int = int(rep_str)
                if rep_id_int == -1 or rep_id_int == 0:
                    query = query.where(Customer.sales_rep_id.is_(None))
                elif rep_id_int > 0:
                    query = query.where(Customer.sales_rep_id == rep_id_int)
            except ValueError:
                pass

    # 2. Lọc theo Địa bàn / Khu vực
    if region and isinstance(region, str) and region.strip() and region.strip().upper() != "ALL":
        query = query.where(Customer.region == region.strip())
    if region_id is not None and isinstance(region_id, (int, str)):
        reg_str = str(region_id).strip()
        if reg_str not in ("ALL", "", "None"):
            try:
                reg_id_int = int(reg_str)
                if reg_id_int > 0:
                    query = query.where(Customer.territory_id == reg_id_int)
            except ValueError:
                pass

    # 3. Lọc theo Phân nhóm đại lý
    effective_group = customer_group if customer_group is not None else customer_group_id
    if effective_group and isinstance(effective_group, str):
        grp = effective_group.strip()
        if grp and grp.upper() != "ALL":
            grp_val = _customer_group_from_value(grp)
            query = query.where(Customer.customer_group == grp_val)

    # 4. Lọc theo Trạng thái hoạt động / Khóa
    if is_active is not None and isinstance(is_active, bool):
        query = query.where(Customer.is_active == is_active)
    elif status and isinstance(status, str):
        st = status.strip().upper()
        if st == "ACTIVE":
            query = query.where(Customer.is_locked == False, Customer.is_active == True)
        elif st == "LOCKED":
            query = query.where(Customer.is_locked == True)
        elif st == "INACTIVE":
            query = query.where(Customer.is_active == False)
    if is_locked is not None and isinstance(is_locked, bool):
        query = query.where(Customer.is_locked == is_locked)

    # 5. Tìm kiếm từ khóa (search / keyword trên mã, tên, SĐT)
    search_term = None
    if search and isinstance(search, str) and search.strip():
        search_term = search.strip()
    elif keyword and isinstance(keyword, str) and keyword.strip():
        search_term = keyword.strip()

    if search_term:
        kw = f"%{search_term}%"
        matching_phone_cids = select(DeliveryAddress.customer_id).where(DeliveryAddress.phone.ilike(kw))
        query = query.where(
            (Customer.code.ilike(kw)) | 
            (Customer.name.ilike(kw)) | 
            (Customer.tax_code.ilike(kw)) |
            (Customer.phone.ilike(kw)) |
            (Customer.id.in_(matching_phone_cids))
        )

    # Tính tổng số bản ghi trước phân trang
    total_count = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    if response is not None and hasattr(response, "headers"):
        response.headers["X-Total-Count"] = str(total_count)
        response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    # 6. Phân trang nếu có
    effective_limit = None
    if limit is not None and isinstance(limit, int) and limit > 0:
        effective_limit = limit
    elif page_size is not None and isinstance(page_size, int) and page_size > 0:
        effective_limit = page_size

    if page is not None and isinstance(page, int) and page > 0 and effective_limit:
        query = query.order_by(Customer.id.asc()).offset((page - 1) * effective_limit).limit(effective_limit)
    elif effective_limit:
        query = query.order_by(Customer.id.asc()).limit(effective_limit)
    else:
        query = query.order_by(Customer.id.asc())

    customers = db.execute(query).scalars().all()
    results = []
    sales_rep_ids = {c.sales_rep_id for c in customers if c.sales_rep_id}
    rep_names: dict[int, str] = {}
    if sales_rep_ids:
        reps = db.query(User).filter(User.id.in_(sales_rep_ids)).all()
        rep_names = {r.id: (r.full_name or r.username) for r in reps}

    territory_ids = {c.territory_id for c in customers if c.territory_id}
    territory_names: dict[int, str] = {}
    if territory_ids:
        terrs = db.query(Territory).filter(Territory.id.in_(territory_ids)).all()
        territory_names = {t.id: t.name for t in terrs}

    customer_ids = [c.id for c in customers]
    delivery_map: dict[int, DeliveryAddress] = {}
    if customer_ids:
        addrs = (
            db.query(DeliveryAddress)
            .filter(DeliveryAddress.customer_id.in_(customer_ids), DeliveryAddress.is_default == True)
            .all()
        )
        delivery_map = {a.customer_id: a for a in addrs}

    for c in customers:
        pending_count = (
            db.query(func.count(Order.id))
            .filter(Order.customer_id == c.id, Order.status.in_(INCOMPLETE_STATUSES))
            .scalar()
            or 0
        )
        debt_record = db.query(CustomerDebt).filter(CustomerDebt.customer_id == c.id).first()
        res = CustomerResponse.model_validate(c)
        res.pending_orders_count = pending_count
        res.credit_limit = float(getattr(c, "credit_limit", 0.0) or 0.0)
        res.creditLimit = res.credit_limit
        res.debt_limit = res.credit_limit
        res.max_debt_amount = res.credit_limit
        res.max_debt_days = int(getattr(c, "max_debt_days", None) or getattr(c, "max_due_days", None) or 0)
        res.max_due_days = res.max_debt_days
        res.maxDebtDays = res.max_debt_days
        res.maxDueDays = res.max_debt_days
        res.warning_threshold_percent = float(getattr(c, "warning_threshold_percent", 80.0) or 80.0)
        res.warning_threshold = float(getattr(c, "warning_threshold", 80.0) or 80.0)
        res.sales_rep_name = rep_names.get(c.sales_rep_id)
        res.territory_name = territory_names.get(c.territory_id)
        res.phone = getattr(c, "phone", None) or (delivery_map[c.id].phone if c.id in delivery_map else None)
        if c.id in delivery_map:
            res.address = delivery_map[c.id].address
        if debt_record:
            res.current_debt = debt_record.total_debt
        from app.api.v1.endpoints.customers import get_customer_transactions_count
        res.transactions_count = get_customer_transactions_count(db, c.id)
        results.append(res)

    has_pagination = (
        (isinstance(page, int) and page > 0) or
        (isinstance(limit, int) and limit > 0) or
        (isinstance(page_size, int) and page_size > 0)
    )
    if active_user and normalize_role(active_user.role) == RoleCode.ACCOUNTANT.value and has_pagination:
        eff_p = page if (isinstance(page, int) and page > 0) else 1
        eff_lim = effective_limit or 20
        total_pages = (total_count + eff_lim - 1) // eff_lim if eff_lim > 0 else 1
        return {
            "success": True,
            "code": 200,
            "message": "Thành công",
            "data": [r.model_dump() for r in results],
            "pagination": {
                "page": eff_p,
                "limit": eff_lim,
                "total": total_count,
                "totalRecords": total_count,
                "totalPages": total_pages,
                "total_records": total_count,
                "total_pages": total_pages,
            },
        }

    return results


@router.post("/customers", status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreateRequest,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(_get_optional_authenticated_user),
):
    """Tạo mới đại lý."""
    if user and getattr(user, "role", None):
        normalized_role_code = (user.role or "").upper().replace(" ", "_")
        if normalized_role_code not in ["ADMIN", "SALES_MANAGER", "ACCOUNTANT"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên, Quản lý kinh doanh hoặc Kế toán mới có quyền tạo đại lý.",
            )

    effective_territory_id = payload.territory_id or payload.region_id
    effective_sales_rep_id = payload.sales_rep_id or payload.assigned_sales_id

    # 1. Kiểm tra tồn tại NVKD nếu có chỉ định
    if effective_sales_rep_id is not None:
        user_exists = db.get(User, effective_sales_rep_id)
        if not user_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhân viên kinh doanh có ID '{effective_sales_rep_id}' không tồn tại trên hệ thống.",
            )

    # 2. Kiểm tra trùng lặp mã đại lý duy nhất (case-insensitive)
    existing = db.execute(select(Customer).where(func.lower(Customer.code) == payload.code.strip().lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Mã đại lý đã tồn tại trên hệ thống!")

    # 3. Kiểm tra số điện thoại bắt buộc và định dạng (SCRUM-62)
    clean_phone = None
    if payload.phone is not None:
        clean_phone = str(payload.phone).strip()
        if not clean_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số điện thoại là bắt buộc khi tạo đại lý mới.",
            )
        if not PHONE_REGEX.match(clean_phone):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số điện thoại không hợp lệ. Phải gồm 10 chữ số và bắt đầu bằng các đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02).",
            )
        existing_phone = db.execute(select(Customer).where(Customer.phone == clean_phone)).scalar_one_or_none()
        if not existing_phone:
            existing_phone = db.execute(select(DeliveryAddress).where(DeliveryAddress.phone == clean_phone)).scalar_one_or_none()
        if existing_phone:
            raise HTTPException(status_code=400, detail="Số điện thoại đã được đăng ký cho đại lý khác!")
    elif payload.code.strip().upper().startswith("DL-PHONE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số điện thoại là bắt buộc khi tạo đại lý mới.",
        )

    # Chuẩn hóa customer_group
    group_str = "RETAIL"
    if payload.customer_group:
        if isinstance(payload.customer_group, CustomerGroup):
            group_str = payload.customer_group.value
        else:
            group_str = str(payload.customer_group)
    elif payload.customer_group_id is not None:
        if payload.customer_group_id == 1:
            group_str = "DEALER_LEVEL_1"
        elif payload.customer_group_id == 2:
            group_str = "DEALER_LEVEL_2"
        else:
            group_str = "RETAIL"

    customer = Customer(
        code=payload.code.strip(),
        name=payload.name.strip(),
        tax_code=payload.tax_code.strip() if payload.tax_code else None,
        phone=clean_phone,
        email=payload.email.strip() if payload.email else None,
        address=payload.address.strip() if payload.address else None,
        region=payload.region.strip() if payload.region else None,
        sales_rep_id=effective_sales_rep_id,
        assigned_sales_id=effective_sales_rep_id,
        territory_id=effective_territory_id,
        customer_group=group_str,
        credit_limit=float(payload.credit_limit or 0.0),
        max_due_days=int(payload.max_due_days or 0),
        warning_threshold_percent=float(payload.warning_threshold_percent or 80.0),
        is_active=True,
        is_locked=False,
    )
    try:
        db.add(customer)
        db.commit()
        db.refresh(customer)
    except Exception as exc:
        db.rollback()
        err_msg = str(getattr(exc, "orig", exc))
        if "code" in err_msg.lower() or "unique" in err_msg.lower():
            raise HTTPException(status_code=400, detail="Mã đại lý đã tồn tại trên hệ thống!")
        raise HTTPException(status_code=400, detail=f"Lỗi ràng buộc dữ liệu khi lưu đại lý: {err_msg}")

    # Tạo điểm giao hàng mặc định kèm phone
    if clean_phone or payload.address:
        addr = DeliveryAddress(
            customer_id=customer.id,
            receiver_name=customer.name,
            phone=clean_phone or "",
            address=payload.address or "",
            is_default=True,
        )
        db.add(addr)
        db.commit()

    # Nếu có gán NVKD, tạo bản ghi lịch sử ban đầu
    if effective_sales_rep_id:
        transferred_by_user = db.query(User).filter(User.username == user.username).first() if user else None
        history = CustomerHandoverHistory(
            customer_id=customer.id,
            from_sales_rep_id=None,
            to_sales_rep_id=effective_sales_rep_id,
            transferred_by_id=transferred_by_user.id if transferred_by_user else None,
            reason="Khởi tạo đại lý và phân công nhân viên phụ trách ban đầu",
        )
        db.add(history)
        db.commit()

    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = 0
    res.debt_limit = getattr(customer, "credit_limit", 0.0)
    res.phone = clean_phone
    res.address = payload.address
    res.tax_code = payload.tax_code
    res.taxCode = payload.tax_code

    if effective_sales_rep_id:
        rep = db.query(User).filter(User.id == effective_sales_rep_id).first()
        if rep:
            res.sales_rep_name = rep.full_name or rep.username
            res.person_in_charge = rep.full_name or rep.username
    if getattr(payload, "person_in_charge", None):
        res.person_in_charge = payload.person_in_charge

    if effective_territory_id:
        terr = db.query(Territory).filter(Territory.id == effective_territory_id).first()
        if terr:
            res.territory_name = terr.name

    ret_dict = res.model_dump()
    ret_dict["data"] = res.model_dump()
    ret_dict["success"] = True
    return ret_dict


@router.post("/customers/handover")
def handover_customers(
    payload: CustomerHandoverRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Sales Manager")),
):
    """Chuyển giao địa bàn / đại lý hàng loạt khi nhân viên nghỉ việc.
    
    Phân quyền: Chỉ Quản lý kinh doanh (Sales Manager).
    """
    target_rep = db.get(User, payload.to_sales_rep_id)
    if not target_rep or target_rep.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Nhân viên nhận bàn giao không tồn tại hoặc tài khoản đã bị khóa!")

    if payload.from_sales_rep_id and payload.from_sales_rep_id == payload.to_sales_rep_id:
        raise HTTPException(status_code=400, detail="Nhân viên bàn giao và nhân viên tiếp nhận không thể trùng nhau!")

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do chuyển giao địa bàn!")

    query = select(Customer)
    if payload.customer_ids:
        query = query.where(Customer.id.in_(payload.customer_ids))
    elif payload.from_sales_rep_id:
        query = query.where(Customer.sales_rep_id == payload.from_sales_rep_id)
    else:
        raise HTTPException(status_code=400, detail="Vui lòng chọn nhân viên cần bàn giao hoặc danh sách đại lý cụ thể!")

    customers_to_transfer = db.execute(query).scalars().all()
    if not customers_to_transfer:
        raise HTTPException(status_code=400, detail="Không tìm thấy đại lý nào phù hợp để chuyển giao!")

    actor_user = db.query(User).filter(User.username == user.username).first()
    actor_id = actor_user.id if actor_user else None

    for cust in customers_to_transfer:
        old_rep = cust.sales_rep_id
        cust.sales_rep_id = target_rep.id
        db.add(CustomerHandoverHistory(
            customer_id=cust.id,
            from_sales_rep_id=old_rep,
            to_sales_rep_id=target_rep.id,
            transferred_by_id=actor_id,
            reason=clean_reason,
        ))

    db.commit()

    return {
        "success": True,
        "message": f"Đã chuyển giao thành công {len(customers_to_transfer)} đại lý cho nhân viên {target_rep.full_name or target_rep.username}.",
        "transferred_count": len(customers_to_transfer),
        "to_sales_rep_id": target_rep.id,
        "to_sales_rep_name": target_rep.full_name or target_rep.username,
    }


@router.get("/customers/handover-history", response_model=List[CustomerHandoverHistoryResponse])
def get_handover_history(
    customer_id: Optional[int] = Query(None),
    sales_rep_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager")),
):
    """Lấy danh sách lịch sử chuyển giao đại lý / địa bàn (Sales Manager)."""
    query = select(CustomerHandoverHistory)
    if customer_id:
        query = query.where(CustomerHandoverHistory.customer_id == customer_id)
    if sales_rep_id:
        query = query.where(
            (CustomerHandoverHistory.from_sales_rep_id == sales_rep_id) |
            (CustomerHandoverHistory.to_sales_rep_id == sales_rep_id)
        )

    logs = db.execute(query.order_by(CustomerHandoverHistory.id.desc()).limit(limit)).scalars().all()
    results = []
    for log in logs:
        cust = db.get(Customer, log.customer_id)
        from_rep = db.get(User, log.from_sales_rep_id) if log.from_sales_rep_id else None
        to_rep = db.get(User, log.to_sales_rep_id)
        actor = db.get(User, log.transferred_by_id) if log.transferred_by_id else None

        results.append(CustomerHandoverHistoryResponse(
            id=log.id,
            customer_id=log.customer_id,
            customer_code=cust.code if cust else None,
            customer_name=cust.name if cust else None,
            from_sales_rep_id=log.from_sales_rep_id,
            from_sales_rep_name=(from_rep.full_name or from_rep.username) if from_rep else None,
            to_sales_rep_id=log.to_sales_rep_id,
            to_sales_rep_name=(to_rep.full_name or to_rep.username) if to_rep else None,
            transferred_by_id=log.transferred_by_id,
            transferred_by_name=(actor.full_name or actor.username) if actor else None,
            reason=log.reason,
            created_at=log.created_at,
        ))

    return results


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Lấy thông tin chi tiết một đại lý."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    from app.api.v1.endpoints.customers import get_customer_transactions_count, get_effective_price_list_for_customer
    tx_count = get_customer_transactions_count(db, customer.id)
    price_list = get_effective_price_list_for_customer(db, customer.customer_group)

    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    res.transactions_count = tx_count
    res.status = "ACTIVE" if customer.is_active else "INACTIVE"
    res.price_list = price_list
    res.effective_price_list = price_list
    if customer.sales_rep:
        res.person_in_charge = customer.sales_rep.full_name
    elif customer.sales_rep_id:
        res.person_in_charge = customer.sales_rep_id
    return res


from app.api.v1.endpoints.customers import (
    CustomerUpdate,
    CustomerStatusUpdate,
    handle_update_customer,
    handle_update_customer_status,
    handle_delete_customer,
)


@router.put("/manager/customers/{customer_id}")
@router.put("/customers/{customer_id}")
def update_customer_in_lock_router(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer(customer_id, payload, db, user)


@router.patch("/customers/{customer_id}/status")
def update_customer_status_in_lock_router(
    customer_id: int,
    payload: CustomerStatusUpdate,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_update_customer_status(customer_id, payload, db, user)


@router.delete("/customers/{customer_id}")
def delete_customer_in_lock_router(
    customer_id: int,
    db: Session = Depends(get_db),
    user: Optional[AuthenticatedUser] = Depends(get_optional_current_user),
) -> Any:
    return handle_delete_customer(customer_id, db, user)


class CustomerTransactionStatusRequest(BaseModel):
    status: str = Field(..., min_length=1, max_length=30)
    reason: Optional[str] = None


class CustomerCreditLimitRequest(BaseModel):
    new_credit_limit: float = Field(..., description="Hạn mức tiền mới phải >= 0", alias="newCreditLimit")
    new_max_debt_days: int = Field(default=30, description="Số ngày nợ tối đa mới phải >= 0", alias="newMaxDebtDays")
    reason: str = Field(..., min_length=1)
    credit_action_mode: Optional[str] = Field(default=None, alias="creditActionMode")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("new_credit_limit")
    @classmethod
    def validate_new_credit_limit(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
        return v

    @field_validator("new_max_debt_days")
    @classmethod
    def validate_new_max_debt_days(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
        return v

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Check negative numbers directly
            for key in ["new_credit_limit", "newCreditLimit", "credit_limit", "creditLimit"]:
                if key in data and data[key] is not None:
                    try:
                        if float(data[key]) < 0:
                            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
                    except (TypeError, ValueError) as err:
                        if "Hạn mức và số ngày nợ" in str(err):
                            raise err
            for key in ["new_max_debt_days", "newMaxDebtDays", "max_debt_days", "max_due_days", "maxDebtDays", "maxDueDays"]:
                if key in data and data[key] is not None:
                    try:
                        if int(data[key]) < 0:
                            raise ValueError("Hạn mức và số ngày nợ phải lớn hơn hoặc bằng 0")
                    except (TypeError, ValueError) as err:
                        if "Hạn mức và số ngày nợ" in str(err):
                            raise err

            # Fallback aliases for new_credit_limit
            if "new_credit_limit" not in data and "newCreditLimit" not in data:
                if "credit_limit" in data:
                    data["new_credit_limit"] = data["credit_limit"]
                elif "creditLimit" in data:
                    data["new_credit_limit"] = data["creditLimit"]
            # Fallback aliases for new_max_debt_days
            if "new_max_debt_days" not in data and "newMaxDebtDays" not in data:
                if "max_debt_days" in data:
                    data["new_max_debt_days"] = data["max_debt_days"]
                elif "max_due_days" in data:
                    data["new_max_debt_days"] = data["max_due_days"]
                elif "maxDebtDays" in data:
                    data["new_max_debt_days"] = data["maxDebtDays"]
                elif "maxDueDays" in data:
                    data["new_max_debt_days"] = data["maxDueDays"]
            # Fallback aliases for credit_action_mode
            if "credit_action_mode" not in data and "creditActionMode" not in data:
                if "action_mode" in data:
                    data["credit_action_mode"] = data["action_mode"]
                elif "actionMode" in data:
                    data["credit_action_mode"] = data["actionMode"]
            # Fallback reason if empty in legacy calls
            if "reason" not in data or not str(data.get("reason", "")).strip():
                data["reason"] = "Điều chỉnh hạn mức công nợ"
            else:
                data["reason"] = str(data["reason"]).strip()
        return data


class CustomerSalesRepAssignRequest(BaseModel):
    sales_rep_id: Optional[int] = Field(default=None, alias="salesRepId")

    model_config = ConfigDict(populate_by_name=True)


def _format_utc_datetime_iso(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime ensuring explicit UTC timezone offset for correct client-side GMT+7 parsing."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


@router.put("/customers/{customer_id}/credit-limit")
def update_customer_credit_limit(
    customer_id: int,
    payload: CustomerCreditLimitRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(get_current_user),
):
    # Phân quyền (RBAC/Role Check): Chỉ cho phép các user có role accountant hoặc sales_manager
    user_role = normalize_role(_user.role) if _user else None
    if user_role not in (RoleCode.ACCOUNTANT.value, RoleCode.SALES_MANAGER.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán (Accountant) hoặc Quản lý kinh doanh (Sales Manager) mới có quyền điều chỉnh hạn mức công nợ.",
        )

    # Ràng buộc số không được âm (Non-negative check)
    if payload.new_credit_limit < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Hạn mức tiền mới không được là số âm (phải >= 0).",
        )
    if payload.new_max_debt_days < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Số ngày nợ tối đa mới không được là số âm (phải >= 0).",
        )

    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    # Đọc hạn mức cũ
    old_credit_limit = float(customer.credit_limit or 0.0)
    old_max_debt_days = int(getattr(customer, "max_debt_days", None) or customer.max_due_days or 0)

    # Chặn lưu khi không có thay đổi dữ liệu (tránh rác audit log)
    new_limit_val = float(payload.new_credit_limit)
    new_days_val = int(payload.new_max_debt_days)
    new_credit_limit = new_limit_val
    new_max_debt_days = new_days_val
    mode_changed = False
    if payload.credit_action_mode:
        clean_mode = payload.credit_action_mode.strip().upper()
        current_mode = (getattr(customer, "credit_action_mode", "BLOCK") or "BLOCK").upper()
        if clean_mode in ("BLOCK", "REVIEW") and clean_mode != current_mode:
            mode_changed = True

    if new_limit_val == old_credit_limit and new_days_val == old_max_debt_days and not mode_changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không có thay đổi nào so với hạn mức hiện tại. Hạn mức tiền hoặc số ngày nợ mới phải khác với giá trị hiện tại.",
        )

    # Cập nhật hạn mức mới vào bảng customers
    customer.credit_limit = new_limit_val
    customer.max_due_days = new_days_val
    customer.max_debt_days = new_days_val
    if payload.credit_action_mode:
        clean_mode = payload.credit_action_mode.strip().upper()
        if clean_mode in ("BLOCK", "REVIEW"):
            customer.credit_action_mode = clean_mode

    # Ghi nhận thông tin người thực hiện
    author_id = _user.id if _user else None
    author_name = _user.full_name or _user.username if _user else "Kế toán"

    # Tạo một bản ghi log vào credit_limit_logs trong cùng transaction commit
    log_entry = CreditLimitLog(
        customer_id=customer.id,
        old_credit_limit=old_credit_limit,
        new_credit_limit=new_limit_val,
        old_max_debt_days=old_max_debt_days,
        new_max_debt_days=new_days_val,
        reason=payload.reason.strip(),
        changed_by_user_id=author_id,
        changed_by_name=author_name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(customer)
    db.refresh(log_entry)

    # SCRUM-42: Đánh giá lại rủi ro tín dụng ngay sau khi cập nhật hạn mức
    eval_result = CreditRiskService.apply_evaluation(db, customer, commit=True)
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )

    response = CustomerResponse.model_validate(customer)
    response.pending_orders_count = pending_count
    response.credit_limit = customer.credit_limit
    response.creditLimit = customer.credit_limit
    response.debt_limit = customer.credit_limit
    response.max_debt_amount = customer.credit_limit
    response.max_debt_days = customer.max_debt_days
    response.max_due_days = customer.max_due_days
    response.maxDebtDays = customer.max_debt_days
    response.maxDueDays = customer.max_due_days
    response.warning_threshold_percent = getattr(customer, "warning_threshold_percent", 80.0)
    response.warning_threshold = getattr(customer, "warning_threshold", 80.0)
    customer_dict = response.model_dump()

    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật hạn mức công nợ cho đại lý '{customer.name}' thành công.",
        "data": {
            **customer_dict,
            "credit_limit": customer.credit_limit,
            "creditLimit": customer.credit_limit,
            "debt_limit": customer.credit_limit,
            "max_debt_amount": customer.credit_limit,
            "max_due_days": customer.max_due_days,
            "max_debt_days": customer.max_debt_days,
            "maxDueDays": customer.max_due_days,
            "maxDebtDays": customer.max_debt_days,
            "isCreditFlagged": customer.is_credit_flagged,
            "creditFlagReason": customer.credit_flag_reason,
            "creditActionMode": customer.credit_action_mode,
            "creditEvaluation": eval_result.to_dict(),
            "log": {
                "id": log_entry.id,
                "old_credit_limit": log_entry.old_credit_limit,
                "new_credit_limit": log_entry.new_credit_limit,
                "old_max_debt_days": log_entry.old_max_debt_days,
                "new_max_debt_days": log_entry.new_max_debt_days,
                "reason": log_entry.reason,
                "changed_by_user_id": log_entry.changed_by_user_id,
                "changed_by_name": log_entry.changed_by_name,
                "created_at": _format_utc_datetime_iso(log_entry.created_at),
            },
        },
    }


@router.get("/customers/{customer_id}/credit-limit-logs")
def get_customer_credit_limit_logs(
    customer_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(get_optional_current_user),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    logs = (
        db.query(CreditLimitLog)
        .filter(CreditLimitLog.customer_id == customer_id)
        .order_by(CreditLimitLog.created_at.desc(), CreditLimitLog.id.desc())
        .all()
    )

    data = [
        {
            "id": l.id,
            "customer_id": l.customer_id,
            "old_credit_limit": l.old_credit_limit,
            "new_credit_limit": l.new_credit_limit,
            "old_max_debt_days": l.old_max_debt_days,
            "new_max_debt_days": l.new_max_debt_days,
            "reason": l.reason,
            "changed_by_user_id": l.changed_by_user_id,
            "changed_by_name": l.changed_by_name or "Hệ thống",
            "created_at": _format_utc_datetime_iso(l.created_at),
        }
        for l in logs
    ]

    return {
        "success": True,
        "code": 200,
        "message": "Lấy lịch sử điều chỉnh hạn mức thành công.",
        "data": data,
        "total": len(data),
    }



@router.patch("/customers/{customer_id}/pricing-group", response_model=CustomerResponse)
def update_customer_pricing_group(
    customer_id: int,
    payload: CustomerPricingGroupRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")
    customer.customer_group = payload.customer_group.value
    db.commit()
    db.refresh(customer)
    pending_count = db.query(func.count(Order.id)).filter(
        Order.customer_id == customer.id,
        Order.status.in_(INCOMPLETE_STATUSES),
    ).scalar() or 0
    response = CustomerResponse.model_validate(customer)
    response.pending_orders_count = pending_count
    return response


@router.post("/customers/{customer_id}/lock", response_model=CustomerResponse)
def lock_customer(
    customer_id: int,
    payload: CustomerLockRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Khóa giao dịch với đại lý (SCRUM-85).
    
    Yêu cầu nghiệp vụ:
    - Kế toán công nợ / Quản trị viên thực hiện.
    - BẮT BUỘC nhập lý do khóa (`reason` không được để trống).
    - Đại lý sau khi bị khóa sẽ không được phép tạo bất kỳ đơn hàng mới nào.
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải nhập lý do khóa đại lý!",
        )

    # Tìm user record thực tế nếu có
    actor_user = db.query(User).filter(User.username == user.username).first()

    customer.is_locked = True
    customer.is_manually_locked = True
    customer.lock_reason = clean_reason
    customer.locked_at = datetime.now(timezone.utc)
    customer.locked_by_id = actor_user.id if actor_user else None

    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


@router.post("/customers/{customer_id}/unlock", response_model=CustomerResponse)
def unlock_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Mở khóa giao dịch với đại lý (SCRUM-85)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    customer.is_locked = False
    customer.is_manually_locked = False
    customer.lock_reason = None
    customer.locked_at = None
    customer.locked_by_id = None

    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


@router.patch("/customers/{customer_id}/transaction-status", response_model=CustomerResponse)
def update_customer_transaction_status(
    customer_id: int,
    payload: CustomerTransactionStatusRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Khóa/Mở giao dịch bán hàng với đại lý (Theo API_SPECIFICATION.md S3-07).
    
    Status: 'ACTIVE' hoặc 'LOCKED_FOR_DEBT'
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý!")

    target_status = payload.status.strip().upper()
    if target_status in ("LOCKED_FOR_DEBT", "LOCKED"):
        clean_reason = (payload.reason or "").strip()
        if not clean_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập lý do khóa đại lý!",
            )
        actor_user = db.query(User).filter(User.username == user.username).first()
        customer.is_locked = True
        customer.is_manually_locked = True
        customer.lock_reason = clean_reason
        customer.locked_at = datetime.now(timezone.utc)
        customer.locked_by_id = actor_user.id if actor_user else None
    elif target_status in ("ACTIVE", "UNLOCKED"):
        customer.is_locked = False
        customer.is_manually_locked = False
        customer.lock_reason = None
        customer.locked_at = None
        customer.locked_by_id = None
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trạng thái không hợp lệ. Chỉ chấp nhận 'ACTIVE' hoặc 'LOCKED_FOR_DEBT'.",
        )

    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    debt_record = db.query(CustomerDebt).filter(CustomerDebt.customer_id == customer.id).first()
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    res.debt_limit = getattr(customer, "credit_limit", 0.0)
    if debt_record:
        res.current_debt = debt_record.total_debt
    return res


@router.get("/accounting/agencies-debt-status", response_model=List[CustomerResponse])
def get_agencies_debt_status(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permissions(PERM_CUSTOMERS_LOCK)),
):
    """Endpoint tương thích cho kế toán theo dõi công nợ và trạng thái khóa đại lý."""
    return list_customers(is_locked=None, search=None, assigned_rep_id=None, region_id=None, db=db, current_user=_user)


class CreditActionModeRequest(BaseModel):
    action_mode: str = Field(..., description="Chế độ xử lý rủi ro tín dụng: BLOCK hoặc REVIEW", alias="actionMode")
    reason: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


@router.patch("/customers/{customer_id}/credit-action-mode", response_model=CustomerResponse)
def update_customer_credit_action_mode(
    customer_id: int,
    payload: CreditActionModeRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Cập nhật chế độ xử lý khi đại lý bị gắn cờ rủi ro tín dụng: BLOCK hoặc REVIEW (SCRUM-42 R2)."""
    clean_mode = payload.action_mode.strip().upper()
    if clean_mode not in ("BLOCK", "REVIEW"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chế độ xử lý không hợp lệ. Chỉ chấp nhận 'BLOCK' (chặn bán) hoặc 'REVIEW' (chuyển duyệt đơn).",
        )
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")

    customer.credit_action_mode = clean_mode
    db.commit()
    db.refresh(customer)

    # Đánh giá lại rủi ro tín dụng để đồng bộ hóa trạng thái khóa theo chế độ mới
    CreditRiskService.apply_evaluation(db, customer, commit=True)
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    return res


@router.post("/customers/{customer_id}/reevaluate-credit-risk")
def reevaluate_customer_credit_risk(
    customer_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Sales Manager", "Admin")),
):
    """Đánh giá lại rủi ro tín dụng cho một đại lý theo yêu cầu (SCRUM-42)."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý.")
    eval_result = CreditRiskService.apply_evaluation(db, customer, commit=True)
    db.refresh(customer)
    return {
        "success": True,
        "code": 200,
        "message": f"Đánh giá rủi ro tín dụng cho đại lý '{customer.name}' thành công.",
        "data": eval_result.to_dict(),
    }


@router.post("/debts/credit-risk/run-daily-job")
@router.post("/credit-risk/run-daily-job")
def run_daily_credit_risk_job(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Accountant", "Admin")),
):
    """Tác vụ định kỳ đánh giá lại rủi ro tín dụng cho tất cả đại lý (SCRUM-42 R3)."""
    summary = CreditRiskService.reevaluate_all_dealers(db)
    return {
        "success": True,
        "code": 200,
        "message": "Hoàn tất tác vụ đánh giá lại rủi ro tín dụng hàng ngày cho toàn bộ đại lý.",
        "data": summary,
    }



# ---------------------------------------------------------
# Territory & Sales Rep Assignment Endpoints (S3-06 & Handover)
# ---------------------------------------------------------

@router.get("/sales-reps", operation_id="list_sales_reps_customer_lock")
def list_sales_reps(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Rep", "Sales Manager", "Admin")),
):
    """Lấy danh sách các nhân sự có vai trò Sales Rep (Nhân viên kinh doanh) đang hoạt động để phân công hoặc tiếp nhận bàn giao."""
    # Chỉ lọc đúng các vai trò Nhân viên kinh doanh
    sales_rep_roles = db.query(Role).filter(
        Role.code.in_(["SALES_REP", "Sales Rep", "KINH_DOANH"])
    ).all()
    role_ids = [r.id for r in sales_rep_roles]
    if not role_ids:
        sales_rep_roles = db.query(Role).filter(
            Role.name.ilike("%kinh doanh%"),
            ~Role.code.in_(["SALES_MANAGER", "Sales Manager", "QUAN_LY_KINH_DOANH", "ADMIN", "ACCOUNTANT", "WAREHOUSE"])
        ).all()
        role_ids = [r.id for r in sales_rep_roles]

    if not role_ids:
        return []

    users = (
        db.query(User)
        .join(User.roles)
        .filter(
            Role.id.in_(role_ids),
            (User.status == "ACTIVE") | (User.is_active == True),
            User.status != "DISABLED",
            User.status != "LOCKED",
        )
        .distinct()
        .all()
    )

    return [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name or u.username,
            "email": u.email,
        }
        for u in users
    ]


@router.patch("/customers/{customer_id}/assign-sales-rep", response_model=CustomerResponse)
def assign_sales_rep(
    customer_id: int,
    payload: AssignSalesRepRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    """Gán một nhân viên kinh doanh phụ trách chính cho đại lý (API_SPECIFICATION.md S3-06).
    
    Phân quyền: Sales Manager.
    """
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý tương ứng!")

    target_rep = db.get(User, payload.sales_rep_id)
    if not target_rep or target_rep.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Nhân viên kinh doanh được chọn không tồn tại hoặc tài khoản đã bị khóa!")

    actor_user = db.query(User).filter(User.username == user.username).first()
    actor_id = actor_user.id if actor_user else None

    old_rep_id = customer.sales_rep_id
    customer.sales_rep_id = target_rep.id

    # Ghi nhận lịch sử phân công
    handover_log = CustomerHandoverHistory(
        customer_id=customer.id,
        from_sales_rep_id=old_rep_id,
        to_sales_rep_id=target_rep.id,
        transferred_by_id=actor_id,
        reason="Phân công nhân viên phụ trách trực tiếp",
    )
    db.add(handover_log)
    db.commit()
    db.refresh(customer)

    pending_count = (
        db.query(func.count(Order.id))
        .filter(Order.customer_id == customer.id, Order.status.in_(INCOMPLETE_STATUSES))
        .scalar()
        or 0
    )
    debt_record = db.query(CustomerDebt).filter(CustomerDebt.customer_id == customer.id).first()
    res = CustomerResponse.model_validate(customer)
    res.pending_orders_count = pending_count
    res.debt_limit = getattr(customer, "credit_limit", 0.0)
    res.sales_rep_name = target_rep.full_name or target_rep.username
    if debt_record:
        res.current_debt = debt_record.total_debt
    return res


# ---------------------------------------------------------
# Order Endpoints (SCRUM-10 & SCRUM-85)
# ---------------------------------------------------------

@router.post("/orders/simulate")
def simulate_order(
    payload: OrderSimulateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Tính toán giá tự động, kiểm tra tồn khả dụng và hạn mức nợ trước khi lưu đơn thật (EP-04 & SCRUM-10)."""
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý tương ứng!")

    serving_wh = get_customer_serving_warehouse(db, customer.id, payload.warehouse_id)
    items_validation = []
    sub_total = 0.0
    total_discount = 0.0

    for it in payload.items:
        sku = (it.sku or "").strip().upper()
        prod = None
        if it.product_id:
            prod = db.get(Product, it.product_id)
            if prod:
                sku = prod.sku
        elif sku:
            prod = db.query(Product).filter(func.upper(Product.sku) == sku).first()

        effective = resolve_effective_price(db, sku, customer.customer_group)
        mock_p = MOCK_PRODUCTS.get(sku)
        base_price = (
            effective["sale_price"]
            if effective
            else (prod.base_price if prod else (mock_p["sale_price"] if mock_p else 0.0))
        )
        floor_price = effective["floor_price"] if effective else None
        actual_price = base_price if it.unit_price is None else it.unit_price
        is_below_floor = floor_price is not None and actual_price < floor_price

        stock_info = get_available_stock_info(db, sku, serving_wh.id)
        avail = stock_info["available_qty"]
        is_available = it.quantity <= avail

        # S3-01: Tính toán chiết khấu sản lượng tốt nhất theo Best Deal Rule
        disc = calculate_best_discount(sku=sku, quantity=it.quantity, base_price=actual_price, db=db)
        disc_amount = float(disc.get("discount_amount") or 0.0)
        disc_percent = float(disc.get("discount_percent") or 0.0)
        line_subtotal = it.quantity * actual_price
        line_total = max(0.0, line_subtotal - disc_amount)

        sub_total += line_subtotal
        total_discount += disc_amount

        items_validation.append({
            "productId": prod.id if prod else it.product_id,
            "sku": sku,
            "requestedQty": it.quantity,
            "availableQty": avail,
            "available_qty": avail,
            "availableQuantity": avail,
            "available_quantity": avail,
            "maxAllowedQty": max(0.0, avail),
            "max_allowed_qty": max(0.0, avail),
            "max_allowed_quantity": max(0.0, avail),
            "isAvailable": is_available,
            "unitPrice": actual_price,
            "floorPrice": floor_price,
            "discountPercent": disc_percent,
            "discountAmount": disc_amount,
            "lineSubtotal": line_subtotal,
            "lineTotal": line_total,
            "appliedPolicyName": disc.get("applied_policy_name"),
            "isBelowFloorPrice": is_below_floor,
        })

    grand_total = max(0.0, sub_total - total_discount)
    current_debt = float(getattr(customer, "current_debt", 0.0) or 0.0)
    credit_limit = float(getattr(customer, "credit_limit", 0.0) or 0.0)
    debt_after = current_debt + grand_total
    is_exceeded = credit_limit > 0 and debt_after > credit_limit

    return {
        "success": True,
        "code": 200,
        "data": {
            "subTotal": sub_total,
            "discountAmount": total_discount,
            "taxAmount": 0.0,
            "grandTotal": grand_total,
            "currentDebt": current_debt,
            "creditLimit": credit_limit,
            "debtAfterOrder": debt_after,
            "isCreditLimitExceeded": is_exceeded,
            "isCreditFlagged": bool(getattr(customer, "is_credit_flagged", False)),
            "creditFlagReason": getattr(customer, "credit_flag_reason", None),
            "creditActionMode": getattr(customer, "credit_action_mode", "BLOCK") or "BLOCK",
            "isLocked": customer.is_locked,
            "warehouseId": serving_wh.id,
            "warehouseName": serving_wh.name,
            "itemsValidation": items_validation,
        }
    }


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Tạo mới đơn hàng (SCRUM-10 & SCRUM-85).
    
    Quy tắc nghiệp vụ:
    - Kiểm tra xem đại lý có tồn tại và đang bị khóa hay không.
    - NẾU ĐẠI LÝ BỊ KHÓA (`is_locked == True`): CHẶN TẠO ĐƠN NGAY LẬP TỨC!
    - SCRUM-10: Kiểm tra tồn khả dụng = Tồn thực tế - Tồn đang giữ chỗ.
      Dùng cơ chế Pessimistic Locking (SELECT ... FOR UPDATE) chống race condition.
      Nếu đặt vượt tồn khả dụng, chặn lại và trả về lỗi kèm gợi ý số lượng tối đa còn đặt được.
    """
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý tương ứng!")

    # SCRUM-85 Validation Check: Chặn đại lý bị khóa giao dịch
    if customer.is_locked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Đại lý '{customer.name}' ({customer.code}) đã bị khóa giao dịch, "
                f"không thể tạo đơn hàng mới! Lý do: {customer.lock_reason or 'Không xác định'}."
            ),
        )

    # SCRUM-42 Validation Check: Kiểm tra cờ rủi ro tín dụng (BLOCK vs REVIEW)
    is_credit_flagged = bool(getattr(customer, "is_credit_flagged", False))
    credit_action_mode = (getattr(customer, "credit_action_mode", "BLOCK") or "BLOCK").upper()
    if is_credit_flagged:
        if credit_action_mode == "BLOCK":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Đại lý '{customer.name}' ({customer.code}) đã bị gắn cờ rủi ro tín dụng "
                    f"và đang ở chế độ CHẶN BÁN (BLOCK)! Lý do: {customer.credit_flag_reason or 'Vượt hạn mức tín dụng hoặc nợ quá hạn cho phép'}."
                ),
            )
        # Trong chế độ REVIEW, đơn hàng sẽ được phép tạo nhưng bắt buộc chuyển sang quy trình cần duyệt (PENDING_APPROVAL)

    serving_wh = get_customer_serving_warehouse(db, customer.id, payload.warehouse_id)

    with _inventory_lock:
        # Sinh mã đơn tự động duy nhất
        count_today = db.query(func.count(Order.id)).scalar() or 0
        unique_suffix = uuid.uuid4().hex[:4].upper()
        order_code = f"ORD-{datetime.now().strftime('%Y%m%d')}-{count_today + 1:04d}-{unique_suffix}"

        is_customer_account = user.role.strip().lower() in {"customer", "đại lý"}
        resolved_items: list[dict[str, Any]] = []
        approval_lines: list[str] = []

        for requested in payload.items:
            sku = (requested.sku or "").strip().upper()
            db_product = None
            if requested.product_id:
                db_product = db.get(Product, requested.product_id)
                if db_product:
                    sku = db_product.sku
            elif sku:
                db_product = db.query(Product).filter(func.upper(Product.sku) == sku).first()

            product = MOCK_PRODUCTS.get(sku)
            effective = resolve_effective_price(db, sku, customer.customer_group)

            # Lấy giá niêm yết gốc (base_price) từ database hoặc mock
            base_product_price: Optional[float] = None
            if db_product and db_product.base_price is not None and db_product.base_price > 0:
                base_product_price = float(db_product.base_price)
            elif product and product.get("sale_price") is not None and product.get("sale_price") > 0:
                base_product_price = float(product["sale_price"])

            if effective is None and customer.customer_group in {
                CustomerGroup.LEVEL_1.value,
                CustomerGroup.LEVEL_2.value,
            } and base_product_price is None and requested.unit_price is None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Chưa có bảng giá đang hiệu lực cho {customer.customer_group} và SKU {sku}.",
                )
            if effective is None and product is None and db_product is None:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy SKU {sku} trong danh mục sản phẩm.")

            # SCRUM-10: Kiểm tra và giữ chỗ tồn kho với Pessimistic Locking (SELECT ... FOR UPDATE)
            success, avail, max_allowed, stock_info = reserve_stock_atomic(
                db=db,
                sku=sku,
                warehouse_id=serving_wh.id,
                quantity=requested.quantity,
            )
            if not success:
                db.rollback()
                max_allowed_int = max(0, int(avail))
                prod_title = db_product.name if db_product else (product.get("name") if product else sku)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Sản phẩm [{prod_title} / {sku}] chỉ còn khả dụng tối đa {max_allowed_int} đơn vị! "
                        f"Sản phẩm '{sku}' không đủ số lượng tồn khả dụng tại kho '{serving_wh.name}'! "
                        f"Số lượng yêu cầu: {requested.quantity}, tồn khả dụng: {max_allowed_int}. "
                        f"Số lượng tối đa còn có thể đặt: {max_allowed_int}."
                    ),
                )

            # Xác định đơn giá cơ sở & giá sàn
            if effective is not None:
                base_price = effective["sale_price"]
                floor_price = effective.get("floor_price")
                price_list_id = effective.get("price_list_id")
            elif base_product_price is not None:
                base_price = base_product_price
                floor_price = None
                price_list_id = None
            elif requested.unit_price is not None and requested.unit_price > 0:
                base_price = requested.unit_price
                floor_price = None
                price_list_id = None
            else:
                base_price = 0.0
                floor_price = None
                price_list_id = None

            actual_price = (
                base_price
                if is_customer_account or requested.unit_price is None or requested.unit_price <= 0
                else requested.unit_price
            )
            if floor_price is not None and actual_price < floor_price:
                approval_lines.append(f"{sku}: {actual_price} dưới giá sàn {floor_price}")

            # Gán product_id để tránh vi phạm NOT NULL constraint trên bảng order_items
            product_id = db_product.id if db_product else (requested.product_id or None)
            if not product_id and (product or requested.product_name):
                existing_prod = db.query(Product).filter(func.upper(Product.sku) == sku).first()
                if existing_prod:
                    product_id = existing_prod.id
                elif db.query(Product).count() > 0:
                    new_prod = Product(
                        sku=sku,
                        name=requested.product_name or (product.get("name") if product else sku),
                        base_price=float(base_price if base_price else 0.0),
                        base_unit=product.get("unit") if product and product.get("unit") else "Cái",
                        status="ACTIVE",
                    )
                    db.add(new_prod)
                    db.flush()
                    product_id = new_prod.id

            disc = calculate_best_discount(sku=sku, quantity=requested.quantity, base_price=actual_price, db=db)
            disc_amount = float(disc.get("discount_amount") or 0.0)
            disc_percent = float(disc.get("discount_percent") or 0.0)
            line_subtotal = float(requested.quantity * actual_price)
            line_total = max(0.0, line_subtotal - disc_amount)

            resolved_items.append({
                "product_id": product_id,
                "sku": sku,
                "product_name": requested.product_name or (db_product.name if db_product else (product.get("name") if product else sku)),
                "quantity": requested.quantity,
                "unit_price": actual_price,
                "floor_price": floor_price,
                "price_list_id": price_list_id,
                "available_qty": avail,
                "discount_percent": disc_percent,
                "discount_amount": disc_amount,
                "applied_policy_name": disc.get("applied_policy_name"),
                "line_subtotal": line_subtotal,
                "line_total": line_total,
            })

        subtotal_amount = sum(item["line_subtotal"] for item in resolved_items)
        total_discount = sum(item["discount_amount"] for item in resolved_items)
        total_amount = max(0.0, subtotal_amount - total_discount)

        # Gắn thông tin người tạo đơn từ session nhân viên hiện tại
        actor_user = None
        if getattr(user, "id", None):
            actor_user = db.get(User, user.id)
        if not actor_user and user.username:
            actor_user = (
                db.query(User)
                .filter(
                    or_(
                        func.lower(User.username) == user.username.lower(),
                        func.lower(User.email) == user.username.lower(),
                        func.lower(User.full_name) == user.username.lower(),
                    )
                )
                .first()
            )
        if not actor_user and getattr(user, "full_name", None):
            actor_user = (
                db.query(User)
                .filter(func.lower(User.full_name) == user.full_name.lower())
                .first()
            )

        # SCRUM-20 Validation điểm giao hàng
        chosen_address_id: Optional[int] = None
        if payload.delivery_address_id is not None:
            addr = db.get(DeliveryAddress, payload.delivery_address_id)
            if not addr:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy điểm giao hàng với ID {payload.delivery_address_id}!",
                )
            if addr.customer_id != customer.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Điểm giao hàng ID {payload.delivery_address_id} không thuộc về đại lý '{customer.name}' (ID: {customer.id})!",
                )
            chosen_address_id = addr.id
        else:
            default_addr = (
                db.query(DeliveryAddress)
                .filter(DeliveryAddress.customer_id == customer.id, DeliveryAddress.is_default == True)
                .first()
            )
            if not default_addr:
                default_addr = (
                    db.query(DeliveryAddress)
                    .filter(DeliveryAddress.customer_id == customer.id)
                    .order_by(DeliveryAddress.id.asc())
                    .first()
                )
            if default_addr:
                chosen_address_id = default_addr.id

        if is_customer_account or payload.submit_for_approval or payload.status in [OrderStatus.PENDING_APPROVAL, "PENDING_APPROVAL"]:
            order_status = OrderStatus.PENDING_APPROVAL
        elif is_credit_flagged and credit_action_mode == "REVIEW":
            order_status = OrderStatus.PENDING_APPROVAL
            approval_lines.append(f"Cảnh báo rủi ro tín dụng (Yêu cầu duyệt): {customer.credit_flag_reason or 'Đại lý vượt hạn mức hoặc quá hạn nợ'}")
        elif approval_lines:
            order_status = OrderStatus.PENDING
        elif payload.status is not None:
            order_status = payload.status
        else:
            order_status = OrderStatus.DRAFT

        approval_reason = "; ".join(approval_lines) if approval_lines else None
        if order_status in (OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL) and not approval_reason:
            approval_reason = payload.note or "Chờ Quản lý kinh doanh phê duyệt"

        new_order = Order(
            order_code=order_code,
            customer_id=customer.id,
            warehouse_id=serving_wh.id,
            created_by_id=actor_user.id if actor_user else None,
            delivery_address_id=chosen_address_id,
            status=order_status,
            subtotal_amount=subtotal_amount,
            discount_amount=total_discount,
            total_amount=total_amount,
            note=payload.note,
            approval_reason=approval_reason,
        )
        db.add(new_order)
        db.flush()

        for it in resolved_items:
            db.add(OrderItem(
                order_id=new_order.id,
                product_id=it.get("product_id"),
                sku=it["sku"],
                product_name=it["product_name"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                floor_price=it["floor_price"],
                price_list_id=it["price_list_id"],
                available_qty=it.get("available_qty"),
                discount_percent=it.get("discount_percent") or 0.0,
                discount_amount=it.get("discount_amount") or 0.0,
                line_subtotal=it.get("line_subtotal") or 0.0,
                line_total=it.get("line_total") or 0.0,
            ))

        db.commit()
        db.refresh(new_order)

        return _build_full_order_response(new_order, db, customer)


@router.get("/orders", response_model=List[OrderResponse])
def list_orders(
    customer_id: Optional[int] = None,
    order_status: Optional[OrderStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """Danh sách đơn hàng kèm cờ cảnh báo nếu đại lý đang bị khóa (SCRUM-85) và tồn khả dụng (SCRUM-10)."""
    query = select(Order)
    if customer_id:
        query = query.where(Order.customer_id == customer_id)
    if order_status:
        query = query.where(Order.status == order_status)

    orders = db.execute(query.order_by(Order.id.desc())).scalars().all()
    results = []
    for ord in orders:
        cust = db.get(Customer, ord.customer_id)
        results.append(_build_full_order_response(ord, db, cust))

    return results


def _resolve_customer_for_user(db: Session, user: AuthenticatedUser) -> Optional[Customer]:
    """Tìm bản ghi Customer tương ứng với tài khoản người dùng đăng nhập."""
    if not user:
        return None

    # Tìm User trong database theo id hoặc username
    user_db = None
    if getattr(user, "id", None):
        user_db = db.get(User, user.id)
    if not user_db and getattr(user, "username", None):
        user_db = (
            db.query(User)
            .filter(
                or_(
                    func.lower(User.username) == user.username.lower(),
                    func.lower(User.email) == user.username.lower(),
                )
            )
            .first()
        )

    # 1. Nếu có user_db, tìm theo user_id đã liên kết
    if user_db:
        cust = db.query(Customer).filter(Customer.user_id == user_db.id).first()
        if cust:
            return cust
        # Thử tự động khởi tạo hoặc liên kết hồ sơ đại lý
        try:
            from app.services.customer_sync_service import ensure_customer_profile_for_user
            return ensure_customer_profile_for_user(db, user_db)
        except Exception:
            pass

    # 2. Fallback tìm theo code trùng username
    if getattr(user, "username", None):
        cust = db.query(Customer).filter(Customer.code == user.username).first()
        if cust:
            return cust

    return None


def _build_portal_order_dict(order: Order, db: Session, customer: Optional[Customer] = None) -> dict:
    if not customer and order.customer_id:
        customer = db.get(Customer, order.customer_id)

    # Ngày giao hàng dự kiến
    exp_date = getattr(order, "expected_delivery_date", None) or getattr(order, "desired_delivery_date", None)
    exp_date_str = str(exp_date) if exp_date is not None else None

    # Điểm giao hàng và địa chỉ
    deliv_addr = getattr(order, "delivery_address", None)
    if not deliv_addr and getattr(order, "delivery_address_id", None):
        deliv_addr = db.get(DeliveryAddress, order.delivery_address_id)

    deliv_point = None
    deliv_addr_str = None
    deliv_detail = None
    if deliv_addr:
        deliv_point = deliv_addr.receiver_name or f"Điểm giao #{deliv_addr.id}"
        parts = [
            getattr(deliv_addr, "address", None),
            getattr(deliv_addr, "ward", None),
            getattr(deliv_addr, "district", None),
            getattr(deliv_addr, "province", None),
        ]
        deliv_addr_str = ", ".join([p for p in parts if p]) or getattr(deliv_addr, "address", None)
        deliv_detail = DeliveryAddressBriefResponse.model_validate(deliv_addr)
    else:
        deliv_point = "Địa chỉ chính"
        if customer and customer.address:
            deliv_addr_str = customer.address
        else:
            deliv_addr_str = "Chưa có địa chỉ giao hàng"

    status_val = (order.status.value if hasattr(order.status, "value") else str(order.status)).upper()
    is_delivering_or_delivered = status_val in ("SHIPPING", "IN_TRANSIT", "DELIVERED", "COMPLETED", "PROCESSING")

    items_res = []
    has_partially_delivered = False

    for it in (order.items or []):
        ord_qty = int(it.quantity or 0)
        deliv_qty = getattr(it, "quantity_delivered", None)
        if deliv_qty is None:
            deliv_qty = getattr(it, "delivered_quantity", None)

        if status_val in ("COMPLETED", "DELIVERED"):
            if deliv_qty is None or deliv_qty == 0:
                deliv_qty = ord_qty
            else:
                deliv_qty = int(deliv_qty)
        elif status_val in ("SHIPPING", "IN_TRANSIT", "PROCESSING"):
            if deliv_qty is None or deliv_qty == 0:
                deliv_qty = ord_qty
            else:
                deliv_qty = int(deliv_qty)
        else:
            deliv_qty = int(deliv_qty) if deliv_qty is not None else None

        unit_price = float(it.unit_price or 0.0)
        total_price = float(getattr(it, "line_total", None) or (ord_qty * unit_price))
        item_is_partial = bool(is_delivering_or_delivered and (deliv_qty is not None and deliv_qty < ord_qty))
        if item_is_partial:
            has_partially_delivered = True

        unit_str = getattr(it, "unit_name", None) or "Cái"

        items_res.append({
            "id": it.id,
            "sku": it.sku or "",
            "product_name": it.product_name or "",
            "unit": unit_str,
            "unit_name": unit_str,
            "ordered_quantity": ord_qty,
            "quantity": ord_qty,
            "delivered_quantity": deliv_qty,
            "actual_quantity": deliv_qty,
            "unit_price": unit_price,
            "total_price": total_price,
            "subtotal": total_price,
            "is_partially_delivered": item_is_partial,
        })

    return {
        "id": order.id,
        "order_code": order.order_code,
        "customer_id": order.customer_id,
        "customer_name": customer.name if customer else None,
        "created_at": order.created_at,
        "expected_delivery_date": exp_date_str,
        "total_amount": float(order.total_amount or 0.0),
        "status": status_val,
        "delivery_point_name": deliv_point,
        "delivery_address": deliv_addr_str,
        "delivery_address_id": order.delivery_address_id,
        "delivery_address_detail": deliv_detail,
        "note": order.note,
        "approval_reason": getattr(order, "approval_reason", None),
        "is_partially_delivered": has_partially_delivered,
        "items": items_res,
    }


@router.get("/portal/customer-profile")
@router.get("/portal/customer")
@router.get("/customer/profile")
def get_portal_customer_profile(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Lấy thông tin chi tiết đại lý của chính tài khoản đang đăng nhập."""
    customer = _resolve_customer_for_user(db, user)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tài khoản của bạn chưa được liên kết với hồ sơ đại lý nào.",
        )
    serving_wh = get_customer_serving_warehouse(db, customer.id, customer.warehouse_id)
    delivery_addresses = (
        db.query(DeliveryAddress)
        .filter(DeliveryAddress.customer_id == customer.id)
        .order_by(DeliveryAddress.is_default.desc(), DeliveryAddress.id.asc())
        .all()
    )
    current_debt = float(getattr(customer, "current_debt", 0.0) or 0.0)
    credit_limit = float(getattr(customer, "credit_limit", 0.0) or 0.0)
    available_credit = max(0.0, credit_limit - current_debt)

    return {
        "success": True,
        "customer": {
            "id": customer.id,
            "code": customer.code,
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address,
            "customer_group": customer.customer_group,
            "credit_limit": credit_limit,
            "creditLimit": credit_limit,
            "current_debt": current_debt,
            "currentDebt": current_debt,
            "available_credit": available_credit,
            "availableCredit": available_credit,
            "is_locked": customer.is_locked,
            "isLocked": customer.is_locked,
            "lock_reason": customer.lock_reason,
            "lockReason": customer.lock_reason,
            "warehouse_id": serving_wh.id if serving_wh else 1,
            "warehouse_name": serving_wh.name if serving_wh else "Kho Tổng",
            "delivery_addresses": [
                {
                    "id": addr.id,
                    "receiver_name": addr.receiver_name,
                    "receiverName": addr.receiver_name,
                    "phone": addr.phone,
                    "address": addr.address,
                    "is_default": addr.is_default,
                    "isDefault": addr.is_default,
                    "note": addr.note,
                }
                for addr in delivery_addresses
            ],
        }
    }


@router.get("/portal/orders", response_model=List[PortalOrderDetailResponse])
@router.get("/customer/orders", response_model=List[PortalOrderDetailResponse])
def get_portal_orders(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lấy danh sách đơn hàng của chính đại lý đăng nhập hiện tại.
    Nếu đại lý chưa có đơn hàng nào hoặc chưa có hồ sơ, trả về danh sách rỗng [].
    Sắp xếp đơn mới nhất lên đầu (created_at DESC).
    """
    customer = _resolve_customer_for_user(db, user)
    if not customer:
        return []

    orders = (
        db.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.delivery_address))
            .where(Order.customer_id == customer.id)
            .order_by(Order.created_at.desc(), Order.id.desc())
        )
        .scalars()
        .all()
    )

    return [_build_portal_order_dict(ord, db, customer) for ord in orders]


@router.get("/portal/orders/{order_id}", response_model=PortalOrderDetailResponse)
@router.get("/customer/orders/{order_id}", response_model=PortalOrderDetailResponse)
def get_portal_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Xem chi tiết đơn hàng của đại lý:
    1. Kiểm tra quyền sở hữu đơn hàng (order.customer_id == current_user.customer_id),
       nếu không khớp trả về 403 Forbidden.
    2. Trả về chi tiết đơn hàng kèm danh sách dòng hàng (items):
       sku, product_name, unit, ordered_quantity, delivered_quantity, unit_price, total_price,
       và cờ is_partially_delivered.
    """
    customer = _resolve_customer_for_user(db, user)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn chưa được liên kết với hồ sơ đại lý nào.",
        )

    order = (
        db.execute(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.delivery_address))
            .where(Order.id == order_id)
        )
        .scalar_one_or_none()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng #{order_id}.",
        )

    if order.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập hoặc xem chi tiết đơn hàng của đại lý khác.",
        )

    return _build_portal_order_dict(order, db, customer)



class ReorderItemDetail(BaseModel):
    product_id: int
    sku: str
    product_name: str
    unit: str = "Cái"
    quantity: int
    unit_price: float
    current_price: float
    old_price: float
    price_changed: bool = False
    subtotal: float
    floor_price: Optional[float] = None
    available_qty: float = 0.0
    stock_available: float = 0.0
    is_available: bool = True
    is_selected: bool = True

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class RemovedReorderItem(BaseModel):
    product_id: Optional[int] = None
    sku: str
    product_name: str
    quantity: int
    old_price: Optional[float] = None
    reason: str = "Sản phẩm đã ngừng kinh doanh"

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ReorderPreparationResponse(BaseModel):
    success: bool = True
    order_id: int
    original_order_code: str
    customer_id: int
    customer_name: str
    default_delivery_point_id: Optional[int] = None
    delivery_address_id: Optional[int] = None
    items: List[ReorderItemDetail] = Field(default_factory=list)
    removed_items: List[RemovedReorderItem] = Field(default_factory=list)
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    warning_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


@router.get("/portal/orders/{order_id}/reorder-items", response_model=ReorderPreparationResponse)
@router.post("/portal/orders/{order_id}/reorder", response_model=ReorderPreparationResponse)
def prepare_order_reorder(
    order_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Chuẩn bị dữ liệu đặt lại đơn hàng (Reorder) cho đại lý:
    1. Kiểm tra quyền sở hữu đơn hàng (chỉ đại lý sở hữu đơn mới được đặt lại).
    2. Lấy tất cả mặt hàng từ đơn cũ.
    3. Kiểm tra trạng thái kinh doanh: sản phẩm ngừng bán được ghi nhận vào removed_items và loại bỏ.
    4. Tính lại đơn giá theo Bảng giá hiện hành của đại lý (áp current_price).
    5. Kiểm tra tồn kho khả dụng tại kho phục vụ.
    6. Trả về payload: items, removed_items, default_delivery_point_id.
    """
    customer = _resolve_customer_for_user(db, user)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn chưa được liên kết với hồ sơ đại lý nào.",
        )

    order = (
        db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id)
        )
        .scalar_one_or_none()
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đơn hàng với ID #{order_id}.",
        )

    # Bảo mật: Chỉ cho phép đặt lại đơn của chính đại lý đó
    if order.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập hoặc đặt lại đơn hàng của đại lý khác.",
        )

    # Xác định kho phục vụ đại lý
    wh_override = getattr(order, "warehouse_id", None) or getattr(customer, "warehouse_id", None)
    serving_wh = get_customer_serving_warehouse(db, customer.id, wh_override)
    wh_id = serving_wh.id if serving_wh else 1

    items: List[dict] = []
    removed_items: List[dict] = []

    for it in order.items:
        sku = (it.sku or "").strip().upper()
        prod = None
        if it.product_id:
            prod = db.get(Product, it.product_id)
        if not prod and sku:
            prod = db.query(Product).filter(func.upper(Product.sku) == sku).first()

        # Kiểm tra trạng thái kinh doanh của sản phẩm
        is_discontinued = False
        if not prod:
            is_discontinued = True
        else:
            prod_status = getattr(prod, "status", "ACTIVE") or "ACTIVE"
            if prod_status.upper() in ["DISCONTINUED", "INACTIVE", "STOPPED", "NGỪNG BÁN", "NGỪNG KINH DOANH"]:
                is_discontinued = True
            elif getattr(prod, "is_active", True) is False:
                is_discontinued = True

        if is_discontinued:
            removed_items.append({
                "product_id": prod.id if prod else it.product_id,
                "sku": sku or (prod.sku if prod else "UNKNOWN"),
                "product_name": it.product_name or (prod.name if prod else sku),
                "quantity": it.quantity,
                "old_price": it.unit_price,
                "reason": "Sản phẩm đã ngừng kinh doanh",
            })
            continue

        # Sản phẩm còn kinh doanh: tính lại đơn giá theo Bảng giá hiện hành
        cust_group = getattr(customer, "customer_group", None) or "DEFAULT"
        effective = resolve_effective_price(db, prod.sku, cust_group)
        if not effective and cust_group != "DEFAULT":
            effective = resolve_effective_price(db, prod.sku, "DEFAULT")
        current_price = (
            float(effective["sale_price"])
            if effective and effective.get("sale_price") is not None
            else (float(prod.base_price) if prod.base_price is not None and prod.base_price > 0 else float(it.unit_price))
        )
        floor_price = float(effective["floor_price"]) if effective and effective.get("floor_price") is not None else None

        # Kiểm tra tồn kho khả dụng
        stock_info = get_available_stock_info(db, prod.sku, wh_id)
        avail = float(stock_info.get("available_qty", 0.0) or 0.0)

        items.append({
            "product_id": prod.id,
            "sku": prod.sku,
            "product_name": prod.name,
            "unit": getattr(prod, "base_unit", "Cái") or "Cái",
            "quantity": it.quantity,
            "unit_price": current_price,
            "current_price": current_price,
            "old_price": float(it.unit_price),
            "price_changed": round(current_price, 2) != round(float(it.unit_price), 2),
            "subtotal": round(current_price * it.quantity, 2),
            "floor_price": floor_price,
            "available_qty": avail,
            "stock_available": avail,
            "is_available": avail >= it.quantity,
            "is_selected": True,
        })

    # Điểm giao hàng mặc định
    default_delivery_point_id = order.delivery_address_id
    if not default_delivery_point_id:
        def_addr = (
            db.query(DeliveryAddress.id)
            .filter(DeliveryAddress.customer_id == customer.id, DeliveryAddress.is_default == True)
            .first()
        )
        if def_addr:
            default_delivery_point_id = def_addr[0]
        else:
            any_addr = (
                db.query(DeliveryAddress.id)
                .filter(DeliveryAddress.customer_id == customer.id)
                .first()
            )
            if any_addr:
                default_delivery_point_id = any_addr[0]

    warn_msg = None
    if removed_items:
        names = ", ".join([f"'{item['product_name']}'" for item in removed_items])
        warn_msg = f"Một số mặt hàng đã ngừng kinh doanh và được tự động bỏ qua: {names}."

    return {
        "success": True,
        "order_id": order.id,
        "original_order_code": order.order_code,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "default_delivery_point_id": default_delivery_point_id,
        "delivery_address_id": default_delivery_point_id,
        "items": items,
        "removed_items": removed_items,
        "warehouse_id": wh_id,
        "warehouse_name": serving_wh.name if serving_wh else None,
        "warning_message": warn_msg,
    }



@router.get("/orders/pending-approval", response_model=List[OrderResponse])
def list_orders_pending_approval(
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    orders = db.execute(
        select(Order).options(selectinload(Order.items))
        .where(Order.status.in_([OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL]))
        .order_by(Order.id.desc())
    ).scalars().all()
    results = []
    for order in orders:
        customer = db.get(Customer, order.customer_id)
        results.append(_build_full_order_response(order, db, customer))
    return results


@router.post("/orders/{order_id}/approve", response_model=OrderResponse)
def approve_below_floor_order(
    order_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    order = db.execute(select(Order).options(selectinload(Order.items)).where(Order.id == order_id)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng.")
    if order.status not in (OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL):
        raise HTTPException(status_code=409, detail="Đơn hàng không ở trạng thái chờ duyệt.")
    order.status = OrderStatus.APPROVED
    db.commit()
    customer = db.get(Customer, order.customer_id)
    return _build_full_order_response(order, db, customer)


class RejectOrderRequest(BaseModel):
    reason: str = Field(default="Không được phê duyệt", max_length=500)


@router.post("/orders/{order_id}/reject", response_model=OrderResponse)
def reject_below_floor_order(
    order_id: int,
    payload: RejectOrderRequest,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    order = db.execute(select(Order).options(selectinload(Order.items)).where(Order.id == order_id)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng.")
    if order.status not in (OrderStatus.PENDING, OrderStatus.PENDING_APPROVAL):
        raise HTTPException(status_code=409, detail="Đơn hàng không ở trạng thái chờ duyệt.")
    order.status = OrderStatus.CANCELLED
    rejection_note = f"Từ chối: {payload.reason.strip()}"
    order.approval_reason = f"{order.approval_reason}; {rejection_note}" if order.approval_reason else rejection_note

    wh_id = getattr(order, "warehouse_id", None) or 1
    for it in order.items:
        if it.sku:
            release_reserved_stock(db, it.sku, wh_id, it.quantity)
    db.commit()
    customer = db.get(Customer, order.customer_id)
    return _build_full_order_response(order, db, customer)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order_detail(order_id: int, db: Session = Depends(get_db)):
    """Xem chi tiết đơn hàng kèm cảnh báo nếu đại lý đang bị khóa (SCRUM-85) và tồn khả dụng (SCRUM-10)."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    customer = db.get(Customer, order.customer_id)
    return _build_full_order_response(order, db, customer)


@router.put("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    new_status: OrderStatus,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Cập nhật trạng thái đơn hàng dở dang.
    
    Theo SCRUM-85: Đơn đang dở của đại lý bị khóa VẪN XỬ LÝ TIẾP ĐƯỢC nhưng có cảnh báo.
    Theo SCRUM-10: Nếu hủy đơn (CANCELLED), giải phóng tồn đang giữ chỗ (Reserved Stock).
    """
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    if new_status == OrderStatus.CANCELLED and order.status != OrderStatus.CANCELLED:
        wh_id = getattr(order, "warehouse_id", None) or 1
        for it in order.items:
            if it.sku:
                release_reserved_stock(db, it.sku, wh_id, it.quantity)

    order.status = new_status
    db.commit()
    db.refresh(order)

    customer = db.get(Customer, order.customer_id)
    return _build_full_order_response(order, db, customer)


@router.post("/orders/{order_id}/submit", response_model=OrderResponse)
def submit_order_for_approval(
    order_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Gửi duyệt đơn hàng nháp (chuyển sang trạng thái PENDING_APPROVAL)."""
    order = db.execute(
        select(Order).options(selectinload(Order.items), selectinload(Order.delivery_address)).where(Order.id == order_id)
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    customer = db.get(Customer, order.customer_id)
    if customer and customer.is_locked:
        raise HTTPException(
            status_code=400,
            detail=f"Đại lý '{customer.name}' hiện đang bị khóa giao dịch, không thể gửi duyệt đơn hàng!",
        )

    if order.status not in (OrderStatus.DRAFT, OrderStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Chỉ có thể gửi duyệt đơn hàng ở trạng thái Bản nháp!")

    order.status = OrderStatus.PENDING_APPROVAL
    if not order.approval_reason:
        order.approval_reason = order.note or "Chờ Quản lý kinh doanh phê duyệt"

    db.commit()
    db.refresh(order)

    return _build_full_order_response(order, db, customer)


@router.put("/orders/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: int,
    payload: OrderCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Chỉnh sửa đơn hàng (chỉ cho phép khi đơn ở trạng thái DRAFT hoặc PENDING_APPROVAL)."""
    order = db.execute(
        select(Order).options(selectinload(Order.items), selectinload(Order.delivery_address)).where(Order.id == order_id)
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    if order.status not in (OrderStatus.DRAFT, OrderStatus.PENDING_APPROVAL):
        raise HTTPException(status_code=400, detail="Không thể chỉnh sửa đơn hàng đã được duyệt hoặc đang xử lý!")

    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại lý tương ứng!")

    if customer.is_locked:
        raise HTTPException(
            status_code=400,
            detail=f"Đại lý '{customer.name}' đã bị khóa giao dịch, không thể cập nhật đơn!",
        )

    # Validate delivery address
    chosen_address_id: Optional[int] = None
    if payload.delivery_address_id is not None:
        addr = db.get(DeliveryAddress, payload.delivery_address_id)
        if not addr or addr.customer_id != customer.id:
            raise HTTPException(status_code=400, detail="Điểm giao hàng không hợp lệ hoặc không thuộc đại lý!")
        chosen_address_id = addr.id
    else:
        chosen_address_id = order.delivery_address_id

    # Resolve items and prices
    resolved_items = []
    approval_lines = []
    for requested in payload.items:
        sku = requested.sku.strip().upper() if requested.sku else ""
        product = MOCK_PRODUCTS.get(sku)
        db_product = db.query(Product).filter(func.upper(Product.sku) == sku).first() if sku else None
        effective = resolve_effective_price(db, sku, customer.customer_group) if sku else None

        base_product_price = None
        if db_product and db_product.base_price is not None and db_product.base_price > 0:
            base_product_price = float(db_product.base_price)
        elif product and product.get("sale_price") is not None and product.get("sale_price") > 0:
            base_product_price = float(product["sale_price"])

        if effective is not None:
            base_price = effective["sale_price"]
            floor_price = effective.get("floor_price")
            price_list_id = effective.get("price_list_id")
        elif base_product_price is not None:
            base_price = base_product_price
            floor_price = None
            price_list_id = None
        elif requested.unit_price is not None and requested.unit_price > 0:
            base_price = requested.unit_price
            floor_price = None
            price_list_id = None
        else:
            base_price = 0.0
            floor_price = None
            price_list_id = None

        actual_price = requested.unit_price if (requested.unit_price is not None and requested.unit_price > 0) else base_price
        if floor_price is not None and actual_price < floor_price:
            approval_lines.append(f"{sku}: {actual_price} dưới giá sàn {floor_price}")

        product_id = db_product.id if db_product else None
        if not product_id and (product or requested.product_name):
            existing_prod = db.query(Product).filter(func.upper(Product.sku) == sku).first() if sku else None
            if existing_prod:
                product_id = existing_prod.id
            elif db.query(Product).count() > 0:
                new_prod = Product(
                    sku=sku,
                    name=requested.product_name or (product.get("name") if product else sku),
                    base_price=float(base_price if base_price else 0.0),
                    base_unit=product.get("unit") if product and product.get("unit") else "Cái",
                    status="ACTIVE",
                )
                db.add(new_prod)
                db.flush()
                product_id = new_prod.id

            disc = calculate_best_discount(sku=sku, quantity=requested.quantity, base_price=actual_price, db=db)
            disc_amount = float(disc.get("discount_amount") or 0.0)
            disc_percent = float(disc.get("discount_percent") or 0.0)
            line_subtotal = float(requested.quantity * actual_price)
            line_total = max(0.0, line_subtotal - disc_amount)

            resolved_items.append({
                "product_id": product_id,
                "sku": sku,
                "product_name": requested.product_name or (db_product.name if db_product else (product.get("name") if product else sku)),
                "quantity": requested.quantity,
                "unit_price": actual_price,
                "floor_price": floor_price,
                "price_list_id": price_list_id,
                "discount_percent": disc_percent,
                "discount_amount": disc_amount,
                "applied_policy_name": disc.get("applied_policy_name"),
                "line_subtotal": line_subtotal,
                "line_total": line_total,
            })

        subtotal_amount = sum(it["line_subtotal"] for it in resolved_items)
        total_discount = sum(it["discount_amount"] for it in resolved_items)
        total_amount = max(0.0, subtotal_amount - total_discount)

        order.customer_id = customer.id
        order.delivery_address_id = chosen_address_id
        order.subtotal_amount = subtotal_amount
        order.discount_amount = total_discount
        order.total_amount = total_amount
        order.note = payload.note
        if payload.submit_for_approval or payload.status in (OrderStatus.PENDING_APPROVAL, "PENDING_APPROVAL"):
            order.status = OrderStatus.PENDING_APPROVAL
        if approval_lines:
            order.approval_reason = "; ".join(approval_lines)
        elif order.status == OrderStatus.PENDING_APPROVAL and not order.approval_reason:
            order.approval_reason = payload.note or "Chờ Quản lý kinh doanh phê duyệt"

        # Xóa các dòng hàng cũ và thêm dòng hàng mới
        for old_it in list(order.items):
            db.delete(old_it)
        db.flush()

        for it in resolved_items:
            db.add(OrderItem(
                order_id=order.id,
                product_id=it.get("product_id"),
                sku=it["sku"],
                product_name=it["product_name"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                floor_price=it["floor_price"],
                price_list_id=it["price_list_id"],
                discount_percent=it.get("discount_percent") or 0.0,
                discount_amount=it.get("discount_amount") or 0.0,
                line_subtotal=it.get("line_subtotal") or 0.0,
                line_total=it.get("line_total") or 0.0,
            ))

        db.commit()
    db.refresh(order)

    return _build_full_order_response(order, db, customer)


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Hủy đơn hàng (cho phép khi đơn ở trạng thái DRAFT hoặc PENDING_APPROVAL)."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    if order.status not in (OrderStatus.DRAFT, OrderStatus.PENDING_APPROVAL, OrderStatus.PENDING):
        raise HTTPException(status_code=400, detail="Chỉ có thể hủy đơn hàng ở trạng thái Bản nháp hoặc Chờ duyệt!")

    wh_id = getattr(order, "warehouse_id", None) or 1
    for it in order.items:
        if it.sku:
            release_reserved_stock(db, it.sku, wh_id, it.quantity)

    order.status = OrderStatus.CANCELLED
    order.approval_reason = f"Hủy đơn bởi người tạo: {user.full_name or user.username}"
    db.commit()
    db.refresh(order)

    customer = db.get(Customer, order.customer_id)
    return _build_full_order_response(order, db, customer)


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_ORDERS_CREATE)),
):
    """Xóa hẳn đơn hàng nháp."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng!")

    if order.status != OrderStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Chỉ có thể xóa hoàn toàn đơn hàng ở trạng thái Bản nháp (DRAFT)!")

    wh_id = getattr(order, "warehouse_id", None) or 1
    for it in order.items:
        if it.sku:
            release_reserved_stock(db, it.sku, wh_id, it.quantity)

    db.delete(order)
    db.commit()
    return {"message": "Đã xóa đơn hàng nháp thành công.", "order_id": order_id}
