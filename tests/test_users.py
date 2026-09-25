import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from src.backend.change_password import reset_fake_user
from src.backend.config import DEFAULT_ROLES
from src.backend.database import get_db, init_db
from src.backend.email_service import email_service
from src.backend.main import app
from src.backend.models import Base, Role, User
from src.backend.security import generate_temporary_password, hash_password, verify_password

# Use an in-memory SQLite database with StaticPool so all connections share the same memory DB
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_database():
    """Setup and teardown in-memory database for each test run"""
    email_service.clear()
    reset_fake_user()
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    # Seed roles
    for r in DEFAULT_ROLES:
        db.add(Role(code=r["code"], name=r["name"], description=r["description"]))
    db.commit()

    test_pwd_hash = hash_password("Password123@")

    # Seed 25 users to test pagination (default 20 items/page)
    for i in range(1, 26):
        if i <= 19:
            role = "SALES"
        elif i <= 22:
            role = "SALES_MANAGER"
        elif i <= 24:
            role = "WAREHOUSE"
        else:
            role = "ADMIN"

        status = "ACTIVE" if i % 3 != 0 else "PENDING_ACTIVATION"
        if i == 10:
            status = "LOCKED"
        if i == 25:
            status = "ACTIVE"

        user = User(
            username=f"user_{i:02d}",
            full_name=f"Nguyễn Nhân Viên {i:02d}",
            email=f"user{i:02d}@congty.vn",
            phone=f"09800000{i:02d}",
            role_code=role,
            status=status,
            password_hash=test_pwd_hash,
            is_temporary_password=False,
            email_sent=True
        )
        db.add(user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    email_service.clear()


# ==============================================================
# TESTS FOR US-001: Xem danh sách, tìm kiếm & phân trang
# ==============================================================

def test_us001_ac1_default_pagination_20_rows():
    """AC1: Danh sách phân trang, mặc định 20 dòng trên một trang"""
    response = client.get("/api/v1/users")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 25
    assert data["page"] == 1
    assert data["page_size"] == 20
    assert data["total_pages"] == 2
    assert len(data["items"]) == 20

    # Trang 2 hiển thị 5 bản ghi còn lại
    response_p2 = client.get("/api/v1/users?page=2")
    assert response_p2.status_code == 200
    data_p2 = response_p2.json()
    assert data_p2["page"] == 2
    assert len(data_p2["items"]) == 5


def test_us001_ac2_search_by_name():
    """AC2: Tìm kiếm theo Họ tên (không phân biệt hoa thường)"""
    response = client.get("/api/v1/users?search=Viên 05")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any("Viên 05" in u["full_name"] for u in data["items"])


def test_us001_ac2_search_by_username():
    """AC2: Tìm kiếm theo Tên tài khoản (Username)"""
    response = client.get("/api/v1/users?search=user_07")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "user_07"


def test_us001_ac2_search_by_phone():
    """AC2: Tìm kiếm theo Số điện thoại"""
    response = client.get("/api/v1/users?search=0980000012")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["phone"] == "0980000012"


def test_us001_ac3_filter_by_role():
    """AC3: Lọc theo vai trò (Role)"""
    response = client.get("/api/v1/users?role=WAREHOUSE")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert all(u["role_code"] == "WAREHOUSE" for u in data["items"])


def test_us001_ac3_filter_by_status():
    """AC3: Lọc theo trạng thái (Status)"""
    response = client.get("/api/v1/users?status=LOCKED")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["username"] == "user_10"
    assert data["items"][0]["status"] == "LOCKED"


def test_us001_ac4_combined_search_and_filters():
    """AC4: Kết hợp cả Tìm kiếm và Bộ lọc"""
    response = client.get("/api/v1/users?search=Viên 03&role=SALES&status=PENDING_ACTIVATION")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    user = data["items"][0]
    assert user["username"] == "user_03"
    assert user["role_code"] == "SALES"
    assert user["status"] == "PENDING_ACTIVATION"


def test_us001_ac5_empty_state_when_no_results():
    """AC5: Không có kết quả tìm kiếm (Empty State)"""
    response = client.get("/api/v1/users?search=KhongTonTai999999")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0
    assert data["total_pages"] == 1


# ==============================================================
# TESTS FOR US-002: Tạo mới tài khoản & Gửi email kích hoạt
# ==============================================================

def test_us002_ac1_reject_duplicate_username():
    """AC1: Từ chối tạo khi trùng Tên tài khoản kèm thông báo cụ thể"""
    payload = {
        "username": "user_01", # Đã tồn tại
        "full_name": "Trần Văn Mới",
        "email": "tranvanmoi@congty.vn",
        "phone": "0981999999",
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 409
    data = response.json()
    assert "field_errors" in data["detail"]
    assert "Tên tài khoản đã tồn tại" in data["detail"]["field_errors"]["username"]


def test_us002_ac1_reject_duplicate_email():
    """AC1: Từ chối tạo khi trùng Email kèm thông báo cụ thể"""
    payload = {
        "username": "user_new_01",
        "full_name": "Trần Văn Mới",
        "email": "user01@congty.vn", # Đã tồn tại
        "phone": "0981999999",
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 409
    data = response.json()
    assert "field_errors" in data["detail"]
    assert "Địa chỉ email này đã được sử dụng" in data["detail"]["field_errors"]["email"]


def test_us002_ac1_reject_duplicate_phone():
    """AC1: Từ chối tạo khi trùng Số điện thoại kèm thông báo cụ thể"""
    payload = {
        "username": "user_new_02",
        "full_name": "Trần Văn Mới",
        "email": "tranvanmoi2@congty.vn",
        "phone": "0980000001", # Đã tồn tại
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 409
    data = response.json()
    assert "field_errors" in data["detail"]
    assert "Số điện thoại này đã được đăng ký" in data["detail"]["field_errors"]["phone"]


def test_us002_ac2_and_ac3_create_user_and_send_email():
    """AC2 & AC3: Tạo tài khoản thành công, tự sinh mật khẩu tạm & gửi email kích hoạt"""
    payload = {
        "username": "sales_new_hn",
        "full_name": "Lê Văn Tiến",
        "email": "tien.lv@congty.vn",
        "phone": "0989123456",
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert data["email_sent"] is True
    assert "Tạo tài khoản thành công" in data["message"]
    user_data = data["user"]
    assert user_data["username"] == "sales_new_hn"
    assert user_data["is_temporary_password"] is True
    assert user_data["email_sent"] is True

    # Kiểm tra mật khẩu tạm được sinh ra
    temp_password = data["temp_password"]
    assert len(temp_password) >= 8
    assert any(c.isupper() for c in temp_password)
    assert any(c.islower() for c in temp_password)
    assert any(c.isdigit() for c in temp_password)

    # Kiểm tra email được gửi đi
    sent_emails = email_service.get_sent_emails(email="tien.lv@congty.vn")
    assert len(sent_emails) == 1
    sent_email = sent_emails[0]
    assert sent_email["username"] == "sales_new_hn"
    assert sent_email["temp_password"] == temp_password
    assert "kích hoạt tài khoản" in sent_email["subject"].lower()


def test_us002_ac4_email_failure_and_resend():
    """AC4: Xử lý lỗi khi dịch vụ email gặp sự cố & hỗ trợ gửi lại email kích hoạt"""
    # 1. Giả lập dịch vụ email bị lỗi
    email_service.set_simulate_failure(True)

    payload = {
        "username": "sales_offline",
        "full_name": "Vũ Đình Trọng",
        "email": "trong.vd@congty.vn",
        "phone": "0987654321",
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    data = response.json()

    # Tài khoản vẫn được tạo trong DB nhưng ghi nhận gửi mail thất bại
    assert data["email_sent"] is False
    assert "gửi email kích hoạt thất bại" in data["message"]
    user_id = data["user"]["id"]

    # 2. Khôi phục dịch vụ email và gửi lại
    email_service.set_simulate_failure(False)
    resend_resp = client.post(f"/api/v1/users/{user_id}/resend-activation")
    assert resend_resp.status_code == 200
    resend_data = resend_resp.json()
    assert resend_data["email_sent"] is True

    # Xác nhận email đã được gửi thành công
    sent_emails = email_service.get_sent_emails(email="trong.vd@congty.vn")
    assert len(sent_emails) == 1
    assert sent_emails[0]["username"] == "sales_offline"


# ==============================================================
# TESTS FOR US-003: Cập nhật thông tin tài khoản người dùng
# ==============================================================

def test_us003_ac1_load_user_for_edit():
    """AC1: Tải dữ liệu người dùng lên form chỉnh sửa"""
    response = client.get("/api/v1/users/1")
    assert response.status_code == 200
    user = response.json()
    assert user["id"] == 1
    assert user["username"] == "user_01"
    assert user["email"] == "user01@congty.vn"
    assert user["phone"] == "0980000001"


def test_us003_ac2_and_ac3_update_user_success():
    """AC2 & AC3: Cập nhật thông tin thành công, giữ nguyên username"""
    update_payload = {
        "full_name": "Nguyễn Nhân Viên 01 Đã Sửa",
        "email": "user01_updated@congty.vn",
        "phone": "0980000099",
        "role_code": "SALES_MANAGER",
        "status": "ACTIVE"
    }
    response = client.put("/api/v1/users/1", json=update_payload)
    assert response.status_code == 200
    updated_user = response.json()

    # Username không thay đổi
    assert updated_user["username"] == "user_01"
    assert updated_user["full_name"] == "Nguyễn Nhân Viên 01 Đã Sửa"
    assert updated_user["email"] == "user01_updated@congty.vn"
    assert updated_user["phone"] == "0980000099"
    assert updated_user["role_code"] == "SALES_MANAGER"


def test_us003_ac3_update_reject_duplicate_email_from_other_user():
    """AC3: Từ chối cập nhật khi email trùng với user khác"""
    # Thử sửa user 1 lấy email của user 2
    update_payload = {
        "full_name": "Nguyễn Nhân Viên 01",
        "email": "user02@congty.vn", # Thuộc user_02
        "phone": "0980000001",
        "role_code": "SALES",
        "status": "ACTIVE"
    }
    response = client.put("/api/v1/users/1", json=update_payload)
    assert response.status_code == 409
    data = response.json()
    assert "Địa chỉ email này đã được sử dụng" in data["detail"]["field_errors"]["email"]


def test_us003_ac3_update_allow_keeping_own_email_and_phone():
    """AC3: Cho phép giữ nguyên email và số điện thoại của chính mình"""
    update_payload = {
        "full_name": "Nguyễn Nhân Viên 01 Tên Mới",
        "email": "user01@congty.vn", # Email của chính user 1
        "phone": "0980000001",       # Phone của chính user 1
        "role_code": "SALES",
        "status": "ACTIVE"
    }
    response = client.put("/api/v1/users/1", json=update_payload)
    assert response.status_code == 200
    assert response.json()["full_name"] == "Nguyễn Nhân Viên 01 Tên Mới"


# ==============================================================
# INTEGRATION TESTS: Workflow Đăng nhập & Đổi mật khẩu
# ==============================================================

def test_integration_new_user_can_change_password():
    """
    Test tích hợp: Tạo user mới -> Lấy mật khẩu tạm -> Đổi mật khẩu thành công bằng API /change-password
    """
    # 1. Tạo user mới
    payload = {
        "username": "sales_hoang",
        "full_name": "Hoàng Văn Nam",
        "email": "nam.hv@congty.vn",
        "phone": "0983456789",
        "role_code": "SALES",
        "status": "PENDING_ACTIVATION"
    }
    create_resp = client.post("/api/v1/users", json=payload)
    assert create_resp.status_code == 201
    temp_password = create_resp.json()["temp_password"]

    # 2. Đổi mật khẩu bằng mật khẩu tạm
    change_payload = {
        "username": "sales_hoang",
        "current_password": temp_password,
        "new_password": "NewSecurePassword123@"
    }
    change_resp = client.post("/change-password", json=change_payload)
    assert change_resp.status_code == 200
    assert change_resp.json()["message"] == "Đổi mật khẩu thành công"

    # 3. Kiểm tra user không còn đánh dấu là mật khẩu tạm
    detail_resp = client.get(f"/api/v1/users/{create_resp.json()['user']['id']}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["is_temporary_password"] is False


def test_legacy_change_password_regression():
    """Kiểm tra chức năng đổi mật khẩu cũ của đồng đội vẫn hoạt động bình thường (không regression)"""
    resp = client.post("/change-password", json={
        "current_password": "Oldpass123",
        "new_password": "BrandNewPass456@"
    })
    assert resp.status_code == 200
    assert resp.json()["message"] == "Đổi mật khẩu thành công"


def test_change_password_locked_user_forbidden():
    """Tài khoản bị khóa (LOCKED) không được phép đổi mật khẩu (HTTP 403)"""
    resp = client.post("/change-password", json={
        "username": "user_10", # user_10 có status = LOCKED trong setup
        "current_password": "SomePassword123@",
        "new_password": "NewValidPassword123@"
    })
    assert resp.status_code == 403
    assert "bị khóa" in resp.json()["detail"].lower()


def test_change_password_validation_edge_cases():
    """Kiểm tra các trường hợp validation của API đổi mật khẩu"""
    # 1. Sai mật khẩu hiện tại
    resp1 = client.post("/change-password", json={
        "current_password": "WrongPassword999@",
        "new_password": "NewValidPassword123@"
    })
    assert resp1.status_code == 400
    assert "không đúng" in resp1.json()["detail"]

    # 2. Mật khẩu mới trùng mật khẩu hiện tại
    resp2 = client.post("/change-password", json={
        "current_password": "Oldpass123",
        "new_password": "Oldpass123"
    })
    assert resp2.status_code == 400
    assert "không được giống" in resp2.json()["detail"]

    # 3. Mật khẩu mới quá ngắn (<8 ký tự)
    resp3 = client.post("/change-password", json={
        "current_password": "Oldpass123",
        "new_password": "Abc1"
    })
    assert resp3.status_code == 400
    assert "ít nhất 8 ký tự" in resp3.json()["detail"]

    # 4. Mật khẩu mới quá dài (>72 ký tự)
    resp4 = client.post("/change-password", json={
        "current_password": "Oldpass123",
        "new_password": "A" * 75 + "1"
    })
    assert resp4.status_code == 400
    assert "quá 72 ký tự" in resp4.json()["detail"]


# ==============================================================
# TESTS FOR S1-01 & S1-02: Authentication & Session Management
# ==============================================================

def test_auth_login_success():
    """S1-01: Đăng nhập thành công trả về access token và thông tin user"""
    resp = client.post("/api/v1/auth/login", json={
        "username": "user_01",
        "password": "Password123@"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "user_01"
    assert data["user"]["role_code"] == "SALES"


def test_auth_login_invalid_password():
    """S1-01: Đăng nhập sai mật khẩu trả về 401 với thông báo chung (không lộ user có tồn tại hay không)"""
    resp = client.post("/api/v1/auth/login", json={
        "username": "user_01",
        "password": "WrongPassword999!"
    })
    assert resp.status_code == 401
    assert "Tài khoản hoặc mật khẩu không chính xác" in resp.json()["detail"]


def test_auth_login_locked_user_forbidden():
    """S1-01 / S1-10: Tài khoản bị khóa (LOCKED) không được phép đăng nhập (HTTP 403)"""
    resp = client.post("/api/v1/auth/login", json={
        "username": "user_10",
        "password": "Password123@"
    })
    assert resp.status_code == 403
    assert "bị khóa" in resp.json()["detail"].lower()


def test_auth_get_me_flow():
    """S1-02: Lấy thông tin tài khoản hiện tại qua Bearer token"""
    # 1. Đăng nhập lấy token
    login_resp = client.post("/api/v1/auth/login", json={
        "username": "user_01",
        "password": "Password123@"
    })
    token = login_resp.json()["access_token"]

    # 2. Gọi GET /me hợp lệ
    me_resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "user_01"

    # 3. Gọi GET /me thiếu Authorization header
    unauth_resp = client.get("/api/v1/auth/me")
    assert unauth_resp.status_code == 401

    # 4. Gọi GET /me với token sai
    invalid_resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.value"})
    assert invalid_resp.status_code == 401


def test_auth_logout():
    """S1-02: Đăng xuất an toàn"""
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ==============================================================
# TESTS FOR S1-10: Khóa và mở khóa tài khoản
# ==============================================================

def test_toggle_user_lock_flow():
    """S1-10: Khóa và mở khóa tài khoản, chặn đăng nhập khi bị khóa"""
    # Ban đầu user_01 là ACTIVE
    get_resp = client.get("/api/v1/users/1")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "ACTIVE"

    # 1. Khóa tài khoản user_01
    lock_resp = client.post("/api/v1/users/1/toggle-lock")
    assert lock_resp.status_code == 200
    assert lock_resp.json()["status"] == "LOCKED"

    # 2. Sau khi bị khóa, user_01 không thể đăng nhập
    login_locked = client.post("/api/v1/auth/login", json={
        "username": "user_01",
        "password": "Password123@"
    })
    assert login_locked.status_code == 403

    # 3. Mở khóa lại tài khoản user_01
    unlock_resp = client.post("/api/v1/users/1/toggle-lock")
    assert unlock_resp.status_code == 200
    assert unlock_resp.json()["status"] == "ACTIVE"

    # 4. Đăng nhập lại thành công
    login_active = client.post("/api/v1/auth/login", json={
        "username": "user_01",
        "password": "Password123@"
    })
    assert login_active.status_code == 200


def test_prevent_locking_sole_active_admin():
    """S1-09 / S1-10: Không thể tự khóa tài khoản Quản trị viên duy nhất đang hoạt động"""
    # user_25 là ADMIN duy nhất trong setup
    resp = client.post("/api/v1/users/25/toggle-lock")
    assert resp.status_code == 400
    assert "Quản trị viên duy nhất" in resp.json()["detail"]
