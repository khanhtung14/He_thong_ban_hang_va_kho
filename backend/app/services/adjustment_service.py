"""Inventory adjustment service with approval workflow and stock card tracking (SCRUM-66).

Key Rules:
1. Two-step adjustment: Draft/Pending -> Approval/Rejection.
2. Only WH Manager (or Admin) can approve or reject.
3. Creator cannot approve their own adjustment slip (even if they are WH Manager).
4. Stock changes ONLY happen upon successful approval in an atomic transaction with pessimistic locking.
5. Available stock rule: physical_qty - reserved_qty >= 0 under all conditions.
6. Double-approval / race condition prevention.
7. Loss value tracking: calculated from unit cost snapshot, persisted for audit.
8. Stock card (Thẻ kho) tracking of all approved movements.
"""
from __future__ import annotations

from datetime import datetime, timezone, date
import threading
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select, desc
from sqlalchemy.orm import Session

from app.api.v1.endpoints.audit_logs import AuditLogCreate, record_audit_log
from app.api.v1.endpoints.rbac import (
    AuthenticatedUser,
    PERM_INVENTORY_ADJUST,
    PERM_INVENTORY_VIEW,
    normalize_role,
    RoleCode,
    can_view_financials,
)
from app.models.models import (
    Inventory,
    InventoryAdjustment,
    InventoryAdjustmentItem,
    InventoryLot,
    InventoryStock,
    InventoryTransaction,
    Product,
    User,
    Warehouse,
)
from app.services.inventory_service import _inventory_lock, calculate_available_qty


# ---------------------------------------------------------------------------
# Pydantic Request & Response Schemas
# ---------------------------------------------------------------------------

class AdjustmentItemCreate(BaseModel):
    productId: int = Field(..., gt=0)
    lotNumber: Optional[str] = None
    adjustQty: float = Field(..., allow_inf_nan=False)
    unitCost: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    lossValue: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    note: Optional[str] = None

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "product_id" in data and "productId" not in data:
                data["productId"] = data["product_id"]
            if "lot_number" in data and "lotNumber" not in data:
                data["lotNumber"] = data["lot_number"]
            if "adjust_qty" in data and "adjustQty" not in data:
                data["adjustQty"] = data["adjust_qty"]
            if "quantity" in data and "adjustQty" not in data:
                data["adjustQty"] = -abs(float(data["quantity"]))
            if "unit_cost" in data and "unitCost" not in data:
                data["unitCost"] = data["unit_cost"]
            if "loss_value" in data and "lossValue" not in data:
                data["lossValue"] = data["loss_value"]
        return data


class AdjustmentCreateRequest(BaseModel):
    code: Optional[str] = None
    warehouseId: int = Field(..., gt=0)
    reason: str = Field(..., min_length=1)
    lossValue: Optional[float] = Field(None, ge=0, allow_inf_nan=False)
    note: Optional[str] = None
    items: List[AdjustmentItemCreate] = Field(..., min_length=1)

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "warehouse_id" in data and "warehouseId" not in data:
                data["warehouseId"] = data["warehouse_id"]
            if "loss_value" in data and "lossValue" not in data:
                data["lossValue"] = data["loss_value"]
        return data


class AdjustmentApproveRequest(BaseModel):
    note: Optional[str] = None


class AdjustmentRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, description="Lý do từ chối phiếu điều chỉnh")


# ---------------------------------------------------------------------------
# Helper: Unique code generation
# ---------------------------------------------------------------------------

def generate_adjustment_code(db: Session, warehouse: Optional[Warehouse] = None) -> str:
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = "ADJ"
    wh_code = warehouse.code.replace("WH-", "") if warehouse and warehouse.code else "WH"
    base_code = f"{prefix}-{wh_code}-{today_str}"

    count = (
        db.query(InventoryAdjustment)
        .filter(InventoryAdjustment.code.like(f"{base_code}%"))
        .count()
    )
    seq = count + 1
    code = f"{base_code}-{seq:03d}"
    while db.query(InventoryAdjustment).filter(InventoryAdjustment.code == code).first():
        seq += 1
        code = f"{base_code}-{seq:03d}"
    return code


