"""Unit and integration tests for User Story SCRUM-18 (Story S3-02).

"Là Quản lý kinh doanh, tôi muốn xem lịch sử thay đổi giá của một sản phẩm,
để giải thích được với đại lý vì sao giá tháng này khác tháng trước."

Test coverage:
1. Model (ProductPriceHistory):
   - Bảng product_price_history lưu đủ các trường: product_id, old_price, new_price, changed_by,
     effective_date (mặc định UTC now), reason/note.
   - Tính bất biến (Audit Log): Không cho phép sửa (UPDATE) hoặc xóa (DELETE) bản ghi ở tầng Database.
2. Nghiệp vụ ghi nhận tự động:
   - Tự động ghi nhật ký khi đổi giá sản phẩm (trực tiếp qua ORM và qua API cập nhật giá).
   - Tự động ghi nhật ký khi phát hành bảng giá (Publish Price List).
3. API GET /products/{id}/price-history:
   - Sắp xếp giảm dần theo thời gian (effective_date desc).
   - Hỗ trợ lọc theo khoảng ngày (fromDate, toDate).
   - Trả về đúng định dạng theo docs/API_SPECIFICATION.md (changedAt, oldPrice, newPrice, changedBy, note).
4. Tính toàn vẹn Audit Log ở tầng API:
   - Chặn toàn bộ các thao tác sửa/xóa: PUT, PATCH, DELETE trả về 405 Method Not Allowed.
5. Kiểm tra phân quyền RBAC:
   - Yêu cầu xác thực: Chưa đăng nhập trả về 401 Unauthorized.
   - Quản lý kinh doanh (Sales Manager) và Admin được phép xem (200 OK).
   - Các vai trò khác (Sales Rep, Warehouse, Accountant, Customer) bị chặn 403 Forbidden.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Generator, List, Optional
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.main import app
from src.backend.models import (
    Base,
    PriceList,
    PriceListItem,
    Product,
    ProductPriceHistory,
    RoleCode,
)
from src.backend.price_lists import CustomerGroup
from src.backend.rbac import create_access_token


def make_auth_header(role: str, username: str = "test_user") -> Dict[str, str]:
    """Generate JWT authorization bearer header for a given role."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide an isolated SQLite database session with all models created."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def price_client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a TestClient connected to the isolated test database."""
    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def sample_product(db_session: Session) -> Product:
    """Create and return a sample product in the database."""
    product = Product(
        sku="TEST-SKU-001",
        name="Sữa tươi tiệt trùng Vinamilk 100ml",
        base_unit="Hộp",
        base_price=10000.0,
        cost_price=7000.0,
        min_stock=50,
        status="ACTIVE",
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product


# ==============================================================================
# 1. MODEL & IMMUTABILITY TESTS
# ==============================================================================
class TestProductPriceHistoryModel:
    """Validate ProductPriceHistory model schema and audit log immutability."""

    def test_model_fields_and_defaults(self, db_session: Session, sample_product: Product):
        """Model stores product_id, old_price, new_price, changed_by, effective_date, note/reason."""
        before_time = datetime.now(timezone.utc) - timedelta(seconds=2)
        history = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=10000.0,
            new_price=12000.0,
            changed_by="Manager_Nguyen",
            note="Điều chỉnh giá theo thị trường",
        )
        db_session.add(history)
        db_session.commit()
        db_session.refresh(history)

        assert history.id is not None
        assert history.product_id == sample_product.id
        assert history.old_price == 10000.0
        assert history.new_price == 12000.0
        assert history.changed_by == "Manager_Nguyen"
        assert history.note == "Điều chỉnh giá theo thị trường"
        assert history.reason == "Điều chỉnh giá theo thị trường"
        assert history.effective_date is not None
        assert history.changed_at == history.effective_date

    def test_immutability_prevents_db_update(self, db_session: Session, sample_product: Product):
        """Modifying a ProductPriceHistory record at the database level raises ValueError."""
        history = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=10000.0,
            new_price=12000.0,
            changed_by="Manager_Nguyen",
            note="Bản ghi gốc",
        )
        db_session.add(history)
        db_session.commit()
        db_session.refresh(history)

        # Attempt to modify the audit log record
        history.new_price = 15000.0
        history.note = "Cố tình sửa đổi lịch sử"

        with pytest.raises(ValueError, match="nhật ký kiểm toán bất biến.*không thể chỉnh sửa"):
            db_session.commit()
        db_session.rollback()

    def test_immutability_prevents_db_delete(self, db_session: Session, sample_product: Product):
        """Deleting a ProductPriceHistory record at the database level raises ValueError."""
        history = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=10000.0,
            new_price=12000.0,
            changed_by="Manager_Nguyen",
            note="Bản ghi không được xóa",
        )
        db_session.add(history)
        db_session.commit()
        db_session.refresh(history)

        # Attempt to delete the audit log record
        db_session.delete(history)
        with pytest.raises(ValueError, match="nhật ký kiểm toán bất biến.*không thể xóa"):
            db_session.commit()
        db_session.rollback()

    def test_product_base_price_set_triggers_automatic_history(
        self, db_session: Session, sample_product: Product
    ):
        """Directly modifying Product.base_price automatically records a ProductPriceHistory."""
        # Initial base_price is 10000.0
        sample_product.base_price = 14000.0
        db_session.commit()
        db_session.refresh(sample_product)

        histories = sample_product.price_history
        assert len(histories) >= 1
        latest = histories[0]
        assert latest.old_price == 10000.0
        assert latest.new_price == 14000.0


# ==============================================================================
# 2. BUSINESS LOGIC & AUTOMATIC RECORDING TESTS
# ==============================================================================
class TestPriceHistoryAutomaticRecording:
    """Verify that price updates automatically log audit entries."""

    def test_update_price_via_api_records_history(
        self, price_client: TestClient, sample_product: Product
    ):
        """PUT /api/v1/products/{id}/price updates product and records price history."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sales_mgr_1")
        payload = {
            "price": 15000.0,
            "note": "Tăng giá do chi phí nguyên vật liệu đầu vào tăng",
        }
        res = price_client.put(
            f"/api/v1/products/{sample_product.id}/price",
            json=payload,
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["old_price"] == 10000.0
        assert data["new_price"] == 15000.0
        assert data["history"]["changedBy"] == "sales_mgr_1"
        assert data["history"]["note"] == "Tăng giá do chi phí nguyên vật liệu đầu vào tăng"

    def test_patch_price_via_compat_route(
        self, price_client: TestClient, sample_product: Product
    ):
        """PATCH /products/{id}/price works via compat router with SKU identifier."""
        headers = make_auth_header(RoleCode.ADMIN.value, username="admin_system")
        payload = {
            "newPrice": 18000.0,
            "reason": "Điều chỉnh theo chiến dịch khuyến mại kết thúc",
        }
        res = price_client.patch(
            f"/products/{sample_product.sku}/price",
            json=payload,
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["new_price"] == 18000.0

    def test_publish_price_list_automatically_records_price_history(
        self, price_client: TestClient, db_session: Session, sample_product: Product
    ):
        """Publishing a PriceList updates mapped products and records ProductPriceHistory."""
        # Create a price list with sample_product
        price_list = PriceList(
            code="PL-2026-T10",
            version=1,
            customer_group=CustomerGroup.LEVEL_1.value,
            start_date=datetime.now(timezone.utc),
            end_date=datetime.now(timezone.utc) + timedelta(days=30),
            published=False,
        )
        item = PriceListItem(
            sku=sample_product.sku,
            product_id=sample_product.id,
            sale_price=22000.0,
            floor_price=18000.0,
        )
        price_list.items.append(item)
        db_session.add(price_list)
        db_session.commit()
        db_session.refresh(price_list)

        # Publish the price list
        headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="manager_hanoi")
        pub_res = price_client.post(
            f"/api/v1/price-lists/{price_list.id}/publish",
            headers=headers,
        )
        assert pub_res.status_code == 200
        assert pub_res.json()["published"] is True

        # Verify that sample_product base_price was updated and logged
        db_session.refresh(sample_product)
        assert sample_product.base_price == 22000.0

        hist_res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert hist_res.status_code == 200
        logs = hist_res.json()
        assert len(logs) >= 1
        latest = logs[0]
        assert latest["newPrice"] == 22000.0
        assert "PL-2026-T10" in latest["note"]
        assert latest["changedBy"] == "manager_hanoi"


# ==============================================================================
# 3. GET PRICE HISTORY & FILTERING TESTS
# ==============================================================================
class TestPriceHistoryQueryEndpoints:
    """Verify GET price history ordering, date filtering, and format compliance."""

    def test_get_price_history_sorted_descending(
        self, price_client: TestClient, db_session: Session, sample_product: Product
    ):
        """History records are returned in descending chronological order (newest first)."""
        t1 = datetime(2026, 8, 1, 8, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 9, 1, 8, 0, 0, tzinfo=timezone.utc)
        t3 = datetime(2026, 10, 1, 8, 0, 0, tzinfo=timezone.utc)

        h1 = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=9000.0,
            new_price=10000.0,
            changed_by="Rep_1",
            note="Giá tháng 8",
            effective_date=t1,
        )
        h2 = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=10000.0,
            new_price=11000.0,
            changed_by="Rep_2",
            note="Giá tháng 9",
            effective_date=t2,
        )
        h3 = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=11000.0,
            new_price=12500.0,
            changed_by="Manager_Main",
            note="Giá tháng 10",
            effective_date=t3,
        )
        db_session.add_all([h1, h2, h3])
        db_session.commit()

        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 200
        records = res.json()
        assert len(records) == 3

        # Must be descending: t3 -> t2 -> t1
        assert records[0]["note"] == "Giá tháng 10"
        assert records[0]["newPrice"] == 12500.0
        assert records[1]["note"] == "Giá tháng 9"
        assert records[1]["newPrice"] == 11000.0
        assert records[2]["note"] == "Giá tháng 8"
        assert records[2]["newPrice"] == 10000.0

    def test_get_price_history_format_matches_api_specification(
        self, price_client: TestClient, db_session: Session, sample_product: Product
    ):
        """Payload adheres strictly to docs/API_SPECIFICATION.md Story S3-02."""
        dt = datetime(2026, 9, 1, 8, 0, 0, tzinfo=timezone.utc)
        h = ProductPriceHistory(
            product_id=sample_product.id,
            old_price=270000.0,
            new_price=280000.0,
            changed_by="Admin",
            note="Tăng giá vụ Tết",
            effective_date=dt,
        )
        db_session.add(h)
        db_session.commit()

        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 200
        item = res.json()[0]

        # Check specification fields
        assert "changedAt" in item
        assert item["oldPrice"] == 270000.0
        assert item["newPrice"] == 280000.0
        assert item["changedBy"] == "Admin"
        assert item["note"] == "Tăng giá vụ Tết"

    def test_get_price_history_date_filtering(
        self, price_client: TestClient, db_session: Session, sample_product: Product
    ):
        """Query parameters fromDate and toDate accurately filter records."""
        d_aug = datetime(2026, 8, 15, 10, 0, 0, tzinfo=timezone.utc)
        d_sep = datetime(2026, 9, 15, 10, 0, 0, tzinfo=timezone.utc)
        d_oct = datetime(2026, 10, 15, 10, 0, 0, tzinfo=timezone.utc)

        db_session.add_all([
            ProductPriceHistory(
                product_id=sample_product.id,
                old_price=10.0,
                new_price=20.0,
                changed_by="Sys",
                note="Tháng 8",
                effective_date=d_aug,
            ),
            ProductPriceHistory(
                product_id=sample_product.id,
                old_price=20.0,
                new_price=30.0,
                changed_by="Sys",
                note="Tháng 9",
                effective_date=d_sep,
            ),
            ProductPriceHistory(
                product_id=sample_product.id,
                old_price=30.0,
                new_price=40.0,
                changed_by="Sys",
                note="Tháng 10",
                effective_date=d_oct,
            ),
        ])
        db_session.commit()

        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # Filter: only September
        res_sep = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history?fromDate=2026-09-01&toDate=2026-09-30",
            headers=headers,
        )
        assert res_sep.status_code == 200
        data_sep = res_sep.json()
        assert len(data_sep) == 1
        assert data_sep[0]["note"] == "Tháng 9"

        # Filter: from September onwards
        res_from_sep = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history?fromDate=2026-09-01",
            headers=headers,
        )
        assert res_from_sep.status_code == 200
        assert len(res_from_sep.json()) == 2

    def test_get_price_history_not_found(self, price_client: TestClient):
        """Querying non-existent product returns 404."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = price_client.get("/api/v1/products/999999/price-history", headers=headers)
        assert res.status_code == 404

    def test_compat_endpoint_without_api_v1(
        self, price_client: TestClient, sample_product: Product
    ):
        """Compat route GET /products/{id}/price-history returns same valid response."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = price_client.get(f"/products/{sample_product.id}/price-history", headers=headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# ==============================================================================
