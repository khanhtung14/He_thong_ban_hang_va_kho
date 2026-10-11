import re

# Read current products.py
with open("backend/app/api/v1/endpoints/products.py", "r", encoding="utf-8") as f:
    orig = f.read()

# 1. Update imports
import_insert = """import io
import math
import re
import uuid
from zipfile import BadZipFile
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from fastapi import APIRouter, Depends, File, HTTPException, Path as PathParam, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse"""

orig = re.sub(
    r"from fastapi import APIRouter[^\n]*\n",
    import_insert + "\n",
    orig
)

orig = orig.replace(
    "    PERM_PRODUCTS_UNIT_MANAGE,\n    AuthenticatedUser,",
    "    PERM_PRODUCTS_UNIT_MANAGE,\n    PERM_PRODUCTS_IMPORT,\n    AuthenticatedUser,"
)

# 2. Extract and remove DEFAULT_MOCK_PRODUCTS block from bottom
mock_block = """DEFAULT_MOCK_PRODUCTS: dict[str, dict[str, Any]] = {
    "SKU-001": {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "category": "Nước tăng lực có gas",
        "category_id": 3,
        "sale_price": 500000,
        "cost_price": 350000,
        "margin": "30.0%",
        "stock_available": 120,
        "unit": "Thùng 24 lon",
    },
    "SKU-002": {
        "sku": "SKU-002",
        "name": "Cà phê lon Highlands 235ml",
        "category": "Cà phê",
        "category_id": None,
        "sale_price": 240000,
        "cost_price": 180000,
        "margin": "25.0%",
        "stock_available": 85,
        "unit": "Thùng 24 lon",
    },
}

MOCK_PRODUCTS: dict[str, dict[str, Any]] = {k: v.copy() for k, v in DEFAULT_MOCK_PRODUCTS.items()}


def reset_mock_products() -> None:
    global MOCK_PRODUCTS
    MOCK_PRODUCTS.clear()
    for k, v in DEFAULT_MOCK_PRODUCTS.items():
        MOCK_PRODUCTS[k] = v.copy()
"""

orig = orig.replace(mock_block, "")

