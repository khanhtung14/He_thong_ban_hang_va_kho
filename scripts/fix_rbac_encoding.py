from pathlib import Path

p = Path("backend/app/api/v1/endpoints/rbac.py")
text = p.read_text(encoding="utf-8")

# Replace line 344 and line 358
lines = text.splitlines(keepends=True)
for i, line in enumerate(lines):
    if "detail=f\"" in line and ("perm" in line or "user.role" in line):
        if "perm" in line:
            lines[i] = "                    detail=f\"Quyền bị từ chối: Vai trò '{user.role}' không có quyền '{perm}'.\",\n"
        elif "normalized_allowed" in lines[i-2] or "normalized_allowed" in lines[i-3]:
            lines[i] = "                detail=f\"Quyền bị từ chối: Vai trò '{user.role}' không được phép truy cập tài nguyên này.\",\n"

p.write_text("".join(lines), encoding="utf-8")
print("Done fixing lines 344 and 358")
