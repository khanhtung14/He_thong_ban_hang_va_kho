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


@router.post("/profile/avatar")
async def upload_avatar(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ảnh.")

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

        # Cắt ảnh thành hình vuông từ chính giữa.
        width, height = image.size
        side = min(width, height)

        left = (width - side) // 2
        top = (height - side) // 2

        image = image.crop(
            (left, top, left + side, top + side)
        )

        # Tạo ảnh đại diện kích thước 256 x 256.
        image = image.resize(
            (256, 256),
            Image.Resampling.LANCZOS
        )

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="File tải lên không phải ảnh hợp lệ."
        )

    filename = f"{uuid4().hex}.jpg"
    file_path = AVATAR_DIR / filename
    image.save(file_path, format="JPEG", quality=90)

    return {
        "message": "Tải ảnh đại diện thành công.",
        "avatar_url": f"/profile/avatar/{filename}"
    }


@router.get("/profile/avatar/{filename}")
def get_avatar(filename: str):
    file_path = AVATAR_DIR / filename

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy ảnh đại diện."
        )

    return FileResponse(file_path, media_type="image/jpeg")