"""Stock Card (Thẻ kho) Service for Product Movements Tracking.

Gom toàn bộ các phát sinh liên quan đến sản phẩm (Nhập, Xuất, Chuyển kho, Điều chỉnh kiểm kê)
sắp xếp theo thứ tự thời gian tăng dần và tính toán số tồn lũy kế (running total).
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Union
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import (
    Product,
    Warehouse,
    WarehouseReceipt,
    WarehouseReceiptItem,
    Dispatch,
    DispatchItem,
    Order,
    WarehouseTransfer,
    WarehouseTransferItem,
    WarehouseAudit,
    WarehouseAuditItem,
    InventoryAdjustment,
    InventoryAdjustmentItem,
    InventoryTransaction,
    InventoryLog,
    ImportDetail,
    ExportDetail,
    TransferDetail,
    AdjustmentDetail,
)


def _parse_datetime(val: Optional[Union[str, date, datetime]], is_end: bool = False) -> Optional[datetime]:
    """Parse date or string into naive or standardized datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None) if val.tzinfo else val
    if isinstance(val, date):
        t = time.max if is_end else time.min
        return datetime.combine(val, t)

    val_str = str(val).strip()
    if not val_str:
        return None

    # Replace 'Z' or timezone offsets for simple parsing
    val_clean = val_str.replace("Z", "").split("+")[0]
    formats = [
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M:%S",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(val_clean, fmt)
            if fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                t = time.max if is_end else time.min
                return datetime.combine(dt.date(), t)
            return dt
        except ValueError:
            continue

    # Fallback substring
    if len(val_clean) >= 10:
        try:
            d = datetime.strptime(val_clean[:10], "%Y-%m-%d").date()
            t = time.max if is_end else time.min
            return datetime.combine(d, t)
        except ValueError:
            pass

    return None


def _normalize_dt(val: Optional[datetime]) -> datetime:
    if val is None:
        return datetime.now()
    if hasattr(val, "tzinfo") and val.tzinfo:
        return val.replace(tzinfo=None)
    return val


def get_inventory_card_data(
    db: Session,
    product_id_or_sku: Union[int, str],
    warehouse_id: Optional[int] = None,
    start_date: Optional[Union[str, date, datetime]] = None,
    end_date: Optional[Union[str, date, datetime]] = None,
) -> Dict[str, Any]:
    """Truy vấn thẻ kho của một sản phẩm:
    - Gom dữ liệu (UNION) từ các bảng chứa lịch sử giao dịch:
      + Nhập kho (WarehouseReceipt / ImportDetail / Transaction IN)
      + Xuất kho (Dispatch / ExportDetail / Transaction OUT)
      + Chuyển kho (WarehouseTransfer / TransferDetail)
      + Điều chỉnh kiểm kê (WarehouseAudit / InventoryAdjustment / AdjustmentDetail)
      + Nhật ký kho (InventoryLog)
    - Sắp xếp theo thời gian tăng dần
    - Tính toán số tồn lũy kế (running total) sau mỗi phát sinh
    - Lọc theo Kho hàng và Khoảng thời gian (start_date, end_date)
    - Tính toán Tồn đầu kỳ, Tổng nhập, Tổng xuất, Tồn cuối kỳ
    """
    # 1. Tìm thông tin sản phẩm
    product = None
    if isinstance(product_id_or_sku, int) or (isinstance(product_id_or_sku, str) and product_id_or_sku.isdigit()):
        prod_id = int(product_id_or_sku)
        product = db.query(Product).filter(Product.id == prod_id).first()

    if product is None:
        clean_sku = str(product_id_or_sku).strip().upper()
        product = db.query(Product).filter(func.upper(Product.sku) == clean_sku).first()

    if product is None:
        raise ValueError(f"Không tìm thấy sản phẩm có mã hoặc ID '{product_id_or_sku}'.")

    # 2. Tìm thông tin kho hàng (nếu có lọc theo kho)
    wh_name = "Tất cả kho hàng"
    wh_code = "ALL"
    if warehouse_id is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh:
            wh_name = wh.name
            wh_code = wh.code
        else:
            wh_name = f"Kho #{warehouse_id}"
            wh_code = f"WH-{warehouse_id}"

    # 3. Chuẩn hóa khoảng thời gian lọc
    parsed_start_dt = _parse_datetime(start_date, is_end=False)
    parsed_end_dt = _parse_datetime(end_date, is_end=True)

    # 4. Gom dữ liệu (UNION) từ tất cả các nguồn phát sinh
    raw_entries: List[Dict[str, Any]] = []

    # --- Nguồn A: Phiếu nhập kho (WarehouseReceipt & WarehouseReceiptItem) ---
    try:
        q_receipts = (
            db.query(WarehouseReceiptItem, WarehouseReceipt)
            .join(WarehouseReceipt, WarehouseReceiptItem.receipt_id == WarehouseReceipt.id)
            .filter(WarehouseReceiptItem.product_id == product.id)
        )
        if warehouse_id is not None:
            q_receipts = q_receipts.filter(WarehouseReceipt.warehouse_id == warehouse_id)

        for item, receipt in q_receipts.all():
            qty = float(item.quantity)
            dt = _normalize_dt(receipt.receipt_date)
            raw_entries.append({
                "source": "receipt",
                "datetime": dt,
                "transaction_type": "NHAP",
                "transaction_type_label": "Nhập kho",
                "document_id": receipt.id,
                "document_code": f"PN-{receipt.id:05d}",
                "document_type": "RECEIPT",
                "document_url": f"/warehouse/receiving?receipt_id={receipt.id}",
                "warehouse_id": receipt.warehouse_id,
                "change_quantity": qty,
                "note": f"Nhập kho theo phiếu PN-{receipt.id:05d}" + (f" (Lô: {item.lot_number})" if item.lot_number else ""),
            })
    except Exception:
        pass

    # --- Nguồn B: Phiếu xuất kho (Dispatch & DispatchItem) ---
    try:
        q_dispatches = (
            db.query(DispatchItem, Dispatch, Order)
            .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
            .outerjoin(Order, Dispatch.order_id == Order.id)
            .filter(DispatchItem.product_id == product.id)
        )
        for item, dispatch, order in q_dispatches.all():
            item_wh_id = order.warehouse_id if order and order.warehouse_id else 1
            if warehouse_id is not None and item_wh_id != warehouse_id:
                continue

            qty = -abs(float(item.actual_qty))
            dt = _normalize_dt(order.created_at if order and order.created_at else None)
            order_code = f" ({order.order_code})" if order and order.order_code else ""
            raw_entries.append({
                "source": "dispatch",
                "datetime": dt,
                "transaction_type": "XUAT",
                "transaction_type_label": "Xuất kho",
                "document_id": dispatch.id,
                "document_code": f"PX-{dispatch.id:05d}{order_code}",
                "document_type": "DISPATCH",
                "document_url": f"/warehouse/picking?dispatch_id={dispatch.id}",
                "warehouse_id": item_wh_id,
                "change_quantity": qty,
                "note": f"Xuất kho phiếu PX-{dispatch.id:05d}" + (f" theo đơn {order.order_code}" if order else ""),
            })
    except Exception:
        pass

    # --- Nguồn C: Điều chuyển kho (WarehouseTransfer & WarehouseTransferItem) ---
    try:
        q_transfers = (
            db.query(WarehouseTransferItem, WarehouseTransfer)
            .join(WarehouseTransfer, WarehouseTransferItem.transfer_id == WarehouseTransfer.id)
            .filter(WarehouseTransferItem.product_id == product.id)
        )
        for item, transfer in q_transfers.all():
            qty = abs(float(item.quantity))
            dt = _normalize_dt(transfer.transfer_date)

            if warehouse_id is not None:
                # Nếu lọc theo kho chuyển đi -> trừ tồn
                if transfer.from_warehouse_id == warehouse_id:
                    raw_entries.append({
                        "source": "transfer_out",
                        "datetime": dt,
                        "transaction_type": "CHUYEN_XUAT",
                        "transaction_type_label": "Xuất chuyển kho",
                        "document_id": transfer.id,
                        "document_code": f"PCK-{transfer.id:05d}",
                        "document_type": "TRANSFER",
                        "document_url": f"/warehouse/transfers?transfer_id={transfer.id}",
                        "warehouse_id": transfer.from_warehouse_id,
                        "change_quantity": -qty,
                        "note": f"Chuyển đến Kho #{transfer.to_warehouse_id}",
                    })
                # Nếu lọc theo kho nhận -> cộng tồn
                elif transfer.to_warehouse_id == warehouse_id:
                    raw_entries.append({
                        "source": "transfer_in",
                        "datetime": dt,
                        "transaction_type": "CHUYEN_NHAP",
                        "transaction_type_label": "Nhập chuyển kho",
                        "document_id": transfer.id,
                        "document_code": f"PCK-{transfer.id:05d}",
                        "document_type": "TRANSFER",
                        "document_url": f"/warehouse/transfers?transfer_id={transfer.id}",
                        "warehouse_id": transfer.to_warehouse_id,
                        "change_quantity": qty,
                        "note": f"Nhận chuyển từ Kho #{transfer.from_warehouse_id}",
                    })
            else:
                # Không lọc kho -> ghi cả 2 đầu xuất và nhập
                raw_entries.append({
                    "source": "transfer_out",
                    "datetime": dt,
                    "transaction_type": "CHUYEN_XUAT",
                    "transaction_type_label": "Xuất chuyển kho",
                    "document_id": transfer.id,
                    "document_code": f"PCK-{transfer.id:05d}",
                    "document_type": "TRANSFER",
                    "document_url": f"/warehouse/transfers?transfer_id={transfer.id}",
                    "warehouse_id": transfer.from_warehouse_id,
                    "change_quantity": -qty,
                    "note": f"Chuyển từ Kho #{transfer.from_warehouse_id} -> Kho #{transfer.to_warehouse_id}",
                })
                raw_entries.append({
                    "source": "transfer_in",
                    "datetime": dt,
                    "transaction_type": "CHUYEN_NHAP",
                    "transaction_type_label": "Nhập chuyển kho",
                    "document_id": transfer.id,
                    "document_code": f"PCK-{transfer.id:05d}",
                    "document_type": "TRANSFER",
                    "document_url": f"/warehouse/transfers?transfer_id={transfer.id}",
                    "warehouse_id": transfer.to_warehouse_id,
                    "change_quantity": qty,
                    "note": f"Nhận chuyển từ Kho #{transfer.from_warehouse_id} -> Kho #{transfer.to_warehouse_id}",
                })
    except Exception:
        pass

    # --- Nguồn D: Kiểm kê kho (WarehouseAudit & WarehouseAuditItem) ---
    try:
        q_audits = (
            db.query(WarehouseAuditItem, WarehouseAudit)
            .join(WarehouseAudit, WarehouseAuditItem.audit_id == WarehouseAudit.id)
            .filter(WarehouseAuditItem.product_id == product.id)
        )
        if warehouse_id is not None:
            q_audits = q_audits.filter(WarehouseAudit.warehouse_id == warehouse_id)

        for item, audit in q_audits.all():
            diff = float(item.actual_qty - item.system_qty)
            dt = _normalize_dt(audit.audit_date)
            raw_entries.append({
                "source": "audit",
                "datetime": dt,
                "transaction_type": "DIEU_CHINH",
                "transaction_type_label": "Điều chỉnh kiểm kê",
                "document_id": audit.id,
                "document_code": f"PKK-{audit.id:05d}",
                "document_type": "AUDIT",
                "document_url": f"/warehouse/inventory?audit_id={audit.id}",
                "warehouse_id": audit.warehouse_id,
                "change_quantity": diff,
                "note": f"Chênh lệch kiểm kê (Thực tế: {item.actual_qty}, Sổ sách: {item.system_qty})",
            })
    except Exception:
        pass

    # --- Nguồn E: Điều chỉnh tồn kho (InventoryAdjustment & InventoryAdjustmentItem) ---
    try:
        q_adjustments = (
            db.query(InventoryAdjustmentItem, InventoryAdjustment)
            .join(InventoryAdjustment, InventoryAdjustmentItem.adjustment_id == InventoryAdjustment.id)
            .filter(InventoryAdjustmentItem.product_id == product.id)
        )
        if warehouse_id is not None:
            q_adjustments = q_adjustments.filter(InventoryAdjustment.warehouse_id == warehouse_id)

        for item, adj in q_adjustments.all():
            qty = float(item.adjust_qty)
            dt = _normalize_dt(None)
            raw_entries.append({
                "source": "adjustment",
                "datetime": dt,
                "transaction_type": "DIEU_CHINH",
                "transaction_type_label": "Điều chỉnh tồn kho",
                "document_id": adj.id,
                "document_code": f"PDC-{adj.id:05d}",
                "document_type": "ADJUSTMENT",
                "document_url": f"/warehouse/inventory?adjustment_id={adj.id}",
                "warehouse_id": adj.warehouse_id,
                "change_quantity": qty,
                "note": adj.reason or "Điều chỉnh số lượng tồn",
            })
    except Exception:
        pass

    # --- Nguồn F: Giao dịch kho chung (InventoryTransaction) ---
    try:
        q_tx = db.query(InventoryTransaction).filter(InventoryTransaction.product_id == product.id)
        if warehouse_id is not None:
            q_tx = q_tx.filter(InventoryTransaction.warehouse_id == warehouse_id)

        for tx in q_tx.all():
            is_in = tx.transaction_type == "IN"
            qty = abs(float(tx.base_quantity)) if is_in else -abs(float(tx.base_quantity))
            dt = _normalize_dt(tx.created_at)
            raw_entries.append({
                "source": "inventory_transaction",
                "datetime": dt,
                "transaction_type": "NHAP" if is_in else "XUAT",
                "transaction_type_label": "Nhập kho (giao dịch)" if is_in else "Xuất kho (giao dịch)",
                "document_id": tx.id,
                "document_code": f"GD-{tx.id:05d}",
                "document_type": "TRANSACTION",
                "document_url": f"/warehouse/inventory?tx_id={tx.id}",
                "warehouse_id": tx.warehouse_id,
                "change_quantity": qty,
                "note": f"{'Nhập' if is_in else 'Xuất'} {tx.input_quantity} {tx.unit_name}",
            })
    except Exception:
        pass

    # --- Nguồn G: ImportDetail / ImportDetails ---
    try:
        q_imports = db.query(ImportDetail).filter(ImportDetail.product_id == product.id)
        if warehouse_id is not None:
            q_imports = q_imports.filter(ImportDetail.warehouse_id == warehouse_id)
        for imp in q_imports.all():
            qty = float(imp.quantity)
            dt = _normalize_dt(imp.created_at)
            doc_id = imp.document_id or imp.id
            raw_entries.append({
                "source": "import_detail",
                "datetime": dt,
                "transaction_type": "NHAP",
                "transaction_type_label": "Nhập kho",
                "document_id": doc_id,
                "document_code": imp.document_code or f"PN-{doc_id:05d}",
                "document_type": "RECEIPT",
                "document_url": f"/warehouse/receiving?receipt_id={doc_id}",
                "warehouse_id": imp.warehouse_id,
                "change_quantity": qty,
                "note": imp.note or f"Nhập kho chi tiết #{imp.id}",
            })
    except Exception:
        pass

    # --- Nguồn H: ExportDetail / ExportDetails ---
    try:
        q_exports = db.query(ExportDetail).filter(ExportDetail.product_id == product.id)
        if warehouse_id is not None:
            q_exports = q_exports.filter(ExportDetail.warehouse_id == warehouse_id)
        for exp in q_exports.all():
            qty = -abs(float(exp.quantity))
            dt = _normalize_dt(exp.created_at)
            doc_id = exp.document_id or exp.id
            raw_entries.append({
                "source": "export_detail",
                "datetime": dt,
                "transaction_type": "XUAT",
                "transaction_type_label": "Xuất kho",
                "document_id": doc_id,
                "document_code": exp.document_code or f"PX-{doc_id:05d}",
                "document_type": "DISPATCH",
                "document_url": f"/warehouse/picking?dispatch_id={doc_id}",
                "warehouse_id": exp.warehouse_id,
                "change_quantity": qty,
                "note": exp.note or f"Xuất kho chi tiết #{exp.id}",
            })
    except Exception:
        pass

    # --- Nguồn I: TransferDetail / TransferDetails ---
    try:
        q_trans_details = db.query(TransferDetail).filter(TransferDetail.product_id == product.id)
        for td in q_trans_details.all():
            qty = abs(float(td.quantity))
            dt = _normalize_dt(td.created_at)
            doc_id = td.document_id or td.id
            doc_code = td.document_code or f"PCK-{doc_id:05d}"
            if warehouse_id is not None:
                if td.from_warehouse_id == warehouse_id:
                    raw_entries.append({
                        "source": "transfer_detail_out",
                        "datetime": dt,
                        "transaction_type": "CHUYEN_XUAT",
                        "transaction_type_label": "Xuất chuyển kho",
                        "document_id": doc_id,
                        "document_code": doc_code,
                        "document_type": "TRANSFER",
                        "document_url": f"/warehouse/transfers?transfer_id={doc_id}",
                        "warehouse_id": td.from_warehouse_id,
                        "change_quantity": -qty,
                        "note": td.note or f"Chuyển đến Kho #{td.to_warehouse_id}",
                    })
                elif td.to_warehouse_id == warehouse_id:
                    raw_entries.append({
                        "source": "transfer_detail_in",
                        "datetime": dt,
                        "transaction_type": "CHUYEN_NHAP",
                        "transaction_type_label": "Nhập chuyển kho",
                        "document_id": doc_id,
                        "document_code": doc_code,
                        "document_type": "TRANSFER",
                        "document_url": f"/warehouse/transfers?transfer_id={doc_id}",
                        "warehouse_id": td.to_warehouse_id,
                        "change_quantity": qty,
                        "note": td.note or f"Nhận chuyển từ Kho #{td.from_warehouse_id}",
                    })
            else:
                raw_entries.append({
                    "source": "transfer_detail_out",
                    "datetime": dt,
                    "transaction_type": "CHUYEN_XUAT",
                    "transaction_type_label": "Xuất chuyển kho",
                    "document_id": doc_id,
                    "document_code": doc_code,
                    "document_type": "TRANSFER",
                    "document_url": f"/warehouse/transfers?transfer_id={doc_id}",
                    "warehouse_id": td.from_warehouse_id,
                    "change_quantity": -qty,
                    "note": td.note or f"Chuyển từ Kho #{td.from_warehouse_id} -> Kho #{td.to_warehouse_id}",
                })
                raw_entries.append({
                    "source": "transfer_detail_in",
                    "datetime": dt,
                    "transaction_type": "CHUYEN_NHAP",
                    "transaction_type_label": "Nhập chuyển kho",
                    "document_id": doc_id,
                    "document_code": doc_code,
                    "document_type": "TRANSFER",
                    "document_url": f"/warehouse/transfers?transfer_id={doc_id}",
                    "warehouse_id": td.to_warehouse_id,
                    "change_quantity": qty,
                    "note": td.note or f"Nhận chuyển từ Kho #{td.from_warehouse_id} -> Kho #{td.to_warehouse_id}",
                })
    except Exception:
        pass

    # --- Nguồn J: AdjustmentDetail / AdjustmentDetails ---
    try:
        q_adjs = db.query(AdjustmentDetail).filter(AdjustmentDetail.product_id == product.id)
        if warehouse_id is not None:
            q_adjs = q_adjs.filter(AdjustmentDetail.warehouse_id == warehouse_id)
        for ad in q_adjs.all():
            qty = float(ad.adjust_quantity)
            dt = _normalize_dt(ad.created_at)
            doc_id = ad.document_id or ad.id
            raw_entries.append({
                "source": "adjustment_detail",
                "datetime": dt,
                "transaction_type": "DIEU_CHINH",
                "transaction_type_label": "Điều chỉnh tồn kho",
                "document_id": doc_id,
                "document_code": ad.document_code or f"PDC-{doc_id:05d}",
                "document_type": "ADJUSTMENT",
                "document_url": f"/warehouse/inventory?adjustment_id={doc_id}",
                "warehouse_id": ad.warehouse_id,
                "change_quantity": qty,
                "note": ad.note or "Điều chỉnh tồn kho chi tiết",
            })
    except Exception:
        pass

    # --- Nguồn K: InventoryLog / InventoryLogs ---
    try:
        q_logs = db.query(InventoryLog).filter(InventoryLog.product_id == product.id)
        if warehouse_id is not None:
            q_logs = q_logs.filter(InventoryLog.warehouse_id == warehouse_id)
        for log in q_logs.all():
            qty = float(log.change_quantity)
            dt = _normalize_dt(log.created_at)
            doc_id = log.document_id or log.id
            doc_type = log.document_type or "LOG"
            doc_code = log.document_code or f"{doc_type}-{doc_id:05d}"
            doc_url = (
                f"/warehouse/receiving?receipt_id={doc_id}" if log.transaction_type == "NHAP"
                else f"/warehouse/picking?dispatch_id={doc_id}" if log.transaction_type == "XUAT"
                else f"/warehouse/transfers?transfer_id={doc_id}" if "CHUYEN" in log.transaction_type
                else f"/warehouse/inventory?doc_id={doc_id}"
            )
            raw_entries.append({
                "source": "inventory_log",
                "datetime": dt,
                "transaction_type": log.transaction_type,
                "transaction_type_label": (
                    "Nhập kho" if log.transaction_type == "NHAP"
                    else "Xuất kho" if log.transaction_type == "XUAT"
                    else "Xuất chuyển kho" if log.transaction_type == "CHUYEN_XUAT"
                    else "Nhập chuyển kho" if log.transaction_type == "CHUYEN_NHAP"
                    else "Điều chỉnh kiểm kê"
                ),
                "document_id": doc_id,
                "document_code": doc_code,
                "document_type": doc_type,
                "document_url": doc_url,
                "warehouse_id": log.warehouse_id,
                "change_quantity": qty,
                "note": log.note or f"Nhật ký biến động tồn #{log.id}",
            })
    except Exception:
        pass

    # 5. Sắp xếp toàn bộ giao dịch theo thứ tự thời gian tăng dần
    raw_entries.sort(key=lambda x: (x["datetime"], x.get("document_id") or 0))

    # 6. Tính toán Tồn lũy kế (Running total) và áp dụng bộ lọc ngày
    current_balance = 0.0
    opening_balance = 0.0
    total_in = 0.0
    total_out = 0.0
    in_period_items: List[Dict[str, Any]] = []

    for idx, entry in enumerate(raw_entries, 1):
        dt = entry["datetime"]
        change = entry["change_quantity"]
        current_balance += change
        entry["balance_after"] = round(current_balance, 3)

        # Kiểm tra điều kiện khoảng thời gian
        if parsed_start_dt and dt < parsed_start_dt:
            # Diễn ra TRƯỚC kỳ báo cáo -> tích lũy vào tồn đầu kỳ
            opening_balance = current_balance
            continue

        if parsed_end_dt and dt > parsed_end_dt:
            # Diễn ra SAU kỳ báo cáo -> không đưa vào items của kỳ này
            continue

        # Nằm TRONG kỳ báo cáo
        if change > 0:
            total_in += change
        elif change < 0:
            total_out += abs(change)

        formatted_item = {
            "id": f"{entry['source']}-{entry.get('document_id', idx)}-{idx}",
            "date": dt.strftime("%Y-%m-%d %H:%M:%S"),
            "transaction_type": entry["transaction_type"],
            "transactionType": entry["transaction_type"],
            "transaction_type_label": entry["transaction_type_label"],
            "transactionTypeLabel": entry["transaction_type_label"],
            "document_id": entry["document_id"],
            "documentId": entry["document_id"],
            "document_code": entry["document_code"],
            "documentCode": entry["document_code"],
            "document_type": entry["document_type"],
            "documentType": entry["document_type"],
            "document_url": entry["document_url"],
            "documentUrl": entry["document_url"],
            "warehouse_id": entry["warehouse_id"],
            "warehouseId": entry["warehouse_id"],
            "change_quantity": round(change, 3),
            "changeQuantity": round(change, 3),
            "balance_after": round(current_balance, 3),
            "balanceAfter": round(current_balance, 3),
            "note": entry.get("note", ""),
        }
        in_period_items.append(formatted_item)

    closing_balance = round(current_balance, 3)

    return {
        "product": {
            "id": product.id,
            "sku": product.sku,
            "name": product.name,
            "base_unit": product.base_unit or "Đơn vị",
            "baseUnit": product.base_unit or "Đơn vị",
        },
        "warehouse": {
            "id": warehouse_id,
            "name": wh_name,
            "code": wh_code,
        },
        "filter": {
            "warehouse_id": warehouse_id,
            "warehouseId": warehouse_id,
            "start_date": str(start_date) if start_date else None,
            "startDate": str(start_date) if start_date else None,
            "end_date": str(end_date) if end_date else None,
            "endDate": str(end_date) if end_date else None,
        },
        "opening_balance": round(opening_balance, 3),
        "openingBalance": round(opening_balance, 3),
        "total_in": round(total_in, 3),
        "totalIn": round(total_in, 3),
        "total_out": round(total_out, 3),
        "totalOut": round(total_out, 3),
        "closing_balance": closing_balance,
        "closingBalance": closing_balance,
        "items": in_period_items,
        "total_transactions": len(in_period_items),
        "totalTransactions": len(in_period_items),
    }
