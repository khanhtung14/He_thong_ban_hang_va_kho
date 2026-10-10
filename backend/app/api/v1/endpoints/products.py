"""Products endpoints with RBAC enforcement."""

import io
import math
import re
import uuid
from typing import Any, Dict, List, Optional, Set
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Category, Product, ProductUnit
from app.api.v1.endpoints.rbac import (
    PERM_PRODUCTS_IMPORT,
    PERM_PRODUCTS_MANAGE,
    PERM_PRODUCTS_VIEW,
    AuthenticatedUser,
    require_permissions,
    sanitize_financial_data,
)
from pydantic import BaseModel

class ProductUnitResponse(BaseModel):
    id: int
    unitName: str
    conversionRate: float
    barcode: Optional[str] = None

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

HEADER_ALIASES: Dict[str, str] = {
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

# Cache for preview sessions (sessionId -> list of row dicts)
IMPORT_SESSIONS: Dict[str, List[Dict[str, Any]]] = {}


async def _read_import_file(file: UploadFile) -> bytes:
    if not file.filename or not (
        file.filename.lower().endswith(".xlsx") or file.filename.lower().endswith(".xls")
    ):
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ tệp Excel .xlsx hoặc .xls.")
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Tệp Excel vượt quá giới hạn 10 MB.")
    return content


def _row_to_import_item(row_number: int, values: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    sku = str(values.get("sku") or "").strip().upper()
    name = str(values.get("name") or "").strip()
    category = str(values.get("category") or "").strip()

    if not sku:
        errors.append("SKU không được để trống.")
    if not name:
        errors.append("Tên sản phẩm không được để trống.")
    if not category:
        errors.append("Danh mục không được để trống.")

    item: Dict[str, Any] = {"sku": sku, "name": name, "category": category}

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


def _parse_import_workbook(content: bytes) -> List[Dict[str, Any]]:
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

        normalized_headers: List[str] = []
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

        parsed_rows: List[Dict[str, Any]] = []
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


def _get_existing_skus(db: Session) -> Set[str]:
    skus = {s[0].upper() for s in db.query(Product.sku).all() if s[0]}
    return skus


def _annotate_import_rows(rows: List[Dict[str, Any]], existing_skus: Set[str]) -> List[Dict[str, Any]]:
    seen_skus: Set[str] = set()
    result: List[Dict[str, Any]] = []

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


def _apply_import_rows(rows: List[Dict[str, Any]], db: Session) -> Dict[str, Any]:
    created_count = 0
    updated_count = 0
    category_cache: Dict[str, Category] = {}

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
) -> Dict[str, Any]:
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
) -> Dict[str, Any]:
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
    items_to_commit: List[Dict[str, Any]] = []

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
) -> Dict[str, Any]:
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


@router.get("", response_model=ProductListResponse)
def list_products(
    keyword: Optional[str] = None,
    category_id: Optional[int] = Query(None, alias="categoryId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get list of products."""
    query = db.query(Product)
    
    if keyword:
        query = query.filter(
            (Product.name.ilike(f"%{keyword}%")) | (Product.sku.ilike(f"%{keyword}%"))
        )
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if status_filter:
        query = query.filter(Product.status == status_filter)
        
    total_records = query.count()
    products = query.offset((page - 1) * limit).limit(limit).all()
    
    products_list = []
    for p in products:
        p_dict = {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "categoryId": p.category_id,
            "baseUnit": p.base_unit,
            "manageByLot": p.manage_by_lot,
            "minStock": p.min_stock,
            "basePrice": p.base_price,
            "costPrice": p.cost_price,
            "status": p.status,
            "imageUrl": p.image_url,
        }
        products_list.append(p_dict)

    sanitized = sanitize_financial_data(products_list, user)
    
    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": sanitized,
        "pagination": {
            "page": page,
            "limit": limit,
            "totalRecords": total_records,
            "totalPages": (total_records + limit - 1) // limit,
        }
    }


@router.get("/{id}", response_model=ProductDetailResponse)
def get_product_detail(
    id: int,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get product detail by ID."""
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
        
    units = db.query(ProductUnit).filter(ProductUnit.product_id == id).all()
    
    p_dict = {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "categoryId": product.category_id,
        "baseUnit": product.base_unit,
        "manageByLot": product.manage_by_lot,
        "minStock": product.min_stock,
        "basePrice": product.base_price,
        "costPrice": product.cost_price,
        "status": product.status,
        "imageUrl": product.image_url,
        "units": [
            {
                "id": u.id,
                "unitName": u.unit_name,
                "conversionRate": u.conversion_rate,
                "barcode": u.barcode
            } for u in units
        ]
    }
    
    sanitized = sanitize_financial_data(p_dict, user)
    
    return {
        "success": True,
        "code": 200,
        "message": "Thành công",
        "data": sanitized
    }

