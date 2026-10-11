import json
import os

# Prevent tests from connecting to a developer's configured MySQL instance.
# Set this before importing backend modules, since database.py creates its
# engine at import time.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["TESTING"] = "1"
for _smtp_key in ("SMTP_HOST", "SMTP_USER", "SMTP_USERNAME", "SMTP_PASSWORD"):
    os.environ.pop(_smtp_key, None)

import bcrypt
import pytest
from fastapi.testclient import TestClient

from src.backend import change_password, database, login

database.init_db()

from src.backend.main import app


@pytest.fixture
def client(monkeypatch):
    password = "SafePass123"
    account = {
        "username": "sales01",
        "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode(),
        "role_code": "SALES",
    }
    monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps([account]))
    login._attempts.clear()
    login._locked_until.clear()
    change_password.fake_user["password"] = bcrypt.hashpw(
        b"Oldpass123", bcrypt.gensalt(rounds=4)
    )
    with TestClient(app) as test_client:
        yield test_client
    login._attempts.clear()
    login._locked_until.clear()
