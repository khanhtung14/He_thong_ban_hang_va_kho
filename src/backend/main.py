import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.backend.auth import router as auth_router
from src.backend.change_password import router as change_password_router
from src.backend.database import init_db
from src.backend.users import router as users_router

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "src" / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo database và dữ liệu seed khi khởi động
    init_db()
    yield


# Khởi tạo database ngay khi nạp module
init_db()

app = FastAPI(

    title="Hệ Thống Quản Lý Bán Hàng Và Kho",
    description="Module Quản lý Tài khoản & Phân quyền (SCRUM-6 / SCRUM-62)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(change_password_router)

# Mount frontend static files if directory exists
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def home():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "message": "Backend đang chạy",
        "docs_url": "/docs",
        "api_prefix": "/api/v1/users"
    }


@app.get("/users-ui")
def users_page():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Giao diện Quản lý Tài khoản"}