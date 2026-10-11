import os
import shutil
import re

root_dir = r"c:\Users\Admin\He_thong_ban_hang_va_kho"
src_backend = os.path.join(root_dir, "src", "backend")
backend_dir = os.path.join(root_dir, "backend")

# 1. Create directories
dirs_to_create = [
    "app/api/v1/endpoints",
    "app/core",
    "app/models",
    "app/schemas",
    "app/services",
    "app/repositories",
    "app/utils",
    "migrations",
    "tests"
]

for d in dirs_to_create:
    os.makedirs(os.path.join(backend_dir, d), exist_ok=True)

# 2. Move backend files
file_mapping = {
    "main.py": "main.py",
    "models.py": "app/models/models.py",
    "schemas.py": "app/schemas/schemas.py",
    "database.py": "app/core/database.py",
    "security.py": "app/core/security.py",
    "session.py": "app/core/session.py",
    "email_service.py": "app/services/email_service.py",
    "users_service.py": "app/services/users_service.py",
}

routers = [
    "login.py", "users.py", "forgot_password.py", "change_password.py", 
    "profile.py", "avatar.py", "customer_lock_routes.py", "navigation.py", 
    "price_lists.py", "products.py", "reports.py", "user_assignment.py", 
    "user_routes.py", "audit_logs.py", "inventory.py", "rbac.py"
]
for r in routers:
    file_mapping[r] = f"app/api/v1/endpoints/{r}"

if os.path.exists(src_backend):
    for f_name, dest_path in file_mapping.items():
        src_path = os.path.join(src_backend, f_name)
        dest_full = os.path.join(backend_dir, dest_path)
        if os.path.exists(src_path):
            shutil.move(src_path, dest_full)
            print(f"Moved {f_name} to {dest_path}")
            
    # Remove old src/backend if empty
    if not os.listdir(src_backend):
        os.rmdir(src_backend)
        print("Removed empty src/backend")

# Create __init__.py files
for root, dirs, files in os.walk(os.path.join(backend_dir, "app")):
    init_path = os.path.join(root, "__init__.py")
    if not os.path.exists(init_path):
        with open(init_path, "w") as f:
            f.write("")

# Update imports in python files
def update_imports(file_path):
    if not os.path.exists(file_path):
        return
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replacements based on old flat structure
    replacements = [
        (r"from database import", r"from app.core.database import"),
        (r"import database", r"from app.core import database"),
        (r"from security import", r"from app.core.security import"),
        (r"from session import", r"from app.core.session import"),
        (r"from models import", r"from app.models.models import"),
        (r"import models", r"from app.models import models"),
        (r"from schemas import", r"from app.schemas.schemas import"),
        (r"import schemas", r"from app.schemas import schemas"),
        (r"from email_service import", r"from app.services.email_service import"),
        (r"from users_service import", r"from app.services.users_service import"),
    ]
    
    # Update router imports from main
    for r in routers:
        module_name = r.replace('.py', '')
        replacements.append((f"from {module_name} import", f"from app.api.v1.endpoints.{module_name} import"))
        replacements.append((f"import {module_name}", f"from app.api.v1.endpoints import {module_name}"))

    new_content = content
    for old, new in replacements:
        new_content = re.sub(old, new, new_content)

    if new_content != content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated imports in {file_path}")

for root, dirs, files in os.walk(backend_dir):
    for f in files:
        if f.endswith(".py"):
            update_imports(os.path.join(root, f))
            
# Frontend structure
frontend_src = os.path.join(root_dir, "frontend", "src")
dirs_to_create_fe = [
    "features/auth",
    "features/profile",
    "features/users",
    "features/roles",
    "hooks",
    "constants",
    "utils",
    "services"
]
for d in dirs_to_create_fe:
    os.makedirs(os.path.join(frontend_src, d), exist_ok=True)

# Map frontend files to features
fe_file_mapping = {
    "Login.tsx": "features/auth/Login.tsx",
    "ForgotPassword.tsx": "features/auth/ForgotPassword.tsx",
    "ChangePassword.tsx": "features/auth/ChangePassword.tsx",
    "Profile.tsx": "features/profile/Profile.tsx",
    "ProfileAvatar.tsx": "features/profile/ProfileAvatar.tsx",
    "ProfileAvatar.css": "features/profile/ProfileAvatar.css",
    "CreateUser.tsx": "features/users/CreateUser.tsx",
    "CreateUser.css": "features/users/CreateUser.css",
    "RoleWorkspace.tsx": "features/roles/RoleWorkspace.tsx",
    "RoleWorkspace.css": "features/roles/RoleWorkspace.css",
    "api.ts": "services/apiClient.ts",
    "session.ts": "services/sessionService.ts"
}

if os.path.exists(frontend_src):
    for f_name, dest_path in fe_file_mapping.items():
        src_path = os.path.join(frontend_src, f_name)
        dest_full = os.path.join(frontend_src, dest_path)
        if os.path.exists(src_path):
            shutil.move(src_path, dest_full)
            print(f"Moved {f_name} to {dest_path}")

print("Restructuring script completed.")
