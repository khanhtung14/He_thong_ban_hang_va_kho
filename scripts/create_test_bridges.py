from pathlib import Path

bridges = {
    "login.py": """from app.api.v1.endpoints.login import *
from app.api.v1.endpoints.login import _attempts, _locked_until""",
    "change_password.py": "from app.api.v1.endpoints.change_password import *",
    "main.py": "from backend.main import app",
    "models.py": "from app.models.models import *",
    "database.py": "from app.core.database import *",
    "rbac.py": "from app.api.v1.endpoints.rbac import *",
    "products.py": "from app.api.v1.endpoints.products import *",
    "product_categories.py": "from app.api.v1.endpoints.product_categories import *",
    "audit_logs.py": "from app.api.v1.endpoints.audit_logs import *",
    "forgot_password.py": "from app.api.v1.endpoints.forgot_password import *",
    "navigation.py": "from app.api.v1.endpoints.navigation import *",
    "email_service.py": "from app.services.email_service import *",
    "security.py": "from app.core.security import *",
    "inventory.py": "from app.api.v1.endpoints.inventory import *",
    "price_lists.py": "from app.api.v1.endpoints.price_lists import *",
    "reports.py": "from app.api.v1.endpoints.reports import *",
    "session.py": "from app.core.session import *",
    "user_assignment.py": "from app.api.v1.endpoints.user_assignment import *",
    "user_routes.py": "from app.api.v1.endpoints.user_routes import *",
    "users.py": "from app.api.v1.endpoints.users import *",
    "users_service.py": "from app.services.users_service import *",
    "schemas.py": "from app.schemas.schemas import *",
    "avatar.py": "from app.api.v1.endpoints.avatar import *",
    "customer_lock_routes.py": "from app.api.v1.endpoints.customer_lock_routes import *",
}

src_backend = Path("src/backend")
src_backend.mkdir(parents=True, exist_ok=True)

header = '"""Backward compatibility bridge for tests importing src.backend."""\n'

for filename, stmt in bridges.items():
    file_path = src_backend / filename
    file_path.write_text(header + stmt + "\n", encoding="utf-8")
    print(f"Updated bridge: {file_path}")

print("Bridge generation completed.")
