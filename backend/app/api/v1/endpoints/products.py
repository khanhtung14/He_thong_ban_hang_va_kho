"""Products endpoints with RBAC enforcement."""

from typing import Any, List, Optional
import io
import math
import re
import uuid
from zipfile import BadZipFile
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from fastapi import APIRouter, Depends, File, HTTPException, Path as PathParam, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator

from app.core.database import get_db
from app.models.models import Product, Category, ProductUnit
from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_VIEW,
    PERM_PRODUCTS_MANAGE,
    PERM_PRODUCTS_UNIT_MANAGE,
    PERM_PRODUCTS_IMPORT,
    AuthenticatedUser,
    require_permissions,
    sanitize_financial_data,
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
        if not file or not hasattr(file, "read"):
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



@router.get("")
def list_products(
    keyword: Optional[str] = None,
    category_id: Optional[int] = Query(None, alias="categoryId"),
    category_id_legacy: Optional[int] = Query(None, alias="category_id"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products."""
    effective_cat_id = category_id if category_id is not None else category_id_legacy
    
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
        if page is not None and limit is not None:
            products = query.offset((page - 1) * limit).limit(limit).all()
        else:
            products = query.all()
        
        products_list = []
        for p in products:
            p_dict = {
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "category_id": p.category_id,
                "categoryId": p.category_id,
                "category": p.category.name if p.category else None,
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
        if page is not None and limit is not None:
            mock_items = mock_items[(page - 1) * limit : page * limit]
        products_list = [p.copy() for p in mock_items]

    sanitized = sanitize_financial_data(products_list, user)
    
    if page is not None and limit is not None:
        return {
            "success": True,
            "code": 200,
            "message": "Thành công",
            "data": sanitized,
            "pagination": {
                "page": page,
                "limit": limit,
                "totalRecords": total_records,
                "totalPages": (total_records + limit - 1) // limit if limit > 0 else 1,
            },
        }
    return sanitized


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
    target_category_id: int = Field(gt=0, description="ID nhóm hàng mới cần chuyển đến")




@router.patch("/{sku}/category")
def move_product_category(
    sku: str,
    payload: MoveProductCategoryRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Move a single product to a new target category (SCRUM-76 AC 2)."""
    from app.models.models import RoleCode
    if user.role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền chuyển nhóm hàng sản phẩm.",
        )

    from app.api.v1.endpoints.product_categories import get_category_by_id
    target_cat = get_category_by_id(payload.target_category_id)
    if not target_cat:
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


