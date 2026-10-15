"""Unit & Integration Tests for SCRUM-79: Quản lý danh mục nhà cung cấp.

Kiểm thử:
1. SQLAlchemy Model 'Supplier' và Pydantic schemas:
   - Các trường: code, name, tax_code, contact_person, payment_terms, is_active.
   - Giá trị mặc định is_active = True.
2. Toàn bộ luồng REST API endpoints CRUD:
   - Thêm mới (POST /api/v1/suppliers): Thành công, chặn trùng mã code, kiểm tra validation.
   - Xem danh sách (GET /api/v1/suppliers): Phân trang, tìm kiếm theo từ khóa, lọc theo trạng thái.
   - Xem chi tiết (GET /api/v1/suppliers/{id}): Thành công và 404 khi không tồn tại.
   - Cập nhật (PUT /api/v1/suppliers/{id}): Sửa thông tin, chặn trùng mã mới.
   - Đổi trạng thái (PATCH /api/v1/suppliers/{id}/status): Ngừng giao dịch / Kích hoạt lại.
   - Xóa (DELETE /api/v1/suppliers/{id}): Xóa thành công khi chưa có phiếu nhập kho.
3. RÀNG BUỘC NGHIỆP VỤ BẮT BUỘC:
   - Khi nhà cung cấp đã có phiếu nhập kho (WarehouseReceipt), TUYỆT ĐỐI CHẶN XÓA (trả về HTTP 400 kèm thông báo rõ ràng).
   - Bắt buộc phải chuyển sang trạng thái "Ngừng giao dịch" (is_active = False).
4. Phân quyền RBAC:
   - Nhân viên kho (Warehouse), Quản lý kho (WH Manager), Admin được phép thao tác.
   - Vai trò không có quyền (Customer) bị chặn 403 Forbidden.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.models import (
    Base,
    RoleCode,
    Supplier,
    User,
    Warehouse,
    WarehouseReceipt,
)
from src.backend.rbac import create_access_token
from src.backend.main import app


def make_auth_header(role: str, username: str = "wh_user") -> dict[str, str]:
    """Tạo JWT Bearer Authorization header hợp lệ theo vai trò."""
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scrum79_env():
    """Thiết lập môi trường test SQLite in-memory độc lập cho SCRUM-79."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Tạo dữ liệu kho mặc định phục vụ tạo phiếu nhập kho
    with TestingSessionLocal() as db:
        wh = Warehouse(
            code="WH-TEST-01",
            name="Kho Tổng Kiểm Thử",
            address="123 Đường Kho Vận",
            is_active=True,
        )
        db.add(wh)
        db.commit()

    with TestClient(app) as client:
        yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ==============================================================================
# 1. KIỂM THỬ MODEL VÀ SCHEMA
# ==============================================================================

def test_supplier_model_fields(scrum79_env):
    """Kiểm tra model Supplier có đầy đủ các trường yêu cầu và default values."""
    client, SessionLocal = scrum79_env
    with SessionLocal() as db:
        supplier = Supplier(
            code="NCC-SABECO",
            name="Tổng Công ty Bia Rượu Nước giải khát Sài Gòn",
            tax_code="0300588569",
            contact_person="Trần Thị Lan",
            payment_terms="Net 45",
            is_active=True,
            phone="02838294083",
            address="187 Nguyễn Chí Thanh, Quận 5, TP.HCM",
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)

        assert supplier.id is not None
        assert supplier.code == "NCC-SABECO"
        assert supplier.name == "Tổng Công ty Bia Rượu Nước giải khát Sài Gòn"
        assert supplier.tax_code == "0300588569"
        assert supplier.contact_person == "Trần Thị Lan"
        assert supplier.payment_terms == "Net 45"
        assert supplier.is_active is True
        assert supplier.phone == "02838294083"
        assert hasattr(supplier, "created_at")
        assert hasattr(supplier, "updated_at")
        assert hasattr(supplier, "receipts")


# ==============================================================================
# 2. KIỂM THỬ THÊM MỚI NHÀ CUNG CẤP (CREATE)
# ==============================================================================

