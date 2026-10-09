import os

def create_endpoint(name, model_name, path):
    content = f"""from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import {model_name}
from app.api.v1.endpoints.rbac import AuthenticatedUser, require_permissions

router = APIRouter(prefix="/api/v1/{path}", tags=["{name}"])

class {model_name}Create(BaseModel):
    pass # TODO: define schema

@router.get("")
def list_{path}(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    items = db.query({model_name}).all()
    return {{"success": True, "code": 200, "data": [item.__dict__ for item in items]}}

@router.post("")
def create_{path}(
    data: {model_name}Create,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_permissions("public")),
):
    return {{"success": True, "code": 201, "message": "Created"}}
"""
    with open(f"backend/app/api/v1/endpoints/{path}.py", "w", encoding="utf-8") as f:
        f.write(content)

endpoints = [
    ("Customers", "Customer", "customers"),
    ("Orders", "Order", "orders"),
    ("Invoices", "Invoice", "invoices"),
    ("Payments", "Payment", "payments"),
    ("Returns", "ReturnOrder", "returns"),
]

for name, model, path in endpoints:
    create_endpoint(name, model, path)