def _get_db_user(db: Session, user: AuthenticatedUser) -> User:
    db_user = None
    if user.id is not None:
        db_user = db.query(User).filter(User.id == user.id).first()
    if not db_user:
        db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Không tìm thấy thông tin tài khoản người dùng trong hệ thống.",
        )
    return db_user


# ---------------------------------------------------------------------------
# Format adjustment response
# ---------------------------------------------------------------------------

def format_adjustment_item(
    item: InventoryAdjustmentItem,
    user: Optional[AuthenticatedUser] = None,
) -> Dict[str, Any]:
    prod = item.product
    show_financials = can_view_financials(user.role) if user else False
    return {
        "id": item.id,
        "productId": item.product_id,
        "productName": prod.name if prod else f"Sản phẩm #{item.product_id}",
        "sku": prod.sku if prod else "",
        "baseUnit": prod.base_unit if prod else "Đơn vị",
        "lotNumber": item.lot_number,
        "adjustQty": item.adjust_qty,
        "unitCost": item.unit_cost_snapshot if show_financials else None,
        "lossValue": item.loss_value,
        "systemQty": item.system_qty,
        "afterQty": item.after_qty,
        "note": item.note or "",
    }


def format_adjustment(
    adj: InventoryAdjustment,
    user: Optional[AuthenticatedUser] = None,
) -> Dict[str, Any]:
    wh = adj.warehouse
    creator = adj.created_by
    approver = adj.approved_by

    return {
        "id": adj.id,
        "code": adj.code,
        "warehouseId": adj.warehouse_id,
        "warehouseName": wh.name if wh else f"Kho #{adj.warehouse_id}",
        "reason": adj.reason,
        "status": adj.status,
        "lossValue": adj.loss_value,
        "note": adj.note or "",
        "createdById": adj.created_by_id,
        "createdByName": creator.full_name if creator else (creator.username if creator else None),
        "createdAt": adj.created_at.isoformat() if adj.created_at else None,
        "approvedById": adj.approved_by_id,
        "approvedByName": approver.full_name if approver else (approver.username if approver else None),
        "approvedAt": adj.approved_at.isoformat() if adj.approved_at else None,
        "approvalNote": adj.approval_note,
        "rejectReason": adj.reject_reason,
        "items": [format_adjustment_item(item, user=user) for item in adj.items],
    }


# ---------------------------------------------------------------------------
# Core Service Operations
# ---------------------------------------------------------------------------

