from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

router = APIRouter()

AVATAR_DIR = Path("uploads/avatars")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 2 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG"}

CURRENT_AVATAR_FILE = AVATAR_DIR / "current_avatar.txt"


@router.post("/profile/avatar")
async def upload_avatar(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng chọn ảnh."
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Ảnh đại diện không được vượt quá 2 MB."
        )

    try:
        image = Image.open(BytesIO(content))
        image_format = image.format

        if image_format not in ALLOWED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail="Chỉ chấp nhận ảnh JPG hoặc PNG."
            )

        image = image.convert("RGB")

        # Cắt ảnh thành hình vuông từ chính giữa
        width, height = image.size
        side = min(width, height)

        left = (width - side) // 2
        top = (height - side) // 2

        image = image.crop(
            (left, top, left + side, top + side)
        )

        # Resize thành 256 x 256
        image = image.resize(
            (256, 256),
            Image.Resampling.LANCZOS
        )

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="File tải lên không phải ảnh hợp lệ."
        )

    old_filename = ""

    # Đọc tên ảnh đại diện cũ
    if CURRENT_AVATAR_FILE.exists():
        old_filename = CURRENT_AVATAR_FILE.read_text(
            encoding="utf-8"
        ).strip()

    # Tạo tên file mới
    filename = f"{uuid4().hex}.jpg"
    file_path = AVATAR_DIR / filename

    # Lưu ảnh mới
    image.save(
        file_path,
        format="JPEG",
        quality=90
    )

    # Lưu tên ảnh hiện tại
    CURRENT_AVATAR_FILE.write_text(
        filename,
        encoding="utf-8"
    )

    # Xóa ảnh cũ
    if old_filename:
        old_file_path = AVATAR_DIR / old_filename

        if old_file_path.is_file():
            old_file_path.unlink()

    return {
        "message": "Tải ảnh đại diện thành công.",
        "filename": filename,
        "avatar_url": f"/profile/avatar/{filename}",
        "size": {
            "width": 256,
            "height": 256
        }
    }


@router.get("/profile/avatar")
def get_current_avatar():
    if not CURRENT_AVATAR_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Chưa có ảnh đại diện."
        )

    filename = CURRENT_AVATAR_FILE.read_text(
        encoding="utf-8"
    ).strip()

    if not filename:
        raise HTTPException(
            status_code=404,
            detail="Chưa có ảnh đại diện."
        )

    return get_avatar(filename)


@router.get("/profile/avatar/{filename}")
def get_avatar(filename: str):
    file_path = AVATAR_DIR / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy ảnh đại diện."
        )

    return FileResponse(
        file_path,
        media_type="image/jpeg"
    )