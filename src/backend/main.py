from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import HTMLResponse

try:  # Supports both `python -m src.backend.main` and running this file directly.
    from src.backend.change_password import router as change_password_router
    from src.backend.login import router as login_router
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from change_password import router as change_password_router
    from login import router as login_router

app = FastAPI()

ERROR_403_TEMPLATE = Path(__file__).parent / "templates" / "errors" / "403.html"


@app.exception_handler(HTTPException)
async def render_html_for_forbidden(request: Request, exc: HTTPException):
    """Render the 403 page in browsers while keeping API errors as JSON."""
    accepts_html = "text/html" in request.headers.get("accept", "")
    if exc.status_code == 403 and accepts_html:
        html = ERROR_403_TEMPLATE.read_text(encoding="utf-8")
        return HTMLResponse(content=html, status_code=403, headers=exc.headers)
    return await http_exception_handler(request, exc)

app.include_router(change_password_router)
app.include_router(login_router)


@app.get("/")
def home():
    return {"message": "Backend đang chạy"}


@app.get("/errors/403", response_class=HTMLResponse, include_in_schema=False)
def preview_forbidden_page():
    """Preview the 403 page in a browser; the response remains HTTP 403."""
    html = ERROR_403_TEMPLATE.read_text(encoding="utf-8")
    return HTMLResponse(content=html, status_code=403)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
