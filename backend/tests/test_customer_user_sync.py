import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.models import Base, User, Customer, Role, RoleCode, AccountStatus
from app.services.customer_sync_service import (
    is_dealer_user,
    ensure_customer_profile_for_user,
    sync_all_dealer_users,
    generate_unique_customer_code,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()

    # Seed roles
    cust_role = Role(code="CUSTOMER", name="Đại lý")
    sales_role = Role(code="SALES_REP", name="Nhân viên kinh doanh")
    session.add_all([cust_role, sales_role])
    session.commit()

    yield session
    session.close()


def test_dealer_user_creation_auto_creates_customer(db_session):
    cust_role = db_session.query(Role).filter(Role.code == "CUSTOMER").first()

    dealer_user = User(
        username="daily_abc",
        email="daily_abc@example.com",
        full_name="Đại lý Bánh kẹo ABC",
        phone="0911222333",
        password_hash="fakehash",
        status=AccountStatus.ACTIVE,
        roles=[cust_role],
    )
    db_session.add(dealer_user)
    db_session.commit()
    db_session.refresh(dealer_user)

    assert is_dealer_user(dealer_user) is True

    # Call sync
    customer = ensure_customer_profile_for_user(db_session, dealer_user)

    assert customer is not None
    assert customer.user_id == dealer_user.id
    assert customer.name == "Đại lý Bánh kẹo ABC"
    assert customer.code.startswith("DL-")
    assert customer.region == "Chưa cập nhật"
    assert customer.sales_rep_id is None
    assert customer.credit_limit == 0.0
    assert customer.current_debt == 0.0
    assert customer.is_active is True
    assert customer.is_locked is False

    # Relationship from User side
    assert dealer_user.customer_id == customer.id
    assert dealer_user.customer_profile.id == customer.id


def test_non_dealer_user_does_not_create_customer(db_session):
    sales_role = db_session.query(Role).filter(Role.code == "SALES_REP").first()

    sales_user = User(
        username="sales_rep_01",
        email="sales01@example.com",
        full_name="Trần Văn Kinh Doanh",
        phone="0988776655",
        password_hash="fakehash",
        status=AccountStatus.ACTIVE,
        roles=[sales_role],
    )
    db_session.add(sales_user)
    db_session.commit()
    db_session.refresh(sales_user)

    assert is_dealer_user(sales_user) is False

    customer = ensure_customer_profile_for_user(db_session, sales_user)
    assert customer is None

    # Verify no customer was inserted
    count = db_session.query(Customer).count()
    assert count == 0


def test_sync_all_dealer_users_idempotent(db_session):
    cust_role = db_session.query(Role).filter(Role.code == "CUSTOMER").first()

    user1 = User(
        username="dealer_1",
        email="d1@example.com",
        full_name="Đại lý 1",
        phone="0901000001",
        password_hash="fakehash",
        status=AccountStatus.ACTIVE,
        roles=[cust_role],
    )
    user2 = User(
        username="dealer_2",
        email="d2@example.com",
        full_name="Đại lý 2",
        phone="0901000002",
        password_hash="fakehash",
        status=AccountStatus.ACTIVE,
        roles=[cust_role],
    )
    db_session.add_all([user1, user2])
    db_session.commit()

    # First sync
    synced = sync_all_dealer_users(db_session)
    assert len(synced) == 2
    assert db_session.query(Customer).count() == 2

    # Second sync (should not duplicate)
    synced_again = sync_all_dealer_users(db_session)
    assert len(synced_again) == 2
    assert db_session.query(Customer).count() == 2


def test_portal_orders_returns_empty_when_no_orders():
    from fastapi.testclient import TestClient
    from main import app
    from app.api.v1.endpoints.rbac import create_access_token

    client = TestClient(app)
    # Token for dealer who has no orders
    token = create_access_token(data={"sub": "dealer_no_orders", "role": "CUSTOMER"})
    resp = client.get("/api/v1/portal/orders", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []

    # Also test /customer/orders alias
    resp_alias = client.get("/api/v1/customer/orders", headers={"Authorization": f"Bearer {token}"})
    assert resp_alias.status_code == 200
    assert resp_alias.json() == []

