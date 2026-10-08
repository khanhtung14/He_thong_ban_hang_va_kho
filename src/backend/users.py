"""FastAPI router for User Management (SCRUM-62)."""

from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy.orm import Session

from src.backend.database import get_db
from src.backend.models import AccountStatus, User
from src.backend.schemas import (
    CreateUserResult,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from src.backend.users_service import (
    bulk_create_users_from_rows,
    create_user,
    get_user_by_id,
    list_users,
    parse_excel_rows,
    preview_user_import_rows,
    update_user,
)
from src.backend.security import require_admin

router = APIRouter(prefix="/api/v1/admin/users", tags=["Admin User Management"])
compat_router = APIRouter(prefix="/users", tags=["User Management (Direct)"])


@router.get("", response_model=UserListResponse, dependencies=[Depends(require_admin)])
@compat_router.get("", response_model=UserListResponse, dependencies=[Depends(require_admin)])
def get_users(
    search: Optional[str] = Query(None, description="Tìm kiếm theo họ tên, tên đăng nhập hoặc số điện thoại"),
    role: Optional[str] = Query(None, description="Lọc theo mã hoặc tên vai trò"),
    status: Optional[AccountStatus] = Query(None, description="Lọc theo trạng thái tài khoản"),
    page: int = Query(default=1, ge=1, description="Số thứ tự trang"),
    page_size: int = Query(default=20, ge=1, le=100, description="Số dòng mỗi trang (mặc định 20)"),
    size: Optional[int] = Query(default=None, ge=1, le=100, description="Tham số phân trang alias size"),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách người dùng có hỗ trợ (SCRUM-104, SCRUM-105):
    - Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại
    - Lọc theo vai trò và trạng thái
    - Phân trang chuẩn, mặc định 20 dòng/trang, hỗ trợ tham số page/size/page_size
    """
    effective_page_size = size if size is not None else page_size
    users, total, total_pages = list_users(
        db=db,
        search=search,
        role=role,
        status_filter=status,
        page=page,
        page_size=effective_page_size
    )

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=effective_page_size,
        total_pages=total_pages
    )


@router.get("/import/template", dependencies=[Depends(require_admin)])
@compat_router.get("/import/template", dependencies=[Depends(require_admin)])
def download_user_import_template():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Users"
    sheet.append(["Họ tên", "Tên đăng nhập", "Email", "Số điện thoại", "Vai trò"])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = "A1:E1"
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="user_import_template.xlsx"'},
    )


async def read_user_import_file(file: UploadFile) -> list[dict]:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vui lòng đính kèm file Excel hoặc CSV.")
    extension = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if extension not in {"xlsx", "csv"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chỉ hỗ trợ file Excel (.xlsx) hoặc CSV.")
    contents = await file.read(10 * 1024 * 1024 + 1)
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File tải lên vượt quá giới hạn 10 MB.")
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File tải lên rỗng.")
    try:
        rows = parse_excel_rows(contents, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không đọc được file. Hãy dùng mẫu .xlsx hoặc CSV hợp lệ.") from exc
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File không chứa dữ liệu người dùng hợp lệ.")
    return rows


@router.post("/import/preview", dependencies=[Depends(require_admin)])
@compat_router.post("/import/preview", dependencies=[Depends(require_admin)])
async def preview_users_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    rows = await read_user_import_file(file)
    preview = preview_user_import_rows(db, rows)
    return {
        "total": len(preview),
        "valid": sum(1 for row in preview if row["valid"]),
        "errors": sum(1 for row in preview if not row["valid"]),
        "duplicates": sum(1 for row in preview if row["duplicate"]),
        "rows": preview,
    }


@router.post("/import", dependencies=[Depends(require_admin)])
@compat_router.post("/import", dependencies=[Depends(require_admin)])
async def import_users_from_excel(
    file: UploadFile = File(...),
    x_actor_id: Optional[int] = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db),
):
    """Import user records from an Excel or CSV file and create accounts in bulk."""
    rows = await read_user_import_file(file)
    created_count, errors, duplicates_count = bulk_create_users_from_rows(db, rows, actor_user_id=x_actor_id)
    response = {
        "message": f"Đã xử lý {len(rows)} dòng trong file. Tạo mới {created_count} tài khoản.",
        "created": created_count,
        "duplicates": duplicates_count,
        "skipped": len(errors),
        "errors": errors,
    }
    if created_count == 0 and duplicates_count == 0 and errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có người dùng nào được tạo. Vui lòng kiểm tra định dạng file.")
    return response


@router.post("", response_model=CreateUserResult, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
@compat_router.post("", response_model=CreateUserResult, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_new_user(
    data: UserCreate,
    x_actor_id: Optional[int] = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db)
):
    """
    Tạo tài khoản người dùng mới (SCRUM-99, 100, 101, 102, 106):
    - Kiểm tra tính trùng lặp tên đăng nhập, email, số điện thoại
    - Tự động sinh mật khẩu tạm ngẫu nhiên mạnh
    - Băm mật khẩu bằng bcrypt trước khi lưu cơ sở dữ liệu
    - Gán cờ must_change_password=True và trạng thái chờ kích hoạt
    - Ghi audit log hệ thống
    - Gửi email kích hoạt kèm mật khẩu tạm và link kích hoạt có thời hạn
    - Không để lộ mật khẩu trong response bảo mật
    """
    user, email_sent, _ = create_user(db=db, user_data=data, actor_user_id=x_actor_id)

    return CreateUserResult(
        message="Tạo tài khoản thành công và đã gửi email kích hoạt.",
        user=UserResponse.model_validate(user),
        email_sent=email_sent
    )


@router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
@compat_router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Lấy thông tin chi tiết một người dùng theo ID."""
    user = get_user_by_id(db, user_id=user_id)
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
@compat_router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_admin)])
def update_user_info(
    user_id: int,
    data: UserUpdate,
    x_actor_id: Optional[int] = Header(None, alias="X-Actor-Id"),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Cập nhật thông tin tài khoản người dùng (SCRUM-103, SCRUM-106):
    - Họ và tên
    - Email (kiểm tra trùng lặp)
    - Số điện thoại (kiểm tra định dạng và trùng lặp)
    - Vai trò
    - Trạng thái (khóa / mở khóa)
    - Ghi audit log hệ thống
    """
    actor_id = x_actor_id if x_actor_id is not None else getattr(current_admin, "id", None)
    updated = update_user(db=db, user_id=user_id, user_data=data, actor_user_id=actor_id)
    return UserResponse.model_validate(updated)
