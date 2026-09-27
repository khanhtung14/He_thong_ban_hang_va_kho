from fastapi import FastAPI
from src.backend.change_password import router as change_password_router
from src.backend.import_users import router as import_users_router

app = FastAPI()

app.include_router(change_password_router)
app.include_router(import_users_router)


@app.get("/")
def home():
    return {"message": "Backend đang chạy"}