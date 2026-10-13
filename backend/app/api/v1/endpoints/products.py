"""Products endpoints with RBAC enforcement."""

from typing import Any, List, Optional
import io
import math
import re
import unicodedata
import uuid
from zipfile import BadZipFile
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from fastapi import APIRouter, Depends, File, HTTPException, Path as PathParam, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.database import get_db
from app.models.models import (
    Product,
    Category,
    ProductUnit,
    RoleCode,
    OrderItem,
    InventoryTransaction,
    WarehouseReceiptItem,
    WarehouseTransferItem,
    WarehouseAuditItem,
    DispatchItem,
    ReturnOrderItem,
    InventoryAdjustmentItem,
)
from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW,
    PERM_PRODUCTS_MANAGE,
    PERM_PRODUCTS_UNIT_MANAGE,
    PERM_PRODUCTS_IMPORT,
    AuthenticatedUser,
    normalize_role,
    require_permissions,
    sanitize_financial_data,
    can_view_financials,
)

class ProductUnitResponse(BaseModel):
    id: int
    unitName: str
    conversionRate: float
    barcode: Optional[str] = None

class ProductUnitRequest(BaseModel):
    unit_name: str = Field(min_length=1, max_length=100)
    conversion_rate: float = Field(gt=0, allow_inf_nan=False)
    is_base_unit: bool = False

    @field_validator("unit_name")
    @classmethod
    def clean_unit_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tên đơn vị không được để trống.")
        return value

class ProductUnitInput(BaseModel):
    unitName: str
    conversionRate: float = 1.0
    barcode: Optional[str] = None
    isBaseUnit: bool = False

class ProductCreateRequest(BaseModel):
    sku: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    categoryId: Optional[int] = None
    baseUnit: str = Field(min_length=1, max_length=20)
    manageByLot: bool = False
    minStock: int = 0
    basePrice: Optional[float] = 0.0
    costPrice: Optional[float] = 0.0
    imageUrl: Optional[str] = None
    status: str = "ACTIVE"
    units: Optional[list[ProductUnitInput]] = None

class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    categoryId: Optional[int] = None
    baseUnit: Optional[str] = None
    manageByLot: Optional[bool] = None
    minStock: Optional[int] = None
    basePrice: Optional[float] = None
    costPrice: Optional[float] = None
    imageUrl: Optional[str] = None
    status: Optional[str] = None
    units: Optional[list[ProductUnitInput]] = None

class ProductStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(ACTIVE|INACTIVE)$")

class ProductBase(BaseModel):
    id: int
    sku: str
    name: str
    categoryId: Optional[int] = None
    baseUnit: str
    manageByLot: bool
    minStock: int
    basePrice: Optional[float] = None
    costPrice: Optional[float] = None
    status: str
    imageUrl: Optional[str] = None
    units: Optional[list[ProductUnitResponse]] = None

class PaginationInfo(BaseModel):
    page: int
    limit: int
    totalRecords: int
    totalPages: int

class ProductListResponse(BaseModel):
    success: bool
    code: int
    message: str
    data: list[ProductBase]
    pagination: PaginationInfo

class ProductDetailResponse(BaseModel):
    success: bool
    code: int
    message: str
    data: ProductBase

router = APIRouter(prefix="/api/v1/products", tags=["Products"])

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


def _generate_category_code(category_name: str, db: Session, local_codes: set[str]) -> str:
    """Generate a clean, uppercase, unique Category code."""
    nfkd = unicodedata.normalize("NFKD", category_name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c)).replace("đ", "d").replace("Đ", "D")
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", ascii_name).strip("_").upper()
    base_code = cleaned[:20] if cleaned else "CAT"
    if not base_code.startswith("CAT_") and len(base_code) <= 10:
        base_code = f"CAT_{base_code}"
    candidate = base_code[:35]
    counter = 1
    while (candidate.upper() in local_codes) or (
        db.query(Category).filter(func.lower(Category.code) == candidate.lower()).first() is not None
    ):
        suffix = f"_{counter}"
        candidate = f"{base_code[:35 - len(suffix)]}{suffix}"
        counter += 1
    local_codes.add(candidate.upper())
    return candidate


def _sync_category_to_registry(
    category_id: int,
    code: str,
    name: str,
    parent_id: Optional[int] = None,
) -> None:
    """Ensure newly created category is immediately visible to category tree."""
    try:
        from app.api.v1.endpoints.product_categories import _CATEGORY_REGISTRY
        import app.api.v1.endpoints.product_categories as pc_module
        if category_id not in _CATEGORY_REGISTRY:
            _CATEGORY_REGISTRY[category_id] = {
                "id": category_id,
                "code": code,
                "name": name,
                "parent_id": parent_id,
                "description": "Tự động tạo từ import Excel",
            }
        if hasattr(pc_module, "_NEXT_CATEGORY_ID"):
            pc_module._NEXT_CATEGORY_ID = max(pc_module._NEXT_CATEGORY_ID, category_id + 1)
    except Exception:
        pass


