"""Kịch bản kiểm tra trực tiếp 2 API lock_user và unlock_user trong src/user_routes.py.
Thực hiện các kịch bản:
1. Gửi request khóa user KHÔNG CÓ lý do -> Kiểm tra validation lỗi 400.
2. Gửi request khóa user CÓ lý do -> Kiểm tra thành công 200 và UPDATE is_active = False.
3. Gửi request mở khóa user -> Kiểm tra thành công 200 và UPDATE is_active = True.
4. Gửi request với user không tồn tại -> Kiểm tra lỗi 404.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Thêm thư mục gốc của dự án vào sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.user_routes import get_db, router

# 1. Khởi tạo ứng dụng FastAPI và gán router
app = FastAPI(title="OMS Lock/Unlock Test App")
app.include_router(router)

# 2. Khởi tạo database in-memory giả lập bảng users MySQL
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

with engine.connect() as conn:
    conn.execute(
        text(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(100) NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT 1
            );
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                revoked_at DATETIME
            );
            """
        )
    )
    conn.execute(text("INSERT INTO users (id, username, is_active) VALUES (1, 'sales01', 1);"))
    conn.execute(text("INSERT INTO user_sessions (id, user_id, revoked_at) VALUES (1, 1, NULL);"))
    conn.commit()


def override_get_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def get_user_db_status(username: str):
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, username, is_active FROM users WHERE username = :uname"),
            {"uname": username},
        ).fetchone()
        return {"id": row[0], "username": row[1], "is_active": bool(row[2])} if row else None


def print_step(title: str):
    print("\n" + "=" * 70)
    print(f">> {title}")
    print("=" * 70)


def main():
    print("BẮT ĐẦU CHẠY KIỂM THỬ API KHÓA VÀ MỞ KHÓA TÀI KHOẢN")
    initial_user = get_user_db_status("sales01")
    print(f"Trạng thái ban đầu trong Database: {initial_user}")

    # =========================================================================
    # Test 1: Khóa tài khoản KHÔNG có reason (Validation 400)
    # =========================================================================
    print_step("TEST 1: Gửi request khóa user KHÔNG có lý do (reason='')")
    req1 = {"user_id": "sales01", "reason": ""}
    print(f"Payload gửi đi: {json.dumps(req1, ensure_ascii=False)}")
    res1 = client.post("/api/users/lock", json=req1)
    print(f"HTTP Status Code: {res1.status_code}")
    print(f"Phản hồi từ server: {res1.text}")
    assert res1.status_code == 400, f"Mong đợi 400, nhưng nhận {res1.status_code}"
    print("=> KẾT QUẢ: Đã bắt đúng lỗi 400 Bad Request khi thiếu lý do khóa.")

    # =========================================================================
    # Test 2: Khóa tài khoản CÓ lý do hợp lệ (Success 200 & UPDATE is_active = False)
    # =========================================================================
    print_step("TEST 2: Gửi request khóa user CÓ lý do ('Nhân viên nghỉ việc')")
    req2 = {"user_id": "sales01", "reason": "Nhân viên nghỉ việc"}
    print(f"Payload gửi đi: {json.dumps(req2, ensure_ascii=False)}")
    res2 = client.post("/api/users/lock", json=req2)
    print(f"HTTP Status Code: {res2.status_code}")
    print(f"Phản hồi từ server: {res2.text}")
    assert res2.status_code == 200, f"Mong đợi 200, nhưng nhận {res2.status_code}"

    # Kiểm tra trực tiếp Database
    user_after_lock = get_user_db_status("sales01")
    print(f"Trạng thái trong Database sau khi khóa: {user_after_lock}")
    assert user_after_lock["is_active"] is False, "is_active phải là False!"
    print("=> KẾT QUẢ: API trả về 200, SQL UPDATE thành công cột is_active = False, KHÔNG có lỗi 500.")

    # =========================================================================
    # Test 3: Mở khóa tài khoản (Success 200 & UPDATE is_active = True)
    # =========================================================================
    print_step("TEST 3: Gửi request mở khóa user ('sales01')")
    res3 = client.post("/api/users/unlock/sales01")
    print(f"HTTP Status Code: {res3.status_code}")
    print(f"Phản hồi từ server: {res3.text}")
    assert res3.status_code == 200, f"Mong đợi 200, nhưng nhận {res3.status_code}"

    # Kiểm tra trực tiếp Database
    user_after_unlock = get_user_db_status("sales01")
    print(f"Trạng thái trong Database sau khi mở khóa: {user_after_unlock}")
    assert user_after_unlock["is_active"] is True, "is_active phải là True!"
    print("=> KẾT QUẢ: API trả về 200, SQL UPDATE thành công cột is_active = True, KHÔNG có lỗi 500.")

    # =========================================================================
    # Test 4: Khóa/Mở khóa với user_id không tồn tại (404 Not Found)
    # =========================================================================
    print_step("TEST 4: Gửi request với user_id không tồn tại ('unknown_user')")
    res4 = client.post("/api/users/lock", json={"user_id": "unknown_user", "reason": "Lý do bất kỳ"})
    print(f"Khóa user không tồn tại -> Status: {res4.status_code}, Detail: {res4.text}")
    assert res4.status_code == 404

    res5 = client.post("/api/users/unlock/unknown_user")
    print(f"Mở khóa user không tồn tại -> Status: {res5.status_code}, Detail: {res5.text}")
    assert res5.status_code == 404
    print("=> KẾT QUẢ: Đã xử lý đúng lỗi 404 khi không tìm thấy người dùng.")

    print("\n" + "=" * 70)
    print("HOÀN TẤT TẤT CẢ CÁC BÀI TEST - TẤT CẢ KỊCH BẢN ĐỀU ĐẠT CHUẨN!")
    print("=" * 70)


if __name__ == "__main__":
    main()
