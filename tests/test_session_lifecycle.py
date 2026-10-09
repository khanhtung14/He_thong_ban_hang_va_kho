import hashlib
from datetime import datetime, timedelta, timezone

import pytest
import bcrypt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.backend.models import AccountStatus, Base, Role, User, UserSession
from src.backend.security import require_active_user
from src.backend.session import logout, refresh_session
from src.backend.change_password import ChangePasswordRequest, change_authenticated_password
from src.backend.rbac import create_access_token


@pytest.fixture
def session_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        role = Role(code="ADMIN", name="Quản trị hệ thống", description="Quản trị")
        db.add(role)
        db.flush()
        user = User(
            username="session-user",
            email="session@example.test",
            full_name="Session User",
            password_hash="unused",
            is_active=True,
            status=AccountStatus.ACTIVE,
            roles=[role],
        )
        db.add(user)
        db.flush()
        token = "test-session-token"
        db.add(
            UserSession(
                user_id=user.id,
                refresh_token_hash=hashlib.sha256(token.encode()).hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            )
        )
        db.commit()
        yield db, token
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_active_request_slides_expiry_and_logout_revokes_session(session_db):
    db, token = session_db
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user = require_active_user(credentials, db)

    assert user.username == "session-user"
    session = db.query(UserSession).one()
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    assert expires_at > datetime.now(timezone.utc) + timedelta(hours=11)

    assert logout(credentials, db)["message"] == "Đăng xuất thành công"
    db.refresh(session)
    assert session.revoked_at is not None
    with pytest.raises(HTTPException) as error:
        require_active_user(credentials, db)
    assert error.value.status_code == 401


def test_password_change_revokes_other_sessions_and_stale_access_tokens(session_db):
    db, current_token = session_db
    user = db.query(User).one()
    user.password_hash = bcrypt.hashpw(b"Oldpass123", bcrypt.gensalt(rounds=4)).decode()
    current_session = db.query(UserSession).one()
    other_session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(b"other-session-token").hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(other_session)
    db.commit()

    old_access_token = create_access_token({"sub": user.username, "role": "ADMIN"})
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=current_token)
    change_authenticated_password(
        ChangePasswordRequest(current_password="Oldpass123", new_password="Newpass456"),
        user,
        db,
        credentials,
    )

    assert bcrypt.checkpw(b"Newpass456", user.password_hash.encode())
    db.refresh(current_session)
    db.refresh(other_session)
    assert current_session.revoked_at is None
    assert other_session.revoked_at is not None
    assert require_active_user(credentials, db) is user

    stale_credentials = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=old_access_token
    )
    with pytest.raises(HTTPException) as error:
        require_active_user(stale_credentials, db)
    assert error.value.status_code == 401

    refreshed = refresh_session(credentials, db)
    fresh_credentials = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=refreshed["access_token"]
    )
    assert require_active_user(fresh_credentials, db) is user


def test_expired_session_is_rejected_without_renewal(session_db):
    db, token = session_db
    session = db.query(UserSession).one()
    session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as error:
        require_active_user(credentials, db)
    assert error.value.status_code == 401


@pytest.mark.parametrize("failure", ["revoked", "disabled", "locked", "missing_credentials", "unknown_token"])
def test_authenticated_request_rejects_invalid_session(session_db, failure):
    db, token = session_db
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    session = db.query(UserSession).one()

    if failure == "revoked":
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    elif failure == "disabled":
        session.user.is_active = False
        db.commit()
    elif failure == "locked":
        session.user.status = AccountStatus.LOCKED
        db.commit()
    elif failure == "missing_credentials":
        credentials = None
    elif failure == "unknown_token":
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="unknown-token")

    with pytest.raises(HTTPException) as error:
        require_active_user(credentials, db)
    assert error.value.status_code == 401


def test_refresh_extends_active_session(session_db):
    db, token = session_db
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    session = db.query(UserSession).one()
    old_expiry = session.expires_at
    if old_expiry.tzinfo is None:
        old_expiry = old_expiry.replace(tzinfo=timezone.utc)

    result = refresh_session(credentials, db)

    assert result["expires_in"] == 12 * 60 * 60
    db.refresh(session)
    expiry = session.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    assert expiry > old_expiry
    assert expiry > datetime.now(timezone.utc) + timedelta(hours=11)


def test_logout_revokes_session_idempotently(session_db):
    db, token = session_db
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    session = db.query(UserSession).one()

    assert logout(credentials, db)["message"] == "Đăng xuất thành công"
    db.refresh(session)
    first_revocation = session.revoked_at
    assert first_revocation is not None

    assert logout(credentials, db)["message"] == "Đăng xuất thành công"
    db.refresh(session)
    assert session.revoked_at == first_revocation


@pytest.mark.parametrize("failure", ["expired", "revoked", "disabled", "missing_credentials", "unknown_token"])
def test_refresh_rejects_invalid_sessions(session_db, failure):
    db, token = session_db
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    session = db.query(UserSession).one()

    if failure == "expired":
        session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    elif failure == "revoked":
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    elif failure == "disabled":
        session.user.is_active = False
        db.commit()
    elif failure == "missing_credentials":
        credentials = None
    elif failure == "unknown_token":
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="unknown-token")

    with pytest.raises(HTTPException) as error:
        refresh_session(credentials, db)
    assert error.value.status_code == 401
