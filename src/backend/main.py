from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware


if __package__:
    # Package import is used by `uvicorn src.backend.main:app` from the project root.
    from src.backend.avatar import router as avatar_router
    from src.backend.change_password import router as change_password_router
    from src.backend.audit_logs import router as audit_logs_router
    from src.backend.forgot_password import router as forgot_password_router
    from src.backend.inventory import router as inventory_router
    from src.backend.login import router as login_router
    from src.backend.navigation import router as navigation_router
    from src.backend.products import router as products_router
    from src.backend.price_lists import router as price_lists_router
    from src.backend.profile import migrate_profile_schema, router as profile_router
    from src.backend.reports import router as reports_router
    from src.backend.session import router as session_router
    from src.backend.user_assignment import router as user_assignment_router
    from src.backend.user_routes import router as user_router
    from src.backend.users import compat_router as users_compat_router, router as users_router
else:  # pragma: no cover - direct script execution from src/backend
    from avatar import router as avatar_router
    from change_password import router as change_password_router
    from audit_logs import router as audit_logs_router
    from forgot_password import router as forgot_password_router
    from inventory import router as inventory_router
    from login import router as login_router
    from navigation import router as navigation_router
    from products import router as products_router
    from price_lists import router as price_lists_router
    from profile import migrate_profile_schema, router as profile_router
    from reports import router as reports_router
    from session import router as session_router
    from user_assignment import router as user_assignment_router
    from user_routes import router as user_router
    from users import compat_router as users_compat_router, router as users_router


app = FastAPI(
    title="OMS - Hệ Thống Quản Lý Bán Hàng Và Kho",
    description="Đăng nhập, đổi mật khẩu, quản lý tài khoản và quên/đặt lại mật khẩu qua email.",
    version="1.0.0",
)


@app.on_event("startup")
def migrate_profile_database() -> None:
    try:
        migrate_profile_schema()
    except Exception:
        pass


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



ROOT_DIR = Path(__file__).resolve().parents[2]
ROOT_FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
if (ROOT_FRONTEND_DIST / "index.html").is_file():
    FRONTEND_DIR = ROOT_DIR / "frontend"
    FRONTEND_DIST = ROOT_FRONTEND_DIST
else:
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


@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    fav_path = FRONTEND_DIST / "favicon.svg"
    if fav_path.is_file():
        return FileResponse(fav_path)
    raise HTTPException(status_code=404)


@app.get("/icons.svg", include_in_schema=False)
def icons():
    icon_path = FRONTEND_DIST / "icons.svg"
    if icon_path.is_file():
        return FileResponse(icon_path)
    raise HTTPException(status_code=404)


def read_frontend_page(filename: str) -> HTMLResponse:
    """Serve a standalone password page from the frontend directory."""
    page_path = FRONTEND_DIR / filename
    if not page_path.is_file():
        legacy_path = Path(__file__).resolve().parents[1] / "frontend" / filename
        if legacy_path.is_file():
            page_path = legacy_path
        else:
            return HTMLResponse(f"Không tìm thấy giao diện {filename}.", status_code=404)
    return HTMLResponse(content=page_path.read_text(encoding="utf-8"))


def login_page_response(status_code: int = 200) -> HTMLResponse:
    if not FRONTEND_INDEX.is_file():
        return HTMLResponse(
            "React frontend is not built. Run `npm run build` in frontend.",
            status_code=503,
        )
    return HTMLResponse(
        content=FRONTEND_INDEX.read_text(encoding="utf-8"),
        status_code=status_code,
    )


def forbidden_page(headers: Optional[Dict[str, str]] = None) -> Response:
    if not FRONTEND_INDEX.is_file():
        return HTMLResponse(
            "React frontend is not built. Run `npm run build` in frontend.",
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
app.include_router(audit_logs_router)
app.include_router(forgot_password_router)
app.include_router(login_router)
app.include_router(session_router)
app.include_router(inventory_router)
app.include_router(products_router)
app.include_router(price_lists_router)
app.include_router(reports_router)
app.include_router(navigation_router)
app.include_router(user_assignment_router)
app.include_router(users_router)
app.include_router(users_compat_router)
app.include_router(user_router)
app.include_router(profile_router)

# SCRUM-71: Avatar
app.include_router(avatar_router)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def home():
    """Show the login interface as the default application page."""
    return login_page_response()


@app.get("/navigation", response_class=HTMLResponse, include_in_schema=False)
@app.get("/navigation-ui", response_class=HTMLResponse, include_in_schema=False)
def get_navigation_page():
    """Giao diện menu điều hướng động theo quyền (SCRUM-60)."""
    return read_frontend_page("navigation.html")


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


@app.get("/profile", response_class=HTMLResponse, include_in_schema=False)
def profile_page():
    return login_page_response()


@app.get("/admin/users", response_class=HTMLResponse, include_in_schema=False)
def admin_users_page():
    """Serve the admin dashboard and account list."""
    return login_page_response()


@app.get("/admin/users/create", response_class=HTMLResponse, include_in_schema=False)
def admin_create_user_page():
    return login_page_response()


@app.get("/portal/orders", response_class=HTMLResponse, include_in_schema=False)
@app.get("/sales/orders", response_class=HTMLResponse, include_in_schema=False)
@app.get("/sales/customers", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/dashboard", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/orders/approval", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/pricing", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/reports", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/picking", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/receiving", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/inventory", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/dashboard", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/debt-book", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/invoices", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin/audit-logs", response_class=HTMLResponse, include_in_schema=False)
def role_workspace_page():
    """Serve the React role workspace selected by the login redirect."""
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
