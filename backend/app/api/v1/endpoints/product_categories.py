"""Product Categories management module (SCRUM-76).

Implements:
- AC 1: Multi-level hierarchical product groups with tree structure (minimum 3 levels).
- AC 2: Move product between groups (delegated via /api/v1/products/{sku}/category).
- AC 3: Deletion restriction when a category still contains products.
- Technical Safety Rule: Block deletion if category has child categories (unspecified behavior protection).
- RBAC: Sales Manager and Admin have Full management rights; read-only roles can only view.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

try:
    from app.models.models import RoleCode
    from app.api.v1.endpoints.rbac import (
        PERM_PRODUCTS_VIEW,
        AuthenticatedUser,
        require_permissions,
    )
except ImportError:  # pragma: no cover
    try:
        from src.backend.models import RoleCode
        from src.backend.rbac import (
            PERM_PRODUCTS_VIEW,
            AuthenticatedUser,
            require_permissions,
        )
    except ImportError:
        from models import RoleCode
        from rbac import (
            PERM_PRODUCTS_VIEW,
            AuthenticatedUser,
            require_permissions,
        )

router = APIRouter(prefix="/api/v1/categories", tags=["Product Categories"])


# ---------------------------------------------------------------------------
# 1. Pydantic Schemas
# ---------------------------------------------------------------------------

class CreateCategoryRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50, description="Mã nhóm hàng (duy nhất)")
    name: str = Field(min_length=1, max_length=150, description="Tên nhóm hàng")
    parent_id: Optional[int] = Field(default=None, description="ID nhóm cha (None nếu là cấp 1)")
    description: Optional[str] = Field(default=None, description="Mô tả nhóm hàng")


class UpdateCategoryRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150, description="Tên nhóm hàng mới")
    code: Optional[str] = Field(default=None, min_length=1, max_length=50, description="Mã nhóm hàng mới")
    parent_id: Optional[int] = Field(default=None, description="ID nhóm cha mới")
    description: Optional[str] = Field(default=None, description="Mô tả mới")


# ---------------------------------------------------------------------------
# 2. In-Memory Category Registry & Default Seed (Minimum 3 Levels)
# ---------------------------------------------------------------------------

DEFAULT_CATEGORIES: list[dict[str, Any]] = [
    {
        "id": 1,
        "code": "NGK",
        "name": "Nước giải khát",
        "parent_id": None,
        "description": "Ngành hàng nước giải khát các loại (Cấp 1)",
    },
    {
        "id": 2,
        "code": "ENERGY",
        "name": "Nước tăng lực",
        "parent_id": 1,
        "description": "Nhóm các sản phẩm nước tăng lực và hồi phục thể lực (Cấp 2)",
    },
    {
        "id": 3,
        "code": "ENERGY_GAS",
        "name": "Nước tăng lực có gas",
        "parent_id": 2,
        "description": "Phân nhóm nước tăng lực có bổ sung ga đóng lon (Cấp 3)",
    },
]

# Mutable storage for categories
_CATEGORY_REGISTRY: dict[int, dict[str, Any]] = {c["id"]: c.copy() for c in DEFAULT_CATEGORIES}
_NEXT_CATEGORY_ID: int = 4


def reset_category_registry() -> None:
    """Reset registry to initial seed state (used in testing)."""
    global _CATEGORY_REGISTRY, _NEXT_CATEGORY_ID
    _CATEGORY_REGISTRY = {c["id"]: c.copy() for c in DEFAULT_CATEGORIES}
    _NEXT_CATEGORY_ID = 4


def get_all_categories() -> list[dict[str, Any]]:
    return list(_CATEGORY_REGISTRY.values())


def get_category_by_id(category_id: int) -> dict[str, Any] | None:
    return _CATEGORY_REGISTRY.get(category_id)


def count_products_for_category(category_id: int) -> int:
    """Count products directly assigned to this category."""
    try:
        from app.api.v1.endpoints.products import MOCK_PRODUCTS
    except ImportError:
        try:
            from src.backend.products import MOCK_PRODUCTS
        except ImportError:
            from products import MOCK_PRODUCTS

    count = 0
    for p in MOCK_PRODUCTS.values():
        if p.get("category_id") == category_id:
            count += 1
    return count


def count_child_categories(category_id: int) -> int:
    """Count direct child categories of this category."""
    return sum(1 for c in _CATEGORY_REGISTRY.values() if c.get("parent_id") == category_id)


def calculate_category_level(category_id: int) -> int:
    """Calculate 1-indexed depth level of a category."""
    level = 1
    current = _CATEGORY_REGISTRY.get(category_id)
    visited = set()
    while current and current.get("parent_id") is not None:
        p_id = current["parent_id"]
        if p_id in visited:
            break
        visited.add(p_id)
        current = _CATEGORY_REGISTRY.get(p_id)
        if current:
            level += 1
    return level


def would_cause_cycle(category_id: int, new_parent_id: int | None) -> bool:
    """Check if setting category_id's parent to new_parent_id creates a cycle."""
    if new_parent_id is None:
        return False
    if category_id == new_parent_id:
        return True

    # Trace up ancestors of new_parent_id
    curr = _CATEGORY_REGISTRY.get(new_parent_id)
    visited = set()
    while curr:
        if curr["id"] == category_id:
            return True
        p_id = curr.get("parent_id")
        if p_id is None or p_id in visited:
            break
        visited.add(p_id)
        curr = _CATEGORY_REGISTRY.get(p_id)
    return False


