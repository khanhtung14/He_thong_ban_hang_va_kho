from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

try:  # Supports both `python -m src.backend.main` and running this file directly.
    from src.backend.change_password import router as change_password_router
    from src.backend.forgot_password import router as forgot_password_router
    from src.backend.inventory import router as inventory_router
    from src.backend.login import router as login_router
    from src.backend.products import router as products_router
    from src.backend.reports import router as reports_router
    from src.backend.session import router as session_router
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from change_password import router as change_password_router
    from forgot_password import router as forgot_password_router
    from inventory import router as inventory_router
    from login import router as login_router
    from products import router as products_router
    from reports import router as reports_router
    from session import router as session_router

try:
    from src.backend.user_routes import router as user_router
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from user_routes import router as user_router

app = FastAPI(
    title="Hệ thống Bán hàng và Kho - Authentication & Password Management",
    description="Đăng nhập, đổi mật khẩu và quên/đặt lại mật khẩu qua email.",
    version="1.0.0",
)

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

# Vite emits the React bundle here. check_dir=False allows the backend module
# to be imported before the first frontend build.
app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False),
    name="frontend-assets",
)


def read_frontend_page(filename: str) -> HTMLResponse:
    """Serve a standalone password page from the frontend directory."""
    page_path = FRONTEND_DIR / filename
    if not page_path.is_file():
        return HTMLResponse(f"Không tìm thấy giao diện {filename}.", status_code=404)
    return HTMLResponse(content=page_path.read_text(encoding="utf-8"))


def login_page_response(status_code: int = 200) -> HTMLResponse:
    if not FRONTEND_INDEX.is_file():
        return HTMLResponse(
            "React frontend is not built. Run `npm install` and `npm run build` in src/frontend.",
            status_code=503,
        )
    return HTMLResponse(content=FRONTEND_INDEX.read_text(encoding="utf-8"), status_code=status_code)


def forbidden_page(headers: dict[str, str] | None = None) -> Response:
    if not FRONTEND_INDEX.is_file():
        return HTMLResponse(
            "React frontend is not built. Run `npm install` and `npm run build` in src/frontend.",
            status_code=503,
            headers=headers,
        )
    return HTMLResponse(
        content=FRONTEND_INDEX.read_text(encoding="utf-8"),
        status_code=403,
        headers=headers,
    )


@app.exception_handler(HTTPException)
async def render_html_for_forbidden(request: Request, exc: HTTPException):
    """Render the 403 page in browsers while keeping API errors as JSON."""
    accepts_html = "text/html" in request.headers.get("accept", "")
    if exc.status_code == 403 and accepts_html:
        return forbidden_page(exc.headers)
    return await http_exception_handler(request, exc)


app.include_router(change_password_router)
app.include_router(forgot_password_router)
app.include_router(login_router)
app.include_router(session_router)
app.include_router(inventory_router)
app.include_router(products_router)
app.include_router(reports_router)
app.include_router(user_router)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def home():
    """Show the login interface as the default application page."""
    return login_page_response()


@app.get("/errors/403", response_class=HTMLResponse, include_in_schema=False)
def preview_forbidden_page():
    """Preview the 403 page in a browser; the response remains HTTP 403."""
    return forbidden_page()


@app.get("/login", response_class=HTMLResponse, include_in_schema=False)
def login_page():
    return login_page_response()


@app.get("/change-password", response_class=HTMLResponse, include_in_schema=False)
def change_password_page():
    return login_page_response()


@app.get("/admin/users", response_class=HTMLResponse, include_in_schema=False)
def admin_users_page():
    """Serve the admin user management screen."""
    return login_page_response()


@app.get("/admin/territory-handover", response_class=HTMLResponse, include_in_schema=False)
def territory_handover_page():
    """Serve the territory handover screen."""
    return login_page_response()


@app.get("/forgot-password", response_class=HTMLResponse, include_in_schema=False)
@app.get("/forgot-password-ui", response_class=HTMLResponse, include_in_schema=False)
def get_forgot_password_page():
    return read_frontend_page("forgot_password.html")


@app.get("/reset-password", response_class=HTMLResponse, include_in_schema=False)
@app.get("/reset-password-ui", response_class=HTMLResponse, include_in_schema=False)
def get_reset_password_page():
    return read_frontend_page("reset_password.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
