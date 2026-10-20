"""API Endpoints for Stock Card (Thẻ kho của một sản phẩm)."""
from __future__ import annotations

from typing import Any, Dict, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.inventory_card_service import get_inventory_card_data

# Router cho /api/v1/inventory-cards
router = APIRouter(prefix="/api/v1/inventory-cards", tags=["Inventory Cards"])

# Router tương thích cho /api/inventory-cards
compat_router = APIRouter(prefix="/api/inventory-cards", tags=["Inventory Cards Compat"])


def handle_get_inventory_card(
    product_id: Union[int, str],
    warehouse_id: Optional[int] = Query(None, alias="warehouse_id", description="Lọc theo mã kho hàng"),
    start_date: Optional[str] = Query(None, alias="start_date", description="Từ ngày (YYYY-MM-DD hoặc ISO)"),
    end_date: Optional[str] = Query(None, alias="end_date", description="Đến ngày (YYYY-MM-DD hoặc ISO)"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Lấy dữ liệu Thẻ kho của một sản phẩm:
    - Hiển thị danh sách toàn bộ các phát sinh (nhập, xuất, chuyển kho, điều chỉnh kiểm kê).
    - Sắp xếp theo thứ tự thời gian tăng dần.
    - Hiển thị số lượng tồn kho (tồn cuối) lũy kế ngay sau mỗi phát sinh.
    - Cung cấp mã chứng từ gốc kèm liên kết trỏ về chứng từ gốc.
    - Hỗ trợ bộ lọc theo Kho hàng và Khoảng thời gian (Từ ngày - Đến ngày).
    """
    try:
        data = get_inventory_card_data(
            db=db,
            product_id_or_sku=product_id,
            warehouse_id=warehouse_id,
            start_date=start_date,
            end_date=end_date,
        )
        return {
            "success": True,
            "code": 200,
            "message": "Lấy thông tin thẻ kho thành công.",
            "data": data,
        }
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi truy vấn dữ liệu thẻ kho: {exc}",
        )


# Đăng ký routes
router.add_api_route(
    "/{product_id}",
    handle_get_inventory_card,
    methods=["GET"],
    operation_id="get_inventory_card_v1",
    summary="Xem thẻ kho của một sản phẩm",
)

compat_router.add_api_route(
    "/{product_id}",
    handle_get_inventory_card,
    methods=["GET"],
    operation_id="get_inventory_card_compat",
    include_in_schema=False,
)