def build_category_tree(parent_id: int | None = None) -> list[dict[str, Any]]:
    """Build nested tree structure starting from parent_id."""
    nodes = []
    # Find direct children sorted by id
    children = [c for c in _CATEGORY_REGISTRY.values() if c.get("parent_id") == parent_id]
    children.sort(key=lambda x: x["id"])

    for cat in children:
        c_id = cat["id"]
        node = {
            "id": c_id,
            "code": cat["code"],
            "name": cat["name"],
            "parent_id": cat.get("parent_id"),
            "description": cat.get("description"),
            "level": calculate_category_level(c_id),
            "products_count": count_products_for_category(c_id),
            "children": build_category_tree(c_id),
        }
        nodes.append(node)
    return nodes


def verify_write_permission(user: AuthenticatedUser) -> None:
    """Ensure user has Sales Manager or Admin role for write operations."""
    if user.role not in (RoleCode.SALES_MANAGER.value, RoleCode.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản lý kinh doanh và Quản trị viên mới có quyền thay đổi danh mục nhóm hàng.",
        )


# ---------------------------------------------------------------------------
# 3. API Endpoints
# ---------------------------------------------------------------------------

@router.get("/tree")
def get_categories_tree(
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get nested hierarchical category tree (AC 1)."""
    return build_category_tree(parent_id=None)


@router.get("")
def list_categories(
    parent_id: Optional[int] = None,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get flat list of categories with level and products count."""
    categories = get_all_categories()
    if parent_id is not None:
        categories = [c for c in categories if c.get("parent_id") == parent_id]

    result = []
    for c in sorted(categories, key=lambda x: x["id"]):
        c_id = c["id"]
        parent = _CATEGORY_REGISTRY.get(c.get("parent_id")) if c.get("parent_id") else None
        result.append({
            "id": c_id,
            "code": c["code"],
            "name": c["name"],
            "parent_id": c.get("parent_id"),
            "parent_name": parent["name"] if parent else None,
            "description": c.get("description"),
            "level": calculate_category_level(c_id),
            "products_count": count_products_for_category(c_id),
        })
    return result


@router.get("/{category_id}")
def get_category_detail(
    category_id: int,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Get detailed category information by ID."""
    cat = get_category_by_id(category_id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nhóm hàng với ID '{category_id}' không tồn tại.",
        )
    parent = _CATEGORY_REGISTRY.get(cat.get("parent_id")) if cat.get("parent_id") else None
    return {
        "id": cat["id"],
        "code": cat["code"],
        "name": cat["name"],
        "parent_id": cat.get("parent_id"),
        "parent_name": parent["name"] if parent else None,
        "description": cat.get("description"),
        "level": calculate_category_level(category_id),
        "products_count": count_products_for_category(category_id),
        "children_count": count_child_categories(category_id),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CreateCategoryRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Create a new product category."""
    global _NEXT_CATEGORY_ID
    verify_write_permission(user)

    code_clean = payload.code.strip().upper()
    name_clean = payload.name.strip()

    # Check unique code
    for c in _CATEGORY_REGISTRY.values():
        if c["code"].upper() == code_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mã nhóm hàng '{code_clean}' đã tồn tại trong hệ thống. Vui lòng chọn mã khác.",
            )

    # Check parent_id exists if specified
    if payload.parent_id is not None:
        if payload.parent_id not in _CATEGORY_REGISTRY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nhóm cha với ID '{payload.parent_id}' không tồn tại.",
            )

    new_id = _NEXT_CATEGORY_ID
    _NEXT_CATEGORY_ID += 1

    new_category = {
        "id": new_id,
        "code": code_clean,
        "name": name_clean,
        "parent_id": payload.parent_id,
        "description": payload.description.strip() if payload.description else None,
    }
    _CATEGORY_REGISTRY[new_id] = new_category

    return {
        "message": "Tạo nhóm hàng mới thành công",
        "category": {
            **new_category,
            "level": calculate_category_level(new_id),
            "products_count": 0,
        },
    }


