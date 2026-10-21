"""Service layer for Pick List and Batch Picking (EP-06 / SCRUM-36 / SCRUM-40)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import (
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    PickList,
    PickListDetail,
    Product,
    WarehouseLocation,
)
from app.schemas.pick_list import (
    PickListCreateRequest,
    PickListExecuteRequest,
)


def get_pending_approved_orders(
    db: Session, warehouse_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Lấy danh sách các đơn hàng đã duyệt (APPROVED / PROCESSING) sẵn sàng để gom thành phiếu soạn hàng (Batch Picking)."""
    query = (
        db.query(Order)
        .filter(Order.status.in_([OrderStatus.APPROVED, OrderStatus.PROCESSING]))
    )

    if warehouse_id is not None:
        query = query.filter(Order.warehouse_id == warehouse_id)

    orders = query.order_by(Order.created_at.asc()).all()

    results: List[Dict[str, Any]] = []
    for o in orders:
        cust_name = ""
        if o.customer:
            cust_name = getattr(o.customer, "company_name", None) or getattr(o.customer, "name", "")
        
        results.append({
            "id": o.id,
            "order_code": o.order_code,
            "customer_id": o.customer_id,
            "customer_name": cust_name,
            "status": o.status.value if hasattr(o.status, "value") else str(o.status),
            "total_amount": float(o.total_amount or 0.0),
            "total_items": len(o.items) if o.items else 0,
            "created_at": o.created_at,
            "warehouse_id": o.warehouse_id,
        })

    return results


def create_batch_pick_list(
    db: Session, request: PickListCreateRequest
) -> PickList:
    """Tạo phiếu soạn hàng gộp (Batch Picking) từ nhiều đơn hàng đã duyệt (AC 1, AC 2).
    
    1. Lấy danh sách các đơn hàng theo order_ids.
    2. Gom nhóm (Group by) các mặt hàng giống nhau (cùng product_id / sku), tính tổng required_qty.
    3. Tra cứu vị trí lưu trữ (WarehouseLocation) của từng mặt hàng.
    4. Sắp xếp các dòng hàng theo thứ tự vị trí nhặt hàng tối ưu (pick_sequence ASC) để tối ưu đường đi trong kho.
    5. Lưu PickList và PickListDetails vào cơ sở dữ liệu.
    """
    if not request.order_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Danh sách mã đơn hàng không được rỗng.",
        )

    # 1. Truy vấn các đơn hàng
    orders = db.query(Order).filter(Order.id.in_(request.order_ids)).all()
    if not orders:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy các đơn hàng đã chọn.",
        )

    # 2. Gom nhóm các mặt hàng trùng lặp và cộng dồn số lượng yêu cầu
    # key: product_id
    grouped_items: Dict[int, Dict[str, Any]] = {}

    for order in orders:
        for item in order.items:
            prod_id = item.product_id or 0
            if prod_id not in grouped_items:
                grouped_items[prod_id] = {
                    "product_id": prod_id,
                    "sku": item.sku or "",
                    "product_name": item.product_name or "",
                    "unit_name": item.unit_name or "",
                    "required_qty": float(item.quantity or 0.0),
                    "order_ids": [order.id],
                }
            else:
                grouped_items[prod_id]["required_qty"] += float(item.quantity or 0.0)
                if order.id not in grouped_items[prod_id]["order_ids"]:
                    grouped_items[prod_id]["order_ids"].append(order.id)

    if not grouped_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Các đơn hàng được chọn không chứa mặt hàng nào để soạn.",
        )

    # Bổ sung thông tin sản phẩm nếu thiếu tên / sku
    prod_ids = [pid for pid in grouped_items.keys() if pid > 0]
    if prod_ids:
        products = db.query(Product).filter(Product.id.in_(prod_ids)).all()
        prod_map = {p.id: p for p in products}
        for pid, data in grouped_items.items():
            if pid in prod_map:
                prod = prod_map[pid]
                if not data["sku"]:
                    data["sku"] = prod.sku
                if not data["product_name"]:
                    data["product_name"] = prod.name
                if not data["unit_name"]:
                    data["unit_name"] = prod.base_unit

    # 3. Tra cứu vị trí lưu trữ (WarehouseLocation) cho từng mặt hàng
    target_warehouse_id = request.warehouse_id or orders[0].warehouse_id or 1
    locations = (
        db.query(WarehouseLocation)
        .filter(
            WarehouseLocation.product_id.in_(prod_ids),
            WarehouseLocation.warehouse_id == target_warehouse_id,
            WarehouseLocation.is_active == True,
        )
        .all()
    )
    loc_map = {loc.product_id: loc for loc in locations}

    # Ghép vị trí và pick_sequence
    item_rows: List[Dict[str, Any]] = []
    for pid, data in grouped_items.items():
        loc = loc_map.get(pid)
        if loc:
            data["location_id"] = loc.id
            data["location_code"] = loc.code
            data["pick_sequence"] = loc.pick_sequence
        else:
            # Fallback vị trí mặc định nếu chưa gán kệ
            data["location_id"] = None
            data["location_code"] = f"KHO-CHUNG-{pid}"
            data["pick_sequence"] = 1000 + pid
        item_rows.append(data)

    # 4. SẮP XẾP TỐI ƯU THEO ĐƯỜNG ĐI TRONG KHO (AC 1)
    # Sắp xếp tăng dần theo pick_sequence -> location_code -> sku
    item_rows.sort(
        key=lambda x: (
            x.get("pick_sequence", 9999),
            x.get("location_code", ""),
            x.get("sku", ""),
        )
    )

    # 5. Sinh mã phiếu soạn và lưu vào DB
    code_suffix = uuid.uuid4().hex[:4].upper()
    pick_code = f"PL-{datetime.now().strftime('%Y%m%d%H%M%S')}-{code_suffix}"

    total_required = sum(item["required_qty"] for item in item_rows)
    total_distinct_items = len(item_rows)

    pick_list = PickList(
        code=pick_code,
        warehouse_id=target_warehouse_id,
        order_id=orders[0].id if len(orders) == 1 else None,
        order_ids=request.order_ids,
        status="PENDING",
        total_items=total_distinct_items,
        total_required_qty=total_required,
        total_actual_qty=0.0,
        note=request.note,
    )
    db.add(pick_list)
    db.flush()

    for idx, item in enumerate(item_rows, start=1):
        detail = PickListDetail(
            pick_list_id=pick_list.id,
            product_id=item["product_id"],
            sku=item["sku"],
            product_name=item["product_name"],
            unit_name=item["unit_name"],
            location_id=item["location_id"],
            location_code=item["location_code"],
            pick_sequence=item.get("pick_sequence", idx),
            required_qty=item["required_qty"],
            actual_qty=0.0,
            missing_reason=None,
            order_ids=item["order_ids"],
            is_completed=False,
            status="PENDING",
        )
        db.add(detail)

    db.commit()
    db.refresh(pick_list)
    return pick_list


