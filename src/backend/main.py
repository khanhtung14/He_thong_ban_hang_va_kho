from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from src.backend.avatar import router as avatar_router
from src.backend.change_password import router as change_password_router
from src.backend.profile import router as profile_router


app = FastAPI(
    title="Hệ thống bán hàng và kho",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Thư mục upload
# =========================

BASE_DIR = Path(__file__).resolve().parents[2]

UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

AVATAR_DIR = UPLOADS_DIR / "avatars"
AVATAR_DIR.mkdir(exist_ok=True)


# Cho phép truy cập file trong thư mục uploads
app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOADS_DIR)),
    name="uploads",
)


# =========================
# Router
# =========================

# SCRUM-58
app.include_router(change_password_router)

# SCRUM-69
app.include_router(profile_router)

# SCRUM-71
app.include_router(avatar_router)


# =========================
# Trang chủ
# =========================

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>Hệ thống bán hàng và kho</title>
    </head>
    <body>
        <h1>Backend đang hoạt động</h1>
        <p>Swagger: <a href="/docs">/docs</a></p>
    </body>
    </html>
    """


# =========================
# Health check
# =========================

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Backend đang hoạt động"
    }


# =========================
# Chạy trực tiếp
# =========================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8001
    )