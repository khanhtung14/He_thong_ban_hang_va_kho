from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

try:
    from src.backend.models import User
    from src.backend.security import require_active_user
    from src.backend.database import get_db
except ImportError:
    from models import User
    from security import require_active_user
    from database import get_db

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
AVATAR_DIR = PROJECT_ROOT / "uploads" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 5 * 1024 * 1024  # Cho phép tối đa 5MB
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def _user_avatar_dir(user_id: int) -> Path:
    directory = AVATAR_DIR / str(user_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _current_avatar_file(user_id: int) -> Path:
    return _user_avatar_dir(user_id) / "current_avatar.txt"


@router.post("/profile/avatar")
@router.post("/api/v1/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ảnh.")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Ảnh đại diện không được vượt quá 5 MB.")

    try:
        image = Image.open(BytesIO(content))
        image_format = image.format

        if image_format not in ALLOWED_FORMATS:
            raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.")

        # Xử lý xoay ảnh nếu có exif orientation và convert sang RGB
        image = image.convert("RGB")

        width, height = image.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2

        image = image.crop((left, top, left + side, top + side))
        image = image.resize((256, 256), Image.Resampling.LANCZOS)

    except (UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="File tải lên không phải ảnh hợp lệ.")

    user_dir = _user_avatar_dir(user.id)
    current_file = _current_avatar_file(user.id)
    old_filename = ""

    if user.avatar_url:
        old_filename = Path(user.avatar_url).name
    elif current_file.exists():
        old_filename = current_file.read_text(encoding="utf-8").strip()

    filename = f"{uuid4().hex}.jpg"
    file_path = user_dir / filename

    image.save(file_path, format="JPEG", quality=90)

    # Lưu đường dẫn tương đối có chứa user_id để route GET tìm đúng thư mục
    user.avatar_url = f"/api/v1/profile/avatar/{user.id}/{filename}"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Không thể lưu vào CSDL: {str(exc)}") from exc

    try:
        current_file.write_text(filename, encoding="utf-8")
    except Exception:
        pass

    # Xóa an toàn file cũ
    if old_filename and old_filename != filename:
        old_file_path = user_dir / Path(old_filename).name
        if old_file_path.is_file():
            try:
                old_file_path.unlink(missing_ok=True)
            except Exception:
                pass  # Bỏ qua nếu file đang bị khóa

    return {
        "message": "Tải ảnh đại diện thành công.",
        "filename": filename,
        "avatar_url": user.avatar_url,
        "size": {"width": 256, "height": 256},
    }


@router.get("/profile/avatar/me")
@router.get("/api/v1/profile/avatar/me")
@router.get("/profile/avatar")
@router.get("/api/v1/profile/avatar")
def get_my_avatar(
    user: User = Depends(require_active_user),
):
    """Trả về ảnh đại diện hiện tại của người dùng đang đăng nhập."""
    if not user.avatar_url:
        raise HTTPException(status_code=404, detail="Người dùng chưa có ảnh đại diện.")

    user_dir = _user_avatar_dir(user.id)
    current_file = _current_avatar_file(user.id)

    # Ưu tiên dùng avatar_url lưu trong DB
    avatar_filename = Path(user.avatar_url).name
    file_path = user_dir / avatar_filename

    # Fallback: đọc từ file current_avatar.txt
    if not file_path.is_file() and current_file.exists():
        avatar_filename = current_file.read_text(encoding="utf-8").strip()
        file_path = user_dir / avatar_filename

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file ảnh đại diện.")

    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/profile/avatar/{user_id}/{filename}")
@router.get("/api/v1/profile/avatar/{user_id}/{filename}")
def get_avatar(user_id: int, filename: str):
    safe_filename = Path(filename).name
    if safe_filename != filename:
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh đại diện.")

    file_path = _user_avatar_dir(user_id) / safe_filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh đại diện.")

    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )