"""Kiểm thử tự động cho User Story SCRUM-60 (US-06 / S1-06):
Menu Điều Hướng Đúng Theo Quyền & Tối Ưu Mobile 360px.

Tiêu chí nghiệm thu (Acceptance Criteria):
1. Mục menu không thuộc quyền thì không hiển thị:
   - Vai trò "Warehouse" (Nhân viên kho) chỉ thấy: "Soạn hàng", "Nhập kho", "Sổ tồn kho", "Chuyển kho".
   - Hoàn toàn KHÔNG thấy: "Tạo đơn hàng", "Duyệt đơn", "Bảng giá", "Sổ công nợ", "Quản trị người dùng".
2. Hiển thị đầy đủ thông tin người dùng, vai trò và phạm vi kho/địa bàn:
   - Ví dụ: Họ tên "Trần Văn Kho", Vai trò "Nhân viên kho", Phạm vi "Kho Tổng Hà Nội".
3. Hoạt động thuận tiện và không vỡ layout trên màn hình 360px:
   - Hiển thị dạng ngăn kéo Drawer / Hamburger menu mượt mà.
   - Nút bấm và liên kết có kích thước cảm ứng tối thiểu 44x44px.
   - Không xuất hiện thanh cuộn ngang gây lỗi hiển thị.
"""

from __future__ import annotations

import re
import pytest
from fastapi.testclient import TestClient

from src.backend.main import app
from src.backend.navigation import (
    MENU_REGISTRY,
    ROLE_DISPLAY_NAMES,
    build_navigation_context,
    get_hidden_menu_items_for_role,
    get_menu_items_for_role,
    normalize_role,
    resolve_user_scope,
)

client = TestClient(app)


# ==============================================================================
# 1. TIÊU CHÍ 1: Mục menu không thuộc quyền thì không hiển thị (Role-Based Access)
# ==============================================================================

class TestCriterion1MenuFilteringByRole:
    """Kiểm tra Scenario: Mục menu không thuộc quyền thì không hiển thị."""

    def test_warehouse_menu_contains_only_authorized_items(self):
        """Khi đăng nhập với vai trò Warehouse (Nhân viên kho):
        Thanh menu chỉ hiển thị: 'Soạn hàng', 'Nhập kho', 'Sổ tồn kho', 'Chuyển kho'.
        """
        warehouse_items = get_menu_items_for_role("WAREHOUSE")
        titles = [item["title"] for item in warehouse_items]

        # Kiểm tra các mục bắt buộc phải có
        assert "Soạn hàng" in titles
        assert "Nhập kho" in titles
        assert "Sổ tồn kho" in titles
        assert "Chuyển kho" in titles

        # Đảm bảo chỉ gồm các mục thuộc quyền kho vận
        assert len(warehouse_items) == 4

    def test_warehouse_menu_strictly_hides_unauthorized_items(self):
        """Khi đăng nhập với vai trò Warehouse:
        Hoàn toàn KHÔNG hiển thị: 'Tạo đơn hàng', 'Duyệt đơn', 'Bảng giá', 'Sổ công nợ', 'Quản trị người dùng'.
        """
        warehouse_items = get_menu_items_for_role("WAREHOUSE")
        visible_titles = {item["title"] for item in warehouse_items}

        forbidden_titles = [
            "Tạo đơn hàng",
            "Duyệt đơn",
            "Bảng giá",
            "Sổ công nợ",
            "Quản trị người dùng",
        ]

        for forbidden in forbidden_titles:
            assert forbidden not in visible_titles, (
                f"LỖI BẢO MẬT: Mục menu '{forbidden}' không thuộc quyền của Nhân viên kho nhưng vẫn hiển thị!"
            )

    def test_sales_rep_menu_contains_sales_items_and_hides_warehouse_items(self):
        """Nhân viên kinh doanh (Sales Rep) phải thấy các mục bán hàng và không thấy các mục soạn hàng / quản trị."""
        sales_items = get_menu_items_for_role("SALES")
        visible_titles = {item["title"] for item in sales_items}

        assert "Tạo đơn hàng" in visible_titles
        assert "Đơn hàng" in visible_titles
        assert "Khách hàng / Đại lý" in visible_titles
        assert "Tồn kho khả dụng" in visible_titles

        # Không thấy các mục của vai trò khác
        assert "Soạn hàng" not in visible_titles
        assert "Nhập kho" not in visible_titles
        assert "Chuyển kho" not in visible_titles
        assert "Quản trị người dùng" not in visible_titles
        assert "Sổ công nợ" not in visible_titles

    def test_admin_has_system_management_menus(self):
        """Quản trị hệ thống (Admin) có quyền quản trị người dùng và nhật ký kiểm toán."""
        admin_items = get_menu_items_for_role("ADMIN")
        visible_titles = {item["title"] for item in admin_items}

        assert "Quản trị người dùng" in visible_titles
        assert "Nhật ký kiểm toán" in visible_titles
        assert "Phân bổ địa bàn" in visible_titles

        # Admin không làm thao tác soạn hàng trực tiếp
        assert "Soạn hàng" not in visible_titles

    def test_accountant_sees_debt_book_and_invoices_only(self):
        """Kế toán thấy Sổ công nợ và Hóa đơn, không thấy soạn hàng hoặc quản trị user."""
        accountant_items = get_menu_items_for_role("ACCOUNTANT")
        visible_titles = {item["title"] for item in accountant_items}

        assert "Sổ công nợ" in visible_titles
        assert "Hóa đơn & Thanh toán" in visible_titles
        assert "Soạn hàng" not in visible_titles
        assert "Quản trị người dùng" not in visible_titles


