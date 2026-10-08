"""Customer segment price lists and immutable published versions."""

from datetime import date
from enum import Enum
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator

try:
    from src.backend.rbac import AuthenticatedUser, require_roles
except ModuleNotFoundError:  # pragma: no cover
    from rbac import AuthenticatedUser, require_roles

router = APIRouter(prefix="/api/v1/price-lists", tags=["Price Lists"])


class CustomerGroup(str, Enum):
    LEVEL_1 = "DEALER_LEVEL_1"
    LEVEL_2 = "DEALER_LEVEL_2"
    RETAIL = "RETAIL"


class PriceLine(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    sale_price: int = Field(ge=0)
    floor_price: int = Field(ge=0)

    @validator("sku")
    def normalize_sku(cls, value):
        return value.strip().upper()


class PriceListCreate(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    customer_group: CustomerGroup
    start_date: date
    end_date: date
    items: List[PriceLine] = Field(min_items=1)

    @validator("code")
    def normalize_code(cls, value):
        return value.strip().upper()

    @validator("end_date")
    def valid_period(cls, value, values):
        start = values.get("start_date")
        if start is not None and value < start:
            raise ValueError("end_date phải bằng hoặc sau start_date")
        return value

    @validator("items")
    def unique_skus(cls, value):
        skus = [line.sku for line in value]
        if len(skus) != len(set(skus)):
            raise ValueError("SKU không được trùng trong cùng bảng giá")
        return value


class PriceListView(PriceListCreate):
    id: int
    version: int
    published: bool


# In-memory adapter follows the other demo routers. Persisted SQLAlchemy models
# are declared in models.py; replace this store with a DB repository in deployment.
PRICE_LISTS = {}  # type: Dict[int, dict]
_next_id = 1


def _response(row):
    return dict(row)


@router.get("", response_model=List[PriceListView])
def list_price_lists(
    published: Optional[bool] = Query(None),
    customer_group: Optional[CustomerGroup] = Query(None),
):
    """Lấy danh sách các bảng giá (hỗ trợ lọc theo trạng thái phát hành hoặc nhóm khách hàng)."""

    results = list(PRICE_LISTS.values())
    if published is not None:
        results = [r for r in results if r.get("published") == published]
    if customer_group is not None:
        results = [r for r in results if r.get("customer_group") == customer_group]
    return [_response(r) for r in results]


@router.post("", response_model=PriceListView, status_code=status.HTTP_201_CREATED)
def create_price_list(
    payload: PriceListCreate,
    user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    global _next_id
    versions = [r["version"] for r in PRICE_LISTS.values() if r["code"] == payload.code]
    row = payload.dict()
    row.update({"id": _next_id, "version": max(versions or [0]) + 1, "published": False})
    PRICE_LISTS[_next_id] = row
    _next_id += 1
    return _response(row)


@router.put("/{price_list_id}", response_model=PriceListView)
def update_draft(
    price_list_id: int,
    payload: PriceListCreate,
    user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = PRICE_LISTS.get(price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")
    if row["published"]:
        raise HTTPException(status_code=409, detail="Bảng giá đã phát hành không thể sửa; hãy tạo phiên bản mới")
    changed = payload.dict()
    row.update(changed)
    return _response(row)


@router.post("/{price_list_id}/publish", response_model=PriceListView)
def publish_price_list(
    price_list_id: int,
    user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = PRICE_LISTS.get(price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")
    row["published"] = True
    return _response(row)


@router.get("/{price_list_id}", response_model=PriceListView)
def get_price_list(price_list_id: int):
    row = PRICE_LISTS.get(price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá")
    return _response(row)


@router.get("/effective/{sku}")
def get_effective_price(
    sku: str,
    customer_group: CustomerGroup = Query(...),
    on_date: Optional[date] = Query(None),
):
    effective_date = on_date or date.today()
    normalized_sku = sku.strip().upper()
    matches = []
    for row in PRICE_LISTS.values():
        if (row["published"] and row["customer_group"] == customer_group
                and row["start_date"] <= effective_date <= row["end_date"]):
            for line in row["items"]:
                if line["sku"] == normalized_sku:
                    matches.append((row, line))
    if not matches:
        raise HTTPException(status_code=404, detail="Không có giá hiệu lực cho sản phẩm và nhóm khách hàng này")
    row, line = max(matches, key=lambda pair: (pair[0]["start_date"], pair[0]["version"]))
    return {
        "price_list_id": row["id"], "version": row["version"], "sku": normalized_sku,
        "customer_group": row["customer_group"], "sale_price": line["sale_price"],
        "floor_price": line["floor_price"],
        "requires_approval": line["sale_price"] < line["floor_price"],
    }
