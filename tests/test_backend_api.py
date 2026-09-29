import json
import os
import re

import bcrypt
import pytest

from src.backend import change_password, login


@pytest.mark.parametrize(
    ("role", "expected_url"),
    [
        ("CUSTOMER", "/portal/orders"),
        ("SALES", "/sales/orders"),
        ("SALES_REP", "/sales/orders"),
        ("SALES_MANAGER", "/manager/dashboard"),
        ("WAREHOUSE", "/warehouse/picking"),
        ("WH_MANAGER", "/warehouse/dashboard"),
        ("ACCOUNTANT", "/accounting/debt-book"),
        ("ADMIN", "/admin/users"),
    ],
)
def test_login_success_routes_by_role(client, monkeypatch, role, expected_url):
    account = {
        "username": "role_user",
        "password_hash": bcrypt.hashpw(b"SafePass123", bcrypt.gensalt(rounds=4)).decode(),
        "role_code": role,
    }
    monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps([account]))

    response = client.post(
        "/api/v1/auth/login",
        json={"username": " ROLE_USER ", "password": "SafePass123"},
    )

    assert response.status_code == 200
    assert response.json()["redirect_url"] == expected_url
    assert response.json()["user"]["role_code"] == role
    assert response.json()["message"] == "Đăng nhập thành công"
    assert "role_user" not in login._attempts


def test_login_case_insensitive_and_role_code_normalized(client, monkeypatch):
    account = {
        "username": "Sales01",
        "password_hash": bcrypt.hashpw(b"SafePass123", bcrypt.gensalt(rounds=4)).decode(),
        "role_code": " sales ",
    }
    monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps([account]))

    response = client.post("/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"})

    assert response.status_code == 200
    assert response.json()["redirect_url"] == "/sales/orders"
    assert response.json()["user"]["username"] == "Sales01"


def test_login_invalid_credentials_have_same_generic_error(client):
    known = client.post("/api/v1/auth/login", json={"username": "sales01", "password": "wrong"})
    unknown = client.post("/api/v1/auth/login", json={"username": "no-such-user", "password": "wrong"})

    assert known.status_code == unknown.status_code == 401
    assert known.json() == unknown.json()
    assert known.json()["detail"] == "Tên đăng nhập hoặc mật khẩu không chính xác."


def test_login_locked_after_five_consecutive_failures_and_rejects_correct_password(client):
    payload = {"username": "sales01", "password": "wrong"}
    for _ in range(4):
        assert client.post("/api/v1/auth/login", json=payload).status_code == 401

    fifth = client.post("/api/v1/auth/login", json=payload)
    assert fifth.status_code == 423
    assert fifth.json()["detail"]["retry_after_seconds"] == login.LOCKOUT_SECONDS
    assert fifth.headers["Retry-After"] == str(login.LOCKOUT_SECONDS)

    still_locked = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )
    assert still_locked.status_code == 423
    assert 1 <= still_locked.json()["detail"]["retry_after_seconds"] <= login.LOCKOUT_SECONDS


def test_login_unlocks_after_lockout_expiry(client, monkeypatch):
    now = [100.0]
    monkeypatch.setattr(login.time, "monotonic", lambda: now[0])
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"username": "sales01", "password": "wrong"})

    now[0] += login.LOCKOUT_SECONDS + 1
    response = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )
    assert response.status_code == 200
    assert "sales01" not in login._attempts


def test_login_success_resets_prior_failures(client):
    client.post("/api/v1/auth/login", json={"username": "sales01", "password": "wrong"})
    response = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )

    assert response.status_code == 200
    assert "sales01" not in login._attempts


def test_disabled_account_uses_generic_auth_error(client, monkeypatch):
    accounts = json.loads(os.environ["LOGIN_USERS_JSON"])
    accounts[0]["status"] = "DISABLED"
    monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps(accounts))

    response = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Tên đăng nhập hoặc mật khẩu không chính xác."


