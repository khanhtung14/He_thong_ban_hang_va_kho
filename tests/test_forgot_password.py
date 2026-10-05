import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.backend.main import app
from src.backend.database import get_db
from src.backend.models import AccountStatus, Base, PasswordResetToken, User
from src.backend.forgot_password import (
    mock_outbox,
    GENERIC_SUCCESS_MESSAGE,
    RESET_TOKEN_EXPIRE_MINUTES
)

client = TestClient(app)
DEMO_EMAIL = "customer@example.com"


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(
            User(
                username="demo_customer",
                email=DEMO_EMAIL,
                full_name="Demo Customer",
                password_hash=bcrypt.hashpw(b"Password123", bcrypt.gensalt()).decode("utf-8"),
                is_active=True,
                status=AccountStatus.ACTIVE,
            )
        )
        db.commit()
        yield db
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def setup_and_teardown(db_session, monkeypatch):
    """Reset dữ liệu giả lập trước mỗi test case để đảm bảo tính độc lập."""
    monkeypatch.setenv("APP_ENV", "development")
    for key in ("SMTP_HOST", "SMTP_FROM", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_USE_SSL"):
        monkeypatch.delenv(key, raising=False)
    mock_outbox.clear()
    
    # Khởi tạo lại user mặc định
    app.dependency_overrides[get_db] = lambda: db_session
    yield
    app.dependency_overrides.pop(get_db, None)


class TestForgotPasswordCriteria:
    """
    Bộ kiểm thử cho User Story SCRUM-57:
    Là người dùng hệ thống, tôi muốn đặt lại mật khẩu khi quên thông qua email,
    để tự động lấy lại quyền truy cập khi đang đi thị trường mà không được gọi về văn phòng.
    """

    # -------------------------------------------------------------
    # Tiêu chí 3: "Email không tồn tại vẫn hiển thị cùng một thông báo"
    # -------------------------------------------------------------
    def test_ac3_email_khong_ton_tai_van_hien_thi_cung_thong_bao(self):
        """
        Kiểm tra tính năng bảo mật chống User Enumeration:
        Gửi yêu cầu với email không tồn tại -> Hệ thống vẫn trả về HTTP 200 và
        cùng một thông báo giống hệt như khi email tồn tại.
        """
        # 1. Gửi với email tồn tại
        resp_existing = client.post(
            "/forgot-password",
            json={"email": DEMO_EMAIL}
        )
        assert resp_existing.status_code == 200
        data_existing = resp_existing.json()
        assert data_existing["message"] == GENERIC_SUCCESS_MESSAGE

        # 2. Gửi với email KHÔNG tồn tại
        resp_non_existing = client.post(
            "/forgot-password",
            json={"email": "khongtontai@congty.com"}
        )
        assert resp_non_existing.status_code == 200
        data_non_existing = resp_non_existing.json()

        # So sánh 2 thông báo: Phải trùng khớp 100%
        assert data_non_existing["message"] == data_existing["message"]
        assert data_non_existing["message"] == GENERIC_SUCCESS_MESSAGE
        assert data_non_existing == data_existing  # Same response body; no preview leak.

        # Email không tồn tại thì không gửi thư ra outbox
        outbox_for_non_exist = [e for e in mock_outbox if e["to"] == "khongtontai@congty.com"]
        assert len(outbox_for_non_exist) == 0

    # -------------------------------------------------------------
    # Tiêu chí 1: "Nhập email đã nhận được liên kết, thiết lập lại có hiệu lực 30 phút"
    # -------------------------------------------------------------
    def test_ac1_gui_email_tao_lien_ket_hieu_luc_30_phut(self, db_session):
        """
        Kiểm tra người dùng nhập email hợp lệ:
        - Nhận được thông báo thành công.
        - Token được tạo kèm thời gian hết hạn đúng 30 phút.
        - Email được ghi nhận vào outbox kèm liên kết đặt lại mật khẩu.
        """
        email = DEMO_EMAIL
        response = client.post("/forgot-password", json={"email": email})
        assert response.status_code == 200
        assert response.json()["message"] == GENERIC_SUCCESS_MESSAGE

        # Kiểm tra token đã sinh
        assert "reset_link_preview" not in response.json()
        token = mock_outbox[0]["token"]
        record = db_session.query(PasswordResetToken).one()
        assert record.user_id == db_session.query(User).filter(User.email == email).one().id
        assert record.used_at is None
        assert record.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()

        # Kiểm tra thời hạn hiệu lực: xấp xỉ 30 phút kể từ lúc tạo
        created_at = record.created_at
        expires_at = record.expires_at
        diff_minutes = (expires_at - created_at).total_seconds() / 60
        assert round(diff_minutes) == RESET_TOKEN_EXPIRE_MINUTES

        # Kiểm tra email outbox
        assert len(mock_outbox) == 1
        assert mock_outbox[0]["to"] == email
        assert token in mock_outbox[0]["reset_link"]

    def test_configured_smtp_sends_email_without_exposing_link_in_response(self, monkeypatch):
        monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
        monkeypatch.setenv("SMTP_FROM", "no-reply@example.test")
        monkeypatch.setenv("PUBLIC_BASE_URL", "https://oms.example.test")

        with patch("src.backend.forgot_password.smtplib.SMTP") as smtp_factory:
            smtp = smtp_factory.return_value.__enter__.return_value
            response = client.post("/forgot-password", json={"email": DEMO_EMAIL})

        assert response.status_code == 200
        assert response.json()["demo_mode"] is False
        assert "reset_link_preview" not in response.json()
        smtp.starttls.assert_called_once()
        mail = smtp.send_message.call_args.args[0]
        assert mail["To"] == DEMO_EMAIL
        assert "https://oms.example.test/reset-password?token=" in mail.get_content()
        assert mock_outbox == []

    def test_production_without_smtp_does_not_publish_mock_reset_link(self, monkeypatch, db_session):
        monkeypatch.setenv("APP_ENV", "production")
        response = client.post("/forgot-password", json={"email": DEMO_EMAIL})

        assert response.status_code == 503
        assert "chưa được cấu hình" in response.json()["detail"].lower()
        assert mock_outbox == []
        assert db_session.query(PasswordResetToken).count() == 0
        assert client.get("/dev/mock-outbox").status_code == 404

    def test_ac1_lien_ket_con_trong_han_30_phut_la_hop_le(self):
        """Token trong vòng 30 phút phải xác thực hợp lệ."""
        # Tạo token
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        # Xác thực token
        verify_resp = client.get(f"/verify-reset-token/{token}")
        assert verify_resp.status_code == 200
        assert verify_resp.json()["valid"] is True
        assert verify_resp.json()["email"] == DEMO_EMAIL

    def test_ac1_lien_ket_qua_30_phut_bi_tu_choi_het_han(self, db_session):
        """Token quá hạn 30 phút sẽ bị từ chối xác thực và không cho đặt lại mật khẩu."""
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        # Chỉnh thời gian hết hạn lùi về quá khứ 35 phút trước
        record = db_session.query(PasswordResetToken).one()
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=35)
        db_session.commit()

        # Kiểm tra verify token
        verify_resp = client.get(f"/verify-reset-token/{token}")
        assert verify_resp.status_code == 400

        # Thử đặt lại mật khẩu bằng token hết hạn
        reset_resp = client.post("/reset-password", json={
            "token": token,
            "new_password": "NewSecretPass123",
            "confirm_password": "NewSecretPass123"
        })
        assert reset_resp.status_code == 400

    # -------------------------------------------------------------
    # Tiêu chí 2: "Liên kết được sử dụng chỉ một lần"
    # -------------------------------------------------------------
    def test_ac2_lien_ket_duoc_su_dung_chi_mot_lan(self, db_session):
        """
        Kiểm tra liên kết chỉ được sử dụng một lần:
        - Lần đầu đặt lại mật khẩu bằng token: Thành công.
        - Lần thứ hai dùng lại cùng token đó: Bị từ chối (400) với thông báo đã sử dụng.
        """
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        # Lần 1: Đặt lại mật khẩu thành công
        resp_1 = client.post("/reset-password", json={
            "token": token,
            "new_password": "NewSecretPass123",
            "confirm_password": "NewSecretPass123"
        })
        assert resp_1.status_code == 200
        assert "thành công" in resp_1.json()["message"].lower()

        # Kiểm tra mật khẩu trong DB đã thay đổi và mã hóa bcrypt
        user = db_session.query(User).filter(User.email == DEMO_EMAIL).one()
        assert bcrypt.checkpw("NewSecretPass123".encode("utf-8"), user.password_hash.encode("utf-8"))

        # Kiểm tra token đã được đánh dấu used=True
        record = db_session.query(PasswordResetToken).one()
        assert record.used_at is not None

        # Lần 2: Thử sử dụng lại chính token đó
        resp_2 = client.post("/reset-password", json={
            "token": token,
            "new_password": "AnotherPass456",
            "confirm_password": "AnotherPass456"
        })
        assert resp_2.status_code == 400

        # Kiểm tra API verify cũng từ chối token đã dùng
        verify_resp = client.get(f"/verify-reset-token/{token}")
        assert verify_resp.status_code == 400

    # -------------------------------------------------------------
    # Kiểm tra các quy tắc bảo mật mật khẩu mới (Validation)
    # -------------------------------------------------------------
    def test_validation_mat_khau_khong_khop(self):
        """Mật khẩu xác nhận không khớp thì báo lỗi."""
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        resp = client.post("/reset-password", json={
            "token": token,
            "new_password": "NewPassword123",
            "confirm_password": "DifferentPassword123"
        })
        assert resp.status_code == 400
        assert "không khớp" in resp.json()["detail"].lower()

    def test_validation_mat_khau_ngan_hon_8_ky_tu(self):
        """Mật khẩu ngắn hơn 8 ký tự bị từ chối."""
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        resp = client.post("/reset-password", json={
            "token": token,
            "new_password": "Pass1",
            "confirm_password": "Pass1"
        })
        # Bị từ chối bởi Pydantic validation (422) hoặc custom logic (400)
        assert resp.status_code in [400, 422]

    def test_validation_mat_khau_thieu_chu_hoac_so(self):
        """Mật khẩu không chứa số hoặc không chứa chữ bị từ chối."""
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        # Toàn chữ cái, không có số
        resp1 = client.post("/reset-password", json={
            "token": token,
            "new_password": "OnlyLettersPass",
            "confirm_password": "OnlyLettersPass"
        })
        assert resp1.status_code == 400
        assert "chữ số" in resp1.json()["detail"].lower()

        # Toàn số, không có chữ cái
        resp2 = client.post("/reset-password", json={
            "token": token,
            "new_password": "1234567890",
            "confirm_password": "1234567890"
        })
        assert resp2.status_code == 400
        assert "chữ" in resp2.json()["detail"].lower()

    def test_validation_mat_khau_moi_trung_mat_khau_cu(self):
        """Không cho phép đặt mật khẩu mới trùng mật khẩu hiện tại."""
        client.post("/forgot-password", json={"email": DEMO_EMAIL})
        token = mock_outbox[-1]["token"]

        resp = client.post("/reset-password", json={
            "token": token,
            "new_password": "Password123",  # Mật khẩu cũ
            "confirm_password": "Password123"
        })
        assert resp.status_code == 400
        assert "mật khẩu cũ" in resp.json()["detail"].lower()

    def test_token_khong_ton_tai(self):
        """Token giả mạo không tồn tại trong hệ thống."""
        resp = client.post("/reset-password", json={
            "token": "fake_token_khong_ton_tai_12345",
            "new_password": "ValidPassword123",
            "confirm_password": "ValidPassword123"
        })
        assert resp.status_code == 400
        assert resp.json()["detail"]

    def test_ui_endpoints(self):
        """Kiểm tra các trang giao diện HTML tải thành công (HTTP 200)."""
        resp_forgot = client.get("/forgot-password")
        assert resp_forgot.status_code == 200
        assert "Đặt lại mật khẩu" in resp_forgot.text

        resp_reset = client.get("/reset-password")
        assert resp_reset.status_code == 200
        assert "Thiết lập mật khẩu mới" in resp_reset.text

