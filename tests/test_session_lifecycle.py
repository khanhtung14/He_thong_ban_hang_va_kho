import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from src.backend.models import AccountStatus, Base, User, UserSession
from src.backend.security import require_active_user
from src.backend.session import logout


@pytest.fixture
def session_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(
            username="session-user",
            email="session@example.test",
            full_name="Session User",
            password_hash="unused",
            is_active=True,
            status=AccountStatus.ACTIVE,
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


def test_expired_session_is_rejected_without_renewal(session_db):
    db, token = session_db
    session = db.query(UserSession).one()
    session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as error:
        require_active_user(credentials, db)
    assert error.value.status_code == 401
