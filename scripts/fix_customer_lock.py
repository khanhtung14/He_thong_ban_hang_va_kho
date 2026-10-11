import os
import re

filepath = "backend/app/api/v1/endpoints/customer_lock_routes.py"
if os.path.exists(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove MOCK_PRODUCTS import
    content = re.sub(r'from [a-zA-Z0-9_\.]+ import MOCK_PRODUCTS\n?', '', content)
    # Add dummy MOCK_PRODUCTS
    if 'MOCK_PRODUCTS =' not in content:
        content = content.replace("router = APIRouter", "MOCK_PRODUCTS = {}\n\nrouter = APIRouter")
        
    # Fix price_lists
    content = content.replace("from app.core.price_lists import", "from app.models.models import")
    content = content.replace("from app.api.v1.endpoints.price_lists import CustomerGroup", "from app.models.models import CustomerGroup")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
