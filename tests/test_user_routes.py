from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from types import SimpleNamespace

from src.backend.security import require_admin
from src.user_routes import get_db, router


@pytest.fixture
def db_session_and_client():
    """Tạo database in-memory và FastAPI TestClient để kiểm thử user_routes."""
    test_app = FastAPI()
    test_app.include_router(router)

    # Sử dụng SQLite in-memory database với StaticPool để giữ nguyên bảng giữa các session
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    # Tạo bảng users và user_sessions tương tự schema MySQL
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
        # Thêm 2 user mẫu: ID 1 (sales01) và ID 2 (accountant01)
        conn.execute(text("INSERT INTO users (id, username, is_active) VALUES (1, 'sales01', 1);"))
        conn.execute(text("INSERT INTO users (id, username, is_active) VALUES (2, 'accountant01', 1);"))
        conn.execute(text("INSERT INTO user_sessions (id, user_id, revoked_at) VALUES (1, 1, NULL);"))
        conn.commit()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[require_admin] = lambda: SimpleNamespace(id=99)

    with TestClient(test_app) as client:
        yield client, engine


# =====================================================================
# 1. Test validation khi không có lý do hoặc lý do rỗng (Lỗi 400)
# =====================================================================
@pytest.mark.parametrize(
    "empty_reason",
    [
        "",
        "   ",
        "\t\n",
    ],
)
def test_lock_user_missing_or_blank_reason_returns_400(db_session_and_client, empty_reason):
    client, _ = db_session_and_client
    payload = {"user_id": "sales01", "reason": empty_reason}

    response = client.post("/api/users/lock", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "Vui lòng nhập lý do khóa tài khoản."


def test_lock_user_blank_user_id_returns_400(db_session_and_client):
    client, _ = db_session_and_client
    payload = {"user_id": "   ", "reason": "Có lý do hợp lệ"}

    response = client.post("/api/users/lock", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "Vui lòng cung cấp ID hoặc username người dùng."


# =====================================================================
# 2. Test khóa tài khoản thành công và xác nhận UPDATE is_active = False
# =====================================================================
def test_lock_user_success_updates_is_active_to_false(db_session_and_client):
    client, engine = db_session_and_client
    payload = {"user_id": "sales01", "reason": "Nhân viên nghỉ việc"}

    # Trước khi khóa: is_active = 1 (True)
    with engine.connect() as conn:
        status_before = conn.execute(text("SELECT is_active FROM users WHERE username = 'sales01'")).scalar()
        assert bool(status_before) is True

    # Gọi API khóa tài khoản
    response = client.post("/api/users/lock", json=payload)

    # Xác nhận response thành công và không bị 500
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "đã bị khóa" in data["message"]

    # Xác nhận trực tiếp trong Database: is_active đã được cập nhật thành False (0)
    with engine.connect() as conn:
        status_after = conn.execute(text("SELECT is_active FROM users WHERE username = 'sales01'")).scalar()
        assert bool(status_after) is False, f"Expected is_active=False, got {status_after}"

        # Xác nhận session của user cũng được thu hồi (revoked_at không còn NULL)
        revoked_at = conn.execute(text("SELECT revoked_at FROM user_sessions WHERE user_id = 1")).scalar()
        assert revoked_at is not None


def test_lock_user_by_numeric_id_string(db_session_and_client):
    client, engine = db_session_and_client
    payload = {"user_id": "2", "reason": "Khóa theo ID số"}

    response = client.post("/api/users/lock", json=payload)

    assert response.status_code == 200
    assert response.json()["success"] is True

    # Xác nhận is_active của user 2 trong DB thành False
    with engine.connect() as conn:
        status_after = conn.execute(text("SELECT is_active FROM users WHERE id = 2")).scalar()
        assert bool(status_after) is False


# =====================================================================
# 3. Test mở khóa tài khoản thành công và xác nhận UPDATE is_active = True
# =====================================================================
def test_unlock_user_success_updates_is_active_to_true(db_session_and_client):
    client, engine = db_session_and_client

    # Khóa user trước
    client.post("/api/users/lock", json={"user_id": "sales01", "reason": "Tạm khóa"})
    with engine.connect() as conn:
        assert bool(conn.execute(text("SELECT is_active FROM users WHERE username = 'sales01'")).scalar()) is False

    # Gọi API mở khóa tài khoản bằng username
    response = client.post("/api/users/unlock/sales01")

    # Xác nhận response thành công và không bị 500
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "đã được mở khóa" in data["message"]

    # Xác nhận trực tiếp trong Database: is_active đã được cập nhật thành True (1)
    with engine.connect() as conn:
        status_after = conn.execute(text("SELECT is_active FROM users WHERE username = 'sales01'")).scalar()
        assert bool(status_after) is True, f"Expected is_active=True, got {status_after}"


def test_unlock_user_by_numeric_id(db_session_and_client):
    client, engine = db_session_and_client

    # Khóa user 2 trước
    client.post("/api/users/lock", json={"user_id": "2", "reason": "Tạm khóa"})

    # Mở khóa bằng ID số "2"
    response = client.post("/api/users/unlock/2")

    assert response.status_code == 200
    assert response.json()["success"] is True

    with engine.connect() as conn:
        status_after = conn.execute(text("SELECT is_active FROM users WHERE id = 2")).scalar()
        assert bool(status_after) is True


# =====================================================================
# 4. Test khi tài khoản không tồn tại trong Database (Lỗi 404)
# =====================================================================
def test_lock_nonexistent_user_returns_404(db_session_and_client):
    client, _ = db_session_and_client
    payload = {"user_id": "nonexistent_user", "reason": "Lý do khóa"}

    response = client.post("/api/users/lock", json=payload)

    assert response.status_code == 404
    assert "Không tìm thấy người dùng" in response.json()["detail"]


def test_unlock_nonexistent_user_returns_404(db_session_and_client):
    client, _ = db_session_and_client

    response = client.post("/api/users/unlock/nonexistent_user")

    assert response.status_code == 404
    assert "Không tìm thấy người dùng" in response.json()["detail"]
