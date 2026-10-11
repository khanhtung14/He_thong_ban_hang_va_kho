import os
import re

filepath = "backend/app/api/v1/endpoints/customer_lock_routes.py"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all OrderStatus.PENDING with OrderStatus.PENDING_APPROVAL
content = content.replace("OrderStatus.PENDING", "OrderStatus.PENDING_APPROVAL")
content = content.replace("OrderStatus.PENDING_APPROVAL_APPROVAL", "OrderStatus.PENDING_APPROVAL")
content = content.replace("OrderStatus.NEW", "OrderStatus.PENDING_APPROVAL")
content = content.replace("OrderStatus.SHIPPED", "OrderStatus.PROCESSING")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