def create_adjustment(
    db: Session,
    payload: AdjustmentCreateRequest,
    user: AuthenticatedUser,
) -> Dict[str, Any]:
    """Create a new inventory adjustment slip with status PENDING.
    Does NOT change physical or reserved inventory.
    """
    normalized_role = normalize_role(user.role)
    if normalized_role in {RoleCode.CUSTOMER.value, RoleCode.SALES_REP.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vai trò của bạn không có quyền lập phiếu điều chỉnh tồn kho.",
        )

    # Warehouse scoping check
    if normalized_role in {"Warehouse", "WH Manager"} and user.warehouse_ids:
        if payload.warehouseId not in user.warehouse_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không được lập phiếu ngoài kho đã được phân công.",
            )

    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouseId).first()
    if not warehouse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kho hàng với ID {payload.warehouseId}.",
        )
    if not warehouse.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Kho hàng '{warehouse.name}' đang tạm ngừng hoạt động.",
        )

    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phiếu điều chỉnh phải có ít nhất một sản phẩm.",
        )

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Lý do điều chỉnh không được để trống.",
        )

    db_user = _get_db_user(db, user)

    # Check and snapshot each item
    items_to_create = []
    total_calculated_loss = 0.0

    for idx, item in enumerate(payload.items, start=1):
        product = db.query(Product).filter(Product.id == item.productId).first()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dòng #{idx}: Không tìm thấy sản phẩm với ID {item.productId}.",
            )

        if item.adjustQty == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Dòng #{idx}: Số lượng điều chỉnh không thể bằng 0.",
            )

        # Standardize adjust_qty to negative for disposal/loss
        normalized_qty = -abs(item.adjustQty)

        # Snapshot current stock
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == item.productId,
                Inventory.warehouse_id == payload.warehouseId,
            )
            .first()
        )
        current_physical = inv.physical_qty if inv else 0.0

        if current_physical < abs(normalized_qty):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Dòng #{idx} ({product.name}): Số lượng điều chỉnh giảm ({abs(normalized_qty)}) "
                    f"vượt quá tồn kho thực tế hiện tại ({current_physical})."
                ),
            )

        # Lot verification if lot is supplied
        if item.lotNumber:
            lot = (
                db.query(InventoryLot)
                .filter(
                    InventoryLot.lot_number == item.lotNumber,
                    InventoryLot.product_id == item.productId,
                    InventoryLot.warehouse_id == payload.warehouseId,
                )
                .first()
            )
            if not lot:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Dòng #{idx}: Lô '{item.lotNumber}' không tồn tại tại kho này.",
                )
            if lot.quantity < abs(normalized_qty):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Dòng #{idx}: Lô '{item.lotNumber}' chỉ còn tồn {lot.quantity}, "
                        f"không đủ để điều chỉnh giảm {abs(normalized_qty)}."
                    ),
                )

        # Financial cost calculation: cost price priority
        unit_cost = (
            float(item.unitCost)
            if item.unitCost is not None and item.unitCost >= 0
            else float(product.cost_price or 0.0)
        )
        item_loss = (
            float(item.lossValue)
            if item.lossValue is not None and item.lossValue >= 0
            else round(abs(normalized_qty) * unit_cost, 2)
        )
        total_calculated_loss += item_loss

        items_to_create.append({
            "product_id": item.productId,
            "lot_number": item.lotNumber.strip() if item.lotNumber else None,
            "adjust_qty": normalized_qty,
            "unit_cost_snapshot": unit_cost,
            "loss_value": item_loss,
            "system_qty": current_physical,
            "after_qty": None,
            "note": item.note.strip() if item.note else None,
        })

    # Total slip loss value
    if payload.lossValue is not None and payload.lossValue >= 0:
        total_loss = float(payload.lossValue)
    else:
        total_loss = round(total_calculated_loss, 2)

    # Unique code
    slip_code = payload.code.strip() if payload.code and payload.code.strip() else None
    if slip_code:
        existing = db.query(InventoryAdjustment).filter(InventoryAdjustment.code == slip_code).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã phiếu điều chỉnh '{slip_code}' đã tồn tại trong hệ thống.",
            )
    else:
        slip_code = generate_adjustment_code(db, warehouse)

    adjustment = InventoryAdjustment(
        code=slip_code,
        warehouse_id=payload.warehouseId,
        reason=clean_reason,
        status="PENDING",
        loss_value=total_loss,
        note=payload.note.strip() if payload.note else None,
        created_by_id=db_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(adjustment)
    db.flush()

    for item_dict in items_to_create:
        adj_item = InventoryAdjustmentItem(
            adjustment_id=adjustment.id,
            product_id=item_dict["product_id"],
            lot_number=item_dict["lot_number"],
            adjust_qty=item_dict["adjust_qty"],
            unit_cost_snapshot=item_dict["unit_cost_snapshot"],
            loss_value=item_dict["loss_value"],
            system_qty=item_dict["system_qty"],
            after_qty=item_dict["after_qty"],
            note=item_dict["note"],
        )
        db.add(adj_item)

    record_audit_log(
        db,
        AuditLogCreate(
            actor_user_id=db_user.id,
            actor_name=db_user.full_name or db_user.username,
            entity_type="inventory",
            entity_id=str(adjustment.id),
            action="create_adjustment",
            before_value=None,
            after_value={
                "code": adjustment.code,
                "status": "PENDING",
                "warehouse_id": adjustment.warehouse_id,
                "loss_value": adjustment.loss_value,
                "items_count": len(items_to_create),
            },
            happened_at=datetime.now(timezone.utc),
        ),
    )

    db.commit()
    db.refresh(adjustment)
    return format_adjustment(adjustment, user=user)


def approve_adjustment(
    db: Session,
    adjustment_id: int,
    payload: Optional[AdjustmentApproveRequest],
    user: AuthenticatedUser,
) -> Dict[str, Any]:
    """Approve an adjustment slip:
    - Verifies role is WH Manager or Admin.
    - Prevents self-approval (Creator != Approver).
    - Checks current stock atomically under lock.
    - Updates physical_qty and available_qty.
    - Updates lot quantity if applicable.
    - Records stock transaction for stock cards.
    - Saves approval audit trail.
    """
    normalized_role = normalize_role(user.role)
    if normalized_role != RoleCode.WH_MANAGER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kho (WH Manager) mới có quyền phê duyệt phiếu điều chỉnh.",
        )

    db_user = _get_db_user(db, user)

    with _inventory_lock:
        try:
            try:
                adjustment = (
                    db.query(InventoryAdjustment)
                    .filter(InventoryAdjustment.id == adjustment_id)
                    .with_for_update()
                    .first()
                )
            except Exception:
                adjustment = db.query(InventoryAdjustment).filter(InventoryAdjustment.id == adjustment_id).first()

            if not adjustment:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy phiếu điều chỉnh với ID {adjustment_id}.",
                )

            # Warehouse scope check
            if user.warehouse_ids:
                if adjustment.warehouse_id not in user.warehouse_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bạn không được phê duyệt phiếu ngoài kho được phân công quản lý.",
                    )

            # Rule: Creator cannot approve their own slip!
            if adjustment.created_by_id is not None and adjustment.created_by_id == db_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Người lập phiếu không được phép tự phê duyệt phiếu điều chỉnh của chính mình.",
                )
            if adjustment.created_by and adjustment.created_by.username == user.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Người lập phiếu không được phép tự phê duyệt phiếu điều chỉnh của chính mình.",
                )

            # Status check
            if adjustment.status != "PENDING":
                status_msg = "đã được duyệt" if adjustment.status == "APPROVED" else "đã bị từ chối"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu điều chỉnh '{adjustment.code}' {status_msg}. Không thể duyệt lại.",
                )

            # Verify stock and apply changes
            for item in adjustment.items:
                qty_to_reduce = abs(item.adjust_qty)

                try:
                    inv = (
                        db.query(Inventory)
                        .filter(
                            Inventory.product_id == item.product_id,
                            Inventory.warehouse_id == adjustment.warehouse_id,
                        )
                        .with_for_update()
                        .first()
                    )
                except Exception:
                    inv = (
                        db.query(Inventory)
                        .filter(
                            Inventory.product_id == item.product_id,
                            Inventory.warehouse_id == adjustment.warehouse_id,
                        )
                        .first()
                    )

                if not inv or inv.physical_qty < qty_to_reduce:
                    current_p = inv.physical_qty if inv else 0.0
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Tồn kho thực tế hiện tại ({current_p}) không đủ để giảm {qty_to_reduce} "
                            f"cho sản phẩm ID {item.product_id}."
                        ),
                    )

                # Available stock & reservation protection: physical_qty cannot drop below reserved_qty!
                new_physical = inv.physical_qty - qty_to_reduce
                if new_physical < inv.reserved_qty:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Không thể duyệt phiếu: Tồn kho thực tế sau điều chỉnh ({new_physical}) "
                            f"sẽ nhỏ hơn lượng đang giữ chỗ cho các đơn hàng ({inv.reserved_qty})."
                        ),
                    )

                # Deduct lot stock if applicable
                if item.lot_number:
                    try:
                        lot = (
                            db.query(InventoryLot)
                            .filter(
                                InventoryLot.lot_number == item.lot_number,
                                InventoryLot.product_id == item.product_id,
                                InventoryLot.warehouse_id == adjustment.warehouse_id,
                            )
                            .with_for_update()
                            .first()
                        )
                    except Exception:
                        lot = (
                            db.query(InventoryLot)
                            .filter(
                                InventoryLot.lot_number == item.lot_number,
                                InventoryLot.product_id == item.product_id,
                                InventoryLot.warehouse_id == adjustment.warehouse_id,
                            )
                            .first()
                        )

                    if not lot:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=(
                                f"Không tìm thấy lô hàng '{item.lot_number}' của sản phẩm ID {item.product_id} "
                                f"tại kho ID {adjustment.warehouse_id}."
                            ),
                        )
                    if lot.quantity < qty_to_reduce:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Lô hàng '{item.lot_number}' chỉ còn {lot.quantity}, "
                                f"không đủ để giảm {qty_to_reduce}."
                            ),
                        )
                    lot.quantity -= qty_to_reduce

                # Update inventory record
                item.system_qty = inv.physical_qty
                inv.physical_qty = new_physical
                inv.available_qty = calculate_available_qty(inv.physical_qty, inv.reserved_qty)
                item.after_qty = inv.physical_qty

                # Update InventoryStock table if exists
                stock = (
                    db.query(InventoryStock)
                    .filter(
                        InventoryStock.product_id == item.product_id,
                        InventoryStock.warehouse_id == adjustment.warehouse_id,
                    )
                    .first()
                )
                if stock:
                    stock.base_quantity = max(0.0, stock.base_quantity - qty_to_reduce)

                # Record stock movement transaction (for stock cards)
                prod = item.product
                unit_name = prod.base_unit if prod and prod.base_unit else "Đơn vị"
                transaction = InventoryTransaction(
                    product_id=item.product_id,
                    warehouse_id=adjustment.warehouse_id,
                    transaction_type="OUT",
                    unit_name=unit_name,
                    input_quantity=qty_to_reduce,
                    conversion_rate_snapshot=1.0,
                    base_quantity=qty_to_reduce,
                    lot_number=item.lot_number,
                    document_type="ADJUSTMENT",
                    document_id=adjustment.id,
                    document_no=adjustment.code,
                    before_qty=item.system_qty,
                    after_qty=item.after_qty,
                    loss_value=item.loss_value,
                    note=f"Điều chỉnh {adjustment.reason}: {item.note or adjustment.note or ''}",
                    created_by_id=db_user.id,
                )
                db.add(transaction)

            # Update adjustment state
            adjustment.status = "APPROVED"
            adjustment.approved_by_id = db_user.id
            adjustment.approved_at = datetime.now(timezone.utc)
            adjustment.approval_note = payload.note.strip() if payload and payload.note else None

            record_audit_log(
                db,
                AuditLogCreate(
                    actor_user_id=db_user.id,
                    actor_name=db_user.full_name or db_user.username,
                    entity_type="inventory",
                    entity_id=str(adjustment.id),
                    action="approve_adjustment",
                    before_value={"status": "PENDING"},
                    after_value={
                        "status": "APPROVED",
                        "approved_by_id": db_user.id,
                        "approved_at": adjustment.approved_at.isoformat(),
                        "note": adjustment.approval_note,
                    },
                    happened_at=datetime.now(timezone.utc),
                ),
            )

            db.commit()
            db.refresh(adjustment)
            return format_adjustment(adjustment, user=user)
        except Exception:
            db.rollback()
            raise