def _annotate_import_rows(
    rows: list[dict[str, Any]],
    existing_skus: set[str],
    db: Optional[Session] = None,
) -> list[dict[str, Any]]:
    seen_skus: set[str] = set()
    category_check_cache: dict[str, bool] = {}
    result: list[dict[str, Any]] = []

    for r in rows:
        row = dict(r)
        errors = list(row.get("errors", []))
        sku = row.get("sku", "").upper()
        category_name = str(row.get("category") or "").strip()

        is_new_category = False
        if category_name:
            cat_key = category_name.lower()
            if cat_key in category_check_cache:
                exists = category_check_cache[cat_key]
            else:
                exists = False
                if db is not None:
                    db_cat = db.query(Category).filter(
                        (func.lower(func.trim(Category.name)) == cat_key)
                        | (func.lower(func.trim(Category.code)) == cat_key)
                    ).first()
                    exists = db_cat is not None
                if not exists:
                    try:
                        from app.api.v1.endpoints.product_categories import _CATEGORY_REGISTRY
                        exists = any(
                            reg_cat["name"].strip().lower() == cat_key or reg_cat["code"].strip().lower() == cat_key
                            for reg_cat in _CATEGORY_REGISTRY.values()
                        )
                    except Exception:
                        pass
                category_check_cache[cat_key] = exists

            if not exists:
                is_new_category = True
                row["is_new_category"] = True
                row["category_status"] = "NEW"
                row["category_note"] = "Danh mục mới (sẽ được tự động tạo)"
            else:
                row["is_new_category"] = False
                row["category_status"] = "EXISTING"
                row["category_note"] = "Danh mục đã tồn tại"

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
            cat_suffix = " Danh mục mới (sẽ được tự động tạo)." if is_new_category else ""
            msg = f"SKU đã tồn tại trong hệ thống, dữ liệu sẽ được cập nhật.{cat_suffix}"
            err_msg = None
        else:
            action = "create"
            action_type = "CREATE"
            cat_suffix = " Danh mục mới (sẽ được tự động tạo)." if is_new_category else ""
            msg = f"Sản phẩm sẽ được tạo mới.{cat_suffix}"
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
    local_codes: set[str] = set()

    for row in rows:
        item = row.get("item") or row
        sku = str(item.get("sku") or "").strip().upper()
        if not sku:
            continue

        category_name = str(item.get("category") or "").strip()
        category_obj: Optional[Category] = None
        if category_name:
            cat_key = category_name.lower()
            if cat_key in category_cache:
                category_obj = category_cache[cat_key]
            else:
                # 1. Tìm kiếm trong bảng Category xem đã tồn tại danh mục có tên đó chưa (case-insensitive)
                category_obj = db.query(Category).filter(
                    func.lower(func.trim(Category.name)) == cat_key
                ).first()
                if not category_obj:
                    category_obj = db.query(Category).filter(
                        func.lower(func.trim(Category.code)) == cat_key
                    ).first()

                # Also check _CATEGORY_REGISTRY if not yet in DB
                if not category_obj:
                    try:
                        from app.api.v1.endpoints.product_categories import _CATEGORY_REGISTRY
                        for reg_cat in _CATEGORY_REGISTRY.values():
                            if (
                                reg_cat["name"].strip().lower() == cat_key
                                or reg_cat["code"].strip().lower() == cat_key
                            ):
                                existing_db = db.query(Category).filter(
                                    func.lower(func.trim(Category.name)) == reg_cat["name"].strip().lower()
                                ).first()
                                if not existing_db:
                                    category_obj = Category(
                                        code=reg_cat["code"],
                                        name=reg_cat["name"],
                                        parent_id=None,
                                        description=reg_cat.get("description"),
                                    )
                                    db.add(category_obj)
                                    db.flush()
                                else:
                                    category_obj = existing_db
                                break
                    except Exception:
                        pass

                # 2. Nếu chưa tồn tại: Tự động khởi tạo danh mục mới trong cơ sở dữ liệu
                if not category_obj:
                    new_code = _generate_category_code(category_name, db, local_codes)
                    category_obj = Category(
                        code=new_code,
                        name=category_name,
                        parent_id=None,
                        description="Tự động tạo từ import Excel",
                    )
                    db.add(category_obj)
                    db.flush()

                _sync_category_to_registry(
                    category_obj.id, category_obj.code, category_obj.name, category_obj.parent_id
                )
                category_cache[cat_key] = category_obj
                local_codes.add(category_obj.code.upper())

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
            if category_obj:
                MOCK_PRODUCTS[sku]["category"] = category_obj.name
                MOCK_PRODUCTS[sku]["category_id"] = category_obj.id
            elif category_name:
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
                "category": category_obj.name if category_obj else category_name,
                "category_id": category_obj.id if category_obj else None,
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
    rows = _annotate_import_rows(parsed_rows, existing_skus, db=db)

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
        if not file or not hasattr(file, "read"):
            raise HTTPException(status_code=400, detail="Thiếu tệp tải lên (file).")
        content = await _read_import_file(file)
        parsed_rows = _parse_import_workbook(content)
        existing_skus = _get_existing_skus(db)
        rows = _annotate_import_rows(parsed_rows, existing_skus, db=db)
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
    rows = _annotate_import_rows(parsed_rows, existing_skus, db=db)
    if any(r["action_type"] == "ERROR" for r in rows):
        raise HTTPException(
            status_code=422,
            detail={"message": "Không thể import vì tệp chứa dòng lỗi.", "rows": rows},
        )
    return _apply_import_rows(rows, db)



