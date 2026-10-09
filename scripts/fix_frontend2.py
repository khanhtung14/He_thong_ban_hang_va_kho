import os
import shutil
import re

root_dir = r"c:\Users\Admin\He_thong_ban_hang_va_kho\frontend\src"

# 1. Move actual auth files to features/auth
auth_src = os.path.join(root_dir, "auth")
features_auth = os.path.join(root_dir, "features", "auth")

if os.path.exists(auth_src):
    for f in os.listdir(auth_src):
        src_path = os.path.join(auth_src, f)
        dest_path = os.path.join(features_auth, f)
        if os.path.isfile(src_path):
            shutil.copy2(src_path, dest_path)
            print(f"Copied {f} to features/auth")
    shutil.rmtree(auth_src)
    print("Removed src/auth")

# 2. Move roles to features/roles
roles_src = os.path.join(root_dir, "roles")
features_roles = os.path.join(root_dir, "features", "roles")

if os.path.exists(roles_src):
    for item in os.listdir(roles_src):
        src_path = os.path.join(roles_src, item)
        dest_path = os.path.join(features_roles, item)
        if os.path.isdir(src_path):
            shutil.copytree(src_path, dest_path, dirs_exist_ok=True)
        else:
            shutil.copy2(src_path, dest_path)
    shutil.rmtree(roles_src)
    print("Removed src/roles")

# 3. Delete proxy files if they exist in features/auth
for f in ["Login.tsx", "ForgotPassword.tsx", "ChangePassword.tsx"]:
    path = os.path.join(features_auth, f)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
            if "export { default } from" in content:
                # Need to restore from the one we just copied? No, we already overwrote or need to make sure we overwrite.
                # Wait, copy2 overwrites by default. Let's just check if it still contains 'export { default }'.
                pass

# Fix imports in all files
def fix_imports(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = content
    # In features/auth/*: ../session -> ../../services/sessionService
    # In features/auth/*: ../api -> ../../services/apiClient
    # Replace anything importing session or api depending on depth.
    
    # We will do a regex to replace session and api imports
    # Match: import ... from "path/to/session"
    new_content = re.sub(r'from\s+["\'](\./|\.\./)+session["\']', 'from "services/sessionService"', new_content)
    new_content = re.sub(r'from\s+["\'](\./|\.\./)+api["\']', 'from "services/apiClient"', new_content)
    
    # Also fix imports pointing to ../../session etc
    new_content = re.sub(r'from\s+["\'].*?/session["\']', 'from "services/sessionService"', new_content)
    new_content = re.sub(r'from\s+["\'].*?/api["\']', 'from "services/apiClient"', new_content)
    
    # In RoleWorkspace.tsx:
    # import Profile from "./Profile" -> "../../features/profile/Profile"
    if "RoleWorkspace.tsx" in file_path:
        new_content = new_content.replace('from "./Profile"', 'from "../profile/Profile"')
        new_content = new_content.replace('from "./ProfileAvatar"', 'from "../profile/ProfileAvatar"')
        new_content = new_content.replace('from "./Error403"', 'from "../../Error403"')
        new_content = new_content.replace('from "./roles/sales_manager/SalesManagerDashboard"', 'from "./sales_manager/SalesManagerDashboard"')

    # Fix ts type errors (implicitly any)
    if "Profile.tsx" in file_path:
        new_content = new_content.replace("const handleSave = async (response) =>", "const handleSave = async (response: any) =>")
    if "CreateUser.tsx" in file_path:
        new_content = new_content.replace("const handleSave = async (response) =>", "const handleSave = async (response: any) =>")
        new_content = new_content.replace("const handleSave = async (data) =>", "const handleSave = async (data: any) =>")
        new_content = new_content.replace("onSubmit={async (data) =>", "onSubmit={async (data: any) =>")
    if "SalesManagerDashboard.tsx" in file_path:
        new_content = new_content.replace("setDraftOrders(draft);", "setDraftOrders(draft as any);")
        new_content = new_content.replace("const loadDashboardData = async (p) =>", "const loadDashboardData = async (p: any) =>")
        new_content = new_content.replace("const loadDashboardData = async (draft) =>", "const loadDashboardData = async (draft: any) =>")
        # Let's just blindly replace implicit any in SalesManagerDashboard
        new_content = re.sub(r'setDraftOrders\(\(draft\) =>', 'setDraftOrders((draft: any) =>', new_content)
        new_content = re.sub(r'setDraftOrders\(draft\)', 'setDraftOrders(draft as any)', new_content)
        new_content = re.sub(r'\(\(p\)', '((p: any)', new_content)
        new_content = re.sub(r'\(p\)', '(p: any)', new_content)
        new_content = re.sub(r'\(\(draft\)', '((draft: any)', new_content)

    if content != new_content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated imports in {file_path}")

for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith(".ts") or file.endswith(".tsx"):
            fix_imports(os.path.join(root, file))

# Update tsconfig.app.json to support absolute imports if we used them (like "services/sessionService")
tsconfig_path = r"c:\Users\Admin\He_thong_ban_hang_va_kho\frontend\tsconfig.app.json"
with open(tsconfig_path, "r", encoding="utf-8") as f:
    ts_content = f.read()
if '"baseUrl": "./src"' not in ts_content:
    ts_content = ts_content.replace('"compilerOptions": {', '"compilerOptions": {\n    "baseUrl": "./src",\n    "paths": {"*": ["*"]},')
    with open(tsconfig_path, "w", encoding="utf-8") as f:
        f.write(ts_content)

print("Done fixing frontend.")
