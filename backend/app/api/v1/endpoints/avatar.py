from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

try:
    from app.models.models import User
    from app.core.security import require_active_user
    from app.core.database import get_db
except ImportError:  # pragma: no cover - direct script execution
    from app.models.models import User
    from app.core.security import require_active_user
    from app.core.database import get_db

router = APIRouter(prefix="/api/v1", tags=["Profile avatar"])

AVATAR_DIR = Path("uploads/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 2 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG"}


def _user_avatar_dir(user_id: int) -> Path:
    directory = AVATAR_DIR / str(user_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _current_avatar_file(user_id: int) -> Path:
    return _user_avatar_dir(user_id) / "current_avatar.txt"


@router.post("/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng chọn ảnh.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Ảnh đại diện không được vượt quá 2 MB.",
        )

    try:
        image = Image.open(BytesIO(content))
        image_format = image.format

        if image_format not in ALLOWED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail="Chỉ chấp nhận ảnh JPG hoặc PNG.",
            )

        image = image.convert("RGB")

        width, height = image.size
        if width * height > 40_000_000:
            raise HTTPException(
                status_code=400,
                detail="Kích thước ảnh quá lớn để xử lý.",
            )
        side = min(width, height)

        left = (width - side) // 2
        top = (height - side) // 2

        image = image.crop(
            (left, top, left + side, top + side)
        )

        image = image.resize(
            (256, 256),
            Image.Resampling.LANCZOS,
        )

    except (UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(
            status_code=400,
            detail="File tải lên không phải ảnh hợp lệ.",
        )

    user_dir = _user_avatar_dir(user.id)
    current_file = _current_avatar_file(user.id)
    old_filename = ""

    if user.avatar_url:
        old_filename = Path(user.avatar_url).name
    elif current_file.exists():
        old_filename = current_file.read_text(
            encoding="utf-8"
        ).strip()

    filename = f"{uuid4().hex}.jpg"
    file_path = user_dir / filename

    image.save(
        file_path,
        format="JPEG",
        quality=90,
    )

    user.avatar_url = f"/api/v1/avatars/{user.id}/{filename}"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save avatar.") from exc
    current_file.write_text(filename, encoding="utf-8")

    if old_filename:
        old_file_path = user_dir / Path(old_filename).name

        if old_file_path.is_file():
            old_file_path.unlink()

    return {
        "message": "Tải ảnh đại diện thành công.",
        "filename": filename,
        "status": "success",
        "avatar_url": f"/api/v1/avatars/{user.id}/{filename}",
        "size": {
            "width": 256,
            "height": 256,
        },
    }


@router.get("/profile/avatar")
def get_current_avatar(user: User = Depends(require_active_user)):
    filename = Path(user.avatar_url).name if user.avatar_url else ""
    current_file = _current_avatar_file(user.id)
    if not filename and not current_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Chưa có ảnh đại diện.",
        )

    if not filename:
        filename = current_file.read_text(encoding="utf-8").strip()

    if not filename:
        raise HTTPException(
            status_code=404,
            detail="Chưa có ảnh đại diện.",
        )

    return _avatar_response(user.id, filename)


@router.get("/avatars/{user_id}/{filename}")
def get_avatar(user_id: int, filename: str):
    safe_filename = Path(filename).name
    if safe_filename != filename:
        raise HTTPException(status_code=404, detail="Không tìm thấy ảnh đại diện.")

    return _avatar_response(user_id, safe_filename)


def _avatar_response(user_id: int, filename: str):
    file_path = _user_avatar_dir(user_id) / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy ảnh đại diện.",
        )

    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store, max-age=0"},
    )