def execute_pick_list(
    db: Session, pick_list_id: int, request: PickListExecuteRequest
) -> PickList:
    """Cập nhật tiến độ soạn hàng (AC 3, AC 4).
    
    Quy tắc nghiệp vụ:
    - Nếu actual_qty < required_qty: BẮT BUỘC missing_reason không được rỗng (trả 400 nếu rỗng).
    - Cập nhật số lượng thực soạn, lý do thiếu và trạng thái hoàn thành từng dòng.
    - Cập nhật tổng thể phiếu soạn (status = COMPLETED / PARTIALLY_PICKED).
    """
    pick_list = db.query(PickList).filter(PickList.id == pick_list_id).first()
    if not pick_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu soạn hàng với ID {pick_list_id}.",
        )

    # Đưa chi tiết vào dict theo detail.id
    details_map = {d.id: d for d in pick_list.details}

    # BƯỚC 1: Validate tất cả các dòng hàng theo AC 4
    for item in request.items:
        detail = details_map.get(item.detail_id)
        if not detail:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dòng soạn hàng ID {item.detail_id} không thuộc phiếu soạn này.",
            )

        if item.actual_qty < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Số lượng thực soạn của sản phẩm '{detail.product_name or detail.sku}' không được nhỏ hơn 0.",
            )

        # KIỂM TRA CHẶT CHẼ AC 4:
        # Nếu "số lượng thực soạn" nhỏ hơn "số lượng yêu cầu", hệ thống bắt buộc người dùng phải nhập "Lý do soạn thiếu".
        if item.actual_qty < detail.required_qty:
            reason = (item.missing_reason or "").strip()
            if not reason:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Mặt hàng '{detail.product_name or detail.sku}' soạn thiếu "
                        f"(thực soạn: {item.actual_qty} < yêu cầu: {detail.required_qty}). "
                        f"Bắt buộc phải nhập 'Lý do soạn thiếu'."
                    ),
                )

    # BƯỚC 2: Cập nhật dữ liệu
    for item in request.items:
        detail = details_map[item.detail_id]
        detail.actual_qty = float(item.actual_qty)
        if detail.actual_qty < detail.required_qty:
            detail.missing_reason = (item.missing_reason or "").strip()
            detail.status = "PARTIALLY_PICKED"
        else:
            detail.missing_reason = (item.missing_reason or "").strip() if item.missing_reason else None
            detail.status = "COMPLETED"
        detail.is_completed = item.is_completed

    # Tính lại tổng số lượng thực tế
    total_actual = sum(d.actual_qty for d in pick_list.details)
    pick_list.total_actual_qty = total_actual

    # Cập nhật trạng thái phiếu
    all_completed = all(d.is_completed for d in pick_list.details)
    if all_completed:
        pick_list.status = "COMPLETED"
    else:
        pick_list.status = "IN_PROGRESS"

    if request.note:
        if pick_list.note:
            pick_list.note = f"{pick_list.note} | {request.note.strip()}"
        else:
            pick_list.note = request.note.strip()

    pick_list.updated_at = datetime.now()
    db.commit()
    db.refresh(pick_list)
    return pick_list


def get_pick_list_by_id(db: Session, pick_list_id: int) -> PickList:
    """Lấy chi tiết phiếu soạn hàng cùng các dòng đã sắp xếp theo lộ trình tối ưu."""
    pick_list = db.query(PickList).filter(PickList.id == pick_list_id).first()
    if not pick_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu soạn hàng với ID {pick_list_id}.",
        )
    return pick_list


def list_pick_lists(
    db: Session,
    warehouse_id: Optional[int] = None,
    status_filter: Optional[str] = None,
) -> List[PickList]:
    """Lấy danh sách các phiếu soạn hàng."""
    query = db.query(PickList)
    if warehouse_id is not None:
        query = query.filter(PickList.warehouse_id == warehouse_id)
    if status_filter:
        query = query.filter(PickList.status == status_filter)
    return query.order_by(PickList.created_at.desc()).all()
