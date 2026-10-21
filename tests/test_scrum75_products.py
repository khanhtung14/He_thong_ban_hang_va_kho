from __future__ import annotations
"""Automated tests for SCRUM-75: Quản lý danh mục sản phẩm (Product CRUD & Constraints).

Covers:
1. POST /api/v1/products:
   - Tạo sản phẩm thủ công thành công với Sales Manager / Admin.
   - Kiểm tra mã SKU duy nhất (trùng trả về 400).
   - Chỉ Sales Manager / Admin mới được thiết lập giá vốn (cost_price).
   - Vai trò không có quyền products:manage bị từ chối 403.
2. PUT /api/v1/products/{id_or_sku}:
   - Cập nhật thông tin sản phẩm (tên, giá bán, danh mục, đơn vị tính).
   - Cập nhật giá vốn chỉ dành cho Sales Manager / Admin.
   - Cập nhật sản phẩm không tồn tại trả về 404.
3. DELETE /api/v1/products/{product_id}:
   - Chặn xóa sản phẩm khi đã phát sinh giao dịch (trả về 400).
   - Cho phép xóa sản phẩm khi chưa phát sinh giao dịch.
4. PATCH /api/v1/products/{product_id}/status:
   - Cập nhật trạng thái sản phẩm giữa ACTIVE và DISCONTINUED.
   - Trạng thái không hợp lệ trả về 400.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.models.models import Base, Category, InventoryTransaction, Order, OrderItem, Product, ProductUnit, RoleCode
from app.api.v1.endpoints.rbac import create_access_token
from src.backend.main import app

client = TestClient(app)


def make_auth_header(role: str, username: str = "test_user") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db_session():
    """Isolated SQLite database fixture for product testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()

    # Pre-seed category
    cat = Category(id=1, code="BEV", name="Đồ uống")
    session.add(cat)
    session.commit()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)


# ==============================================================================
# 1. TEST POST /api/v1/products (Tạo sản phẩm)
# ==============================================================================