@router.put("/{category_id}")
def update_category(
    category_id: int,
    payload: UpdateCategoryRequest,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Update category information."""
    verify_write_permission(user)

    cat = get_category_by_id(category_id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nhóm hàng với ID '{category_id}' không tồn tại.",
        )

    # Validate code uniqueness if changing
    if payload.code is not None:
        code_clean = payload.code.strip().upper()
        for other_id, other_cat in _CATEGORY_REGISTRY.items():
            if other_id != category_id and other_cat["code"].upper() == code_clean:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Mã nhóm hàng '{code_clean}' đã được sử dụng bởi nhóm khác.",
                )
        cat["code"] = code_clean

    if payload.name is not None:
        cat["name"] = payload.name.strip()

    if payload.description is not None:
        cat["description"] = payload.description.strip() if payload.description else None

    # Handle parent_id update and cycle prevention
    if payload.parent_id is not None or "parent_id" in payload.model_fields_set:
        new_parent_id = payload.parent_id
        if new_parent_id is not None:
            if new_parent_id not in _CATEGORY_REGISTRY:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Nhóm cha mới với ID '{new_parent_id}' không tồn tại.",
                )
            if would_cause_cycle(category_id, new_parent_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Không thể gán nhóm '{new_parent_id}' làm nhóm cha vì sẽ tạo vòng lặp phân cấp.",
                )
        cat["parent_id"] = new_parent_id

    return {
        "message": "Cập nhật nhóm hàng thành công",
        "category": {
            **cat,
            "level": calculate_category_level(category_id),
            "products_count": count_products_for_category(category_id),
        },
    }


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    user: AuthenticatedUser = Depends(require_permissions(PERM_PRODUCTS_VIEW)),
) -> Any:
    """Delete category with strict integrity checks (AC 3 & Technical Safety Rule)."""
    verify_write_permission(user)

    cat = get_category_by_id(category_id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nhóm hàng với ID '{category_id}' không tồn tại.",
        )

    # AC 3: Nhóm còn sản phẩm thì không xoá được
    products_count = count_products_for_category(category_id)
    if products_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Không thể xóa nhóm hàng vì vẫn còn {products_count} sản phẩm đang thuộc nhóm này. "
                "Vui lòng chuyển sản phẩm sang nhóm khác trước khi xóa."
            ),
        )

    # Technical Safety Rule: Nhóm còn nhóm con thì không được xóa
    children_count = count_child_categories(category_id)
    if children_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Không thể xóa nhóm hàng vì vẫn còn {children_count} nhóm con trực thuộc "
                "(Hành vi xóa nhóm cha khi còn nhóm con chưa được đặc tả trong yêu cầu, "
                "vui lòng xóa hoặc di chuyển các nhóm con trước)."
            ),
        )

    # Only delete when both products_count == 0 and children_count == 0
    deleted_cat = _CATEGORY_REGISTRY.pop(category_id)
    return {
        "message": f"Xóa nhóm hàng '{deleted_cat['name']}' thành công.",
        "deleted_category_id": category_id,
    }
