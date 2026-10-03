from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.backend.change_password import router as change_password_router
from src.backend.profile import router as profile_router

app = FastAPI(
    title="Hệ thống bán hàng và kho",
    description="API quản lý bán hàng và kho",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Đăng ký các router
app.include_router(change_password_router)
app.include_router(profile_router)


@app.get("/")
def home():
    return {"message": "Backend đang chạy"}