# ==============================================================================
# 2. TIÊU CHÍ 2: Hiển thị đầy đủ thông tin người dùng, vai trò và phạm vi kho/địa bàn
# ==============================================================================

class TestCriterion2UserInfoAndScope:
    """Kiểm tra Scenario: Hiển thị đầy đủ thông tin người dùng, vai trò và phạm vi kho/địa bàn."""

    def test_warehouse_user_tran_van_kho_full_profile(self):
        """Given người dùng 'Trần Văn Kho' giữ vai trò 'Nhân viên kho' phụ trách 'Kho Tổng Hà Nội'
        Then hiển thị chính xác Họ tên, Vai trò, Phạm vi.
        """
        user_profile = {
            "username": "tranvankho",
            "full_name": "Trần Văn Kho",
            "role_code": "WAREHOUSE",
            "scope": "Kho Tổng Hà Nội",
        }

        context = build_navigation_context(user_profile)
        user_info = context["user"]

        assert user_info["full_name"] == "Trần Văn Kho"
        assert user_info["role_name"] == "Nhân viên kho"
        assert user_info["scope"] == "Kho Tổng Hà Nội"

    def test_sales_rep_territory_scope(self):
        """Nhân viên kinh doanh hiển thị địa bàn phụ trách."""
        user_profile = {
            "username": "trankinhdoanh",
            "full_name": "Trần Kinh Doanh",
            "role_code": "SALES",
            "scope": "Địa bàn Hà Nội",
        }

        context = build_navigation_context(user_profile)
        user_info = context["user"]

        assert user_info["full_name"] == "Trần Kinh Doanh"
        assert user_info["role_name"] == "Nhân viên kinh doanh"
        assert user_info["scope"] == "Địa bàn Hà Nội"

    def test_admin_system_wide_scope(self):
        """Quản trị hệ thống hiển thị phạm vi Toàn hệ thống."""
        user_profile = {
            "username": "buiquantri",
            "full_name": "Bùi Quản Trị",
            "role_code": "ADMIN",
        }

        context = build_navigation_context(user_profile)
        user_info = context["user"]

        assert user_info["full_name"] == "Bùi Quản Trị"
        assert user_info["role_name"] == "Quản trị hệ thống"
        assert user_info["scope"] == "Toàn hệ thống"


# ==============================================================================
# 3. TIÊU CHÍ 3: Hoạt động thuận tiện và tối ưu trên màn hình 360px
# ==============================================================================

