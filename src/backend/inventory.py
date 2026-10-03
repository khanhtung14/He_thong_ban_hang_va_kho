"""FastAPI router for inventory transactions and unit conversion."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

try:
    from src.backend.database import get_db
    from src.backend.models import InventoryTransaction, ProductUnit
except ImportError:  # pragma: no cover - direct script execution
    from database import get_db
    from models import InventoryTransaction, ProductUnit

router = APIRouter(prefix="/inventory", tags=["Kho hàng / Inventory"])


class TransactionCreateRequest(BaseModel):
    """Payload tạo mới giao dịch nhập/xuất kho."""

    product_id: int = Field(..., description="ID sản phẩm")
    unit_name: str = Field(..., min_length=1, description="Tên đơn vị tính")
    input_quantity: float = Field(..., description="Số lượng theo đơn vị tính")


class TransactionResponse(BaseModel):
    """Dữ liệu trả về sau khi tạo giao dịch kho."""

    id: int
    product_id: int
    unit_name: str
    input_quantity: float
    conversion_rate_snapshot: float
    base_quantity: float

    model_config = ConfigDict(from_attributes=True)


@router.post("/transaction", response_model=TransactionResponse, status_code=status.HTTP_200_OK)
def create_inventory_transaction(
    payload: TransactionCreateRequest,
    db: Session = Depends(get_db),
) -> Any:
    """Tạo giao dịch kho, snapshot tỷ lệ quy đổi và tính toán base_quantity."""
    # 1. Query bảng ProductUnit để lấy conversion_rate hiện tại (mặc định là 1 nếu không thấy)
    unit_record = (
        db.query(ProductUnit)
        .filter(
            ProductUnit.product_id == payload.product_id,
            ProductUnit.unit_name == payload.unit_name,
        )
        .first()
    )

    if unit_record is None and payload.unit_name.strip() != payload.unit_name:
        unit_record = (
            db.query(ProductUnit)
            .filter(
                ProductUnit.product_id == payload.product_id,
                ProductUnit.unit_name == payload.unit_name.strip(),
            )
            .first()
        )

    conversion_rate: float = float(unit_record.conversion_rate) if unit_record else 1.0

    # 2. Tính base_quantity = input_quantity * conversion_rate
    base_quantity: float = float(payload.input_quantity * conversion_rate)

    # 3. Khởi tạo record InventoryTransaction, lưu cứng hệ số vào cột conversion_rate_snapshot
    transaction = InventoryTransaction(
        product_id=payload.product_id,
        unit_name=payload.unit_name,
        input_quantity=payload.input_quantity,
        conversion_rate_snapshot=conversion_rate,
        base_quantity=base_quantity,
    )

    # 4. Lưu xuống DB và trả về kết quả
    try:
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu giao dịch kho: {exc}",
        ) from exc

    return transaction
