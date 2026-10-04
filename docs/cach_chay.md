mở terminal
$env:DATABASE_URL = "sqlite:///./database/demo.db"

.\.venv\Scripts\python.exe scripts/seed_demo_data.py

$env:LOGIN_USERS_JSON = Get-Content database/demo_login_users.json -Raw

nhập: python -m pip install -r requirements.txt     để tải các thư viện cần thiết


nhập: .venv\Scripts\python.exe -m uvicorn src.backend.main:app --reload   
sau khi nhập hết lệnh, những lần sau chỉ cần nhập lệnh cuối để chạy


lệnh chạy testcase: 
python -m pytest -q


chạy lại frontend khi thay đổi frontend:
cd C:\Users\Admin\He_thong_ban_hang_va_kho\src\frontend
npm.cmd run build