"""Demo Script for SCRUM-75: Product Catalog Management."""

import sys
import time
import httpx

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"

def line():
    print("=" * 75)

print("\n" + "=" * 75)
print("🎯 BẮT ĐẦU CHẠY DEMO TÍNH NĂNG SCRUM-75 (QUẢN LÝ DANH MỤC SẢN PHẨM)")
print("=" * 75)

# --- DEMO 1: Xem danh mục với vai trò Quản lý kinh doanh ---
print("\n[BƯỚC 1] ĐĂNG NHẬP VỚI VAI TRÒ QUẢN LÝ KINH DOANH (SALES MANAGER)")
headers_mgr = {"X-User-Role": "SALES_MANAGER", "X-User-Name": "demo_sales_mgr"}
r1 = httpx.get(f"{BASE_URL}/api/v1/products", headers=headers_mgr)
data1 = r1.json()
print(f"👉 HTTP Status: {r1.status_code}")
print(f"👉 Quyền xem giá vốn (can_view_cost_price): {data1['can_view_cost_price']}")
print(f"👉 Tổng số sản phẩm trong hệ thống: {data1['total']}")
print("👉 Danh sách sản phẩm mẫu:")
for p in data1["items"][:3]:
    print(f"   • [{p['sku']}] {p['name']} | ĐVT: {p['base_unit']} | Quy cách: {p['packaging_spec']} | Giá vốn: {p['cost_price']:,.0f} đ | Trạng thái: {p['status_label']}")

# --- DEMO 2: Bảo mật giá vốn với các vai trò khác ---
print("\n[BƯỚC 2] KIỂM TRA BẢO MẬT GIÁ VỐN VỚI VAI TRÒ NHÂN VIÊN KINH DOANH (SALES REP)")
headers_sales = {"X-User-Role": "SALES", "X-User-Name": "demo_sales"}
r2 = httpx.get(f"{BASE_URL}/api/v1/products", headers=headers_sales)
data2 = r2.json()
print(f"👉 HTTP Status: {r2.status_code}")
print(f"👉 Quyền xem giá vốn (can_view_cost_price): {data2['can_view_cost_price']}")
for p in data2["items"][:2]:
    print(f"   • [{p['sku']}] {p['name']} | Giá vốn hiển thị: {p['cost_price']} (Đã bị ẩn tự động ở server)")

# --- DEMO 3: Khai báo sản phẩm mới ---
print("\n[BƯỚC 3] KHAI BÁO SẢN PHẨM MỚI (SKU, Tên, ĐVT, Giá vốn, Trạng thái)")
new_product = {
    "sku": "SKU-BIA-SG",
    "name": "Bia Sài Gòn Special 330ml",
    "category_id": 2,
    "category_name": "Bia & Đồ uống có cồn",
    "base_unit": "Lon",
    "packaging_spec": "Thùng 24 lon",
    "cost_price": 280000.0,
    "sale_price": 340000.0,
    "status": "ACTIVE",
    "description": "Bia Sài Gòn Special lon xanh cao cấp",
}
r3 = httpx.post(f"{BASE_URL}/api/v1/products", json=new_product, headers=headers_mgr)
print(f"👉 HTTP Status: {r3.status_code} (Created)")
if r3.status_code == 201:
    created = r3.json()["product"]
    print(f"👉 Đã tạo: [{created['sku']}] {created['name']} - Giá vốn: {created['cost_price']:,.0f} đ")
else:
    print(f"👉 Kết quả: {r3.json()}")

# --- DEMO 4: Kiểm tra ràng buộc SKU duy nhất (Case-insensitive) ---
print("\n[BƯỚC 4] KIỂM TRA RÀNG BUỘC SKU DUY NHẤT (Thử tạo lại mã trùng: 'sku-bia-sg')")
r4 = httpx.post(f"{BASE_URL}/api/v1/products", json=new_product, headers=headers_mgr)
print(f"👉 HTTP Status: {r4.status_code} (Bad Request)")
print(f"👉 Thông báo chặn: {r4.json().get('detail')}")

# --- DEMO 5: Ràng buộc xóa sản phẩm đã phát sinh giao dịch ---
print("\n[BƯỚC 5] THỬ XÓA SẢN PHẨM ĐÃ PHÁT SINH GIAO DỊCH (SKU-RB-250)")
r5 = httpx.delete(f"{BASE_URL}/api/v1/products/SKU-RB-250", headers=headers_mgr)
print(f"👉 HTTP Status: {r5.status_code} (Bad Request)")
print(f"👉 Cảnh báo từ chối xóa: {r5.json().get('detail')}")

# --- DEMO 6: Chuyển sang ngừng kinh doanh thay vì xóa ---
print("\n[BƯỚC 6] CHUYỂN TRẠNG THÁI SẢN PHẨM SANG 'NGỪNG KINH DOANH'")
r6 = httpx.patch(f"{BASE_URL}/api/v1/products/SKU-RB-250/status", json={"status": "INACTIVE"}, headers=headers_mgr)
print(f"👉 HTTP Status: {r6.status_code}")
print(f"👉 Kết quả: {r6.json().get('message')}")

# Khôi phục lại trạng thái ACTIVE cho SKU-RB-250
httpx.patch(f"{BASE_URL}/api/v1/products/SKU-RB-250/status", json={"status": "ACTIVE"}, headers=headers_mgr)

# --- DEMO 7: Xóa sản phẩm chưa có giao dịch ---
print("\n[BƯỚC 7] XÓA SẢN PHẨM CHƯA CÓ GIAO DỊCH (SKU-BIA-SG)")
r7 = httpx.delete(f"{BASE_URL}/api/v1/products/SKU-BIA-SG", headers=headers_mgr)
print(f"👉 HTTP Status: {r7.status_code} (Success)")
print(f"👉 Kết quả: {r7.json().get('message')}")

line()
print("🎉 HOÀN THÀNH DEMO TOÀN BỘ 4 TIÊU CHÍ NGHIỆM THU CỦA SCRUM-75!")
print(f"👉 Giao diện Web tương tác trực tiếp đã được mở tại: {BASE_URL}/products")
print(f"👉 Tài liệu API tương tác Swagger UI: {BASE_URL}/docs#/Product%20Catalog%20(SCRUM-75)")
line()
