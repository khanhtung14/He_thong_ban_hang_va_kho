import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from src.backend.change_password import router as change_password_router
from src.backend.forgot_password import router as forgot_password_router

app = FastAPI(
    title="Hệ thống Bán hàng và Kho - Authentication & Password Management",
    description="Hệ thống hỗ trợ Đổi mật khẩu (SCRUM-58) và Quên / Đặt lại mật khẩu qua Email (SCRUM-57)",
    version="1.0.0"
)

# Cấu hình CORS để hỗ trợ frontend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký các router tính năng
app.include_router(change_password_router)
app.include_router(forgot_password_router)

# Mount thư mục frontend nếu tồn tại
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


@app.get("/forgot-password", response_class=HTMLResponse)
@app.get("/forgot-password-ui", response_class=HTMLResponse)
def get_forgot_password_page():
    html_path = os.path.join(frontend_dir, "forgot_password.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Không tìm thấy giao diện forgot_password.html</h1>", status_code=404)


@app.get("/reset-password", response_class=HTMLResponse)
@app.get("/reset-password-ui", response_class=HTMLResponse)
def get_reset_password_page():
    html_path = os.path.join(frontend_dir, "reset_password.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Không tìm thấy giao diện reset_password.html</h1>", status_code=404)


@app.get("/")
def home():
    return {
        "message": "Backend Hệ thống Bán hàng và Kho đang hoạt động",
        "docs_url": "/docs",
        "features": {
            "SCRUM-58": "Đổi mật khẩu (/change-password)",
            "SCRUM-57": "Quên & Đặt lại mật khẩu qua email (/forgot-password, /reset-password)"
        },
        "ui_pages": {
            "forgot_password_ui": "/forgot-password",
            "reset_password_ui": "/reset-password"
        }
    }