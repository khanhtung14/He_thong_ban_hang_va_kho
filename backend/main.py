from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import migrate_pricing_schema, migrate_sales_order_draft_schema
from app.api.v1.endpoints.avatar import router as avatar_router
from app.api.v1.endpoints.change_password import router as change_password_router
from app.api.v1.endpoints.audit_logs import router as audit_logs_router
from app.api.v1.endpoints.forgot_password import router as forgot_password_router
from app.api.v1.endpoints.inventory import router as inventory_router, legacy_router as legacy_inventory_router
from app.api.v1.endpoints.login import router as login_router
from app.api.v1.endpoints.navigation import router as navigation_router
from app.api.v1.endpoints.product_categories import router as product_categories_router
from app.api.v1.endpoints.products import compat_router as products_compat_router, router as products_router
from app.api.v1.endpoints.price_lists import router as price_lists_router
from app.api.v1.endpoints.profile import migrate_profile_schema, router as profile_router
from app.api.v1.endpoints.reports import router as reports_router

from app.api.v1.endpoints.user_assignment import router as user_assignment_router
from app.api.v1.endpoints.sales_assignment import router as sales_assignment_router
from app.api.v1.endpoints.user_routes import router as user_router
from app.api.v1.endpoints.users import compat_router as users_compat_router, router as users_router
from app.api.v1.endpoints.customer_lock_routes import router as customer_lock_router
from app.api.v1.endpoints.delivery_addresses import router as delivery_addresses_router
from app.api.v1.endpoints.import_users import router as import_users_router
from app.api.v1.endpoints.suppliers import compat_router as suppliers_compat_router, router as suppliers_router
from app.api.v1.endpoints.discount_policy_routes import router as discounts_router, compat_router as discounts_compat_router
from app.api.v1.endpoints.sales_orders import router as sales_orders_router
from app.api.v1.endpoints.debt_limit import router as debt_limit_router, compat_router as debt_limit_compat_router
from app.api.v1.endpoints.dealer_history import router as dealer_history_router



@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        migrate_profile_schema()
    except Exception:
        pass
    migrate_pricing_schema()
    migrate_sales_order_draft_schema()
    try:
        from app.api.v1.endpoints.warehouse import seed_default_warehouses_and_territories
        from app.core.database import SessionLocal
        with SessionLocal() as db:
            seed_default_warehouses_and_territories(db)
    except Exception:
        pass
    yield


app = FastAPI(
    title="OMS - Hệ Thống Quản Lý Bán Hàng Và Kho",
    description="Đăng nhập, đổi mật khẩu, quản lý tài khoản và quên/đặt lại mật khẩu qua email.",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:8000", "http://127.0.0.1:8000",
        "http://localhost:8003", "http://127.0.0.1:8003",
    ],
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
if not FRONTEND_INDEX.is_file():
    FRONTEND_INDEX = FRONTEND_DIR / "index.html"


# Vite emits the React bundle here. check_dir=False allows the backend module
# to be imported before the first frontend build.
app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False),
    name="frontend-assets",
)


@app.get("/assets/index.js", include_in_schema=False)
def frontend_placeholder_bundle():
    return Response(
        "console.log('OMS frontend bundle placeholder');",
        media_type="application/javascript",
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
            """
            <!doctype html>
            <html lang=\"vi\">
              <head><meta charset=\"utf-8\"><title>OMS</title></head>
              <body>
                <div id=\"root\"></div>
                <script type=\"module\" src=\"/assets/index.js\"></script>
              </body>
            </html>
            """,
            status_code=status_code,
        )
    return HTMLResponse(
        content=FRONTEND_INDEX.read_text(encoding="utf-8"),
        status_code=status_code,
    )


def forbidden_page(headers: Optional[Dict[str, str]] = None) -> Response:
    if not FRONTEND_INDEX.is_file():
        return HTMLResponse(
            """
            <!doctype html>
            <html lang=\"vi\">
              <head><meta charset=\"utf-8\"><title>OMS</title></head>
              <body>
                <div id=\"root\"></div>
                <script type=\"module\" src=\"/assets/index.js\"></script>
              </body>
            </html>
            """,
            status_code=403,
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
app.include_router(import_users_router)
app.include_router(login_router)
app.include_router(inventory_router)
app.include_router(legacy_inventory_router)
app.include_router(products_router)
app.include_router(products_compat_router)
app.include_router(product_categories_router)
app.include_router(price_lists_router)
app.include_router(reports_router)
app.include_router(navigation_router)
app.include_router(user_assignment_router)
app.include_router(sales_assignment_router)
app.include_router(users_router)
app.include_router(users_compat_router)
app.include_router(user_router)
app.include_router(profile_router)
app.include_router(customer_lock_router)
app.include_router(delivery_addresses_router)
app.include_router(suppliers_router)
app.include_router(suppliers_compat_router)
app.include_router(discounts_router)
app.include_router(discounts_compat_router)
app.include_router(sales_orders_router)
app.include_router(debt_limit_router)
app.include_router(debt_limit_compat_router)
app.include_router(dealer_history_router)
try:
    from app.api.v1.endpoints.warehouse import (
        router as warehouse_router,
        warehouses_router,
        territories_router,
        roles_router,
    )
    from app.api.v1.endpoints.customers import router as customers_router, agencies_router
    from app.api.v1.endpoints.orders import router as orders_router
    from app.api.v1.endpoints.invoices import router as invoices_router
    from app.api.v1.endpoints.payments import router as payments_router
    from app.api.v1.endpoints.returns import router as returns_router
    app.include_router(warehouse_router)
    app.include_router(warehouses_router)
    app.include_router(territories_router)
    app.include_router(roles_router)
    app.include_router(customers_router)
    app.include_router(agencies_router)
    app.include_router(orders_router)
    app.include_router(invoices_router)
    app.include_router(payments_router)
    app.include_router(returns_router)
except ModuleNotFoundError:
    pass

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
@app.get("/sales/assignments", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/dashboard", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/orders/approval", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/pricing", response_class=HTMLResponse, include_in_schema=False)
@app.get("/manager/reports", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/picking", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/receiving", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/inventory", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/suppliers", response_class=HTMLResponse, include_in_schema=False)
@app.get("/warehouse/dashboard", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/debt-book", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/invoices", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/agencies", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accountant/agencies", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/customers", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accountant/customers", response_class=HTMLResponse, include_in_schema=False)
@app.get("/accounting/agency-locks", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin/audit-logs", response_class=HTMLResponse, include_in_schema=False)
def role_workspace_page():
    """Serve the React role workspace selected by the login redirect."""
    return login_page_response()


@app.get("/admin/territory-handover", response_class=HTMLResponse, include_in_schema=False)
def territory_handover_page():
    """Serve the territory handover screen."""
    return login_page_response()


@app.get("/manager/categories", response_class=HTMLResponse, include_in_schema=False)
def manager_categories_page():
    """Serve the product categories management screen (SCRUM-76)."""
    return login_page_response()


@app.get("/manager/customers", response_class=HTMLResponse, include_in_schema=False)
def manager_customers_page():
    """Serve the customer and territory assignment management screen."""
    return login_page_response()


@app.get("/manager/discounts", response_class=HTMLResponse, include_in_schema=False)
def manager_discounts_page():
    """Serve the volume discount policy management screen."""
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
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8003))
    uvicorn.run(app, host="127.0.0.1", port=port)
