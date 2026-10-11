import os
import glob

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = content.replace("app.core.rbac", "app.api.v1.endpoints.rbac")
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

for root, dirs, files in os.walk("backend/app"):
    for file in files:
        if file.endswith(".py"):
            fix_file(os.path.join(root, file))
