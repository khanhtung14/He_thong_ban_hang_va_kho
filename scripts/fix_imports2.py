import os
import glob
import re

endpoints_path = "backend/app/api/v1/endpoints/*.py"
core_path = "backend/app/core/*.py"
services_path = "backend/app/services/*.py"

for filepath in glob.glob(endpoints_path) + glob.glob(core_path) + glob.glob(services_path):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace("app.core.schemas", "app.schemas.schemas")
    content = content.replace("app.core.users_service", "app.services.users_service")
    content = content.replace("app.core.audit", "app.services.audit_service") # might be wrong
    
    # Just in case
    content = content.replace("from src.backend.schemas", "from app.schemas.schemas")
    content = content.replace("from src.backend.users_service", "from app.services.users_service")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
