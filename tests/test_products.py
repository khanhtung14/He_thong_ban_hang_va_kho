"""Automated test suite for SCRUM-75: Product Catalog Management.

User Story:
Là Quản lý kinh doanh, tôi muốn quản lý danh mục sản phẩm, để cả công ty gọi tên
và mã hàng giống nhau thay vì mỗi người một kiểu.

Acceptance Criteria:
1. Khai báo mã SKU, tên, nhóm hàng, đơn vị tính cơ sở, quy cách đóng gói, giá vốn, ảnh, trạng thái.
2. Mã SKU là duy nhất (không phân biệt chữ hoa, chữ thường).
3. Giá vốn chỉ Quản lý kinh doanh xem và sửa được (và Admin toàn quyền).
4. Sản phẩm đã phát sinh giao dịch thì không xoá được, chỉ ngừng kinh doanh.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.models import Base, Product, ProductCategory, ProductTransaction, User
from src.backend.products import router as products_router


@pytest.fixture
def product_client():
    """Create in-memory SQLite database and test client for products API."""
    test_app = FastAPI()
    test_app.include_router(products_router)

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    test_app.dependency_overrides[get_db] = override_get_db

    with TestClient(test_app) as client:
        yield client, TestingSessionLocal


# =====================================================================
# 1. AC 1: Khai báo sản phẩm với đầy đủ thông tin
# =====================================================================

def test_create_product_success_with_all_fields(product_client):
    client, SessionLocal = product_client

    payload = {
        "sku": "SKU-BIA-01",
        "name": "Bia Heineken Sleek 330ml",
        "category_id": 2,
        "category_name": "Bia & Đồ uống có cồn",
        "base_unit": "Lon",
        "packaging_spec": "Thùng 24 lon",
        "cost_price": 360000.0,
        "sale_price": 430000.0,
        "image_url": "https://example.com/heineken.jpg",
        "status": "ACTIVE",
        "description": "Bia Heineken Sleek can 330ml chính hãng",
    }

    headers = {"X-User-Role": "SALES_MANAGER", "X-User-Name": "demo_sales_mgr"}
    response = client.post("/api/v1/products", json=payload, headers=headers)

    assert response.status_code == 201
    data = response.json()
    assert "thành công" in data["message"]
    prod = data["product"]
    assert prod["sku"] == "SKU-BIA-01"
    assert prod["name"] == "Bia Heineken Sleek 330ml"
    assert prod["base_unit"] == "Lon"
    assert prod["packaging_spec"] == "Thùng 24 lon"
    assert prod["cost_price"] == 360000.0
    assert prod["sale_price"] == 430000.0
    assert prod["status"] == "ACTIVE"
    assert prod["status_label"] == "Đang kinh doanh"
    assert prod["has_transactions"] is False

    # Check database persistence
    with SessionLocal() as db:
        saved = db.query(Product).filter_by(sku="SKU-BIA-01").first()
        assert saved is not None
        assert saved.name == "Bia Heineken Sleek 330ml"
        assert saved.cost_price == 360000.0


def test_create_product_validation_missing_required_fields(product_client):
    client, _ = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Missing SKU
    res1 = client.post("/api/v1/products", json={"name": "Nước", "base_unit": "Chai"}, headers=headers)
    assert res1.status_code == 422

    # Missing Name
    res2 = client.post("/api/v1/products", json={"sku": "SKU-TEST", "base_unit": "Chai"}, headers=headers)
    assert res2.status_code == 422

    # Missing base_unit
    res3 = client.post("/api/v1/products", json={"sku": "SKU-TEST", "name": "Nước"}, headers=headers)
    assert res3.status_code == 422

    # Empty string SKU
    res4 = client.post("/api/v1/products", json={"sku": "   ", "name": "Nước", "base_unit": "Chai"}, headers=headers)
    assert res4.status_code == 422


# =====================================================================
# 2. AC 2: Mã SKU là duy nhất (Case-insensitive)
# =====================================================================

def test_sku_uniqueness_exact_match(product_client):
    client, _ = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    payload1 = {
        "sku": "SKU-DUPLICATE-01",
        "name": "Sản phẩm mẫu 1",
        "base_unit": "Lon",
        "cost_price": 10000.0,
    }
    res1 = client.post("/api/v1/products", json=payload1, headers=headers)
    assert res1.status_code == 201

    # Tạo lại với cùng mã SKU
    payload2 = {
        "sku": "SKU-DUPLICATE-01",
        "name": "Sản phẩm mẫu 2",
        "base_unit": "Chai",
        "cost_price": 20000.0,
    }
    res2 = client.post("/api/v1/products", json=payload2, headers=headers)
    assert res2.status_code == 400
    assert "đã tồn tại trong hệ thống" in res2.json()["detail"]


def test_sku_uniqueness_case_insensitive(product_client):
    client, _ = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo SKU hoa
    payload1 = {
        "sku": "SKU-ENERGY-RED",
        "name": "Red Bull hoa",
        "base_unit": "Lon",
    }
    res1 = client.post("/api/v1/products", json=payload1, headers=headers)
    assert res1.status_code == 201

    # Thử tạo với chữ thường "sku-energy-red"
    payload2 = {
        "sku": "sku-energy-red",
        "name": "Red Bull thường",
        "base_unit": "Lon",
    }
    res2 = client.post("/api/v1/products", json=payload2, headers=headers)
    assert res2.status_code == 400
    assert "đã tồn tại trong hệ thống" in res2.json()["detail"]


# =====================================================================
# 3. AC 3: Giá vốn chỉ Quản lý kinh doanh xem và sửa được
# =====================================================================

def test_cost_price_visible_to_sales_manager(product_client):
    client, _ = product_client
    headers = {"X-User-Role": "SALES_MANAGER", "X-User-Name": "demo_sales_mgr"}

    # Khởi tạo sản phẩm có giá vốn 350.000đ
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-COST-TEST", "name": "Hàng kiểm tra giá vốn", "base_unit": "Lon", "cost_price": 350000.0},
        headers=headers,
    )

    # GET list
    res_list = client.get("/api/v1/products?search=SKU-COST-TEST", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    target = next(p for p in items if p["sku"] == "SKU-COST-TEST")
    assert target["cost_price"] == 350000.0
    assert res_list.json()["can_view_cost_price"] is True

    # GET detail
    res_detail = client.get("/api/v1/products/SKU-COST-TEST", headers=headers)
    assert res_detail.status_code == 200
    assert res_detail.json()["cost_price"] == 350000.0


def test_cost_price_visible_to_admin(product_client):
    client, _ = product_client
    admin_headers = {"X-User-Role": "ADMIN", "X-User-Name": "demo_admin"}

    res_list = client.get("/api/v1/products", headers=admin_headers)
    assert res_list.status_code == 200
    assert res_list.json()["can_view_cost_price"] is True


@pytest.mark.parametrize("restricted_role", ["SALES", "SALES_REP", "WAREHOUSE", "WH_MANAGER", "ACCOUNTANT", "CUSTOMER"])
def test_cost_price_masked_for_non_sales_manager_roles(product_client, restricted_role):
    client, _ = product_client
    mgr_headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo sản phẩm có giá vốn bảo mật
    client.post(
        "/api/v1/products",
        json={"sku": f"SKU-CONFIDENTIAL-{restricted_role}", "name": "Bí mật thương mại", "base_unit": "Lon", "cost_price": 999000.0},
        headers=mgr_headers,
    )

    # Truy cập bằng vai trò bị giới hạn
    headers = {"X-User-Role": restricted_role, "X-User-Name": f"test_{restricted_role.lower()}"}

    # 1. Danh sách sản phẩm: cost_price phải là None
    res_list = client.get(f"/api/v1/products?search=SKU-CONFIDENTIAL-{restricted_role}", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    target = next(p for p in items if p["sku"] == f"SKU-CONFIDENTIAL-{restricted_role}")
    assert target["cost_price"] is None
    assert res_list.json()["can_view_cost_price"] is False

    # 2. Chi tiết sản phẩm: cost_price phải là None
    res_detail = client.get(f"/api/v1/products/SKU-CONFIDENTIAL-{restricted_role}", headers=headers)
    assert res_detail.status_code == 200
    assert res_detail.json()["cost_price"] is None


@pytest.mark.parametrize("unauthorized_role", ["SALES", "WAREHOUSE", "ACCOUNTANT", "CUSTOMER"])
def test_non_sales_manager_cannot_create_or_update_products(product_client, unauthorized_role):
    client, _ = product_client
    headers = {"X-User-Role": unauthorized_role}

    # Không thể POST tạo sản phẩm
    res_create = client.post(
        "/api/v1/products",
        json={"sku": "SKU-HACK", "name": "Tạo trái phép", "base_unit": "Lon"},
        headers=headers,
    )
    assert res_create.status_code == 403
    assert "Chỉ Quản lý kinh doanh và Quản trị viên" in res_create.json()["detail"]

    # Không thể PUT sửa sản phẩm
    res_update = client.put(
        "/api/v1/products/SKU-RB-250",
        json={"name": "Sửa trái phép"},
        headers=headers,
    )
    assert res_update.status_code == 403


# =====================================================================
# 4. AC 4: Ràng buộc giao dịch khi xóa & Chuyển ngừng kinh doanh
# =====================================================================

def test_delete_product_with_transactions_is_forbidden(product_client):
    client, SessionLocal = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo sản phẩm và giả lập giao dịch
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-WITH-TXN", "name": "Hàng đã bán", "base_unit": "Thùng", "cost_price": 50000.0},
        headers=headers,
    )

    # Ghi nhận giao dịch
    res_sim = client.post(
        "/api/v1/products/SKU-WITH-TXN/simulate-transaction",
        json={"transaction_type": "ORDER", "reference_code": "ORD-TEST-001", "quantity": 10},
        headers=headers,
    )
    assert res_sim.status_code == 200

    # Thử xóa sản phẩm đã có giao dịch
    res_del = client.delete("/api/v1/products/SKU-WITH-TXN", headers=headers)
    assert res_del.status_code == 400
    detail = res_del.json()["detail"]
    assert "đã phát sinh giao dịch" in detail
    assert "không thể xóa" in detail
    assert "ngừng kinh doanh" in detail

    # Xác nhận sản phẩm vẫn tồn tại trong database
    with SessionLocal() as db:
        prod = db.query(Product).filter_by(sku="SKU-WITH-TXN").first()
        assert prod is not None


def test_delete_product_without_transactions_is_allowed(product_client):
    client, SessionLocal = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo sản phẩm chưa có giao dịch nào
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-NO-TXN", "name": "Hàng mới chưa bán", "base_unit": "Hộp", "cost_price": 30000.0},
        headers=headers,
    )

    # Xóa sản phẩm
    res_del = client.delete("/api/v1/products/SKU-NO-TXN", headers=headers)
    assert res_del.status_code == 200
    assert res_del.json()["success"] is True

    # Xác nhận sản phẩm đã được xóa khỏi database
    with SessionLocal() as db:
        prod = db.query(Product).filter_by(sku="SKU-NO-TXN").first()
        assert prod is None


def test_change_product_status_to_discontinued(product_client):
    client, SessionLocal = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo sản phẩm đang kinh doanh
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-DISCONTINUE", "name": "Mặt hàng chuẩn bị dừng", "base_unit": "Gói"},
        headers=headers,
    )

    # Chuyển trạng thái sang INACTIVE (Ngừng kinh doanh)
    res_patch = client.patch(
        "/api/v1/products/SKU-DISCONTINUE/status",
        json={"status": "INACTIVE"},
        headers=headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "INACTIVE"
    assert res_patch.json()["status_label"] == "Ngừng kinh doanh"

    # Xác nhận DB lưu INACTIVE
    with SessionLocal() as db:
        prod = db.query(Product).filter_by(sku="SKU-DISCONTINUE").first()
        assert prod.status == "INACTIVE"


# =====================================================================
# 5. Bộ lọc tìm kiếm và danh mục
# =====================================================================

def test_filter_products_by_search_category_and_status(product_client):
    client, _ = product_client
    headers = {"X-User-Role": "SALES_MANAGER"}

    # Tạo các sản phẩm thử nghiệm
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-FILTER-A", "name": "Bia Tiger Bạc", "category_id": 2, "base_unit": "Lon", "status": "ACTIVE"},
        headers=headers,
    )
    client.post(
        "/api/v1/products",
        json={"sku": "SKU-FILTER-B", "name": "Nước suối Aquafina", "category_id": 1, "base_unit": "Chai", "status": "INACTIVE"},
        headers=headers,
    )

    # 1. Tìm theo từ khóa "Tiger"
    res1 = client.get("/api/v1/products?search=Tiger", headers=headers)
    items1 = res1.json()["items"]
    assert any(p["sku"] == "SKU-FILTER-A" for p in items1)
    assert not any(p["sku"] == "SKU-FILTER-B" for p in items1)

    # 2. Lọc theo trạng thái INACTIVE
    res2 = client.get("/api/v1/products?status=INACTIVE", headers=headers)
    items2 = res2.json()["items"]
    assert all(p["status"] == "INACTIVE" for p in items2)
    assert any(p["sku"] == "SKU-FILTER-B" for p in items2)

    # 3. Lọc theo category_id = 2
    res3 = client.get("/api/v1/products?category_id=2", headers=headers)
    items3 = res3.json()["items"]
    assert all(p["category_id"] == 2 for p in items3)


# =====================================================================
# 6. Default Deny - Yêu cầu xác thực khi không có credentials
# =====================================================================

def test_unauthenticated_requests_are_denied(product_client):
    client, _ = product_client
    # Gọi không có Header hay Token
    res = client.get("/api/v1/products")
    assert res.status_code == 401
    assert "Vui lòng đăng nhập" in res.json()["detail"]
