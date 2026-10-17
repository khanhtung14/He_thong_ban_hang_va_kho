"""
Script đồng bộ dữ liệu giữa bảng users và customers:
Quét tất cả tài khoản trong bảng users có vai trò Đại lý (CUSTOMER / DEALER)
nhưng chưa có bản ghi trong bảng customers, tự động INSERT bản ghi tương ứng
để hiển thị đầy đủ trên trang Đại lý & Phân công Địa bàn (/manager/customers).
"""
import sys
import os

# Đảm bảo đường dẫn import app và encoding utf-8
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.core.database import SessionLocal, engine, inspect, text
from app.models.models import User, Customer
from app.services.customer_sync_service import (
    is_dealer_user,
    ensure_customer_profile_for_user,
    sync_all_dealer_users,
)


def run_sync():
    print("=" * 60)
    print("BẮT ĐẦU ĐỒNG BỘ TÀI KHOẢN ĐẠI LÝ (USERS -> CUSTOMERS)...")
    print("=" * 60)

    # 1. Đảm bảo cột user_id đã tồn tại trong bảng customers
    inspector = inspect(engine)
    if inspector.has_table("customers"):
        cols = {c["name"] for c in inspector.get_columns("customers")}
        if "user_id" not in cols:
            print("-> Thêm cột 'user_id' vào bảng customers...")
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE customers ADD COLUMN user_id INTEGER"))
            print("-> Đã thêm cột 'user_id' thành công.")

    # 2. Quét và đồng bộ
    with SessionLocal() as db:
        users = db.query(User).all()
        dealer_users = [u for u in users if is_dealer_user(u)]
        print(f"-> Tìm thấy tổng cộng {len(dealer_users)} tài khoản có vai trò Đại lý.")

        created_count = 0
        linked_count = 0
        already_synced_count = 0

        for u in dealer_users:
            # Kiểm tra xem user này đã liên kết với customer nào chưa
            existing = db.query(Customer).filter(Customer.user_id == u.id).first()
            if existing:
                already_synced_count += 1
                print(f"   [ĐÃ CÓ] User #{u.id} ({u.username} - {u.full_name}) -> Customer #{existing.id} ({existing.code})")
                continue

            # Thực hiện liên kết hoặc tạo mới
            customer = ensure_customer_profile_for_user(db, u)
            if customer:
                # Kiểm tra vừa tạo mới hay liên kết
                if customer.name == (u.full_name or u.username):
                    created_count += 1
                    print(f"   [TẠO MỚI] User #{u.id} ({u.username} - {u.full_name}) -> Đã tạo Customer #{customer.id} (Mã: {customer.code}, NVKD: Chưa phân công, Khu vực: {customer.region})")
                else:
                    linked_count += 1
                    print(f"   [LIÊN KẾT] User #{u.id} ({u.username}) -> Đã liên kết với Customer #{customer.id} ({customer.code})")

        print("=" * 60)
        print("KẾT QUẢ ĐỒNG BỘ:")
        print(f"- Đã đồng bộ từ trước: {already_synced_count}")
        print(f"- Hồ sơ vừa tạo mới:  {created_count}")
        print(f"- Hồ sơ vừa liên kết: {linked_count}")
        print("HOÀN THÀNH ĐỒNG BỘ THÀNH CÔNG!")
        print("=" * 60)


if __name__ == "__main__":
    run_sync()