class TestCriterion3Mobile360pxCompliance:
    """Kiểm tra Scenario: Hoạt động thuận tiện và không vỡ layout trên màn hình 360px."""

    @pytest.fixture
    def html_content(self):
        response = client.get("/navigation")
        assert response.status_code == 200
        return response.text

    def test_meta_viewport_present(self, html_content):
        """Đảm bảo có meta viewport để responsive chuẩn xác trên màn hình mobile 360px."""
        assert '<meta name="viewport"' in html_content
        assert "width=device-width" in html_content

    def test_hamburger_and_drawer_elements_exist(self, html_content):
        """Đảm bảo có nút Hamburger menu và ngăn kéo Drawer cho mobile."""
        assert 'id="btnHamburger"' in html_content
        assert 'id="appSidebar"' in html_content
        assert 'id="sidebarOverlay"' in html_content
        assert 'id="btnCloseSidebar"' in html_content

    def test_touch_target_dimensions_at_least_44px(self, html_content):
        """Đảm bảo các nút bấm và liên kết có kích thước cảm ứng tối thiểu 44x44px.
        Kiểm tra CSS quy định min-width và min-height >= 44px.
        """
        # Hamburger button: min 44x44px
        assert re.search(r"\.btn-hamburger\s*\{[^}]*min-width:\s*44px", html_content)
        assert re.search(r"\.btn-hamburger\s*\{[^}]*min-height:\s*44px", html_content)

        # Close button: min 44x44px
        assert re.search(r"\.btn-close-drawer\s*\{[^}]*min-width:\s*44px", html_content)
        assert re.search(r"\.btn-close-drawer\s*\{[^}]*min-height:\s*44px", html_content)

        # Nav items: min-height >= 44px
        assert re.search(r"\.nav-item\s*\{[^}]*min-height:\s*4[4-9]px", html_content)

    def test_no_horizontal_overflow_css(self, html_content):
        """Đảm bảo layout ngăn ngừa cuộn ngang (overflow-x: hidden) trên màn hình 360px."""
        assert "overflow-x: hidden" in html_content
        assert "@media (max-width: 360px)" in html_content

    def test_user_header_badges_exist(self, html_content):
        """Đảm bảo header có các phần tử hiển thị Họ tên, Vai trò và Kho/Địa bàn."""
        assert 'id="userFullName"' in html_content
        assert 'id="userRoleBadge"' in html_content
        assert 'id="userScopeBadge"' in html_content


# ==============================================================================
# 4. KIỂM THỬ API ENDPOINTS (FastAPI Router Integration)
# ==============================================================================

class TestNavigationAPIEndpoints:
    """Kiểm tra các endpoints của router /api/v1/navigation."""

    def test_get_menu_warehouse_role_via_api(self):
        response = client.get("/api/v1/navigation/menu?role=WAREHOUSE")
        assert response.status_code == 200
        data = response.json()

        assert "user" in data
        assert "menu_items" in data
        assert data["user"]["role_code"] == "WAREHOUSE"
        assert data["user"]["role_name"] == "Nhân viên kho"

        titles = [item["title"] for item in data["menu_items"]]
        assert "Soạn hàng" in titles
        assert "Nhập kho" in titles
        assert "Sổ tồn kho" in titles
        assert "Chuyển kho" in titles
        assert "Quản trị người dùng" not in titles

    def test_get_menu_with_custom_name_and_scope(self):
        url = "/api/v1/navigation/menu?role=WAREHOUSE&full_name=Trần+Văn+Kho&scope=Kho+Tổng+Hà+Nội"
        response = client.get(url)
        assert response.status_code == 200
        data = response.json()

        assert data["user"]["full_name"] == "Trần Văn Kho"
        assert data["user"]["role_name"] == "Nhân viên kho"
        assert data["user"]["scope"] == "Kho Tổng Hà Nội"

    def test_get_navigation_me(self):
        response = client.get("/api/v1/navigation/me?role=SALES")
        assert response.status_code == 200
        data = response.json()

        assert data["user"]["role_code"] == "SALES"
        assert data["user"]["role_name"] == "Nhân viên kinh doanh"
        assert len(data["menu_items"]) > 0

    def test_list_available_roles(self):
        response = client.get("/api/v1/navigation/roles")
        assert response.status_code == 200
        roles = response.json()
        assert len(roles) >= 7

        role_codes = [r["role_code"] for r in roles]
        assert "WAREHOUSE" in role_codes
        assert "SALES" in role_codes
        assert "ADMIN" in role_codes

    def test_navigation_ui_route_served(self):
        res1 = client.get("/navigation")
        res2 = client.get("/navigation-ui")
        assert res1.status_code == 200
        assert res2.status_code == 200
        assert "SCRUM-60" in res1.text