def reject_adjustment(
    db: Session,
    adjustment_id: int,
    payload: AdjustmentRejectRequest,
    user: AuthenticatedUser,
) -> Dict[str, Any]:
    """Reject an adjustment slip:
    - Verifies role is WH Manager or Admin.
    - Prevents self-rejection (Creator != Approver).
    - Requires a rejection reason.
    - Does NOT modify stock.
    - Saves rejection audit trail.
    """
    normalized_role = normalize_role(user.role)
    if normalized_role != RoleCode.WH_MANAGER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kho (WH Manager) mới có quyền từ chối phiếu điều chỉnh.",
        )

    clean_reason = payload.reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vui lòng nhập lý do từ chối phiếu điều chỉnh.",
        )

    db_user = _get_db_user(db, user)

    with _inventory_lock:
        try:
            adjustment = db.query(InventoryAdjustment).filter(InventoryAdjustment.id == adjustment_id).first()
            if not adjustment:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Không tìm thấy phiếu điều chỉnh với ID {adjustment_id}.",
                )

            # Warehouse scope check
            if user.warehouse_ids:
                if adjustment.warehouse_id not in user.warehouse_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bạn không được từ chối phiếu ngoài kho được phân công quản lý.",
                    )

            # Rule: Creator cannot reject their own slip!
            if adjustment.created_by_id is not None and adjustment.created_by_id == db_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Người lập phiếu không được phép tự từ chối phiếu điều chỉnh của chính mình.",
                )
            if adjustment.created_by and adjustment.created_by.username == user.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Người lập phiếu không được phép tự từ chối phiếu điều chỉnh của chính mình.",
                )

            if adjustment.status != "PENDING":
                status_msg = "đã được duyệt" if adjustment.status == "APPROVED" else "đã bị từ chối"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Phiếu điều chỉnh '{adjustment.code}' {status_msg}. Không thể từ chối lại.",
                )

            adjustment.status = "REJECTED"
            adjustment.approved_by_id = db_user.id
            adjustment.approved_at = datetime.now(timezone.utc)
            adjustment.reject_reason = clean_reason

            record_audit_log(
                db,
                AuditLogCreate(
                    actor_user_id=db_user.id,
                    actor_name=db_user.full_name or db_user.username,
                    entity_type="inventory",
                    entity_id=str(adjustment.id),
                    action="reject_adjustment",
                    before_value={"status": "PENDING"},
                    after_value={
                        "status": "REJECTED",
                        "approved_by_id": db_user.id,
                        "approved_at": adjustment.approved_at.isoformat(),
                        "reject_reason": clean_reason,
                    },
                    happened_at=datetime.now(timezone.utc),
                ),
            )

            db.commit()
            db.refresh(adjustment)
            return format_adjustment(adjustment, user=user)
        except Exception:
            db.rollback()
            raise