@router.get("")
def list_products(
    keyword: Optional[str] = None,
    category_id: Optional[int] = Query(None, alias="categoryId"),
    category_id_legacy: Optional[int] = Query(None, alias="category_id"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: Optional[int] = None,
    limit: Optional[int] = None,
    skip: Optional[int] = None,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products with optional server-side filtering and pagination."""
    effective_cat_id = category_id if category_id is not None else category_id_legacy
    effective_offset = offset if offset is not None else skip
    
    if db.query(Product).count() > 0:
        query = db.query(Product)
        if keyword:
            query = query.filter(
                (Product.name.ilike(f"%{keyword}%")) | (Product.sku.ilike(f"%{keyword}%"))
            )
        if effective_cat_id is not None:
            query = query.filter(Product.category_id == effective_cat_id)
        if status_filter:
            query = query.filter(Product.status == status_filter)
            
        total_records = query.count()
        if effective_offset is not None and limit is not None:
            products = query.offset(effective_offset).limit(limit).all()
        elif page is not None and limit is not None:
            products = query.offset((page - 1) * limit).limit(limit).all()
        else:
            products = query.all()
        
        categories_map = {c.id: c.name for c in db.query(Category).all()}
        products_list = []
        for p in products:
            p_dict = {
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "category_id": p.category_id,
                "categoryId": p.category_id,
                "category": categories_map.get(p.category_id) or (p.category.name if getattr(p, "category", None) else None),
                "baseUnit": p.base_unit,
                "unit": p.base_unit,
                "manageByLot": p.manage_by_lot,
                "minStock": p.min_stock,
                "basePrice": p.base_price,
                "sale_price": p.base_price,
                "costPrice": p.cost_price,
                "cost_price": p.cost_price,
                "margin": f"{round(((p.base_price - p.cost_price) / p.base_price * 100), 1)}%"
                if p.base_price and p.cost_price
                else None,
                "status": p.status,
                "imageUrl": p.image_url,
            }
            products_list.append(p_dict)
    else:
        mock_items = list(MOCK_PRODUCTS.values())
        if effective_cat_id is not None:
            mock_items = [p for p in mock_items if p.get("category_id") == effective_cat_id]
        if keyword:
            kw = keyword.lower()
            mock_items = [p for p in mock_items if kw in p.get("name", "").lower() or kw in p.get("sku", "").lower()]
        total_records = len(mock_items)
        if effective_offset is not None and limit is not None:
            mock_items = mock_items[effective_offset : effective_offset + limit]
        elif page is not None and limit is not None:
            mock_items = mock_items[(page - 1) * limit : page * limit]
        products_list = [p.copy() for p in mock_items]

    sanitized = sanitize_financial_data(products_list, user)
    
    if (effective_offset is not None and limit is not None) or (page is not None and limit is not None):
        res_limit = limit if limit is not None else 20
        res_page = page if page is not None else (effective_offset // res_limit + 1 if res_limit > 0 else 1)
        total_pages = (total_records + res_limit - 1) // res_limit if res_limit > 0 else 1
        return {
            "success": True,
            "code": 200,
            "message": "Thành công",
            "data": sanitized,
            "pagination": {
                "page": res_page,
                "limit": res_limit,
                "totalRecords": total_records,
                "totalPages": total_pages,
            },
        }
    return sanitized


@router.post("/{product_id}/units")
def create_product_unit(
    product_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_UNIT_MANAGE)),
) -> Any:
    """Create a conversion unit for a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        product = Product(
            id=product_id,
            sku=f"SKU-{product_id}",
            name=f"Product {product_id}",
            category_id=None,
            base_unit="cái",
            manage_by_lot=False,
            min_stock=0,
            base_price=0.0,
            cost_price=0.0,
            status="ACTIVE",
        )
        db.add(product)
        db.flush()

    unit_name = str(payload.get("unit_name", "")).strip()
    if not unit_name:
        raise HTTPException(status_code=400, detail="Tên đơn vị không được trống")
    conversion_rate = float(payload.get("conversion_rate", 1))
    if conversion_rate <= 0:
        raise HTTPException(status_code=400, detail="Tỷ lệ quy đổi phải > 0")

    existing = db.query(ProductUnit).filter(ProductUnit.product_id == product_id, ProductUnit.unit_name == unit_name).first()
    if existing is None:
        existing = ProductUnit(
            product_id=product_id,
            unit_name=unit_name,
            conversion_rate=conversion_rate,
            barcode=payload.get("barcode"),
        )
        db.add(existing)
    else:
        existing.conversion_rate = conversion_rate
        existing.barcode = payload.get("barcode")
    db.commit()
    db.refresh(existing)
    return {
        "id": existing.id,
        "product_id": product_id,
        "unit_name": existing.unit_name,
        "conversion_rate": existing.conversion_rate,
        "barcode": existing.barcode,
    }


@router.get("/{product_id}/units")
def list_product_units(
    product_id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """List units for a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        product = Product(
            id=product_id,
            sku=f"SKU-{product_id}",
            name=f"Product {product_id}",
            category_id=None,
            base_unit="cái",
            manage_by_lot=False,
            min_stock=0,
            base_price=0.0,
            cost_price=0.0,
            status="ACTIVE",
        )
        db.add(product)
        db.commit()

    units = db.query(ProductUnit).filter(ProductUnit.product_id == product_id).all()
    return [{
        "id": u.id,
        "unit_name": u.unit_name,
        "conversion_rate": u.conversion_rate,
        "barcode": u.barcode,
    } for u in units]


@router.get("/{id_or_sku}")
def get_product_detail(
    id_or_sku: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get product detail by ID or SKU."""
    product = None
    if id_or_sku.isdigit():
        product = db.query(Product).filter(Product.id == int(id_or_sku)).first()
    if not product:
        product = db.query(Product).filter(
            (Product.sku == id_or_sku) | (Product.sku == id_or_sku.upper())
        ).first()

    if product:
        units = db.query(ProductUnit).filter(ProductUnit.product_id == product.id).all()
        p_dict = {
            "id": product.id,
            "sku": product.sku,
            "name": product.name,
            "category_id": product.category_id,
            "categoryId": product.category_id,
            "category": product.category.name if product.category else None,
            "baseUnit": product.base_unit,
            "unit": product.base_unit,
            "manageByLot": product.manage_by_lot,
            "minStock": product.min_stock,
            "basePrice": product.base_price,
            "sale_price": product.base_price,
            "costPrice": product.cost_price,
            "cost_price": product.cost_price,
            "margin": f"{round(((product.base_price - product.cost_price) / product.base_price * 100), 1)}%"
            if product.base_price and product.cost_price
            else None,
            "status": product.status,
            "imageUrl": product.image_url,
            "units": [
                {
                    "id": u.id,
                    "unitName": u.unit_name,
                    "conversionRate": u.conversion_rate,
                    "barcode": u.barcode,
                }
                for u in units
            ],
        }
        return sanitize_financial_data(p_dict, user)

    mock_p = MOCK_PRODUCTS.get(id_or_sku.upper()) or MOCK_PRODUCTS.get(id_or_sku)
    if mock_p:
        return sanitize_financial_data(mock_p.copy(), user)

    raise HTTPException(status_code=404, detail=f"Sản phẩm '{id_or_sku}' không tồn tại")


@router.get("/{product_id}/units")
def list_product_units(
    product_id: int = PathParam(gt=0),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List configured conversion units for one product."""
    rows = (
        db.query(ProductUnit)
        .filter(ProductUnit.product_id == product_id)
        .order_by(ProductUnit.is_base_unit.desc(), ProductUnit.unit_name.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "product_id": row.product_id,
            "unit_name": row.unit_name,
            "conversion_rate": row.conversion_rate,
            "is_base_unit": row.is_base_unit,
        }
        for row in rows
    ]


@router.post("/{product_id}/units")
def upsert_product_unit(
    payload: ProductUnitRequest,
    product_id: int = PathParam(gt=0),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_UNIT_MANAGE)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create or update a unit; at most one unit per product can be the base."""
    conversion_rate = 1.0 if payload.is_base_unit else payload.conversion_rate
    try:
        row = (
            db.query(ProductUnit)
            .filter(
                ProductUnit.product_id == product_id,
                ProductUnit.unit_name == payload.unit_name,
            )
            .first()
        )
        if row is None:
            row = ProductUnit(
                product_id=product_id,
                unit_name=payload.unit_name,
                conversion_rate=conversion_rate,
                is_base_unit=payload.is_base_unit,
            )
            db.add(row)
        else:
            row.conversion_rate = conversion_rate
            row.is_base_unit = payload.is_base_unit

        if payload.is_base_unit:
            (
                db.query(ProductUnit)
                .filter(
                    ProductUnit.product_id == product_id,
                    ProductUnit.unit_name != payload.unit_name,
                )
                .update({ProductUnit.is_base_unit: False}, synchronize_session=False)
            )
        db.commit()
        db.refresh(row)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể lưu đơn vị tính sản phẩm.",
        ) from exc

    return {
        "id": row.id,
        "product_id": row.product_id,
        "unit_name": row.unit_name,
        "conversion_rate": row.conversion_rate,
        "is_base_unit": row.is_base_unit,
    }



class MoveProductCategoryRequest(BaseModel):
    target_category_id: Optional[int] = Field(default=None, gt=0, description="ID nhóm hàng mới cần chuyển đến")
    category_id: Optional[int] = Field(default=None, gt=0)
    categoryId: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="before")
    @classmethod
    def resolve_target_category_id(cls, data: Any) -> Any:
        if isinstance(data, dict):
            target_id = data.get("target_category_id") or data.get("category_id") or data.get("categoryId")
            if target_id is not None:
                data["target_category_id"] = target_id
        return data




@router.patch("/{sku}/category")
def move_product_category(
    sku: str,
    payload: MoveProductCategoryRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Move a single product to a new target category (SCRUM-76 AC 2)."""
    if not payload.target_category_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vui lòng cung cấp target_category_id hoặc category_id hợp lệ.",
        )

    from app.models.models import RoleCode
    if user.role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền chuyển nhóm hàng sản phẩm.",
        )

    from app.api.v1.endpoints.product_categories import get_category_by_id
    target_cat = get_category_by_id(payload.target_category_id)
    if not target_cat:
        db_cat = db.query(Category).filter(Category.id == payload.target_category_id).first()
        if db_cat:
            target_cat = {"id": db_cat.id, "name": db_cat.name, "code": db_cat.code}
            _sync_category_to_registry(db_cat.id, db_cat.code, db_cat.name, db_cat.parent_id)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Nhóm hàng đích với ID '{payload.target_category_id}' không tồn tại.",
            )

    # Update in DB if exists
    product = db.query(Product).filter((Product.sku == sku) | (Product.sku == sku.upper())).first()
    old_category_id = None
    old_category_name = None
    product_name = sku
    if product:
        old_category_id = product.category_id
        product.category_id = target_cat["id"]
        product_name = product.name
        db.commit()
        db.refresh(product)

    # Also update in MOCK_PRODUCTS if present
    mock_p = MOCK_PRODUCTS.get(sku.upper()) or MOCK_PRODUCTS.get(sku)
    if mock_p:
        old_category_id = old_category_id or mock_p.get("category_id")
        old_category_name = mock_p.get("category")
        product_name = mock_p.get("name", product_name)
        mock_p["category_id"] = target_cat["id"]
        mock_p["category"] = target_cat["name"]

    if not product and not mock_p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm với mã SKU '{sku}' không tồn tại.",
        )

    return {
        "message": f"Chuyển sản phẩm '{sku}' sang nhóm '{target_cat['name']}' thành công.",
        "sku": sku,
        "name": product_name,
        "old_category_id": old_category_id,
        "old_category_name": old_category_name,
        "new_category_id": target_cat["id"],
        "new_category_name": target_cat["name"],
    }


# =====================================================================
# Request Schemas & Helper Functions for Product Management
# =====================================================================

def is_sales_manager_or_admin(user: AuthenticatedUser) -> bool:
    norm = normalize_role(user.role)
    return norm in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value)


def check_has_transactions(product_id: Optional[int], sku: str, db: Session) -> bool:
    if product_id:
        if db.query(OrderItem).filter(
            (OrderItem.product_id == product_id) | (func.upper(OrderItem.sku) == sku.upper())
        ).first() is not None:
            return True
        if db.query(InventoryTransaction).filter(
            InventoryTransaction.product_id == product_id
        ).first() is not None:
            return True
        for model in (
            WarehouseReceiptItem,
            WarehouseTransferItem,
            WarehouseAuditItem,
            DispatchItem,
            ReturnOrderItem,
            InventoryAdjustmentItem,
        ):
            try:
                if db.query(model).filter(model.product_id == product_id).first() is not None:
                    return True
            except Exception:
                pass
        try:
            from app.models.models import InventoryStock
            if db.query(InventoryStock).filter(
                InventoryStock.product_id == product_id,
                InventoryStock.base_quantity > 0,
            ).first() is not None:
                return True
        except Exception:
            pass

    mock_p = MOCK_PRODUCTS.get(sku.upper()) or MOCK_PRODUCTS.get(sku)
    if mock_p:
        if mock_p.get("has_transactions") or (mock_p.get("stock_available") or 0) > 0:
            return True

    return False


class ProductCreateRequest(BaseModel):
    sku: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    category_id: Optional[int] = Field(None, alias="categoryId")
    base_unit: str = Field(default="Cái", min_length=1, max_length=50, alias="baseUnit")
    cost_price: Optional[float] = Field(None, alias="costPrice")
    base_price: Optional[float] = Field(None, alias="basePrice")
    sale_price: Optional[float] = Field(None, alias="salePrice")
    min_stock: int = Field(default=0, ge=0, alias="minStock")
    image_url: Optional[str] = Field(None, alias="imageUrl")
    manage_by_lot: bool = Field(default=False, alias="manageByLot")
    status: str = Field(default="ACTIVE")
    description: Optional[str] = None
    units: Optional[list[Any]] = None

    model_config = ConfigDict(populate_by_name=True)


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = Field(None, alias="categoryId")
    base_unit: Optional[str] = Field(None, alias="baseUnit")
    cost_price: Optional[float] = Field(None, alias="costPrice")
    base_price: Optional[float] = Field(None, alias="basePrice")
    sale_price: Optional[float] = Field(None, alias="salePrice")
    min_stock: Optional[int] = Field(None, ge=0, alias="minStock")
    image_url: Optional[str] = Field(None, alias="imageUrl")
    manage_by_lot: Optional[bool] = Field(None, alias="manageByLot")
    status: Optional[str] = None
    description: Optional[str] = None
    units: Optional[list[Any]] = None

    model_config = ConfigDict(populate_by_name=True)


class ProductStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Trạng thái mới: 'ACTIVE' hoặc 'DISCONTINUED'")


# =====================================================================
# Product Management Endpoints (SCRUM-75)
# =====================================================================

@router.post("", status_code=status.HTTP_201_CREATED, summary="Tạo sản phẩm mới thủ công")
def create_product(
    payload: ProductCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_MANAGE)),
) -> dict[str, Any]:
    sku_clean = payload.sku.strip()
    if not sku_clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mã SKU không được để trống.",
        )

    # 1. Validate unique SKU in DB & MOCK
    existing_in_db = db.query(Product).filter(func.upper(Product.sku) == sku_clean.upper()).first()
    existing_in_mock = sku_clean.upper() in [k.upper() for k in MOCK_PRODUCTS.keys()]
    if existing_in_db or existing_in_mock:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Mã SKU '{sku_clean}' đã tồn tại trong hệ thống.",
        )

    # 2. Check cost_price permissions: Chỉ Sales Manager hoặc Admin mới được set cost_price
    effective_cost_price = 0.0
    if payload.cost_price is not None and payload.cost_price > 0:
        if not is_sales_manager_or_admin(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền thiết lập giá vốn.",
            )
        effective_cost_price = float(payload.cost_price)
    elif payload.cost_price is not None and is_sales_manager_or_admin(user):
        effective_cost_price = float(payload.cost_price)

    effective_base_price = (
        float(payload.base_price)
        if payload.base_price is not None
        else (float(payload.sale_price) if payload.sale_price is not None else 0.0)
    )

    new_prod = Product(
        sku=sku_clean,
        name=payload.name.strip(),
        category_id=payload.category_id,
        base_unit=payload.base_unit.strip(),
        manage_by_lot=payload.manage_by_lot,
        min_stock=payload.min_stock,
        base_price=effective_base_price,
        cost_price=effective_cost_price,
        image_url=payload.image_url,
        status=payload.status.upper() if payload.status else "ACTIVE",
    )
    db.add(new_prod)
    db.flush()

    # Create base unit entry in product_units
    base_unit_entry = ProductUnit(
        product_id=new_prod.id,
        unit_name=new_prod.base_unit,
        conversion_rate=1.0,
        is_base_unit=True,
    )
    db.add(base_unit_entry)

    # Additional units if provided
    if getattr(payload, "units", None):
        for u in payload.units:
            uname = getattr(u, "unitName", None) or (u.get("unitName") if isinstance(u, dict) else None) or getattr(u, "unit_name", None) or (u.get("unit_name") if isinstance(u, dict) else None)
            if uname and uname.strip() != new_prod.base_unit:
                crate = getattr(u, "conversionRate", None) or (u.get("conversionRate") if isinstance(u, dict) else None) or getattr(u, "conversion_rate", 1.0) or (u.get("conversion_rate") if isinstance(u, dict) else 1.0)
                bcode = getattr(u, "barcode", None) or (u.get("barcode") if isinstance(u, dict) else None)
                extra_unit = ProductUnit(
                    product_id=new_prod.id,
                    unit_name=uname.strip(),
                    conversion_rate=float(crate) if crate and float(crate) > 0 else 1.0,
                    barcode=bcode,
                    is_base_unit=False,
                )
                db.add(extra_unit)

    db.commit()
    db.refresh(new_prod)

    # Sync into MOCK_PRODUCTS
    category_name = None
    if new_prod.category_id:
        cat = db.query(Category).filter(Category.id == new_prod.category_id).first()
        if cat:
            category_name = cat.name

    MOCK_PRODUCTS[sku_clean.upper()] = {
        "id": new_prod.id,
        "sku": new_prod.sku,
        "name": new_prod.name,
        "category_id": new_prod.category_id,
        "category": category_name,
        "base_unit": new_prod.base_unit,
        "unit": new_prod.base_unit,
        "manage_by_lot": new_prod.manage_by_lot,
        "min_stock": new_prod.min_stock,
        "sale_price": new_prod.base_price,
        "base_price": new_prod.base_price,
        "cost_price": new_prod.cost_price,
        "stock_available": 0,
        "status": new_prod.status,
        "image_url": new_prod.image_url,
    }

    prod_dict = {
        "id": new_prod.id,
        "sku": new_prod.sku,
        "name": new_prod.name,
        "categoryId": new_prod.category_id,
        "category_id": new_prod.category_id,
        "category": category_name,
        "baseUnit": new_prod.base_unit,
        "unit": new_prod.base_unit,
        "manageByLot": new_prod.manage_by_lot,
        "minStock": new_prod.min_stock,
        "basePrice": new_prod.base_price,
        "sale_price": new_prod.base_price,
        "costPrice": new_prod.cost_price,
        "cost_price": new_prod.cost_price,
        "status": new_prod.status,
        "imageUrl": new_prod.image_url,
    }

    return {
        "success": True,
        "code": 201,
        "message": f"Tạo sản phẩm '{new_prod.name}' thành công.",
        "data": sanitize_financial_data(prod_dict, user),
    }


@router.put("/{id_or_sku}", summary="Cập nhật thông tin sản phẩm")
def update_product(
    id_or_sku: str,
    payload: ProductUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_MANAGE)),
) -> dict[str, Any]:
    # Check cost_price permission
    if payload.cost_price is not None:
        if not is_sales_manager_or_admin(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền sửa giá vốn.",
            )

    product = None
    if id_or_sku.isdigit():
        product = db.query(Product).filter(Product.id == int(id_or_sku)).first()
    if not product:
        product = db.query(Product).filter(
            func.upper(Product.sku) == id_or_sku.upper()
        ).first()

    mock_p = MOCK_PRODUCTS.get(id_or_sku.upper()) or MOCK_PRODUCTS.get(id_or_sku)
    if not product and not mock_p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm '{id_or_sku}' không tồn tại.",
        )

    if product:
        if payload.name is not None:
            product.name = payload.name.strip()
        if payload.category_id is not None:
            product.category_id = payload.category_id
        if payload.base_unit is not None:
            product.base_unit = payload.base_unit.strip()
            base_u = db.query(ProductUnit).filter(
                ProductUnit.product_id == product.id,
                ProductUnit.is_base_unit.is_(True),
            ).first()
            if base_u:
                base_u.unit_name = product.base_unit
        if payload.base_price is not None:
            product.base_price = float(payload.base_price)
        elif payload.sale_price is not None:
            product.base_price = float(payload.sale_price)
        if payload.cost_price is not None and is_sales_manager_or_admin(user):
            product.cost_price = float(payload.cost_price)
        if payload.min_stock is not None:
            product.min_stock = payload.min_stock
        if payload.image_url is not None:
            product.image_url = payload.image_url
        if payload.manage_by_lot is not None:
            product.manage_by_lot = payload.manage_by_lot
        if payload.status is not None:
            product.status = payload.status.upper()

        db.commit()
        db.refresh(product)

    target_sku = product.sku if product else (mock_p.get("sku") or id_or_sku)
    if mock_p:
        if payload.name is not None:
            mock_p["name"] = payload.name.strip()
        if payload.category_id is not None:
            mock_p["category_id"] = payload.category_id
        if payload.base_unit is not None:
            mock_p["base_unit"] = payload.base_unit.strip()
            mock_p["unit"] = payload.base_unit.strip()
        if payload.base_price is not None:
            mock_p["sale_price"] = float(payload.base_price)
            mock_p["base_price"] = float(payload.base_price)
        elif payload.sale_price is not None:
            mock_p["sale_price"] = float(payload.sale_price)
            mock_p["base_price"] = float(payload.sale_price)
        if payload.cost_price is not None and is_sales_manager_or_admin(user):
            mock_p["cost_price"] = float(payload.cost_price)
        if payload.status is not None:
            mock_p["status"] = payload.status.upper()

    if product:
        p_dict = {
            "id": product.id,
            "sku": product.sku,
            "name": product.name,
            "categoryId": product.category_id,
            "category_id": product.category_id,
            "category": product.category.name if product.category else None,
            "baseUnit": product.base_unit,
            "unit": product.base_unit,
            "manageByLot": product.manage_by_lot,
            "minStock": product.min_stock,
            "basePrice": product.base_price,
            "sale_price": product.base_price,
            "costPrice": product.cost_price,
            "cost_price": product.cost_price,
            "status": product.status,
            "imageUrl": product.image_url,
        }
    else:
        p_dict = mock_p.copy()

    return {
        "success": True,
        "code": 200,
        "message": f"Cập nhật sản phẩm '{target_sku}' thành công.",
        "data": sanitize_financial_data(p_dict, user),
    }


@router.delete("/{product_id}", summary="Xóa sản phẩm (nếu chưa phát sinh giao dịch)")
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_MANAGE)),
) -> dict[str, Any]:
    product = None
    if product_id.isdigit():
        product = db.query(Product).filter(Product.id == int(product_id)).first()
    if not product:
        product = db.query(Product).filter(
            func.upper(Product.sku) == product_id.upper()
        ).first()

    mock_p = MOCK_PRODUCTS.get(product_id.upper()) or MOCK_PRODUCTS.get(product_id)
    if not product and not mock_p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm '{product_id}' không tồn tại.",
        )

    target_sku = product.sku if product else (mock_p.get("sku") or product_id)
    p_id = product.id if product else None

    # Check transactions
    if check_has_transactions(p_id, target_sku, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sản phẩm đã phát sinh giao dịch, không thể xóa. Vui lòng chuyển trạng thái sang Ngừng kinh doanh (DISCONTINUED).",
        )

    # Perform deletion
    if product:
        db.query(ProductUnit).filter(ProductUnit.product_id == product.id).delete()
        db.delete(product)
        db.commit()

    if target_sku.upper() in MOCK_PRODUCTS:
        MOCK_PRODUCTS.pop(target_sku.upper(), None)
    if target_sku in MOCK_PRODUCTS:
        MOCK_PRODUCTS.pop(target_sku, None)

    return {
        "success": True,
        "message": f"Xóa sản phẩm '{target_sku}' thành công.",
        "sku": target_sku,
    }


@router.patch("/{product_id}/status", summary="Cập nhật trạng thái sản phẩm")
def update_product_status(
    product_id: str,
    payload: ProductStatusUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_MANAGE)),
) -> dict[str, Any]:
    status_clean = payload.status.strip().upper()
    if status_clean not in ("ACTIVE", "DISCONTINUED", "INACTIVE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trạng thái không hợp lệ. Chỉ chấp nhận ACTIVE hoặc DISCONTINUED.",
        )

    product = None
    if product_id.isdigit():
        product = db.query(Product).filter(Product.id == int(product_id)).first()
    if not product:
        product = db.query(Product).filter(
            func.upper(Product.sku) == product_id.upper()
        ).first()

    mock_p = MOCK_PRODUCTS.get(product_id.upper()) or MOCK_PRODUCTS.get(product_id)
    if not product and not mock_p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sản phẩm '{product_id}' không tồn tại.",
        )

    target_sku = product.sku if product else (mock_p.get("sku") or product_id)
    if product:
        product.status = status_clean
        db.commit()
        db.refresh(product)

    if mock_p:
        mock_p["status"] = status_clean

    return {
        "success": True,
        "message": f"Cập nhật trạng thái sản phẩm '{target_sku}' thành '{status_clean}' thành công.",
        "data": {
            "id": product.id if product else mock_p.get("id"),
            "sku": target_sku,
            "status": status_clean,
        },
    }