# 4. AUDIT LOG IMMUTABILITY API TESTS (READ-ONLY ENFORCEMENT)
# ==============================================================================
class TestPriceHistoryAuditLogImmutabilityAPI:
    """Ensure absolutely NO API allows updating (PUT/PATCH) or deleting (DELETE) price history."""

    def test_put_price_history_endpoint_rejected_405(
        self, price_client: TestClient, sample_product: Product
    ):
        """PUT /api/v1/products/{id}/price-history returns 405 Method Not Allowed."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.put(
            f"/api/v1/products/{sample_product.id}/price-history",
            json={"price": 99999},
            headers=headers,
        )
        assert res.status_code == 405

    def test_patch_price_history_endpoint_rejected_405(
        self, price_client: TestClient, sample_product: Product
    ):
        """PATCH /api/v1/products/{id}/price-history returns 405 Method Not Allowed."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.patch(
            f"/api/v1/products/{sample_product.id}/price-history",
            json={"price": 99999},
            headers=headers,
        )
        assert res.status_code == 405

    def test_delete_price_history_endpoint_rejected_405(
        self, price_client: TestClient, sample_product: Product
    ):
        """DELETE /api/v1/products/{id}/price-history returns 405 Method Not Allowed."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.delete(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 405

    def test_delete_specific_history_record_rejected_405(
        self, price_client: TestClient, sample_product: Product
    ):
        """DELETE /api/v1/products/{id}/price-history/{history_id} returns 405 Method Not Allowed."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.delete(
            f"/api/v1/products/{sample_product.id}/price-history/123",
            headers=headers,
        )
        assert res.status_code == 405

    def test_compat_route_immutability_rejected_405(
        self, price_client: TestClient, sample_product: Product
    ):
        """DELETE /products/{id}/price-history on compat router also returns 405."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.delete(
            f"/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 405


# ==============================================================================
# 5. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
# ==============================================================================
class TestPriceHistoryRBAC:
    """Validate RBAC permissions according to API Specification."""

    def test_unauthenticated_request_rejected_401(
        self, price_client: TestClient, sample_product: Product
    ):
        """Unauthenticated request without token returns 401."""
        res = price_client.get(f"/api/v1/products/{sample_product.id}/price-history")
        assert res.status_code == 401

    def test_sales_manager_access_granted_200(
        self, price_client: TestClient, sample_product: Product
    ):
        """Sales Manager has explicit permission to view price history."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 200

    def test_admin_access_granted_200(
        self, price_client: TestClient, sample_product: Product
    ):
        """Admin has elevated permission to view price history."""
        headers = make_auth_header(RoleCode.ADMIN.value)
        res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 200

    @pytest.mark.parametrize(
        "forbidden_role",
        [
            RoleCode.SALES_REP.value,
            RoleCode.WAREHOUSE.value,
            RoleCode.ACCOUNTANT.value,
            RoleCode.CUSTOMER.value,
        ],
    )
    def test_other_roles_forbidden_403(
        self, price_client: TestClient, sample_product: Product, forbidden_role: str
    ):
        """Non-authorized roles (Sales Rep, Warehouse, Accountant, Customer) get 403 Forbidden."""
        headers = make_auth_header(forbidden_role)
        res = price_client.get(
            f"/api/v1/products/{sample_product.id}/price-history",
            headers=headers,
        )
        assert res.status_code == 403
        detail = res.json().get("detail", "")
        assert "Quyền bị từ chối" in detail or "Không đủ quyền" in detail

    def test_update_price_permission_denied_for_sales_rep(
        self, price_client: TestClient, sample_product: Product
    ):
        """Sales Rep cannot change product price."""
        headers = make_auth_header(RoleCode.SALES_REP.value)
        res = price_client.put(
            f"/api/v1/products/{sample_product.id}/price",
            json={"price": 99999},
            headers=headers,
        )
        assert res.status_code == 403
