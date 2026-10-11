"""Comprehensive automated tests for SCRUM-76 (S2-06):
Multi-level Product Categories Management.

Covers:
1. AC 1: Tree hierarchy with minimum 3 levels.
2. AC 2: Move product between categories (single product transfer).
3. AC 3: Deletion restriction when category still contains products.
4. Technical Safety Rule: Block deletion if category still has child categories.
5. Cycle prevention in category hierarchy.
6. Validation of unique category code and non-existent references.
7. Query filtering on products by category_id.
8. RBAC: Sales Manager and Admin have Full write permissions; read-only roles can only view.
9. Zero regression of existing product and RBAC functionality.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.backend.main import app
from src.backend.models import RoleCode
from src.backend.product_categories import reset_category_registry
from src.backend.products import reset_mock_products
from src.backend.rbac import create_access_token

client = TestClient(app)


def make_auth_header(role: str, username: str = "test_user") -> dict[str, str]:
    """Helper to generate JWT Bearer Authorization header for tests."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def reset_state():
    """Reset category registry and mock products before each test."""
    reset_category_registry()
    reset_mock_products()
    yield
    reset_category_registry()
    reset_mock_products()


# ==============================================================================
# 1. AC 1: Cấu trúc cây tối thiểu 3 cấp & phân cấp danh mục
# ==============================================================================