@pytest.mark.parametrize("bad_config", ["{invalid", "{}"])
def test_login_invalid_account_configuration_returns_503(client, monkeypatch, bad_config):
    monkeypatch.setenv("LOGIN_USERS_JSON", bad_config)

    response = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Dịch vụ đăng nhập chưa được cấu hình đúng."


def test_login_unknown_role_returns_403(client, monkeypatch):
    account = {
        "username": "sales01",
        "password_hash": bcrypt.hashpw(b"SafePass123", bcrypt.gensalt(rounds=4)).decode(),
        "role_code": "UNSUPPORTED",
    }
    monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps([account]))

    response = client.post(
        "/api/v1/auth/login", json={"username": "sales01", "password": "SafePass123"}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Vai trò tài khoản chưa được hỗ trợ."


@pytest.mark.parametrize(
    "payload",
    [
        {"password": "SafePass123"},
        {"username": "sales01"},
        {"username": "", "password": "SafePass123"},
        {"username": "u" * 101, "password": "SafePass123"},
        {"username": "sales01", "password": "p" * 257},
    ],
)
def test_login_invalid_request_returns_422(client, payload):
    assert client.post("/api/v1/auth/login", json=payload).status_code == 422


def test_login_non_json_body_returns_422(client):
    assert client.post("/api/v1/auth/login", content="not-json").status_code == 422


def test_openapi_lists_every_http_api(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    actual_paths = set(response.json()["paths"])
    assert "/change-password" in actual_paths
    assert "/api/v1/auth/login" in actual_paths


def test_change_password_success_updates_hash(client):
    response = client.post(
        "/change-password",
        json={"current_password": "Oldpass123", "new_password": "Newpass456"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Đổi mật khẩu thành công"}
    assert bcrypt.checkpw(b"Newpass456", change_password.fake_user["password"])
    assert not bcrypt.checkpw(b"Oldpass123", change_password.fake_user["password"])


def test_change_password_wrong_current_password_is_rejected(client):
    response = client.post(
        "/change-password", json={"current_password": "wrong", "new_password": "Newpass456"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Mật khẩu hiện tại không đúng"


@pytest.mark.parametrize(
    ("new_password", "expected_detail"),
    [
        ("Oldpass123", "Mật khẩu mới không được giống mật khẩu hiện tại"),
        ("Abc123", "Mật khẩu mới phải có ít nhất 8 ký tự"),
        ("12345678", "Mật khẩu mới phải chứa chữ"),
        ("Password", "Mật khẩu mới phải chứa số"),
    ],
)
def test_change_password_policy_rejections(client, new_password, expected_detail):
    response = client.post(
        "/change-password",
        json={"current_password": "Oldpass123", "new_password": new_password},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == expected_detail
    assert bcrypt.checkpw(b"Oldpass123", change_password.fake_user["password"])


@pytest.mark.parametrize(
    "payload",
    [
        {"current_password": "Oldpass123"},
        {"new_password": "Newpass456"},
        {"current_password": "", "new_password": "Newpass456"},
        {"current_password": "Oldpass123", "new_password": ""},
        {"current_password": "x" * 129, "new_password": "Newpass456"},
        {"current_password": "Oldpass123", "new_password": "x" * 129},
        {"current_password": 123, "new_password": "Newpass456"},
    ],
)
def test_change_password_invalid_request_returns_422(client, payload):
    assert client.post("/change-password", json=payload).status_code == 422


@pytest.mark.parametrize("path", ["/", "/login", "/change-password"])
def test_frontend_pages_are_served(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert '<div id="root"></div>' in response.text


def test_forbidden_preview_is_served_as_html(client):
    response = client.get("/errors/403")
    assert response.status_code == 403
    assert "text/html" in response.headers["content-type"]


def test_forbidden_api_response_stays_json(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "missing", "password": "bad"},
        headers={"Accept": "application/json"},
    )
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/json")


def test_frontend_bundle_asset_is_served(client):
    html = client.get("/").text
    asset_path = re.search(r'src="([^"]+\.js)"', html).group(1)

    response = client.get(asset_path)
    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]


def test_unknown_path_returns_404(client):
    assert client.get("/not-an-api-or-page").status_code == 404
