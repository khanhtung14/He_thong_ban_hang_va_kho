"""Automated integration tests for SCRUM-62: User Management Backend."""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.email_service import email_service
from src.backend.main import app
from src.backend.security import require_admin
from src.backend.models import (
    AccountAuditLog,
    AccountStatus,
    Base,
    Role,
    User,
    seed_default_roles,
)
from src.backend.users_service import (
    generate_temporary_password,
    verify_password,
)

# Use SQLite in-memory with StaticPool for fast, isolated, reliable testing
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="function")
def db_session():
    """Create fresh database tables for each test function."""
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    seed_default_roles(session)
    email_service.clear_sent_emails()
    email_service.set_simulate_failure(False)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_admin] = lambda: type(
        "AdminActor", (), {"id": 999, "roles": [type("Role", (), {"code": "ADMIN"})()]}
    )()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==============================================================================
# TEST SUITE 1: Create User & Password Security & Email Dispatch
# ==============================================================================

def test_create_user_success(client, db_session):
    """AC1: Create user with role Sales Rep, verify ACTIVE status, bcrypt hash, and activation email."""
    payload = {
        "username": "nguyenvana",
        "full_name": "Nguyễn Văn A",
        "email": "a.nguyen@company.com",
        "phone": "0912345678",
        "role": "Sales Rep",
    }

    response = client.post("/api/v1/admin/users", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()

    assert data["message"] == "Tạo tài khoản thành công và đã gửi email kích hoạt."
    assert data["email_sent"] is True

    user = data["user"]
    assert user["username"] == "nguyenvana"
    assert user["full_name"] == "Nguyễn Văn A"
    assert user["email"] == "a.nguyen@company.com"
    assert user["phone"] == "0912345678"
    assert user["status"] in ("PENDING_ACTIVATION", "ACTIVE")
    assert user.get("must_change_password") is True
    assert any(r["code"] == "SALES_REP" for r in user["roles"])

    # Security check: Password and hash must NOT be in the API response
    assert "password" not in user
    assert "password_hash" not in user
    assert "temp_password" not in user

    # Database verification
    db_user = db_session.query(User).filter(User.username == "nguyenvana").first()
    assert db_user is not None
    assert db_user.password_hash is not None
    assert db_user.password_hash.startswith("$2b$") or db_user.password_hash.startswith("$2a$")
    assert db_user.status in (AccountStatus.PENDING_ACTIVATION, AccountStatus.ACTIVE)
    assert db_user.must_change_password is True

    # Email verification
    sent = email_service.sent_emails
    assert len(sent) == 1
    assert sent[0]["to"] == "a.nguyen@company.com"
    assert sent[0]["username"] == "nguyenvana"
    temp_pass = sent[0]["temp_password"]
    assert len(temp_pass) >= 8

    # Password hash in DB must verify against the sent temporary password
    assert verify_password(temp_pass, db_user.password_hash) is True


def test_create_sales_rep_accepts_legacy_sales_role_code(client, db_session):
    """Existing demo DBs use SALES while the new user form sends SALES_REP."""
    sales_rep_role = db_session.query(Role).filter(Role.code == "SALES_REP").one()
    sales_rep_role.code = "SALES"
    db_session.commit()

    response = client.post(
        "/api/v1/admin/users",
        json={
            "username": "legacy_sales_user",
            "full_name": "Legacy Sales User",
            "email": "legacy.sales@example.com",
            "role": "SALES_REP",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["user"]["roles"][0]["code"] == "SALES"


def test_create_user_duplicate_username(client):
    """AC2: Reject duplicate username with specific error message."""
    client.post(
        "/api/v1/admin/users",
        json={
            "username": "duplicateman",
            "full_name": "User One",
            "email": "user1@company.com",
            "phone": "0901111111",
        }
    )

    # Try inserting same username with different email
    response = client.post(
        "/api/v1/admin/users",
        json={
            "username": "duplicateman",
            "full_name": "User Two",
            "email": "user2@company.com",
            "phone": "0902222222",
        }
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Tên đăng nhập" in detail or "đã tồn tại trong hệ thống" in detail


def test_create_user_duplicate_email(client):
    """AC2: Reject duplicate email with specific error message."""
    client.post(
        "/api/v1/admin/users",
        json={
            "username": "firstuser",
            "full_name": "First User",
            "email": "shared@company.com",
        }
    )

    response = client.post(
        "/api/v1/admin/users",
        json={
            "username": "seconduser",
            "full_name": "Second User",
            "email": "shared@company.com",
        }
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Email" in detail or "đã tồn tại trong hệ thống" in detail


def test_create_user_duplicate_phone(client):
    """AC2: Reject duplicate phone number."""
    client.post(
        "/api/v1/admin/users",
        json={
            "username": "phoneuser1",
            "full_name": "Phone User 1",
            "email": "phone1@company.com",
            "phone": "0987654321",
        }
    )

    response = client.post(
        "/api/v1/admin/users",
        json={
            "username": "phoneuser2",
            "full_name": "Phone User 2",
            "email": "phone2@company.com",
            "phone": "0987654321",
        }
    )
    assert response.status_code == 400
    assert "Số điện thoại đã tồn tại" in response.json()["detail"]


def test_create_user_invalid_input_validation(client):
    """Validate input data constraints: email format, phone format, empty names."""
    # Invalid email
    res1 = client.post(
        "/api/v1/admin/users",
        json={"username": "validname", "full_name": "Valid Name", "email": "invalid-email"}
    )
    assert res1.status_code == 422

    # Invalid phone (not 10 digits starting with 0)
    res2 = client.post(
        "/api/v1/admin/users",
        json={"username": "validname2", "full_name": "Valid Name", "email": "valid@email.com", "phone": "12345"}
    )
    assert res2.status_code == 422

    # Username with spaces or invalid characters
    res3 = client.post(
        "/api/v1/admin/users",
        json={"username": "invalid user", "full_name": "Valid Name", "email": "valid@email.com"}
    )
    assert res3.status_code == 422


# ==============================================================================
# TEST SUITE 2: Search, Filter & Pagination
# ==============================================================================

@pytest.fixture
def populate_sample_users(client):
    """Helper to populate diverse users for search, filter, and pagination tests."""
    users_data = [
        {"username": "salerep01", "full_name": "Nguyễn Văn Thịnh", "email": "thinh@company.com", "phone": "0912111111", "role": "Sales Rep", "status": "ACTIVE"},
        {"username": "salerep02", "full_name": "Trần Thị Lan", "email": "lan@company.com", "phone": "0912222222", "role": "Sales Rep", "status": "ACTIVE"},
        {"username": "wh01", "full_name": "Lê Văn Kho", "email": "kho@company.com", "phone": "0988333333", "role": "Warehouse", "status": "ACTIVE"},
        {"username": "wh02", "full_name": "Phạm Quốc Thủ", "email": "thu@company.com", "phone": "0988444444", "role": "Warehouse", "status": "LOCKED"},
        {"username": "admin01", "full_name": "Admin Tổng", "email": "admin@company.com", "phone": "0900555555", "role": "Admin", "status": "ACTIVE"},
        {"username": "acc01", "full_name": "Đặng Kế Toán", "email": "ketoan@company.com", "phone": "0977666666", "role": "Accountant", "status": "DISABLED"},
    ]
    for u in users_data:
        client.post("/api/v1/admin/users", json=u)


def test_search_by_name(client, populate_sample_users):
    """AC3: Search users by full name (case-insensitive partial match)."""
    res = client.get("/api/v1/admin/users?search=Thịnh")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "salerep01"


def test_search_by_username(client, populate_sample_users):
    """AC3: Search users by username."""
    res = client.get("/api/v1/admin/users?search=admin01")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["full_name"] == "Admin Tổng"


def test_search_by_phone(client, populate_sample_users):
    """AC3: Search users by phone number fragment (e.g. '0912' per BDD scenario)."""
    res = client.get("/api/v1/admin/users?search=0912")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    usernames = {u["username"] for u in data["items"]}
    assert usernames == {"salerep01", "salerep02"}


def test_filter_by_role(client, populate_sample_users):
    """AC3: Filter users by role (e.g. 'Warehouse')."""
    res = client.get("/api/v1/admin/users?role=Warehouse")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    for u in data["items"]:
        assert any(r["code"] == "WAREHOUSE" for r in u["roles"])


def test_filter_by_status(client, populate_sample_users):
    """AC3: Filter users by status (e.g. 'LOCKED')."""
    res = client.get("/api/v1/admin/users?status=LOCKED")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "wh02"
    assert data["items"][0]["status"] == "LOCKED"


def test_multi_criteria_filter(client, populate_sample_users):
    """AC3: Combine role filter and status filter."""
    res = client.get("/api/v1/admin/users?role=Warehouse&status=ACTIVE")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "wh01"


def test_pagination_default_20(client):
    """AC4: Default pagination is 20 rows per page."""
    # Seed 25 users
    for i in range(1, 26):
        client.post(
            "/api/v1/admin/users",
            json={
                "username": f"user_page_{i:02d}",
                "full_name": f"User Page {i}",
                "email": f"user{i}@company.com",
            }
        )

    # Page 1 without specifying page_size (should default to 20)
    res_p1 = client.get("/api/v1/admin/users")
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()

    assert data_p1["total"] == 25
    assert data_p1["page"] == 1
    assert data_p1["page_size"] == 20
    assert data_p1["total_pages"] == 2
    assert len(data_p1["items"]) == 20

    # Page 2
    res_p2 = client.get("/api/v1/admin/users?page=2")
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()

    assert data_p2["page"] == 2
    assert len(data_p2["items"]) == 5


# ==============================================================================
# TEST SUITE 3: Update User & Single User Detail
# ==============================================================================

def test_get_user_detail_success_and_not_found(client):
    """Get single user by ID and 404 when not found."""
    create_res = client.post(
        "/api/v1/admin/users",
        json={
            "username": "targetuser",
            "full_name": "Target User",
            "email": "target@company.com",
            "phone": "0911223344",
        }
    )
    user_id = create_res.json()["user"]["id"]

    # Success
    res = client.get(f"/api/v1/admin/users/{user_id}")
    assert res.status_code == 200
    assert res.json()["username"] == "targetuser"

    # Not found
    res_404 = client.get("/api/v1/admin/users/99999")
    assert res_404.status_code == 404
    assert "Không tìm thấy người dùng" in res_404.json()["detail"]


def test_update_user_success(client):
    """Edit user fields: full_name, email, phone, role, status."""
    create_res = client.post(
        "/api/v1/admin/users",
        json={
            "username": "editableuser",
            "full_name": "Tên Cũ",
            "email": "oldemail@company.com",
            "phone": "0912000000",
            "role": "Sales Rep",
            "status": "ACTIVE",
        }
    )
    user_id = create_res.json()["user"]["id"]

    update_payload = {
        "full_name": "Tên Mới Sau Cập Nhật",
        "email": "newemail@company.com",
        "phone": "0912999999",
        "role": "Sales Manager",
        "status": "LOCKED",
    }
    update_res = client.put(f"/api/v1/admin/users/{user_id}", json=update_payload)
    assert update_res.status_code == 200
    updated_data = update_res.json()

    assert updated_data["full_name"] == "Tên Mới Sau Cập Nhật"
    assert updated_data["email"] == "newemail@company.com"
    assert updated_data["phone"] == "0912999999"
    assert updated_data["status"] == "LOCKED"
    assert any(r["code"] == "SALES_MANAGER" for r in updated_data["roles"])


def test_update_user_duplicate_email_conflict(client):
    """Prevent updating email to another existing user's email."""
    client.post(
        "/api/v1/admin/users",
        json={"username": "useralpha", "full_name": "Alpha", "email": "alpha@company.com"}
    )
    res_b = client.post(
        "/api/v1/admin/users",
        json={"username": "userbeta", "full_name": "Beta", "email": "beta@company.com"}
    )
    beta_id = res_b.json()["user"]["id"]

    # Try updating Beta's email to Alpha's email
    conflict_res = client.put(f"/api/v1/admin/users/{beta_id}", json={"email": "alpha@company.com"})
    assert conflict_res.status_code == 400
    assert "Email đã tồn tại" in conflict_res.json()["detail"]


# ==============================================================================
# TEST SUITE 4: Authorization & Security
# ==============================================================================

def test_authorization_role_header_cannot_override_authenticated_admin(client):
    """An untrusted role header cannot change the server-authenticated identity."""
    headers = {"X-User-Role": "SALES_REP"}

    # List endpoint
    res_list = client.get("/api/v1/admin/users", headers=headers)
    assert res_list.status_code == 200

    # Create endpoint
    res_create = client.post(
        "/api/v1/admin/users",
        json={"username": "testauth", "full_name": "Auth Test", "email": "auth@company.com"},
        headers=headers
    )
    assert res_create.status_code == 201

    # Update endpoint
    res_update = client.put("/api/v1/admin/users/1", json={"full_name": "Hack"}, headers=headers)
    assert res_update.status_code in (200, 404)


def test_authorization_admin_allowed(client):
    """An authenticated admin can access user management."""
    headers = {"X-User-Role": "ADMIN"}
    res = client.get("/api/v1/admin/users", headers=headers)
    assert res.status_code == 200


def test_role_header_cannot_authenticate_unauthenticated_request(client):
    app.dependency_overrides.pop(require_admin, None)
    for headers in ({}, {"X-User-Role": "ADMIN"}, {"X-User-Role": "SALES_REP"}):
        response = client.get("/api/v1/admin/users", headers=headers)
        assert response.status_code == 401


def test_temporary_password_strength():
    """Verify that generated temporary password meets complexity requirements."""
    for _ in range(20):
        pw = generate_temporary_password(12)
        assert len(pw) == 12
        assert any(c.isupper() for c in pw), f"Missing uppercase in {pw}"
        assert any(c.islower() for c in pw), f"Missing lowercase in {pw}"
        assert any(c.isdigit() for c in pw), f"Missing digit in {pw}"
        assert any(c in "!@#$%^&*()_+" for c in pw), f"Missing symbol in {pw}"


def test_email_service_failure_resilience(client):
    """Verify system resilience when email service fails: user created, returns email_sent=False without 500 error."""
    email_service.set_simulate_failure(True)

    payload = {
        "username": "mailfailuser",
        "full_name": "Mail Failure Test",
        "email": "fail@company.com",
    }
    res = client.post("/api/v1/admin/users", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["email_sent"] is False
    assert data["user"]["username"] == "mailfailuser"


# ==============================================================================
# TEST SUITE 5: Extended Acceptance Tests for Subtasks SCRUM-99 to SCRUM-106
# ==============================================================================

def test_audit_log_recorded_on_create_and_update(client, db_session):
    """SCRUM-106: Audit log for user creation and modification."""
    # 1. Create user with actor header
    headers = {"X-User-Role": "ADMIN", "X-Actor-Id": "10"}
    create_res = client.post(
        "/api/v1/admin/users",
        json={
            "username": "audituser",
            "full_name": "Audit User",
            "email": "audit@company.com",
            "phone": "0911000111",
        },
        headers=headers
    )
    assert create_res.status_code == 201
    user_id = create_res.json()["user"]["id"]

    # Verify CREATE_USER audit log in database
    create_log = (
        db_session.query(AccountAuditLog)
        .filter(AccountAuditLog.user_id == user_id, AccountAuditLog.action == "CREATE_USER")
        .first()
    )
    assert create_log is not None
    assert create_log.actor_user_id == 10
    assert "audituser" in create_log.reason

    # 2. Lock user (SCRUM-103 & SCRUM-106)
    lock_res = client.put(
        f"/api/v1/admin/users/{user_id}",
        json={"status": "LOCKED"},
        headers=headers
    )
    assert lock_res.status_code == 200
    assert lock_res.json()["status"] == "LOCKED"

    # Verify LOCK_USER audit log in database
    lock_log = (
        db_session.query(AccountAuditLog)
        .filter(AccountAuditLog.user_id == user_id, AccountAuditLog.action == "LOCK_USER")
        .first()
    )
    assert lock_log is not None
    assert lock_log.actor_user_id == 10

    # 3. Unlock user (SCRUM-103 & SCRUM-106)
    unlock_res = client.put(
        f"/api/v1/admin/users/{user_id}",
        json={"status": "ACTIVE"},
        headers=headers
    )
    assert unlock_res.status_code == 200
    assert unlock_res.json()["status"] == "ACTIVE"

    unlock_log = (
        db_session.query(AccountAuditLog)
        .filter(AccountAuditLog.user_id == user_id, AccountAuditLog.action == "UNLOCK_USER")
        .first()
    )
    assert unlock_log is not None


def test_email_activation_link_with_expiring_token(client):
    """SCRUM-101: Email contains activation link with expiring token."""
    email_service.clear_sent_emails()
    email_service.set_simulate_failure(False)

    payload = {
        "username": "tokenuser",
        "full_name": "Token User",
        "email": "token@company.com",
    }
    res = client.post("/api/v1/admin/users", json=payload)
    assert res.status_code == 201

    assert len(email_service.sent_emails) == 1
    sent = email_service.sent_emails[0]
    assert sent["activation_token"] is not None
    assert len(sent["activation_token"]) >= 20
    assert "action=activate&token=" in sent["activation_url"]
    assert "24 giờ" in sent["text"]
    assert "24" in sent["html"]


def test_email_retry_mechanism_on_failure(client):
    """SCRUM-101: Test retry mechanism is invoked upon email dispatch failure."""
    email_service.clear_sent_emails()
    email_service.set_simulate_failure(True)

    payload = {
        "username": "retryuser",
        "full_name": "Retry User",
        "email": "retry@company.com",
    }
    res = client.post("/api/v1/admin/users", json=payload)
    assert res.status_code == 201
    assert res.json()["email_sent"] is False
    # Verify retry count reached 3 attempts
    assert email_service.last_retry_count == 3


def test_pagination_supports_size_alias_parameter(client):
    """SCRUM-105: Supports both page and size parameters."""
    for i in range(1, 15):
        client.post(
            "/api/v1/admin/users",
            json={
                "username": f"sizeuser_{i:02d}",
                "full_name": f"Size User {i}",
                "email": f"size{i}@company.com",
            }
        )

    res = client.get("/api/v1/admin/users?page=1&size=5")
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 5
    assert len(data["items"]) == 5
    assert data["total"] >= 14


def test_direct_users_endpoint_routing(client):
    """SCRUM-99: Endpoints accessible directly via /users."""
    # POST /users
    create_res = client.post(
        "/users",
        json={
            "username": "directuser",
            "full_name": "Direct User",
            "email": "direct@company.com",
            "phone": "0933445566",
        }
    )
    assert create_res.status_code == 201
    user_id = create_res.json()["user"]["id"]

    # GET /users
    get_res = client.get("/users?search=directuser")
    assert get_res.status_code == 200
    assert get_res.json()["total"] == 1

    # GET /users/{id}
    detail_res = client.get(f"/users/{user_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["username"] == "directuser"

    # PUT /users/{id}
    put_res = client.put(f"/users/{user_id}", json={"full_name": "Direct Updated"})
    assert put_res.status_code == 200
    assert put_res.json()["full_name"] == "Direct Updated"
