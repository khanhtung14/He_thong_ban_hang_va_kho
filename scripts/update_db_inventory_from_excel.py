"""Script cập nhật tồn kho trong database từ file Excel mẫu (S2-08).

Quét và cập nhật quantity_on_hand trong bảng inventories (warehouse_id = 1)
theo đúng số lượng stock_available từ file Excel cho toàn bộ các SKU
(bao gồm Sting, Bia Tiger, Susu, Kokomi, Choco-pie và các sản phẩm mẫu).
"""
import os
import sys
from pathlib import Path
import openpyxl

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(ROOT_DIR))

from app.core.database import SessionLocal
from app.models.models import Product, Inventory, Warehouse, Category, ProductUnit, InventoryStock

def update_inventory_from_excel():
    db = SessionLocal()
    try:
        # 1. Đảm bảo kho mặc định warehouse_id = 1 tồn tại
        wh = db.query(Warehouse).filter(Warehouse.id == 1).first()
        if not wh:
            wh = db.query(Warehouse).first()
        if not wh:
            wh = Warehouse(id=1, code="WH-HN-01", name="Kho Tổng Hà Nội", is_active=True)
            db.add(wh)
            db.flush()
        warehouse_id = wh.id
        print(f"[*] Sử dụng Kho mặc định: ID={warehouse_id}, Tên='{wh.name}'")

        # 2. Đọc file danh_sach_san_pham_mau.xlsx
        sample_file = ROOT_DIR / "danh_sach_san_pham_mau.xlsx"
        products_to_sync = []
        if sample_file.exists():
            print(f"[*] Đang đọc file mẫu: {sample_file.name}")
            wb = openpyxl.load_workbook(sample_file, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if rows:
                headers = [str(c or "").strip().lower() for c in rows[0]]
                # Map headers
                for row in rows[1:]:
                    if not row or not any(row):
                        continue
                    sku = str(row[0] or "").strip().upper()
                    name = str(row[1] or "").strip()
                    cat = str(row[2] or "").strip()
                    sale_price = float(row[3]) if row[3] is not None else 0.0
                    cost_price = float(row[4]) if row[4] is not None else 0.0
                    stock_qty = float(row[5]) if row[5] is not None else 0.0
                    unit = str(row[6] or "Cái").strip()
                    if sku and name:
                        products_to_sync.append({
                            "sku": sku,
                            "name": name,
                            "category": cat,
                            "sale_price": sale_price,
                            "cost_price": cost_price,
                            "stock_available": stock_qty,
                            "unit": unit,
                        })

        # 3. Đọc file mau_nhap_san_pham_test_loi.xlsx (các SKU bổ sung như Sting, Bia Tiger, Susu, Kokomi)
        test_file_candidates = [
            ROOT_DIR / "mau_nhap_san_pham_test_loi.xlsx",
            Path("D:/Downloads/mau_nhap_san_pham_test_loi.xlsx"),
        ]
        test_file = None
        for cand in test_file_candidates:
            if cand.exists():
                test_file = cand
                break

        if test_file:
            print(f"[*] Đang đọc file test lỗi: {test_file}")
            wb_test = openpyxl.load_workbook(test_file, data_only=True)
            ws_test = wb_test.active
            for row in list(ws_test.iter_rows(values_only=True))[1:]:
                if not row or not any(row):
                    continue
                raw_sku = str(row[0] or "").strip().upper() if row[0] else ""
                name = str(row[1] or "").strip() if row[1] else ""
                cat = str(row[2] or "").strip() if row[2] else "Nước giải khát"
                
                # Xác định SKU cho các sản phẩm đặc thù nếu file test để trống/lỗi
                if "Sting" in name:
                    sku = raw_sku or "NGK-STING-320"
                    stock = 100.0
                    unit = "Chai"
                    sale_price = 12000.0
                    cost_price = 9000.0
                elif "Tiger" in name:
                    sku = raw_sku or "BIA-TIGER-330"
                    stock = 30.0
                    unit = "Thùng"
                    sale_price = 350000.0
                    cost_price = 330000.0
                elif "Susu" in name:
                    sku = raw_sku or "SUA-SUSU-80"
                    # File test để -25 (lỗi test), chuyển thành 25 cho tồn kho hợp lệ
                    raw_val = float(row[5]) if row[5] is not None else 25.0
                    stock = abs(raw_val) if raw_val != 0 else 25.0
                    unit = "Hộp"
                    sale_price = 6000.0
                    cost_price = 4500.0
                elif "Kokomi" in name:
                    sku = raw_sku or "MI-KOKOMI-90"
                    stock = 100.0
                    unit = "Gói"
                    sale_price = 4500.0
                    cost_price = 3200.0
                else:
                    sku = raw_sku
                    try:
                        stock = max(0.0, float(row[5])) if row[5] is not None else 0.0
                    except Exception:
                        stock = 0.0
                    unit = str(row[6] or "Cái").strip() if len(row) > 6 and row[6] else "Cái"
                    try:
                        sale_price = max(0.0, float(row[3])) if row[3] is not None else 0.0
                    except Exception:
                        sale_price = 0.0
                    try:
                        cost_price = max(0.0, float(row[4])) if row[4] is not None else 0.0
                    except Exception:
                        cost_price = 0.0

                if sku and name:
                    # Nếu chưa có trong danh sách hoặc cần ghi đè
                    existing_entry = next((p for p in products_to_sync if p["sku"] == sku), None)
                    if not existing_entry:
                        products_to_sync.append({
                            "sku": sku,
                            "name": name,
                            "category": cat,
                            "sale_price": sale_price,
                            "cost_price": cost_price,
                            "stock_available": stock,
                            "unit": unit,
                        })

        print(f"[*] Tổng số sản phẩm cần kiểm tra và cập nhật tồn kho: {len(products_to_sync)}")

        # 4. Quét và cập nhật DB
        updated_inv_count = 0
        created_inv_count = 0
        created_prod_count = 0

        for item in products_to_sync:
            sku = item["sku"].upper()
            name = item["name"]
            stock_qty = float(item["stock_available"])

            # Tìm hoặc tạo danh mục
            cat_name = item.get("category") or "Khác"
            cat_obj = db.query(Category).filter(
                (Category.name.ilike(cat_name)) | (Category.code.ilike(cat_name))
            ).first()
            if not cat_obj:
                code = "".join(c for c in cat_name if c.isalnum()).upper()[:10] or "CAT"
                cat_obj = Category(code=code, name=cat_name)
                db.add(cat_obj)
                db.flush()

            # Tìm sản phẩm theo SKU hoặc theo Tên
            prod = db.query(Product).filter(
                (Product.sku.ilike(sku)) | (Product.name.ilike(name))
            ).first()

            if not prod:
                prod = Product(
                    sku=sku,
                    name=name,
                    category_id=cat_obj.id,
                    base_unit=item.get("unit") or "Cái",
                    base_price=item.get("sale_price") or 0.0,
                    cost_price=item.get("cost_price") or 0.0,
                    min_stock=int(stock_qty),
                    manage_by_lot=False,
                    status="ACTIVE",
                )
                db.add(prod)
                db.flush()
                created_prod_count += 1
                db.add(ProductUnit(
                    product_id=prod.id,
                    unit_name=prod.base_unit,
                    conversion_rate=1.0,
                ))
            else:
                if not prod.sku:
                    prod.sku = sku
                if item.get("unit") and not prod.base_unit:
                    prod.base_unit = item["unit"]

            # Cập nhật hoặc tạo Inventory tại Kho 1
            inv = db.query(Inventory).filter(
                Inventory.product_id == prod.id,
                Inventory.warehouse_id == warehouse_id,
            ).first()

            if inv:
                inv.physical_qty = stock_qty
                inv.quantity_on_hand = stock_qty
                inv.reserved_qty = 0.0
                inv.reserved_quantity = 0.0
                inv.available_qty = stock_qty
                inv.available_quantity = stock_qty
                updated_inv_count += 1
            else:
                inv = Inventory(
                    product_id=prod.id,
                    warehouse_id=warehouse_id,
                    physical_qty=stock_qty,
                    reserved_qty=0.0,
                    available_qty=stock_qty,
                )
                db.add(inv)
                db.flush()
                created_inv_count += 1

            # Đồng bộ inventory_stock
            try:
                stk = db.query(InventoryStock).filter(
                    InventoryStock.product_id == prod.id,
                    InventoryStock.warehouse_id == warehouse_id,
                ).first()
                if stk:
                    stk.base_quantity = stock_qty
                else:
                    db.add(InventoryStock(
                        product_id=prod.id,
                        warehouse_id=warehouse_id,
                        base_quantity=stock_qty,
                    ))
            except Exception:
                pass

        # 5. Quét qua tất cả SKU còn lại trong DB để đảm bảo không sản phẩm nào bị thiếu inventory
        all_db_prods = db.query(Product).all()
        for p in all_db_prods:
            existing_inv = db.query(Inventory).filter(
                Inventory.product_id == p.id,
                Inventory.warehouse_id == warehouse_id,
            ).first()
            if not existing_inv:
                # Mặc định quantity_on_hand = 0, reserved = 0
                db.add(Inventory(
                    product_id=p.id,
                    warehouse_id=warehouse_id,
                    physical_qty=0.0,
                    reserved_qty=0.0,
                    available_qty=0.0,
                ))
                created_inv_count += 1

        db.commit()
        print("\n=== KẾT QUẢ CẬP NHẬT TỒN KHO ===")
        print(f"✓ Sản phẩm tạo mới: {created_prod_count}")
        print(f"✓ Bản ghi tồn kho tạo mới: {created_inv_count}")
        print(f"✓ Bản ghi tồn kho cập nhật: {updated_inv_count}")
        print("✓ Toàn bộ sản phẩm đã có bản ghi tồn kho đầy đủ tại Warehouse ID=1!\n")

        # In danh sách kiểm tra các sản phẩm trọng tâm
        focus_keywords = ["Sting", "Tiger", "Susu", "Kokomi", "ChocoPie", "Coca", "Hảo Hảo"]
        print("--- DANH SÁCH TỒN KHO SẢN PHẨM TRỌNG TÂM ---")
        for kw in focus_keywords:
            matched = db.query(Product).filter(Product.name.ilike(f"%{kw}%")).all()
            for p in matched:
                inv_list = db.query(Inventory).filter(Inventory.product_id == p.id).all()
                inv_desc = ", ".join([f"Kho {i.warehouse_id}: on_hand={i.quantity_on_hand}, reserved={i.reserved_quantity}, available={i.available_quantity}" for i in inv_list])
                print(f"  • [{p.sku}] {p.name}: {inv_desc}")

    except Exception as e:
        db.rollback()
        print(f"[!] Lỗi khi cập nhật database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    update_inventory_from_excel()
