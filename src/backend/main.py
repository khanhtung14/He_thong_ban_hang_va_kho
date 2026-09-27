from fastapi import FastAPI

try:  # Supports both `python -m src.backend.main` and running this file directly.
    from src.backend.change_password import router as change_password_router
    from src.backend.login import router as login_router
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from change_password import router as change_password_router
    from login import router as login_router

app = FastAPI()

app.include_router(change_password_router)
app.include_router(login_router)


@app.get("/")
def home():
    return {"message": "Backend đang chạy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