# 3. Create Excel import block
excel_import_code = '''
DEFAULT_MOCK_PRODUCTS: dict[str, dict[str, Any]] = {
    "SKU-001": {
        "sku": "SKU-001",
        "name": "Nước tăng lực Red Bull 250ml",
        "category": "Nước tăng lực có gas",
        "category_id": 3,
        "sale_price": 500000,
        "cost_price": 350000,
        "margin": "30.0%",
        "stock_available": 120,
        "unit": "Thùng 24 lon",
    },
    "SKU-002": {
        "sku": "SKU-002",
        "name": "Cà phê lon Highlands 235ml",
        "category": "Cà phê",
        "category_id": None,
        "sale_price": 240000,
        "cost_price": 180000,
        "margin": "25.0%",
        "stock_available": 85,
        "unit": "Thùng 24 lon",
    },
}

MOCK_PRODUCTS: dict[str, dict[str, Any]] = {k: v.copy() for k, v in DEFAULT_MOCK_PRODUCTS.items()}


def reset_mock_products() -> None:
    global MOCK_PRODUCTS
    MOCK_PRODUCTS.clear()
    for k, v in DEFAULT_MOCK_PRODUCTS.items():
        MOCK_PRODUCTS[k] = v.copy()


MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB
IMPORT_COLUMNS = (
    "sku",
    "name",
    "category",
    "sale_price",
    "cost_price",
    "stock_available",
    "unit",
)
REQUIRED_IMPORT_COLUMNS = {"sku", "name", "category"}

HEADER_ALIASES: dict[str, str] = {
    "sku": "sku",
    "mã sku": "sku",
    "ma sku": "sku",
    "mã sản phẩm": "sku",
    "ma san pham": "sku",
    "mã": "sku",
    "ma": "sku",
    "name": "name",
    "tên sản phẩm": "name",
    "ten san pham": "name",
    "tên": "name",
    "ten": "name",
    "category": "category",
    "danh mục": "category",
    "danh muc": "category",
    "ngành hàng": "category",
    "nganh hang": "category",
    "loại sản phẩm": "category",
    "sale_price": "sale_price",
    "giá bán": "sale_price",
    "gia ban": "sale_price",
    "base_price": "sale_price",
    "cost_price": "cost_price",
    "giá vốn": "cost_price",
    "gia von": "cost_price",
    "stock_available": "stock_available",
    "tồn kho": "stock_available",
    "ton kho": "stock_available",
    "số lượng tồn": "stock_available",
    "số lượng": "stock_available",
    "so luong": "stock_available",
    "unit": "unit",
    "đơn vị tính": "unit",
    "don vi tinh": "unit",
    "đvt": "unit",
    "dvt": "unit",
    "đơn vị": "unit",
}

IMPORT_SESSIONS: dict[str, list[dict[str, Any]]] = {}


async def _read_import_file(file: UploadFile) -> bytes:
    if not file.filename or not (
        file.filename.lower().endswith(".xlsx") or file.filename.lower().endswith(".xls")
    ):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp Excel .xlsx hoặc .xls.")
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Tệp Excel vượt quá giới hạn 10 MB.")
    return content


def _row_to_import_item(row_number: int, values: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    sku = str(values.get("sku") or "").strip().upper()
    name = str(values.get("name") or "").strip()
    category = str(values.get("category") or "").strip()

    if not sku:
        errors.append("SKU không được để trống.")
    if not name:
        errors.append("Tên sản phẩm không được để trống.")
    if not category:
        errors.append("Danh mục không được để trống.")

    item: dict[str, Any] = {"sku": sku, "name": name, "category": category}

    for col in ("sale_price", "cost_price", "stock_available"):
        raw_val = values.get(col)
        if raw_val is None or str(raw_val).strip() == "":
            continue
        try:
            num = float(str(raw_val).strip())
            if not math.isfinite(num) or num < 0 or (col == "stock_available" and not num.is_integer()):
                raise ValueError
            item[col] = int(num) if num.is_integer() else num
        except (TypeError, ValueError):
            suffix = " nguyên." if col == "stock_available" else "."
            errors.append(f"{col} phải là số không âm{suffix}")

    unit = str(values.get("unit") or "").strip()
    item["unit"] = unit or "Cái"

    return {
        "row": row_number,
        "row_number": row_number,
        "sku": sku,
        "name": name,
        "category": category,
        "unit": item["unit"],
        "sale_price": item.get("sale_price"),
        "cost_price": item.get("cost_price"),
        "stock_available": item.get("stock_available"),
        "item": item,
        "errors": errors,
    }


def _parse_import_workbook(content: bytes) -> list[dict[str, Any]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Tệp không phải Excel .xlsx hợp lệ.") from exc

    try:
        worksheet = workbook.active
        rows_iter = worksheet.iter_rows(values_only=True)
        headers = next(rows_iter, None)
        if not headers:
            raise HTTPException(status_code=422, detail="Tệp Excel không có dòng tiêu đề.")

        normalized_headers: list[str] = []
        for val in headers:
            raw = str(val or "").strip().lower()
            mapped = HEADER_ALIASES.get(raw, raw)
            normalized_headers.append(mapped)

        nonempty_headers = [h for h in normalized_headers if h]
        if len(nonempty_headers) != len(set(nonempty_headers)):
            raise HTTPException(status_code=422, detail="Tệp Excel có tên cột bị trùng.")

        missing_columns = REQUIRED_IMPORT_COLUMNS - set(nonempty_headers)
        if missing_columns:
            raise HTTPException(
                status_code=422,
                detail=f"Thiếu cột bắt buộc: {', '.join(sorted(missing_columns))}.",
            )

        parsed_rows: list[dict[str, Any]] = []
        for row_number, cells in enumerate(rows_iter, start=2):
            if not any(value is not None and str(value).strip() for value in cells):
                continue
            values = {
                header: cells[index] if index < len(cells) else None
                for index, header in enumerate(normalized_headers)
                if header in IMPORT_COLUMNS
            }
            parsed_rows.append(_row_to_import_item(row_number, values))

        if not parsed_rows:
            raise HTTPException(status_code=422, detail="Tệp Excel không có dữ liệu sản phẩm.")
        return parsed_rows
    finally:
        workbook.close()


def _get_existing_skus(db: Session) -> set[str]:
    skus = {s[0].upper() for s in db.query(Product.sku).all() if s[0]}
    skus |= {k.upper() for k in MOCK_PRODUCTS.keys()}
    return skus


def _annotate_import_rows(rows: list[dict[str, Any]], existing_skus: set[str]) -> list[dict[str, Any]]:
    seen_skus: set[str] = set()
    result: list[dict[str, Any]] = []

    for r in rows:
        row = dict(r)
        errors = list(row.get("errors", []))
        sku = row.get("sku", "").upper()

        if sku and sku in seen_skus:
            errors.append("SKU bị lặp trong tệp Excel.")
        if sku:
            seen_skus.add(sku)

        if errors:
            action = "error"
            action_type = "ERROR"
            msg = "; ".join(errors)
            err_msg = msg
        elif sku in existing_skus:
            action = "update"
            action_type = "UPDATE"
            msg = "SKU đã tồn tại trong hệ thống, dữ liệu sẽ được cập nhật."
            err_msg = None
        else:
            action = "create"
            action_type = "CREATE"
            msg = "Sản phẩm sẽ được tạo mới."
            err_msg = None

        row["action"] = action
        row["action_type"] = action_type
        row["message"] = msg
        row["error_message"] = err_msg
        row.pop("errors", None)
        result.append(row)

    return result


def _apply_import_rows(rows: list[dict[str, Any]], db: Session) -> dict[str, Any]:
    created_count = 0
    updated_count = 0
    category_cache: dict[str, Category] = {}

    for row in rows:
        item = row.get("item") or row
        sku = str(item.get("sku") or "").strip().upper()
        if not sku:
            continue

        category_name = str(item.get("category") or "").strip()
        category_obj: Optional[Category] = None
        if category_name:
            if category_name in category_cache:
                category_obj = category_cache[category_name]
            else:
                category_obj = db.query(Category).filter(
                    (Category.name.ilike(category_name)) | (Category.code.ilike(category_name))
                ).first()
                if not category_obj:
                    clean_code = re.sub(r"[^A-Za-z0-9]", "", category_name).upper()[:15] or "CAT"
                    existing_code = db.query(Category).filter(Category.code == clean_code).first()
                    if existing_code:
                        clean_code = f"{clean_code[:10]}_{uuid.uuid4().hex[:4].upper()}"
                    category_obj = Category(code=clean_code, name=category_name)
                    db.add(category_obj)
                    db.flush()
                category_cache[category_name] = category_obj

        existing_product = db.query(Product).filter(Product.sku.ilike(sku)).first()
        if existing_product:
            updated_count += 1
            if item.get("name"):
                existing_product.name = str(item["name"]).strip()
            if category_obj:
                existing_product.category_id = category_obj.id
            if item.get("sale_price") is not None:
                existing_product.base_price = float(item["sale_price"])
            if item.get("cost_price") is not None:
                existing_product.cost_price = float(item["cost_price"])
            if item.get("unit"):
                existing_product.base_unit = str(item["unit"]).strip()
        elif sku in MOCK_PRODUCTS:
            updated_count += 1
        else:
            created_count += 1
            new_product = Product(
                sku=sku,
                name=str(item.get("name") or sku).strip(),
                category_id=category_obj.id if category_obj else None,
                base_unit=str(item.get("unit") or "Cái").strip(),
                base_price=float(item.get("sale_price") or 0.0),
                cost_price=float(item.get("cost_price") or 0.0),
                min_stock=int(item.get("stock_available") or 0),
                manage_by_lot=False,
                status="ACTIVE",
            )
            db.add(new_product)
            db.flush()

            base_unit_entry = ProductUnit(
                product_id=new_product.id,
                unit_name=new_product.base_unit,
                conversion_rate=1.0,
            )
            db.add(base_unit_entry)

        # Sync with MOCK_PRODUCTS
        if sku in MOCK_PRODUCTS:
            if item.get("name"):
                MOCK_PRODUCTS[sku]["name"] = str(item["name"]).strip()
            if category_name:
                MOCK_PRODUCTS[sku]["category"] = category_name
            if item.get("sale_price") is not None:
                MOCK_PRODUCTS[sku]["sale_price"] = item["sale_price"]
            if item.get("cost_price") is not None:
                MOCK_PRODUCTS[sku]["cost_price"] = item["cost_price"]
            if item.get("stock_available") is not None:
                MOCK_PRODUCTS[sku]["stock_available"] = item["stock_available"]
            if item.get("unit"):
                MOCK_PRODUCTS[sku]["unit"] = item["unit"]
        else:
            MOCK_PRODUCTS[sku] = {
                "sku": sku,
                "name": str(item.get("name") or sku).strip(),
                "category": category_name,
                "sale_price": item.get("sale_price", 0),
                "cost_price": item.get("cost_price", 0),
                "stock_available": item.get("stock_available", 0),
                "unit": str(item.get("unit") or "Cái").strip(),
            }

    db.commit()
    return {
        "success": True,
        "message": f"Nhập danh mục sản phẩm thành công. Đã tạo mới {created_count}, cập nhật {updated_count} sản phẩm.",
        "created_count": created_count,
        "updated_count": updated_count,
        "total": created_count + updated_count,
    }


@router.get("/import/template")
def download_import_template(
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_IMPORT)),
) -> StreamingResponse:
    """Download standard Excel import template."""
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Products"
    worksheet.append(list(IMPORT_COLUMNS))
    worksheet.append(["SKU-001", "Nước ngọt Coca-Cola 330ml", "Nước giải khát", 10000, 7500, 100, "Lon"])
    worksheet.append(["SKU-002", "Bánh Cosy Mè 288g", "Bánh kẹo", 35000, 26000, 50, "Hộp"])
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="product-import-template.xlsx"'},
    )


@router.post("/import/preview")
async def preview_product_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_IMPORT)),
) -> dict[str, Any]:
    """Parse Excel file and return validation & preview list."""
    content = await _read_import_file(file)
    parsed_rows = _parse_import_workbook(content)
    existing_skus = _get_existing_skus(db)
    rows = _annotate_import_rows(parsed_rows, existing_skus)

    session_id = str(uuid.uuid4())
    IMPORT_SESSIONS[session_id] = rows

    return {
        "success": True,
        "session_id": session_id,
        "batch_id": session_id,
        "total": len(rows),
        "create_count": sum(1 for r in rows if r["action_type"] == "CREATE"),
        "update_count": sum(1 for r in rows if r["action_type"] == "UPDATE"),
        "error_count": sum(1 for r in rows if r["action_type"] == "ERROR"),
        "items": rows,
        "rows": rows,
    }


@router.post("/import/commit")
async def commit_product_import(
    request: Request,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_IMPORT)),
) -> dict[str, Any]:
    """Commit validated products into the database."""
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if not file or not isinstance(file, UploadFile):
            raise HTTPException(status_code=400, detail="Thiếu tệp tải lên (file).")
        content = await _read_import_file(file)
        parsed_rows = _parse_import_workbook(content)
        existing_skus = _get_existing_skus(db)
        rows = _annotate_import_rows(parsed_rows, existing_skus)
        if any(r["action_type"] == "ERROR" for r in rows):
            raise HTTPException(
                status_code=422,
                detail={"message": "Không có dữ liệu nào được lưu vì tệp còn dòng lỗi.", "rows": rows},
            )
        return _apply_import_rows(rows, db)

    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = body.get("session_id")
    items_to_commit: list[dict[str, Any]] = []

    if session_id and session_id in IMPORT_SESSIONS:
        cached_rows = IMPORT_SESSIONS.pop(session_id)
        if any(r.get("action_type") == "ERROR" for r in cached_rows):
            raise HTTPException(
                status_code=422,
                detail="Không thể lưu vì phiên nhập chứa dòng dữ liệu lỗi.",
            )
        items_to_commit = cached_rows
    elif "items" in body and isinstance(body["items"], list):
        items_to_commit = body["items"]
    else:
        raise HTTPException(
            status_code=400,
            detail="Thiếu dữ liệu session_id hoặc danh sách items để lưu.",
        )

    return _apply_import_rows(items_to_commit, db)


@router.post("/import-excel")
async def import_excel_direct(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_IMPORT)),
) -> dict[str, Any]:
    """Direct Excel import endpoint matching API_SPECIFICATION.md POST /products/import-excel."""
    content = await _read_import_file(file)
    parsed_rows = _parse_import_workbook(content)
    existing_skus = _get_existing_skus(db)
    rows = _annotate_import_rows(parsed_rows, existing_skus)
    if any(r["action_type"] == "ERROR" for r in rows):
        raise HTTPException(
            status_code=422,
            detail={"message": "Không thể import vì tệp chứa dòng lỗi.", "rows": rows},
        )
    return _apply_import_rows(rows, db)
'''

# Place excel_import_code right after router = APIRouter(prefix="/api/v1/products", tags=["Products"])
target = 'router = APIRouter(prefix="/api/v1/products", tags=["Products"])'
orig = orig.replace(target, target + "\n" + excel_import_code)

with open("backend/app/api/v1/endpoints/products.py", "w", encoding="utf-8") as f:
    f.write(orig)

print("Successfully updated backend/app/api/v1/endpoints/products.py")
