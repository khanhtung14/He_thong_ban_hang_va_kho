"""Unit and API tests for Volume Discount Policy (Story S3-01).

Tests:
1. CRUD operations on /api/v1/discounts (Create, Read, Update, Delete, Toggle Status).
2. Compat route POST /api/v1/discount-policies.
3. Validation rules (target_type, tier bounds, percentages <= 100).
4. Best-discount calculation engine (calculate_best_discount and POST /api/v1/discounts/calculate).
"""
import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints.discount_policy_routes import calculate_best_discount
from app.api.v1.endpoints.rbac import create_access_token
from app.core.database import SessionLocal, get_db
from app.models.models import Category, DiscountPolicy, DiscountTier, Product
from main import app

client = TestClient(app)


def auth_headers(role: str = "Sales Manager", username: str = "test_sales_manager"):
    token = create_access_token(
        data={"sub": username, "role": role, "roles": [role]},
        expires_delta=None,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def setup_teardown_discounts():
    db = SessionLocal()
    # Cleanup any previous discount test records
    db.query(DiscountTier).delete()
    db.query(DiscountPolicy).delete()

    # Ensure a category exists
    cat = db.query(Category).filter(Category.code == "BEVERAGE").first()
    if not cat:
        cat = Category(name="Nước Giải Khát", code="BEVERAGE")
        db.add(cat)
        db.commit()
        db.refresh(cat)

    # Ensure test products exist
    p1 = db.query(Product).filter(Product.sku == "DISC-COCA-01").first()
    if not p1:
        p1 = Product(
            sku="DISC-COCA-01",
            name="Coca Cola 330ml Lon",
            category_id=cat.id,
            base_price=10000.0,
            cost_price=7000.0,
            base_unit="Lon",
            status="ACTIVE",
        )
        db.add(p1)

    p2 = db.query(Product).filter(Product.sku == "DISC-PEPSI-01").first()
    if not p2:
        p2 = Product(
            sku="DISC-PEPSI-01",
            name="Pepsi 330ml Lon",
            category_id=cat.id,
            base_price=9000.0,
            cost_price=6500.0,
            base_unit="Lon",
            status="ACTIVE",
        )
        db.add(p2)

    db.commit()
    yield
    try:
        db.query(Product).filter(Product.sku.in_(["DISC-COCA-01", "DISC-PEPSI-01"])).delete()
        db.commit()
    except Exception:
        pass
    db.close()


def test_create_sku_discount_policy_percentage():
    headers = auth_headers("Sales Manager")
    payload = {
        "name": "Chiết khấu sản lượng Coca Cola",
        "scope": "SKU",
        "targetId": "DISC-COCA-01",
        "discountType": "PERCENTAGE",
        "isActive": True,
        "tiers": [
            {"minQty": 10, "maxQty": 49, "discountPercent": 5.0},
            {"minQty": 50, "maxQty": 99, "discountPercent": 8.0},
            {"minQty": 100, "maxQty": None, "discountPercent": 12.0},
        ],
    }

    resp = client.post("/api/v1/discounts", json=payload, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    data = body["data"]
    assert data["name"] == "Chiết khấu sản lượng Coca Cola"
    assert data["target_type"] == "SKU"
    assert data["target_id"] == "DISC-COCA-01"
    assert data["target_name"] == "Coca Cola 330ml Lon"
    assert len(data["tiers"]) == 3
    assert data["tiers"][0]["discount_value"] == 5.0
    assert data["tiers"][2]["discount_value"] == 12.0


def test_compat_route_post_discount_policies():
    """Verify POST /api/v1/discount-policies strictly follows Story S3-01."""
    headers = auth_headers("Sales Manager")
    payload = {
        "name": "Chiết khấu sản lượng bia lon Q4",
        "scope": "SKU",
        "targetId": "DISC-COCA-01",
        "tiers": [
            {"minQty": 50, "maxQty": 99, "discountPercent": 2.0},
            {"minQty": 100, "maxQty": 999999, "discountPercent": 5.0},
        ],
    }

    resp = client.post("/api/v1/discount-policies", json=payload, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["name"] == "Chiết khấu sản lượng bia lon Q4"


def test_create_category_discount_policy_fixed_amount():
    db = SessionLocal()
    cat = db.query(Category).filter(Category.code == "BEVERAGE").first()
    cat_id = str(cat.id)
    db.close()

    headers = auth_headers("Sales Manager")
    payload = {
        "name": "Giảm tiền mặt nhóm Nước giải khát",
        "target_type": "CATEGORY",
        "target_id": cat_id,
        "discount_type": "FIXED_AMOUNT",
        "is_active": True,
        "tiers": [
            {"min_quantity": 20, "max_quantity": 99, "discount_value": 500.0},
            {"min_quantity": 100, "max_quantity": None, "discount_value": 1200.0},
        ],
    }

    resp = client.post("/api/v1/discounts", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["target_type"] == "CATEGORY"
    assert data["target_id"] == cat_id
    assert data["target_name"] == "Nước Giải Khát"
    assert data["discount_type"] == "FIXED_AMOUNT"


def test_validation_invalid_target_and_percentage():
    headers = auth_headers("Sales Manager")
    # Invalid target SKU
    resp = client.post(
        "/api/v1/discounts",
        json={
            "name": "Chính sách lỗi",
            "target_type": "SKU",
            "target_id": "NON_EXISTENT_SKU_999",
            "discount_type": "PERCENTAGE",
            "tiers": [{"min_quantity": 10, "discount_value": 5.0}],
        },
        headers=headers,
    )
    assert resp.status_code == 404

    # Percentage > 100
    resp2 = client.post(
        "/api/v1/discounts",
        json={
            "name": "Chính sách giảm trên 100%",
            "target_type": "SKU",
            "target_id": "DISC-COCA-01",
            "discount_type": "PERCENTAGE",
            "tiers": [{"min_quantity": 10, "discount_value": 150.0}],
        },
        headers=headers,
    )
    assert resp2.status_code == 400


def test_list_and_filter_discounts():
    headers = auth_headers("Sales Manager")
    # Create 2 policies
    client.post(
        "/api/v1/discounts",
        json={
            "name": "Chính sách Coca",
            "target_type": "SKU",
            "target_id": "DISC-COCA-01",
            "discount_type": "PERCENTAGE",
            "tiers": [{"min_quantity": 10, "discount_value": 5.0}],
        },
        headers=headers,
    )
    db = SessionLocal()
    cat = db.query(Category).filter(Category.code == "BEVERAGE").first()
    cat_id = str(cat.id)
    db.close()

    client.post(
        "/api/v1/discounts",
        json={
            "name": "Chính sách Nhóm nước",
            "target_type": "CATEGORY",
            "target_id": cat_id,
            "discount_type": "FIXED_AMOUNT",
            "tiers": [{"min_quantity": 20, "discount_value": 500.0}],
        },
        headers=headers,
    )

    # List all
    res = client.get("/api/v1/discounts", headers=headers)
    assert res.status_code == 200
    all_data = res.json()["data"]
    assert len(all_data) == 2

    # Filter by target_type
    res_sku = client.get("/api/v1/discounts?target_type=SKU", headers=headers)
    assert len(res_sku.json()["data"]) == 1

    # Search keyword
    res_search = client.get("/api/v1/discounts?search=Coca", headers=headers)
    assert len(res_search.json()["data"]) == 1


def test_update_and_toggle_status_and_delete():
    headers = auth_headers("Sales Manager")
    # 1. Create
    create_res = client.post(
        "/api/v1/discounts",
        json={
            "name": "Chính sách ban đầu",
            "target_type": "SKU",
            "target_id": "DISC-COCA-01",
            "discount_type": "PERCENTAGE",
            "tiers": [{"min_quantity": 10, "discount_value": 5.0}],
        },
        headers=headers,
    )
    policy_id = create_res.json()["data"]["id"]

    # 2. Update
    update_res = client.put(
        f"/api/v1/discounts/{policy_id}",
        json={
            "name": "Chính sách cập nhật mới",
            "tiers": [
                {"min_quantity": 10, "max_quantity": 49, "discount_value": 7.0},
                {"min_quantity": 50, "discount_value": 15.0},
            ],
        },
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["data"]["name"] == "Chính sách cập nhật mới"
    assert len(update_res.json()["data"]["tiers"]) == 2

    # 3. Toggle Status
    toggle_res = client.patch(f"/api/v1/discounts/{policy_id}/toggle-status", headers=headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["data"]["is_active"] is False

    # 4. Delete
    del_res = client.delete(f"/api/v1/discounts/{policy_id}", headers=headers)
    assert del_res.status_code == 200

    # 5. Check 404 after delete
    get_res = client.get(f"/api/v1/discounts/{policy_id}", headers=headers)
    assert get_res.status_code == 404


def test_calculate_best_discount_engine():
    """Verify that calculate_best_discount selects the best deal for the customer

    Scenario:
    Product: Coca Cola 330ml, base_price = 10,000 đ.
    Policy 1 (Category: Beverage):
       >= 50 lon -> giảm 1,500 đ/lon cố định.
    Policy 2 (SKU: DISC-COCA-01):
       >= 50 lon -> giảm 20% (tức 2,000 đ/lon).
    Customer orders 60 lon:
       Policy 1 saves: 1,500 * 60 = 90,000 đ
       Policy 2 saves: 2,000 * 60 = 120,000 đ -> Policy 2 wins!
    """
    db = SessionLocal()
    cat = db.query(Category).filter(Category.code == "BEVERAGE").first()
    cat_id = str(cat.id)

    # Create Policy 1 (Category, Fixed 1500đ)
    pol1 = DiscountPolicy(
        name="Category Beverage Fixed 1500",
        target_type="CATEGORY",
        target_id=cat_id,
        discount_type="FIXED_AMOUNT",
        is_active=True,
    )
    db.add(pol1)
    db.flush()
    db.add(DiscountTier(policy_id=pol1.id, min_quantity=50, max_quantity=None, discount_value=1500.0))

    # Create Policy 2 (SKU, 20%)
    pol2 = DiscountPolicy(
        name="Coca Cola 20% Volume",
        target_type="SKU",
        target_id="DISC-COCA-01",
        discount_type="PERCENTAGE",
        is_active=True,
    )
    db.add(pol2)
    db.flush()
    db.add(DiscountTier(policy_id=pol2.id, min_quantity=50, max_quantity=None, discount_value=20.0))

    db.commit()

    # Call calculate function
    best = calculate_best_discount(sku="DISC-COCA-01", quantity=60, base_price=10000.0, db=db)
    assert best["policy_id"] == pol2.id
    assert best["discount_per_unit"] == 2000.0
    assert best["discount_amount"] == 120000.0
    assert best["final_unit_price"] == 8000.0
    assert best["final_total"] == 480000.0

    # Also test API endpoint POST /api/v1/discounts/calculate
    api_res = client.post(
        "/api/v1/discounts/calculate",
        json={"sku": "DISC-COCA-01", "quantity": 60, "base_price": 10000.0},
    )
    assert api_res.status_code == 200
    api_data = api_res.json()["data"]
    assert api_data["policy_id"] == pol2.id
    assert api_data["discount_amount"] == 120000.0

    # Scenario: quantity = 10 (does not meet tier min 50)
    api_res_small = client.post(
        "/api/v1/discounts/calculate",
        json={"sku": "DISC-COCA-01", "quantity": 10, "base_price": 10000.0},
    )
    assert api_res_small.status_code == 200
    small_data = api_res_small.json()["data"]
    assert small_data["discount_amount"] == 0.0
    assert small_data["final_unit_price"] == 10000.0

    db.close()