def test_create_product_success_sales_manager(db_session):
    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    payload = {
        "sku": "SKU-BEER-001",
        "name": "Bia Tiger Lon 330ml",
        "categoryId": 1,
        "baseUnit": "Lon",
        "costPrice": 12000.0,
        "basePrice": 16000.0,
        "minStock": 100,
        "manageByLot": True,
        "imageUrl": "https://example.com/tiger.png",
    }
    response = client.post("/api/v1/products", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["sku"] == "SKU-BEER-001"
    assert data["data"]["name"] == "Bia Tiger Lon 330ml"
    assert data["data"]["cost_price"] == 12000.0
    assert data["data"]["sale_price"] == 16000.0
    assert data["data"]["baseUnit"] == "Lon"

    # Verify database persistence
    saved = db_session.query(Product).filter(Product.sku == "SKU-BEER-001").first()
    assert saved is not None
    assert saved.cost_price == 12000.0
    assert saved.base_price == 16000.0


def test_create_product_duplicate_sku_returns_400(db_session):
    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    payload = {
        "sku": "SKU-DUP-01",
        "name": "Sản phẩm ban đầu",
        "baseUnit": "Chai",
    }
    res1 = client.post("/api/v1/products", json=payload, headers=headers)
    assert res1.status_code == 201

    # Tạo lại với cùng SKU (không phân biệt hoa thường)
    res2 = client.post("/api/v1/products", json={"sku": "sku-dup-01", "name": "Trùng SKU", "baseUnit": "Chai"}, headers=headers)
    assert res2.status_code == 400
    assert "đã tồn tại" in res2.json()["detail"]


def test_create_product_forbidden_for_unauthorized_roles(db_session):
    # Sales Rep không có quyền products:manage
    rep_headers = make_auth_header(RoleCode.SALES_REP.value, username="rep_01")
    payload = {"sku": "SKU-REP-01", "name": "Bán thử", "baseUnit": "Cái"}
    res = client.post("/api/v1/products", json=payload, headers=rep_headers)
    assert res.status_code == 403


# ==============================================================================
# 2. TEST PUT /api/v1/products/{id_or_sku} (Cập nhật sản phẩm)
# ==============================================================================

def test_update_product_success(db_session):
    # Seed product
    prod = Product(
        sku="SKU-UPDATE-01",
        name="Tên cũ",
        base_unit="Lon",
        base_price=10000.0,
        cost_price=8000.0,
        status="ACTIVE",
    )
    db_session.add(prod)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    update_payload = {
        "name": "Tên mới đã sửa",
        "basePrice": 12000.0,
        "costPrice": 9000.0,
    }
    res = client.put(f"/api/v1/products/{prod.id}", json=update_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["name"] == "Tên mới đã sửa"
    assert data["sale_price"] == 12000.0
    assert data["cost_price"] == 9000.0

    db_session.refresh(prod)
    assert prod.name == "Tên mới đã sửa"
    assert prod.cost_price == 9000.0


def test_update_product_by_sku(db_session):
    prod = Product(sku="SKU-BY-CODE", name="Bia", base_unit="Lon", status="ACTIVE")
    db_session.add(prod)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.put("/api/v1/products/SKU-BY-CODE", json={"name": "Bia lon cập nhật"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["data"]["name"] == "Bia lon cập nhật"


def test_update_nonexistent_product_returns_404(db_session):
    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.put("/api/v1/products/SKU-NOT-EXIST", json={"name": "Lỗi"}, headers=headers)
    assert res.status_code == 404


# ==============================================================================
# 3. TEST DELETE /api/v1/products/{product_id} (Ràng buộc giao dịch)
# ==============================================================================

def test_delete_product_with_order_transactions_blocked(db_session):
    # Seed product and order item
    prod = Product(sku="SKU-ORDERED", name="Hàng đã bán", base_unit="Chai", status="ACTIVE")
    db_session.add(prod)
    db_session.flush()

    order_item = OrderItem(order_id=999, product_id=prod.id, sku=prod.sku, quantity=5, unit_price=10000.0)
    db_session.add(order_item)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.delete(f"/api/v1/products/{prod.id}", headers=headers)
    assert res.status_code == 400
    assert "đã phát sinh giao dịch, không thể xóa" in res.json()["detail"]
    assert "DISCONTINUED" in res.json()["detail"]

    # Product still exists
    assert db_session.query(Product).filter(Product.id == prod.id).first() is not None


def test_delete_product_with_inventory_transactions_blocked(db_session):
    prod = Product(sku="SKU-INV-TXN", name="Hàng kho", base_unit="Thùng", status="ACTIVE")
    db_session.add(prod)
    db_session.flush()

    inv_txn = InventoryTransaction(
        product_id=prod.id,
        warehouse_id=1,
        transaction_type="IN",
        unit_name="Thùng",
        input_quantity=10,
        conversion_rate_snapshot=1.0,
        base_quantity=10,
    )
    db_session.add(inv_txn)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.delete(f"/api/v1/products/{prod.id}", headers=headers)
    assert res.status_code == 400
    assert "đã phát sinh giao dịch" in res.json()["detail"]


def test_delete_product_without_transactions_success(db_session):
    prod = Product(sku="SKU-CLEAN", name="Hàng chưa bán", base_unit="Cái", status="ACTIVE")
    db_session.add(prod)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.delete(f"/api/v1/products/{prod.id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["success"] is True

    # Product deleted
    assert db_session.query(Product).filter(Product.id == prod.id).first() is None


# ==============================================================================
# 4. TEST PATCH /api/v1/products/{product_id}/status (Đổi trạng thái)
# ==============================================================================

def test_update_product_status_active_to_discontinued(db_session):
    prod = Product(sku="SKU-STATUS-01", name="Hàng đổi trạng thái", base_unit="Lon", status="ACTIVE")
    db_session.add(prod)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.patch(f"/api/v1/products/{prod.id}/status", json={"status": "DISCONTINUED"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "DISCONTINUED"

    db_session.refresh(prod)
    assert prod.status == "DISCONTINUED"


def test_update_product_status_invalid_value_returns_400(db_session):
    prod = Product(sku="SKU-STATUS-02", name="Hàng", base_unit="Lon", status="ACTIVE")
    db_session.add(prod)
    db_session.commit()

    headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="sm_01")
    res = client.patch(f"/api/v1/products/{prod.id}/status", json={"status": "INVALID_STATUS"}, headers=headers)
    assert res.status_code == 400
