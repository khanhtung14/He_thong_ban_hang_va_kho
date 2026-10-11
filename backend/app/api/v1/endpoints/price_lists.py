"""Persistent customer-group price lists and effective-price lookup."""

from datetime import date
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

try:
    from app.core.database import get_db
    from app.models.models import PriceList, PriceListItem
    from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles
except ImportError:  # pragma: no cover
    from app.core.database import get_db
    from app.models.models import PriceList, PriceListItem
    from app.api.v1.endpoints.rbac import AuthenticatedUser, require_roles

router = APIRouter(prefix="/api/v1/price-lists", tags=["Price Lists"])


class CustomerGroup(str, Enum):
    LEVEL_1 = "DEALER_LEVEL_1"
    LEVEL_2 = "DEALER_LEVEL_2"
    RETAIL = "RETAIL"


class PriceLine(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    sale_price: int = Field(ge=0)
    floor_price: int = Field(ge=0)

    @model_validator(mode="after")
    def floor_not_above_sale(self):
        if self.floor_price > self.sale_price:
            raise ValueError("Giá sàn không được cao hơn giá bán.")
        return self

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        return value.strip().upper()


class PriceListCreate(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    customer_group: CustomerGroup
    start_date: date
    end_date: date
    items: List[PriceLine] = Field(min_length=1)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_period_and_items(self):
        if self.end_date < self.start_date:
            raise ValueError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.")
        skus = [line.sku for line in self.items]
        if len(skus) != len(set(skus)):
            raise ValueError("SKU không được trùng trong cùng bảng giá.")
        return self


class PriceListView(PriceListCreate):
    id: int
    version: int
    published: bool


def _serialize(price_list: PriceList) -> dict:
    return {
        "id": price_list.id,
        "code": price_list.code,
        "customer_group": price_list.customer_group,
        "start_date": price_list.start_date,
        "end_date": price_list.end_date,
        "version": price_list.version,
        "published": price_list.published,
        "items": [
            {"sku": item.sku, "sale_price": item.sale_price, "floor_price": item.floor_price}
            for item in price_list.items
        ],
    }


def _load_price_list(db: Session, price_list_id: int) -> PriceList | None:
    return db.execute(
        select(PriceList)
        .options(selectinload(PriceList.items))
        .where(PriceList.id == price_list_id)
    ).scalar_one_or_none()


def _save_lines(price_list: PriceList, lines: list[PriceLine]) -> None:
    price_list.items = [
        PriceListItem(sku=line.sku, sale_price=line.sale_price, floor_price=line.floor_price)
        for line in lines
    ]


def resolve_effective_price(
    db: Session,
    sku: str,
    customer_group: str,
    on_date: date | None = None,
) -> dict | None:
    effective_date = on_date or date.today()
    normalized_sku = sku.strip().upper()
    row = db.execute(
        select(PriceList, PriceListItem)
        .join(PriceListItem, PriceListItem.price_list_id == PriceList.id)
        .where(
            PriceList.published.is_(True),
            PriceList.customer_group == customer_group,
            PriceList.start_date <= effective_date,
            PriceList.end_date >= effective_date,
            PriceListItem.sku == normalized_sku,
        )
        .order_by(PriceList.start_date.desc(), PriceList.version.desc(), PriceList.id.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    price_list, item = row
    return {
        "price_list_id": price_list.id,
        "code": price_list.code,
        "version": price_list.version,
        "customer_group": price_list.customer_group,
        "sale_price": item.sale_price,
        "floor_price": item.floor_price,
    }


@router.get("", response_model=List[PriceListView])
def list_price_lists(
    published: Optional[bool] = Query(None),
    customer_group: Optional[CustomerGroup] = Query(None),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    query = select(PriceList).options(selectinload(PriceList.items))
    if published is not None:
        query = query.where(PriceList.published.is_(published))
    if customer_group is not None:
        query = query.where(PriceList.customer_group == customer_group.value)
    rows = db.execute(query.order_by(PriceList.code, PriceList.version.desc())).scalars().all()
    return [_serialize(row) for row in rows]


@router.post("", response_model=PriceListView, status_code=status.HTTP_201_CREATED)
def create_price_list(
    payload: PriceListCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    latest_version = db.scalar(select(func.max(PriceList.version)).where(PriceList.code == payload.code)) or 0
    row = PriceList(
        code=payload.code,
        version=latest_version + 1,
        customer_group=payload.customer_group.value,
        start_date=payload.start_date,
        end_date=payload.end_date,
        published=False,
    )
    _save_lines(row, payload.items)
    db.add(row)
    db.commit()
    return _serialize(_load_price_list(db, row.id))


@router.put("/{price_list_id}", response_model=PriceListView)
def update_draft(
    price_list_id: int,
    payload: PriceListCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = _load_price_list(db, price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá.")
    if row.published:
        raise HTTPException(status_code=409, detail="Bảng giá đã phát hành không thể sửa; hãy tạo phiên bản mới.")
    row.code = payload.code
    row.customer_group = payload.customer_group.value
    row.start_date = payload.start_date
    row.end_date = payload.end_date
    _save_lines(row, payload.items)
    db.commit()
    return _serialize(_load_price_list(db, row.id))


@router.post("/{price_list_id}/publish", response_model=PriceListView)
def publish_price_list(
    price_list_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = _load_price_list(db, price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá.")
    if not row.items:
        raise HTTPException(status_code=422, detail="Bảng giá cần có ít nhất một dòng sản phẩm.")
    conflicting = db.execute(
        select(PriceList).join(PriceListItem).where(
            PriceList.id != row.id,
            PriceList.published.is_(True),
            PriceList.customer_group == row.customer_group,
            PriceList.code != row.code,
            PriceList.start_date <= row.end_date,
            PriceList.end_date >= row.start_date,
            PriceListItem.sku.in_([line.sku for line in row.items]),
        )
    ).scalars().first()
    if conflicting:
        raise HTTPException(status_code=409, detail=f"Trùng thời hạn và SKU với bảng {conflicting.code} v{conflicting.version}; hãy dùng cùng mã bảng để phát hành phiên bản kế tiếp hoặc chỉnh thời hạn.")
    row.published = True
    db.commit()
    return _serialize(_load_price_list(db, row.id))


@router.delete("/{price_list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft_price_list(
    price_list_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = _load_price_list(db, price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá.")
    if row.published:
        raise HTTPException(status_code=409, detail="Bảng giá đã phát hành không thể xóa.")
    db.delete(row)
    db.commit()


@router.get("/effective/{sku}")
def get_effective_price(
    sku: str,
    customer_group: CustomerGroup = Query(...),
    on_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    result = resolve_effective_price(db, sku, customer_group.value, on_date)
    if result is None:
        raise HTTPException(status_code=404, detail="Không có giá hiệu lực cho SKU, nhóm khách hàng và ngày này.")
    result["requires_approval"] = result["sale_price"] < result["floor_price"]
    return result


@router.get("/{price_list_id}", response_model=PriceListView)
def get_price_list(
    price_list_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_roles("Sales Manager", "Admin")),
):
    row = _load_price_list(db, price_list_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bảng giá.")
    return _serialize(row)
