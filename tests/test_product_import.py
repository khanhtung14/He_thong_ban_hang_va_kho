import copy
import io

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from src.backend import products
from src.backend.main import app
from src.backend.rbac import create_access_token


client = TestClient(app)


def auth_headers(role="Sales Manager"):
    token = create_access_token({"sub": "import_user", "role": role})
    return {"Authorization": f"Bearer {token}"}


def xlsx_file(rows):
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(products.IMPORT_COLUMNS)
    for row in rows:
        worksheet.append(row)
    content = io.BytesIO()
    workbook.save(content)
    return content.getvalue()


def test_import_template_is_downloadable_xlsx():
    response = client.get("/api/v1/products/import/template", headers=auth_headers())

    assert response.status_code == 200
    assert "product-import-template.xlsx" in response.headers["content-disposition"]
    workbook = load_workbook(io.BytesIO(response.content), read_only=True)
    assert tuple(next(workbook.active.iter_rows(values_only=True))) == products.IMPORT_COLUMNS
    workbook.close()


def test_preview_marks_existing_skus_and_reports_row_errors(monkeypatch):
    monkeypatch.setattr(products, "MOCK_PRODUCTS", copy.deepcopy(products.MOCK_PRODUCTS))
    content = xlsx_file(
        [
            ["SKU-001", "Updated", "Beverages", 510000, None, None, None],
            ["SKU-003", "New", "Snacks", None, None, 5, "Box"],
            ["SKU-004", "Missing category", "", None, None, None, None],
        ]
    )

    response = client.post(
        "/api/v1/products/import/preview",
        headers=auth_headers(),
        files={"file": ("products.xlsx", content)},
    )

    assert response.status_code == 200
    data = response.json()
    assert (data["create_count"], data["update_count"], data["error_count"]) == (1, 1, 1)
    assert data["rows"][0]["action"] == "update"
    assert "tồn tại" in data["rows"][0]["message"]
    assert data["rows"][1]["action"] == "create"
    assert data["rows"][2]["action"] == "error"
    assert "Danh mục" in data["rows"][2]["message"]
    assert data["rows"][2]["row"] == 4


def test_import_commit_updates_existing_sku_and_creates_new_sku(monkeypatch):
    monkeypatch.setattr(products, "MOCK_PRODUCTS", copy.deepcopy(products.MOCK_PRODUCTS))
    content = xlsx_file(
        [
            ["SKU-001", "Updated name", "New category", 520000, None, None, None],
            ["SKU-003", "New product", "Snacks", 30000, None, 12, "Box"],
        ]
    )

    response = client.post(
        "/api/v1/products/import/commit",
        headers=auth_headers(),
        files={"file": ("products.xlsx", content)},
    )

    assert response.status_code == 200
    assert response.json()["created_count"] == 1
    assert response.json()["updated_count"] == 1
    assert products.MOCK_PRODUCTS["SKU-001"]["name"] == "Updated name"
    assert products.MOCK_PRODUCTS["SKU-001"]["category"] == "New category"
    assert products.MOCK_PRODUCTS["SKU-003"]["name"] == "New product"


def test_import_commit_rejects_invalid_batch_without_partial_updates(monkeypatch):
    monkeypatch.setattr(products, "MOCK_PRODUCTS", copy.deepcopy(products.MOCK_PRODUCTS))
    original_name = products.MOCK_PRODUCTS["SKU-001"]["name"]
    content = xlsx_file(
        [
            ["SKU-001", "Should not apply", "Beverages", None, None, None, None],
            ["SKU-003", "Invalid", "", None, None, None, None],
        ]
    )

    response = client.post(
        "/api/v1/products/import/commit",
        headers=auth_headers(),
        files={"file": ("products.xlsx", content)},
    )

    assert response.status_code == 422
    assert products.MOCK_PRODUCTS["SKU-001"]["name"] == original_name
    assert "rows" in response.json()["detail"]


def test_only_product_import_roles_can_upload_files():
    response = client.post(
        "/api/v1/products/import/preview",
        headers=auth_headers("Sales Rep"),
        files={"file": ("products.xlsx", xlsx_file([["SKU-003", "New", "Beverages", None, None, None, None]]))},
    )

    assert response.status_code == 403


def test_preview_rejects_corrupt_xlsx():
    response = client.post(
        "/api/v1/products/import/preview",
        headers=auth_headers(),
        files={"file": ("products.xlsx", b"not an xlsx file")},
    )

    assert response.status_code == 422