def list_adjustments(
    db: Session,
    user: AuthenticatedUser,
    warehouse_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    reason: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    """List adjustments with filters and pagination."""
    normalized_role = normalize_role(user.role)
    if normalized_role in {RoleCode.CUSTOMER.value, RoleCode.SALES_REP.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem danh sách phiếu điều chỉnh tồn kho.",
        )

    query = db.query(InventoryAdjustment)

    # Scoping
    if normalized_role in {"Warehouse", "WH Manager"} and user.warehouse_ids:
        if warehouse_id is not None:
            if warehouse_id not in user.warehouse_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không được xem kho ngoài phạm vi được phân công.",
                )
            query = query.filter(InventoryAdjustment.warehouse_id == warehouse_id)
        else:
            query = query.filter(InventoryAdjustment.warehouse_id.in_(user.warehouse_ids))
    elif warehouse_id is not None:
        query = query.filter(InventoryAdjustment.warehouse_id == warehouse_id)

    if status_filter:
        query = query.filter(InventoryAdjustment.status == status_filter.strip().upper())

    if reason:
        query = query.filter(InventoryAdjustment.reason.ilike(f"%{reason.strip()}%"))

    if from_date:
        try:
            fd = datetime.strptime(from_date, "%Y-%m-%d")
            query = query.filter(InventoryAdjustment.created_at >= fd)
        except ValueError:
            pass

    if to_date:
        try:
            td = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(InventoryAdjustment.created_at <= td)
        except ValueError:
            pass

    total_records = query.count()
    total_pages = max(1, (total_records + limit - 1) // limit)
    offset = (page - 1) * limit

    adjustments = (
        query.order_by(desc(InventoryAdjustment.created_at), desc(InventoryAdjustment.id))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "code": 200,
        "message": "Lấy danh sách phiếu điều chỉnh thành công",
        "data": [format_adjustment(adj, user=user) for adj in adjustments],
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total_records,
            "totalPages": total_pages,
        },
    }


