from fastapi import FastAPI

from src.backend.change_password import router as change_password_router
from src.backend.profile import router as profile_router

app = FastAPI(
    title="Hệ thống bán hàng và kho",
    description="API quản lý bán hàng và kho",
    version="1.0.0",
)

# Đăng ký các router
app.include_router(change_password_router)
app.include_router(profile_router)


@app.get("/")
def home():
    return {"message": "Backend đang chạy"}