def test_create_supplier_success(scrum79_env):
    """Thêm mới nhà cung cấp thành công với đầy đủ các trường thông tin."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value, "wh_staff_01")

    payload = {
        "code": "NCC-HN-001",
        "name": "Công ty Bia Hà Nội (Habeco)",
        "tax_code": "0100100998",
        "contact_person": "Nguyễn Văn Hùng",
        "payment_terms": "Gối đầu 30 ngày",
        "is_active": True,
        "phone": "02438631122",
        "address": "183 Hoàng Hoa Thám, Ba Đình, Hà Nội",
    }

    res = client.post("/api/v1/suppliers", json=payload, headers=wh_headers)
    assert res.status_code == 201
    res_data = res.json()
    assert res_data["success"] is True
    assert res_data["code"] == 201
    assert "thành công" in res_data["message"]
    data = res_data["data"]
    assert data["code"] == "NCC-HN-001"
    assert data["name"] == "Công ty Bia Hà Nội (Habeco)"
    assert data["tax_code"] == "0100100998"
    assert data["contact_person"] == "Nguyễn Văn Hùng"
    assert data["payment_terms"] == "Gối đầu 30 ngày"
    assert data["is_active"] is True
    assert data["receipts_count"] == 0

    # Kiểm tra lưu trữ trong cơ sở dữ liệu
    with SessionLocal() as db:
        saved = db.query(Supplier).filter(Supplier.code == "NCC-HN-001").first()
        assert saved is not None
        assert saved.name == "Công ty Bia Hà Nội (Habeco)"


def test_create_supplier_duplicate_code_fails(scrum79_env):
    """Chặn thêm nhà cung cấp khi mã đã tồn tại (không phân biệt hoa thường)."""
    client, _ = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    payload1 = {"code": "NCC-DUP", "name": "Nhà cung cấp 1"}
    res1 = client.post("/api/v1/suppliers", json=payload1, headers=wh_headers)
    assert res1.status_code == 201

    payload2 = {"code": "ncc-dup", "name": "Nhà cung cấp 2"}
    res2 = client.post("/api/v1/suppliers", json=payload2, headers=wh_headers)
    assert res2.status_code == 400
    assert "đã tồn tại" in res2.json()["detail"]


def test_create_supplier_validation_empty_fields(scrum79_env):
    """Kiểm tra validation: Không cho phép để trống mã hoặc tên nhà cung cấp."""
    client, _ = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    res_empty_code = client.post(
        "/api/v1/suppliers",
        json={"code": "   ", "name": "Công ty ABC"},
        headers=wh_headers,
    )
    assert res_empty_code.status_code == 422

    res_empty_name = client.post(
        "/api/v1/suppliers",
        json={"code": "NCC-ABC", "name": "   "},
        headers=wh_headers,
    )
    assert res_empty_name.status_code == 422


# ==============================================================================
# 3. KIỂM THỬ XEM DANH SÁCH & CHI TIẾT (READ)
# ==============================================================================

def test_list_suppliers_pagination_and_search(scrum79_env):
    """Kiểm tra xem danh sách nhà cung cấp, hỗ trợ tìm kiếm và phân trang."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    with SessionLocal() as db:
        s1 = Supplier(code="NCC-01", name="Bia Hà Nội Habeco", tax_code="0101", is_active=True)
        s2 = Supplier(code="NCC-02", name="Bia Sài Gòn Sabeco", tax_code="0202", is_active=False)
        s3 = Supplier(code="NCC-03", name="Nước giải khát Cocacola", tax_code="0303", is_active=True)
        db.add_all([s1, s2, s3])
        db.commit()

    # 1. Lấy danh sách đầy đủ
    res_all = client.get("/api/v1/suppliers", headers=wh_headers)
    assert res_all.status_code == 200
    all_data = res_all.json()
    assert all_data["pagination"]["total_records"] == 3
    assert len(all_data["data"]) == 3

    # 2. Tìm kiếm theo từ khóa
    res_search = client.get("/api/v1/suppliers?search=Bia", headers=wh_headers)
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["pagination"]["total_records"] == 2
    assert all("Bia" in item["name"] for item in search_data["data"])

    # 3. Lọc theo trạng thái hoạt động (is_active = False)
    res_inactive = client.get("/api/v1/suppliers?is_active=false", headers=wh_headers)
    assert res_inactive.status_code == 200
    inactive_data = res_inactive.json()
    assert inactive_data["pagination"]["total_records"] == 1
    assert inactive_data["data"][0]["code"] == "NCC-02"

    # 4. Phân trang
    res_paged = client.get("/api/v1/suppliers?page=1&limit=2", headers=wh_headers)
    assert res_paged.status_code == 200
    paged_data = res_paged.json()
    assert len(paged_data["data"]) == 2
    assert paged_data["pagination"]["total_pages"] == 2


