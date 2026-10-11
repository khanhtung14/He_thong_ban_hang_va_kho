import os
import glob
import re

endpoints_path = "backend/app/api/v1/endpoints/*.py"
core_path = "backend/app/core/*.py"

for filepath in glob.glob(endpoints_path) + glob.glob(core_path):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix from .database
    content = content.replace("from .database import", "from app.core.database import")
    # Fix from .models
    content = content.replace("from .models import", "from app.models.models import")
    # Fix from .security
    content = content.replace("from .security import", "from app.core.security import")
    # Fix from src.backend
    content = re.sub(r'from src\.backend\.(\w+)', r'from app.core.\1', content)
    # Revert if it replaced models incorrectly
    content = content.replace("from app.core.models", "from app.models.models")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