def get_adjustment_detail(
    db: Session,
    adjustment_id: int,
    user: AuthenticatedUser,
) -> Dict[str, Any]:
    """Retrieve full detail of one adjustment slip."""
    normalized_role = normalize_role(user.role)
    if normalized_role in {RoleCode.CUSTOMER.value, RoleCode.SALES_REP.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem phiếu điều chỉnh tồn kho.",
        )

    adj = db.query(InventoryAdjustment).filter(InventoryAdjustment.id == adjustment_id).first()
    if not adj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiếu điều chỉnh với ID {adjustment_id}.",
        )

    if normalized_role in {"Warehouse", "WH Manager"} and user.warehouse_ids:
        if adj.warehouse_id not in user.warehouse_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không được xem phiếu ngoài kho được phân công.",
            )

    return {
        "success": True,
        "code": 200,
        "data": format_adjustment(adj, user=user),
    }


# ---------------------------------------------------------------------------
# Stock Card (Thẻ kho) Report
# ---------------------------------------------------------------------------

def get_stock_cards(
    db: Session,
    user: AuthenticatedUser,
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    """Generate Stock Card (Thẻ kho) listing all posted inventory movements.
    Every approved adjustment slip appears as an actual stock movement.
    Unapproved slips (PENDING/REJECTED) can be viewed as documents but do NOT alter balance.
    """
    normalized_role = normalize_role(user.role)
    if normalized_role in {RoleCode.CUSTOMER.value, RoleCode.SALES_REP.value}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập thẻ kho.",
        )

    query = (
        db.query(InventoryTransaction, Product, Warehouse)
        .join(Product, InventoryTransaction.product_id == Product.id)
        .join(Warehouse, InventoryTransaction.warehouse_id == Warehouse.id)
    )

    if normalized_role in {"Warehouse", "WH Manager"} and user.warehouse_ids:
        if warehouse_id is not None:
            if warehouse_id not in user.warehouse_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không được xem thẻ kho ngoài phạm vi kho được phân công.",
                )
            query = query.filter(InventoryTransaction.warehouse_id == warehouse_id)
        else:
            query = query.filter(InventoryTransaction.warehouse_id.in_(user.warehouse_ids))
    elif warehouse_id is not None:
        query = query.filter(InventoryTransaction.warehouse_id == warehouse_id)

    if product_id is not None:
        query = query.filter(InventoryTransaction.product_id == product_id)

    if from_date:
        try:
            fd = datetime.strptime(from_date, "%Y-%m-%d")
            query = query.filter(InventoryTransaction.created_at >= fd)
        except ValueError:
            pass

    if to_date:
        try:
            td = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(InventoryTransaction.created_at <= td)
        except ValueError:
            pass

    total_records = query.count()
    total_pages = max(1, (total_records + limit - 1) // limit)
    offset = (page - 1) * limit

    transactions = (
        query.order_by(desc(InventoryTransaction.created_at), desc(InventoryTransaction.id))
        .offset(offset)
        .limit(limit)
        .all()
    )

    rows = []
    for tx, prod, wh in transactions:
        is_in = tx.transaction_type == "IN"
        in_qty = tx.input_quantity if is_in else 0.0
        out_qty = tx.input_quantity if not is_in else 0.0

        doc_type_label = "Xuất kho"
        if tx.document_type == "ADJUSTMENT":
            doc_type_label = "Điều chỉnh tồn kho"
        elif tx.document_type == "RECEIPT" or is_in:
            doc_type_label = "Nhập kho"
        elif tx.document_type == "DISPATCH":
            doc_type_label = "Xuất bán / Dispatch"

        rows.append({
            "id": tx.id,
            "date": tx.created_at.isoformat() if tx.created_at else None,
            "documentNo": tx.document_no or f"TX-{tx.id:06d}",
            "documentType": doc_type_label,
            "productId": prod.id,
            "productName": prod.name,
            "sku": prod.sku,
            "warehouseId": wh.id,
            "warehouseName": wh.name,
            "lotNumber": tx.lot_number,
            "unitName": tx.unit_name,
            "inQty": in_qty,
            "outQty": out_qty,
            "beforeQty": tx.before_qty,
            "afterQty": tx.after_qty,
            "lossValue": tx.loss_value,
            "note": tx.note or "",
        })

    return {
        "success": True,
        "code": 200,
        "message": "Tra cứu thẻ kho thành công",
        "data": rows,
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total_records,
            "totalPages": total_pages,
        },
    }