def test_get_supplier_detail_success_and_not_found(scrum79_env):
    """Kiểm tra lấy chi tiết nhà cung cấp theo ID."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    with SessionLocal() as db:
        sup = Supplier(code="NCC-DETAIL", name="Công ty Chi Tiết", is_active=True)
        db.add(sup)
        db.commit()
        sup_id = sup.id

    # Tìm thấy
    res = client.get(f"/api/v1/suppliers/{sup_id}", headers=wh_headers)
    assert res.status_code == 200
    assert res.json()["data"]["code"] == "NCC-DETAIL"

    # Không tìm thấy (404)
    res_404 = client.get("/api/v1/suppliers/99999", headers=wh_headers)
    assert res_404.status_code == 404
    assert "Không tìm thấy" in res_404.json()["detail"]


# ==============================================================================
# 4. KIỂM THỬ CẬP NHẬT & ĐỔI TRẠNG THÁI (UPDATE & TOGGLE STATUS)
# ==============================================================================

def test_update_supplier_success(scrum79_env):
    """Cập nhật thông tin nhà cung cấp thành công."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    with SessionLocal() as db:
        sup = Supplier(code="NCC-OLD", name="Tên Cũ", contact_person="Anh A", is_active=True)
        db.add(sup)
        db.commit()
        sup_id = sup.id

    update_payload = {
        "name": "Tên Mới Cập Nhật",
        "contact_person": "Chị B",
        "payment_terms": "Thanh toán ngay",
        "tax_code": "0999999999",
    }
    res = client.put(f"/api/v1/suppliers/{sup_id}", json=update_payload, headers=wh_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["name"] == "Tên Mới Cập Nhật"
    assert data["contact_person"] == "Chị B"
    assert data["payment_terms"] == "Thanh toán ngay"
    assert data["tax_code"] == "0999999999"


def test_toggle_supplier_status_endpoint(scrum79_env):
    """Chuyển đổi trạng thái ngừng giao dịch / kích hoạt lại qua PATCH status."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    with SessionLocal() as db:
        sup = Supplier(code="NCC-STATUS", name="Nhà Cung Cấp Status", is_active=True)
        db.add(sup)
        db.commit()
        sup_id = sup.id

    # 1. Chuyển sang ngừng giao dịch (is_active = False)
    res_deactivate = client.patch(
        f"/api/v1/suppliers/{sup_id}/status",
        json={"is_active": False},
        headers=wh_headers,
    )
    assert res_deactivate.status_code == 200
    assert res_deactivate.json()["data"]["is_active"] is False
    assert "Ngừng giao dịch" in res_deactivate.json()["message"]

    # 2. Kích hoạt lại (is_active = True)
    res_activate = client.patch(
        f"/api/v1/suppliers/{sup_id}/status",
        json={"is_active": True},
        headers=wh_headers,
    )
    assert res_activate.status_code == 200
    assert res_activate.json()["data"]["is_active"] is True
    assert "Hoạt động" in res_activate.json()["message"]


# ==============================================================================
# 5. KIỂM THỬ XÓA & RÀNG BUỘC PHIẾU NHẬP KHO (CRITICAL BUSINESS CONSTRAINT)
# ==============================================================================

def test_delete_supplier_without_receipts_succeeds(scrum79_env):
    """Xóa thành công khi nhà cung cấp chưa có phiếu nhập kho nào."""
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    with SessionLocal() as db:
        sup = Supplier(code="NCC-DELETE-OK", name="Nhà Cung Cấp Sẽ Xóa", is_active=True)
        db.add(sup)
        db.commit()
        sup_id = sup.id

    res = client.delete(f"/api/v1/suppliers/{sup_id}", headers=wh_headers)
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert "thành công" in res.json()["message"]

    # Kiểm tra trong DB đã bị xóa hoàn toàn
    with SessionLocal() as db:
        deleted = db.get(Supplier, sup_id)
        assert deleted is None


def test_delete_supplier_with_receipts_blocked_with_400(scrum79_env):
    """RÀNG BUỘC NGHIỆP VỤ BẮT BUỘC:
    Nếu nhà cung cấp đã có phiếu nhập kho liên quan, TUYỆT ĐỐI KHÔNG CHO PHÉP XÓA
    (trả về HTTP 400 kèm thông báo rõ ràng), mà bắt buộc phải chuyển sang
    trạng thái "ngừng giao dịch" (is_active = False).
    """
    client, SessionLocal = scrum79_env
    wh_headers = make_auth_header(RoleCode.WAREHOUSE.value)

    # 1. Tạo nhà cung cấp và 1 phiếu nhập kho liên quan
    with SessionLocal() as db:
        sup = Supplier(
            code="NCC-HAS-RECEIPT",
            name="Công ty Bao Bì Thăng Long",
            is_active=True,
        )
        db.add(sup)
        db.commit()
        sup_id = sup.id

        # Tạo phiếu nhập kho liên kết đến nhà cung cấp này
        receipt = WarehouseReceipt(
            supplier_id=sup_id,
            warehouse_id=1,
            status="COMPLETED",
        )
        db.add(receipt)
        db.commit()
        receipt_id = receipt.id

    # 2. Thử gọi API xóa nhà cung cấp -> BẮT BUỘC BỊ CHẶN VỚI HTTP 400
    res_delete = client.delete(f"/api/v1/suppliers/{sup_id}", headers=wh_headers)
    assert res_delete.status_code == 400
    error_detail = res_delete.json()["detail"]
    assert "Không thể xóa" in error_detail
    assert "phiếu nhập kho liên quan" in error_detail
    assert "Ngừng giao dịch" in error_detail
    assert "is_active = False" in error_detail

    # 3. Xác nhận nhà cung cấp VẪN TỒN TẠI trong database (không bị xóa mất)
    with SessionLocal() as db:
        still_exists = db.get(Supplier, sup_id)
        assert still_exists is not None
        assert still_exists.code == "NCC-HAS-RECEIPT"

    # 4. Người dùng bắt buộc phải chuyển sang trạng thái "ngừng giao dịch" (is_active = False)
    res_deactivate = client.patch(
        f"/api/v1/suppliers/{sup_id}/status",
        json={"is_active": False},
        headers=wh_headers,
    )
    assert res_deactivate.status_code == 200
    assert res_deactivate.json()["data"]["is_active"] is False

    # 5. Xác nhận dữ liệu phiếu nhập kho và nhà cung cấp vẫn an toàn và toàn vẹn
    with SessionLocal() as db:
        deactivated_sup = db.get(Supplier, sup_id)
        assert deactivated_sup.is_active is False
        rec = db.get(WarehouseReceipt, receipt_id)
        assert rec is not None
        assert rec.supplier_id == sup_id


# ==============================================================================
# 6. KIỂM THỬ PHÂN QUYỀN RBAC (SECURITY & PERMISSIONS)
# ==============================================================================

def test_unauthorized_role_cannot_manage_suppliers(scrum79_env):
    """Kiểm tra phân quyền: Vai trò không được phép (Customer) bị chặn 403 Forbidden."""
    client, SessionLocal = scrum79_env
    customer_headers = make_auth_header(RoleCode.CUSTOMER.value, "customer_user")

    with SessionLocal() as db:
        sup = Supplier(code="NCC-SEC", name="Bảo mật Test", is_active=True)
        db.add(sup)
        db.commit()
        sup_id = sup.id

    # Customer thử tạo NCC -> 403
    res_create = client.post(
        "/api/v1/suppliers",
        json={"code": "NCC-HACK", "name": "Hack"},
        headers=customer_headers,
    )
    assert res_create.status_code == 403

    # Customer thử xóa NCC -> 403
    res_del = client.delete(f"/api/v1/suppliers/{sup_id}", headers=customer_headers)
    assert res_del.status_code == 403

    # Customer thử sửa NCC -> 403
    res_put = client.put(
        f"/api/v1/suppliers/{sup_id}",
        json={"name": "Sửa trái phép"},
        headers=customer_headers,
    )
    assert res_put.status_code == 403


def test_warehouse_manager_and_admin_can_manage_suppliers(scrum79_env):
    """Kiểm tra WH Manager và Admin có quyền quản lý nhà cung cấp."""
    client, _ = scrum79_env
    mgr_headers = make_auth_header(RoleCode.WH_MANAGER.value, "wh_manager_01")
    admin_headers = make_auth_header(RoleCode.ADMIN.value, "admin_01")

    # WH Manager tạo thành công
    res_mgr = client.post(
        "/api/v1/suppliers",
        json={"code": "NCC-MGR", "name": "Do Quản Lý Tạo"},
        headers=mgr_headers,
    )
    assert res_mgr.status_code == 201

    # Admin tạo thành công
    res_admin = client.post(
        "/api/v1/suppliers",
        json={"code": "NCC-ADM", "name": "Do Admin Tạo"},
        headers=admin_headers,
    )
    assert res_admin.status_code == 201
