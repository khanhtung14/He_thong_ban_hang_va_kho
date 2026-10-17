import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from app.core.database import SessionLocal
from app.models.models import Order, OrderItem, Inventory, Product, Warehouse, OrderStatus

def sync_reserved_inventory():
    db = SessionLocal()
    try:
        print("=== BẮT ĐẦU ĐỒNG BỘ DỮ LIỆU TỒN KHO THEO CÁC ĐƠN HÀNG HIỆN HỮU ===")

        active_statuses = [
            OrderStatus.DRAFT,
            OrderStatus.PENDING,
            OrderStatus.PENDING_APPROVAL,
            OrderStatus.APPROVED,
        ]

        active_orders = db.query(Order).filter(Order.status.in_(active_statuses)).all()
        print(f"[*] Tìm thấy {len(active_orders)} đơn hàng đang hoạt động (chưa xuất kho / chưa hủy).")

        reserved_map = {}

        for order in active_orders:
            wh_id = order.warehouse_id or 1
            for item in order.items:
                if not item.sku:
                    continue
                clean_sku = item.sku.strip().upper()
                key = (clean_sku, wh_id)
                reserved_map[key] = reserved_map.get(key, 0.0) + float(item.quantity or 0)

        inventories = db.query(Inventory).all()
        products_map = {p.id: p for p in db.query(Product).all()}

        updated_count = 0
        for inv in inventories:
            prod = products_map.get(inv.product_id)
            if not prod or not prod.sku:
                continue
            clean_sku = prod.sku.strip().upper()
            target_reserved = reserved_map.get((clean_sku, inv.warehouse_id), 0.0)

            old_reserved = inv.reserved_qty
            old_available = inv.available_qty
            # Tồn khả dụng = max(0, physical - reserved)
            new_available = max(0.0, float(inv.physical_qty - target_reserved))

            if old_reserved != target_reserved or old_available != new_available:
                inv.reserved_qty = target_reserved
                inv.reserved_quantity = target_reserved
                inv.available_qty = new_available
                inv.available_quantity = new_available
                updated_count += 1
                print(
                    f"[UPDATED] {clean_sku} (Kho {inv.warehouse_id}): "
                    f"Physical={inv.physical_qty} | "
                    f"Reserved: {old_reserved} -> {target_reserved} | "
                    f"Available: {old_available} -> {new_available}"
                )

        db.commit()
        print(f"\n=== HOÀN TẤT ĐỒNG BỘ: Đã cập nhật {updated_count} bản ghi tồn kho thành công! ===")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Lỗi khi đồng bộ: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    sync_reserved_inventory()