class TestCriterion1TreeHierarchy:
    """Verify that product categories support tree hierarchy with minimum 3 levels."""

    def test_default_seed_has_minimum_3_levels(self):
        """Default seed must contain at least 3 levels: Cấp 1, Cấp 2, Cấp 3."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        response = client.get("/api/v1/categories/tree", headers=headers)
        assert response.status_code == 200
        tree = response.json()
        assert len(tree) >= 1

        # Level 1: Ngành hàng (e.g., NGK)
        level1_node = tree[0]
        assert level1_node["level"] == 1
        assert level1_node["code"] == "NGK"
        assert level1_node["name"] == "Nước giải khát"
        assert len(level1_node["children"]) >= 1

        # Level 2: Nhóm hàng (e.g., ENERGY)
        level2_node = level1_node["children"][0]
        assert level2_node["level"] == 2
        assert level2_node["code"] == "ENERGY"
        assert level2_node["parent_id"] == level1_node["id"]
        assert len(level2_node["children"]) >= 1

        # Level 3: Phân nhóm hàng (e.g., ENERGY_GAS)
        level3_node = level2_node["children"][0]
        assert level3_node["level"] == 3
        assert level3_node["code"] == "ENERGY_GAS"
        assert level3_node["parent_id"] == level2_node["id"]

    def test_create_and_query_level_4_category(self):
        """System must allow creating deeper levels (e.g. Level 4) dynamically."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        payload = {
            "code": "ENERGY_CAN_250",
            "name": "Nước tăng lực có gas lon 250ml",
            "parent_id": 3,  # Child of level 3 (ENERGY_GAS)
            "description": "Lon dung tích nhỏ 250ml",
        }
        res = client.post("/api/v1/categories", json=payload, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["category"]["level"] == 4
        assert data["category"]["code"] == "ENERGY_CAN_250"

        # Check in tree
        tree_res = client.get("/api/v1/categories/tree", headers=headers)
        tree = tree_res.json()
        l1 = tree[0]
        l2 = l1["children"][0]
        l3 = l2["children"][0]
        assert len(l3["children"]) == 1
        assert l3["children"][0]["code"] == "ENERGY_CAN_250"
        assert l3["children"][0]["level"] == 4

    def test_update_category_parent_id(self):
        """Updating category parent_id should successfully relocate the node in the hierarchy."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # Create a new Level 1 category: "BÁNH KẸO"
        create_res = client.post(
            "/api/v1/categories",
            json={"code": "CONF", "name": "Bánh kẹo", "parent_id": None},
            headers=headers,
        )
        assert create_res.status_code == 201
        conf_id = create_res.json()["category"]["id"]

        # Move category 3 (ENERGY_GAS) under Bánh kẹo
        update_res = client.put(
            "/api/v1/categories/3",
            json={"parent_id": conf_id},
            headers=headers,
        )
        assert update_res.status_code == 200
        assert update_res.json()["category"]["parent_id"] == conf_id
        assert update_res.json()["category"]["level"] == 2


# ==============================================================================
# 2. Validation & Edge Cases (Cycle, Duplicate, Not Found)
# ==============================================================================

class TestCategoryValidationAndEdgeCases:
    """Verify validation rules: cycle prevention, unique code, non-existent entity handling."""

    def test_cycle_prevention_self_parent(self):
        """A category cannot be its own parent."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.put("/api/v1/categories/2", json={"parent_id": 2}, headers=headers)
        assert res.status_code == 400
        assert "vòng lặp" in res.json()["detail"].lower()

    def test_cycle_prevention_descendant_parent(self):
        """Category 1 cannot set its parent to Category 3 (which is its grandchild)."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.put("/api/v1/categories/1", json={"parent_id": 3}, headers=headers)
        assert res.status_code == 400
        assert "vòng lặp" in res.json()["detail"].lower()

    def test_duplicate_category_code_rejected(self):
        """Creating a category with an existing code must be rejected with 400."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.post(
            "/api/v1/categories",
            json={"code": "NGK", "name": "Trùng mã nước giải khát"},
            headers=headers,
        )
        assert res.status_code == 400
        assert "đã tồn tại" in res.json()["detail"].lower()

    def test_category_not_found(self):
        """Non-existent category operations must return 404 or 400 appropriately."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        # GET non-existent
        res = client.get("/api/v1/categories/9999", headers=headers)
        assert res.status_code == 404

        # PUT non-existent
        res = client.put("/api/v1/categories/9999", json={"name": "New"}, headers=headers)
        assert res.status_code == 404

        # DELETE non-existent
        res = client.delete("/api/v1/categories/9999", headers=headers)
        assert res.status_code == 404

        # POST with non-existent parent_id
        res = client.post(
            "/api/v1/categories",
            json={"code": "NEW_CAT", "name": "New", "parent_id": 9999},
            headers=headers,
        )
        assert res.status_code == 400
        assert "không tồn tại" in res.json()["detail"].lower()


# ==============================================================================
# 3. AC 2: Chuyển sản phẩm giữa các nhóm (Move Product)
# ==============================================================================

class TestCriterion2MoveProduct:
    """Verify single-product transfer between categories."""

    def test_move_product_success(self):
        """Move SKU-001 from category 3 (ENERGY_GAS) to category 2 (ENERGY)."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # Before: SKU-001 is in category 3
        prod_before = client.get("/api/v1/products/SKU-001", headers=headers).json()
        assert prod_before["category_id"] == 3

        # Move to category 2
        move_res = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert move_res.status_code == 200
        data = move_res.json()
        assert data["sku"] == "SKU-001"
        assert data["old_category_id"] == 3
        assert data["new_category_id"] == 2
        assert data["new_category_name"] == "Nước tăng lực"

        # Verify product detail now reflects category_id = 2
        prod_after = client.get("/api/v1/products/SKU-001", headers=headers).json()
        assert prod_after["category_id"] == 2
        assert prod_after["category"] == "Nước tăng lực"

    def test_products_list_filtered_by_category_id(self):
        """Query parameter GET /api/v1/products?category_id=X filters products accurately."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # SKU-001 initially belongs to category_id=3, SKU-002 has category_id=None (uncategorized / Cà phê)
        res_cat3 = client.get("/api/v1/products?category_id=3", headers=headers)
        assert res_cat3.status_code == 200
        skus_cat3 = [p["sku"] for p in res_cat3.json()]
        assert "SKU-001" in skus_cat3
        assert "SKU-002" not in skus_cat3

        # Category 2 initially has no products
        res_cat2_init = client.get("/api/v1/products?category_id=2", headers=headers)
        assert res_cat2_init.status_code == 200
        assert len(res_cat2_init.json()) == 0

        # Move SKU-001 to category 2
        move_res = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert move_res.status_code == 200

        # Now category 2 contains SKU-001, and category 3 is empty
        res_cat2_after = client.get("/api/v1/products?category_id=2", headers=headers)
        assert res_cat2_after.status_code == 200
        skus_cat2_after = [p["sku"] for p in res_cat2_after.json()]
        assert "SKU-001" in skus_cat2_after
        assert "SKU-002" not in skus_cat2_after

        res_cat3_after = client.get("/api/v1/products?category_id=3", headers=headers)
        assert res_cat3_after.status_code == 200
        assert len(res_cat3_after.json()) == 0

        # Without query param: returns all products (both SKU-001 and SKU-002)
        res_all = client.get("/api/v1/products", headers=headers)
        assert res_all.status_code == 200
        all_skus = [p["sku"] for p in res_all.json()]
        assert "SKU-001" in all_skus
        assert "SKU-002" in all_skus

    def test_move_product_invalid_sku(self):
        """Moving a non-existent SKU returns 404 Not Found."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.patch(
            "/api/v1/products/NON-EXISTENT-SKU/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert res.status_code == 404

    def test_move_product_invalid_target_category(self):
        """Moving to a non-existent category returns 404 Not Found."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 99999},
            headers=headers,
        )
        assert res.status_code == 404


# ==============================================================================
# 4. AC 3: Chặn xóa nhóm còn sản phẩm & Technical Safety Rule
# ==============================================================================

class TestCriterion3DeleteRestriction:
    """Verify AC 3: Deletion restriction when products exist, plus child group protection."""

    def test_delete_category_containing_products_is_strictly_forbidden(self):
        """Category 3 contains SKU-001 -> deletion must be rejected with 400 Bad Request."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.delete("/api/v1/categories/3", headers=headers)
        assert res.status_code == 400
        data = res.json()
        assert "không thể xóa" in data["detail"].lower()
        assert "sản phẩm" in data["detail"].lower()

    def test_delete_category_with_child_groups_is_forbidden_by_safety_rule(self):
        """Category 1 has 0 products directly, but has child category 2 -> rejected with 400."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)
        res = client.delete("/api/v1/categories/1", headers=headers)
        assert res.status_code == 400
        data = res.json()
        assert "nhóm con" in data["detail"].lower()

    def test_delete_category_succeeds_when_empty(self):
        """An empty leaf category (0 products, 0 children) can be deleted successfully."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # 1. Create an empty leaf category
        create_res = client.post(
            "/api/v1/categories",
            json={"code": "TEMP_CAT", "name": "Nhóm tạm", "parent_id": 3},
            headers=headers,
        )
        assert create_res.status_code == 201
        temp_id = create_res.json()["category"]["id"]

        # 2. Delete it -> Must succeed 200 OK
        del_res = client.delete(f"/api/v1/categories/{temp_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["deleted_category_id"] == temp_id

        # 3. Verify it is gone
        get_res = client.get(f"/api/v1/categories/{temp_id}", headers=headers)
        assert get_res.status_code == 404

    def test_delete_category_after_moving_products_out(self):
        """Category 3 contains SKU-001. Moving SKU-001 out allows Category 3 to be deleted."""
        headers = make_auth_header(RoleCode.SALES_MANAGER.value)

        # Move SKU-001 out of category 3 to category 2
        move_res = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert move_res.status_code == 200

        # Now category 3 has 0 products and 0 children -> deletion must succeed
        del_res = client.delete("/api/v1/categories/3", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["deleted_category_id"] == 3


# ==============================================================================
# 5. RBAC & Security Scoping
# ==============================================================================

class TestCategoryRBACPermissions:
    """Verify that only Sales Manager and Admin have write access; read-only roles can only view."""

    def test_admin_has_full_management_access(self):
        """Admin has full permission to create, update, delete categories and move products."""
        headers = make_auth_header(RoleCode.ADMIN.value, username="admin_super")

        # Admin can create
        res = client.post(
            "/api/v1/categories",
            json={"code": "ADMIN_CAT", "name": "Admin tạo"},
            headers=headers,
        )
        assert res.status_code == 201
        cat_id = res.json()["category"]["id"]

        # Admin can update
        res = client.put(f"/api/v1/categories/{cat_id}", json={"name": "Admin đổi"}, headers=headers)
        assert res.status_code == 200

        # Admin can move product between categories
        res_move = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert res_move.status_code == 200
        assert res_move.json()["new_category_id"] == 2

        # Admin can delete empty
        res = client.delete(f"/api/v1/categories/{cat_id}", headers=headers)
        assert res.status_code == 200

    @pytest.mark.parametrize("role", [
        RoleCode.SALES_REP.value,
        RoleCode.WAREHOUSE.value,
        RoleCode.ACCOUNTANT.value,
    ])
    def test_read_only_roles_can_read_but_cannot_write(self, role: str):
        """Sales Rep, Warehouse, Accountant can GET tree and categories, but are denied write operations."""
        headers = make_auth_header(role, username=f"test_{role.lower().replace(' ', '_')}")

        # GET is allowed
        res_tree = client.get("/api/v1/categories/tree", headers=headers)
        assert res_tree.status_code == 200

        res_list = client.get("/api/v1/categories", headers=headers)
        assert res_list.status_code == 200

        # POST is forbidden (403)
        res_post = client.post(
            "/api/v1/categories",
            json={"code": "HACK_CAT", "name": "Hack"},
            headers=headers,
        )
        assert res_post.status_code == 403

        # PUT is forbidden (403)
        res_put = client.put("/api/v1/categories/1", json={"name": "Hack"}, headers=headers)
        assert res_put.status_code == 403

        # DELETE is forbidden (403)
        res_del = client.delete("/api/v1/categories/1", headers=headers)
        assert res_del.status_code == 403

        # PATCH move product is forbidden (403)
        res_patch = client.patch(
            "/api/v1/products/SKU-001/category",
            json={"target_category_id": 2},
            headers=headers,
        )
        assert res_patch.status_code == 403

    def test_unauthenticated_request_rejected(self):
        """Requests without Authorization token return 401 Unauthorized."""
        assert client.get("/api/v1/categories/tree").status_code == 401
        assert client.post("/api/v1/categories", json={"code": "X", "name": "X"}).status_code == 401


# ==============================================================================
# 6. Zero Regression of Existing Product APIs
# ==============================================================================

class TestZeroRegressionProductAPIs:
    """Verify that existing Product APIs still work seamlessly after SCRUM-76 changes."""

    def test_regression_existing_product_apis(self):
        """Verify GET /products and GET /products/{sku} maintain backward compatibility and RBAC masking."""
        # 1. Sales Rep: list and detail work, cost_price and margin are masked
        sales_rep_headers = make_auth_header(RoleCode.SALES_REP.value, username="rep_01")
        res_rep_list = client.get("/api/v1/products", headers=sales_rep_headers)
        assert res_rep_list.status_code == 200
        rep_products = res_rep_list.json()
        assert len(rep_products) >= 2
        for prod in rep_products:
            assert "cost_price" not in prod
            assert "margin" not in prod
            assert "sale_price" in prod
            assert "category_id" in prod

        res_rep_detail = client.get("/api/v1/products/SKU-001", headers=sales_rep_headers)
        assert res_rep_detail.status_code == 200
        rep_detail = res_rep_detail.json()
        assert rep_detail["sku"] == "SKU-001"
        assert "cost_price" not in rep_detail
        assert "margin" not in rep_detail

        # 2. Warehouse: list and detail work, cost_price and margin are masked
        wh_headers = make_auth_header(RoleCode.WAREHOUSE.value, username="wh_01")
        res_wh_list = client.get("/api/v1/products", headers=wh_headers)
        assert res_wh_list.status_code == 200
        for prod in res_wh_list.json():
            assert "cost_price" not in prod
            assert "margin" not in prod

        res_wh_detail = client.get("/api/v1/products/SKU-001", headers=wh_headers)
        assert res_wh_detail.status_code == 200
        assert "cost_price" not in res_wh_detail.json()
        assert "margin" not in res_wh_detail.json()

        # 3. Sales Manager: list and detail include sensitive financial fields (cost_price, margin)
        sm_headers = make_auth_header(RoleCode.SALES_MANAGER.value, username="mgr_01")
        res_sm_list = client.get("/api/v1/products", headers=sm_headers)
        assert res_sm_list.status_code == 200
        sm_products = res_sm_list.json()
        assert any("cost_price" in prod and "margin" in prod for prod in sm_products)

        res_sm_detail = client.get("/api/v1/products/SKU-001", headers=sm_headers)
        assert res_sm_detail.status_code == 200
        sm_detail = res_sm_detail.json()
        assert sm_detail["cost_price"] == 350000
        assert sm_detail["margin"] == "30.0%"

        # 4. Admin: compatible access, financial fields masked according to RBAC definition
        admin_headers = make_auth_header(RoleCode.ADMIN.value, username="admin_01")
        res_admin_list = client.get("/api/v1/products", headers=admin_headers)
        assert res_admin_list.status_code == 200
        for prod in res_admin_list.json():
            assert "cost_price" not in prod
            assert "margin" not in prod

        res_admin_detail = client.get("/api/v1/products/SKU-001", headers=admin_headers)
        assert res_admin_detail.status_code == 200
        assert "cost_price" not in res_admin_detail.json()
        assert "margin" not in res_admin_detail.json()
