"""Automated integration tests for Role-Based Access Control (RBAC).

Covers:
1. Test 1 (Sales Rep): Attempt to adjust inventory -> 403 Forbidden.
2. Test 2 (Warehouse): Fetch product / inventory info -> payload does NOT contain cost price and margin.
3. Test 3 (Sales Manager): View product / report info -> payload returns full cost price and margin.
4. Default-Deny tests: Unauthenticated requests and unauthorized access are denied.
5. All 7 roles validation in RoleCode enum and RBAC matrix.
"""

import pytest
from fastapi.testclient import TestClient

from src.backend.main import app
from src.backend.models import RoleCode, ROLE_DEFINITIONS
from src.backend.rbac import create_access_token

client = TestClient(app)


def make_auth_header_for_role(role: str, username: str = "test_user") -> dict[str, str]:
    """Helper to generate JWT Bearer Authorization header."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


class TestRBAC7RolesValidation:
    """Verify that all 7 roles exist and have defined permissions."""

    def test_all_7_roles_defined_in_role_code_enum(self):
        expected_roles = {
            "Customer",
            "Sales Rep",
            "Sales Manager",
            "Warehouse",
            "WH Manager",
            "Accountant",
            "Admin",
        }
        actual_roles = {r.value for r in RoleCode}
        assert actual_roles == expected_roles
        assert len(actual_roles) == 7

    def test_all_7_roles_have_metadata(self):
        for role_enum in RoleCode:
            assert role_enum in ROLE_DEFINITIONS
            info = ROLE_DEFINITIONS[role_enum]
            assert "name" in info and len(info["name"]) > 0
            assert "description" in info and len(info["description"]) > 0


class TestRBACDefaultDeny:
    """Verify Default-Deny rule: unauthenticated or invalid access is rejected."""

    def test_unauthenticated_request_rejected(self):
        # Calling protected endpoint without token must return 401
        response = client.get("/api/v1/products/SKU-001")
        assert response.status_code == 401

    def test_invalid_role_rejected(self):
        headers = make_auth_header_for_role("HackerRole")
        response = client.get("/api/v1/products/SKU-001", headers=headers)
        assert response.status_code == 403

    def test_customer_cannot_adjust_inventory(self):
        headers = make_auth_header_for_role(RoleCode.CUSTOMER.value)
        payload = {
            "sku": "SKU-001",
            "warehouse_id": 1,
            "quantity_delta": 10,
            "reason": "Khách tự ý điều chỉnh",
        }
        response = client.post("/api/v1/inventory/adjust", json=payload, headers=headers)
        assert response.status_code == 403


class TestRBACRequirement1SalesRepInventoryConstraint:
    """Test 1: Sales Rep TUYỆT ĐỐI KHÔNG có quyền cập nhật, chỉnh sửa số lượng tồn kho -> 403 Forbidden."""

    def test_sales_rep_cannot_adjust_inventory_returns_403(self):
        headers = make_auth_header_for_role(RoleCode.SALES_REP.value, username="sales_rep_01")
        payload = {
            "sku": "SKU-001",
            "warehouse_id": 1,
            "quantity_delta": 50,
            "reason": "Nhân viên kinh doanh cố ý sửa số lượng",
        }
        response = client.post("/api/v1/inventory/adjust", json=payload, headers=headers)
        assert response.status_code == 403
        data = response.json()
        assert "detail" in data
        assert "từ chối" in data["detail"].lower()

    def test_wh_manager_can_adjust_inventory_returns_200(self):
        # WH Manager has permission to adjust inventory
        headers = make_auth_header_for_role(RoleCode.WH_MANAGER.value, username="wh_manager_01")
        payload = {
            "sku": "SKU-001",
            "warehouse_id": 1,
            "quantity_delta": -2,
            "reason": "Hao hụt kiểm kê định kỳ",
        }
        response = client.post("/api/v1/inventory/adjust", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Điều chỉnh tồn kho thành công"
        assert data["sku"] == "SKU-001"


class TestRBACRequirement2WarehouseSensitiveDataMasking:
    """Test 2: Warehouse (Thủ kho) và Sales Rep KHÔNG ĐƯỢC XEM giá vốn và biên lợi nhuận."""

    def test_warehouse_cannot_view_cost_price_and_margin_in_product_detail(self):
        headers = make_auth_header_for_role(RoleCode.WAREHOUSE.value, username="warehouse_staff_01")
        response = client.get("/api/v1/products/SKU-001", headers=headers)
        assert response.status_code == 200
        data = response.json()

        # Must have basic product info
        assert data["sku"] == "SKU-001"
        assert data["name"] == "Nước tăng lực Red Bull 250ml"
        assert data["sale_price"] == 500000

        # MUST NOT contain cost_price or margin
        assert "cost_price" not in data
        assert "costPrice" not in data
        assert "cogs" not in data
        assert "margin" not in data
        assert "gross_margin" not in data

    def test_warehouse_cannot_view_cost_price_and_margin_in_inventory_items(self):
        headers = make_auth_header_for_role(RoleCode.WAREHOUSE.value, username="warehouse_staff_01")
        response = client.get("/api/v1/inventory/items", headers=headers)
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0
        for item in items:
            assert "cost_price" not in item
            assert "margin" not in item
            assert "quantity_available" in item

    def test_sales_rep_cannot_view_cost_price_and_margin_in_product_detail(self):
        headers = make_auth_header_for_role(RoleCode.SALES_REP.value, username="sales_rep_01")
        response = client.get("/api/v1/products/SKU-001", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "cost_price" not in data
        assert "margin" not in data
        assert data["sale_price"] == 500000

    def test_warehouse_cannot_access_sales_margin_reports_returns_403(self):
        headers = make_auth_header_for_role(RoleCode.WAREHOUSE.value, username="warehouse_staff_01")
        response = client.get("/api/v1/reports/sales-margin", headers=headers)
        assert response.status_code == 403


class TestRBACRequirement3SalesManagerFinancialVisibility:
    """Test 3: Sales Manager (và Admin) xem thông tin sản phẩm/báo cáo đầy đủ giá vốn và biên lợi nhuận."""

    def test_sales_manager_views_product_with_cost_price_and_margin(self):
        headers = make_auth_header_for_role(RoleCode.SALES_MANAGER.value, username="sales_manager_01")
        response = client.get("/api/v1/products/SKU-001", headers=headers)
        assert response.status_code == 200
        data = response.json()

        assert data["sku"] == "SKU-001"
        assert data["sale_price"] == 500000
        # Financial fields MUST be present
        assert data["cost_price"] == 350000
        assert data["margin"] == "30.0%"

    def test_sales_manager_views_sales_margin_report(self):
        headers = make_auth_header_for_role(RoleCode.SALES_MANAGER.value, username="sales_manager_01")
        response = client.get("/api/v1/reports/sales-margin", headers=headers)
        assert response.status_code == 200
        data = response.json()

        assert data["total_revenue"] == 150_000_000
        assert data["total_cogs"] == 105_000_000
        assert data["gross_profit"] == 45_000_000
        assert data["margin"] == "30.0%"

    def test_admin_also_has_full_financial_visibility(self):
        headers = make_auth_header_for_role(RoleCode.ADMIN.value, username="admin_super")
        response = client.get("/api/v1/products/SKU-001", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["cost_price"] == 350000
        assert data["margin"] == "30.0%"


class TestRBACEndToEndLoginFlow:
    """Verify that logging in issues a valid token and redirects properly according to role."""

    @pytest.fixture(autouse=True)
    def setup_accounts(self, monkeypatch):
        import json
        import bcrypt

        hashed = bcrypt.hashpw(b"Pass12345", bcrypt.gensalt()).decode("utf-8")
        test_accounts = [
            {"username": "customer_user", "password_hash": hashed, "role_code": "Customer"},
            {"username": "sales_user", "password_hash": hashed, "role_code": "Sales Rep"},
            {"username": "manager_user", "password_hash": hashed, "role_code": "Sales Manager"},
            {"username": "warehouse_user", "password_hash": hashed, "role_code": "Warehouse"},
            {"username": "wh_manager_user", "password_hash": hashed, "role_code": "WH Manager"},
            {"username": "accountant_user", "password_hash": hashed, "role_code": "Accountant"},
            {"username": "admin_user", "password_hash": hashed, "role_code": "Admin"},
        ]
        monkeypatch.setenv("LOGIN_USERS_JSON", json.dumps(test_accounts))

    def test_login_redirect_and_token_usage_flow(self):
        # 1. Login as Sales Rep
        res = client.post("/api/v1/auth/login", json={"username": "sales_user", "password": "Pass12345"})
        assert res.status_code == 200
        login_data = res.json()
        assert login_data["redirect_url"] == "/sales/orders"
        assert login_data["user"]["role_code"] == "Sales Rep"
        token = login_data["access_token"]

        # Call product endpoint with the issued token
        headers = {"Authorization": f"Bearer {token}"}
        prod_res = client.get("/api/v1/products/SKU-001", headers=headers)
        assert prod_res.status_code == 200
        prod_data = prod_res.json()
        # Financial fields stripped for Sales Rep
        assert "cost_price" not in prod_data
        assert "margin" not in prod_data

        # 2. Login as Sales Manager
        res_mgr = client.post("/api/v1/auth/login", json={"username": "manager_user", "password": "Pass12345"})
        assert res_mgr.status_code == 200
        mgr_data = res_mgr.json()
        assert mgr_data["redirect_url"] == "/manager/dashboard"
        assert mgr_data["user"]["role_code"] == "Sales Manager"
        mgr_token = mgr_data["access_token"]

        # Call product endpoint with the manager token
        mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
        prod_res_mgr = client.get("/api/v1/products/SKU-001", headers=mgr_headers)
        assert prod_res_mgr.status_code == 200
        prod_data_mgr = prod_res_mgr.json()
        # Financial fields visible for Sales Manager
        assert prod_data_mgr["cost_price"] == 350000
        assert prod_data_mgr["margin"] == "30.0%"

