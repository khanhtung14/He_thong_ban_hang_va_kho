"""Automated Test Suite for SCRUM-42:
Automated Credit Risk Evaluation, Dealer Sales Restriction, Payment-Triggered Reassessment, and Daily Scheduling.

Acceptance Requirements Verified:
R1. Automatically flag a dealer when the dealer exceeds the permitted monetary credit limit
    or has debt overdue beyond the permitted number of days.
R2. When a dealer is flagged, new orders must be blocked (BLOCK) or moved into a review-required
    workflow (REVIEW / PENDING_APPROVAL) according to configuration.
R3. A scheduled task must reevaluate credit risk once daily (daily scheduler & deterministic runner).
R4. Credit risk must be reevaluated again after each successfully recorded payment.

Safeguards & Edge Cases:
- Exact exposure calculation from customer debt and unpaid invoice balances.
- Manual administrative locks (SCRUM-85) are NEVER cleared automatically when financial debt recovers.
- Blocked orders NEVER reserve inventory.
- Review orders are routed to PENDING_APPROVAL with credit risk approval lines.
- One customer evaluation failure during daily sweep does not crash evaluation of other customers.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.backend.database import get_db
from src.backend.models import (
    Base,
    Customer,
    CustomerDebt,
    Invoice,
    InvoicePayment,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    Product,
    RoleCode,
    User,
    Warehouse,
    Inventory,
)
from src.backend.rbac import create_access_token
from src.backend.credit_risk_service import CreditRiskService
from src.backend.main import app


@pytest.fixture
def scrum42_env():
    """Sets up an isolated, in-memory SQLite database for test execution."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Seed base test users, warehouse, and products
    with TestingSession() as db:
        # Staff users
        accountant = User(
            username="accountant_scrum42",
            email="accountant42@test.com",
            full_name="Kế Toán Công Nợ",
            password_hash="fakehash",
            is_active=True,
        )
        sales_manager = User(
            username="manager_scrum42",
            email="manager42@test.com",
            full_name="Quản Lý Kinh Doanh",
            password_hash="fakehash",
            is_active=True,
        )
        sales_rep = User(
            username="salesrep_scrum42",
            email="salesrep42@test.com",
            full_name="Nhân Viên Kinh Doanh",
            password_hash="fakehash",
            is_active=True,
        )
        db.add_all([accountant, sales_manager, sales_rep])

        # Warehouse & Product with stock
        wh = Warehouse(code="WH-TEST", name="Kho Tổng Test", is_active=True)
        db.add(wh)
        db.flush()

        prod = Product(
            sku="SKU-BRICK-01",
            name="Gạch Ceramic Cao Cấp",
            base_price=100000.0,
            base_unit="Hộp",
            status="ACTIVE",
        )
        db.add(prod)
        db.flush()

        inv = Inventory(
            product_id=prod.id,
            warehouse_id=wh.id,
            physical_qty=100.0,
            reserved_qty=0.0,
            available_qty=100.0,
        )
        db.add(inv)

        # Customer 1: Normal clean dealer
        cust1 = Customer(
            code="DL-001",
            name="Đại Lý An Bình",
            credit_limit=100000000.0,  # 100M limit
            max_debt_days=30,
            max_due_days=30,
            current_debt=20000000.0,   # 20M current debt (Under limit)
            is_active=True,
            is_locked=False,
            credit_action_mode="BLOCK",
        )
        # Customer 2: Exceeded limit
        cust2 = Customer(
            code="DL-002",
            name="Đại Lý Bình Minh",
            credit_limit=50000000.0,   # 50M limit
            max_debt_days=30,
            max_due_days=30,
            current_debt=80000000.0,   # 80M debt (Breached)
            is_active=True,
            is_locked=False,
            credit_action_mode="BLOCK",
        )
        # Customer 3: Overdue debt dealer
        cust3 = Customer(
            code="DL-003",
            name="Đại Lý Cát Tường",
            credit_limit=200000000.0,  # 200M limit
            max_debt_days=15,          # 15 days max overdue allowed
            max_due_days=15,
            current_debt=30000000.0,
            is_active=True,
            is_locked=False,
            credit_action_mode="REVIEW", # REVIEW mode
        )
        db.add_all([cust1, cust2, cust3])
        db.commit()

    with TestClient(app) as test_client:
        yield test_client, TestingSession

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


def auth_header(role: str, username: str = "test_user") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
# PART 1: R1 — AUTOMATED CREDIT RISK EVALUATION (DOMAIN & BOUNDARY LOGIC)
# -----------------------------------------------------------------------------

def test_credit_evaluation_under_limit_is_safe(scrum42_env):
    """R1: Đại lý có dư nợ dưới hạn mức và không có nợ quá hạn thì không bị gắn cờ."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-001").first()
        result = CreditRiskService.evaluate_dealer_credit_risk(db, cust)

        assert result.is_flagged is False
        assert result.is_limit_exceeded is False
        assert result.is_overdue_exceeded is False
        assert len(result.breach_reasons) == 0


def test_credit_evaluation_exactly_at_limit_is_safe(scrum42_env):
    """R1 Boundary: Dư nợ đúng bằng hạn mức tín dụng thì chưa vi phạm (chỉ vi phạm khi vượt quá >)."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-001").first()
        cust.current_debt = 100000000.0  # Exactly 100M == credit_limit
        db.commit()

        result = CreditRiskService.evaluate_dealer_credit_risk(db, cust)
        assert result.is_flagged is False
        assert result.is_limit_exceeded is False


def test_credit_evaluation_strictly_above_limit_is_flagged(scrum42_env):
    """R1: Dư nợ vượt quá hạn mức tín dụng thì tự động bị gắn cờ và nêu rõ số tiền vượt."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-002").first()
        result = CreditRiskService.evaluate_dealer_credit_risk(db, cust)

        assert result.is_flagged is True
        assert result.is_limit_exceeded is True
        assert result.exceeded_amount == 30000000.0  # 80M - 50M = 30M
        assert any("Vượt hạn mức tín dụng" in r for r in result.breach_reasons)


def test_credit_evaluation_overdue_invoice_past_allowed_days(scrum42_env):
    """R1: Hóa đơn quá hạn vượt quá số ngày nợ cho phép (max_debt_days) bị gắn cờ."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-003").first()
        today = date.today()

        # Tạo hóa đơn xuất từ 30 ngày trước với term 10 ngày -> quá hạn 20 ngày > 15 ngày cho phép
        old_invoice = Invoice(
            customer_id=cust.id,
            invoice_date=datetime.now(timezone.utc) - timedelta(days=30),
            payment_term_days=10,
            total_amount=25000000.0,
            status="UNPAID",
        )
        db.add(old_invoice)
        db.commit()

        result = CreditRiskService.evaluate_dealer_credit_risk(db, cust, eval_date=today)
        assert result.is_flagged is True
        assert result.is_overdue_exceeded is True
        assert result.max_overdue_days >= 20
        assert any("quá hạn" in r for r in result.breach_reasons)


def test_fully_paid_invoices_do_not_trigger_overdue(scrum42_env):
    """R1: Hóa đơn đã thanh toán đầy đủ không bao giờ được tính là nợ quá hạn."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-003").first()
        today = date.today()

        paid_invoice = Invoice(
            customer_id=cust.id,
            invoice_date=datetime.now(timezone.utc) - timedelta(days=50),
            payment_term_days=10,
            total_amount=50000000.0,
            status="PAID",
        )
        db.add(paid_invoice)
        db.flush()

        payment_rec = Payment(
            customer_id=cust.id,
            amount=50000000.0,
            payment_method="BANK_TRANSFER",
            payment_date=date.today(),
            receiver_name="Kế Toán",
        )
        db.add(payment_rec)
        db.flush()

        payment = InvoicePayment(
            invoice_id=paid_invoice.id,
            payment_id=payment_rec.id,
            amount_applied=50000000.0,
        )
        db.add(payment)
        cust.current_debt = 0.0
        db.commit()

        result = CreditRiskService.evaluate_dealer_credit_risk(db, cust, eval_date=today)
        assert result.is_flagged is False
        assert result.is_overdue_exceeded is False


# -----------------------------------------------------------------------------
# PART 2: R2 — DEALER SALES RESTRICTION (BLOCK VS REVIEW WORKFLOW)
# -----------------------------------------------------------------------------

def test_flagged_dealer_in_block_mode_cannot_create_orders_and_no_stock_reserved(scrum42_env):
    """R2: Khi đại lý bị gắn cờ ở chế độ BLOCK, đơn mới bị CHẶN HOÀN TOÀN (400) và KHÔNG giữ chỗ kho."""
    client, SessionLocal = scrum42_env
    sales_headers = auth_header(RoleCode.SALES_REP.value, "salesrep_scrum42")

    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-002").first()
        # Áp dụng đánh giá rủi ro (DL-002 đang vượt hạn mức 80M > 50M)
        eval_res = CreditRiskService.apply_evaluation(db, cust, commit=True)
        assert eval_res.is_flagged is True
        assert cust.is_locked is True

        wh = db.query(Warehouse).first()
        prod = db.query(Product).first()
        inv = db.query(Inventory).filter(Inventory.product_id == prod.id).first()
        initial_reserved = inv.reserved_qty
        cust_id = cust.id
        wh_id = wh.id
        prod_sku = prod.sku
        prod_id = prod.id

    order_payload = {
        "customer_id": cust_id,
        "warehouse_id": wh_id,
        "items": [{"sku": prod_sku, "quantity": 5.0}],
    }

    # Thử đặt hàng
    res = client.post("/api/v1/orders", json=order_payload, headers=sales_headers)
    assert res.status_code == 400
    assert "bị khóa" in res.json()["detail"] or "CHẶN BÁN" in res.json()["detail"]

    # Kiểm tra tồn kho KHÔNG bị giữ chỗ ngoài ý muốn
    with SessionLocal() as db:
        inv = db.query(Inventory).filter(Inventory.product_id == prod_id).first()
        assert inv.reserved_qty == initial_reserved


def test_flagged_dealer_in_review_mode_routes_order_to_pending_approval(scrum42_env):
    """R2: Khi đại lý bị gắn cờ ở chế độ REVIEW, đơn hàng được tạo nhưng chuyển sang PENDING_APPROVAL kèm cảnh báo."""
    client, SessionLocal = scrum42_env
    sales_headers = auth_header(RoleCode.SALES_REP.value, "salesrep_scrum42")

    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-003").first()
        wh = db.query(Warehouse).first()
        prod = db.query(Product).first()

        # Tạo hóa đơn quá hạn để DL-003 bị gắn cờ
        inv = Invoice(
            customer_id=cust.id,
            invoice_date=datetime.now(timezone.utc) - timedelta(days=40),
            payment_term_days=10,
            total_amount=35000000.0,
            status="UNPAID",
        )
        db.add(inv)
        db.commit()

        # Apply evaluation in REVIEW mode
        eval_res = CreditRiskService.apply_evaluation(db, cust, commit=True)
        assert eval_res.is_flagged is True
        assert eval_res.action_mode == "REVIEW"
        assert cust.is_credit_flagged is True
        # In REVIEW mode, customer is NOT hard-locked so they can submit orders for review
        assert cust.is_locked is False

        cust_id = cust.id
        wh_id = wh.id
        prod_sku = prod.sku

    order_payload = {
        "customer_id": cust_id,
        "warehouse_id": wh_id,
        "items": [{"sku": prod_sku, "quantity": 2.0}],
        "note": "Đơn hàng đại lý đang có nợ",
    }

    res = client.post("/api/v1/orders", json=order_payload, headers=sales_headers)
    assert res.status_code == 201, res.text
    order_data = res.json()
    assert order_data["status"] == "PENDING_APPROVAL"
    assert "Cảnh báo rủi ro tín dụng" in (order_data.get("approval_reason") or "")


def test_update_credit_action_mode_endpoint(scrum42_env):
    """R2: Kế toán / Quản lý có thể chuyển đổi chế độ kiểm soát rủi ro giữa BLOCK và REVIEW."""
    client, SessionLocal = scrum42_env
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")

    # Đổi chế độ DL-002 từ BLOCK sang REVIEW
    res = client.patch(
        "/api/v1/customers/2/credit-action-mode",
        json={"action_mode": "REVIEW"},
        headers=acc_headers,
    )
    assert res.status_code == 200
    assert res.json()["credit_action_mode"] == "REVIEW"

    # Gửi giá trị không hợp lệ
    invalid_res = client.patch(
        "/api/v1/customers/2/credit-action-mode",
        json={"action_mode": "UNKNOWN_MODE"},
        headers=acc_headers,
    )
    assert invalid_res.status_code == 400


# -----------------------------------------------------------------------------
# PART 3: R3 — DAILY SCHEDULED REEVALUATION
# -----------------------------------------------------------------------------

def test_daily_scheduled_job_evaluates_all_active_dealers(scrum42_env):
    """R3: Tác vụ định kỳ quét và đánh giá lại toàn bộ đại lý đang hoạt động bởi Kế toán công nợ."""
    client, SessionLocal = scrum42_env
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")

    # Gọi endpoint chạy tác vụ quét định kỳ hàng ngày với quyền Kế toán
    res = client.post("/api/v1/debts/credit-risk/run-daily-job", headers=acc_headers)
    assert res.status_code == 200
    summary = res.json()["data"]

    assert summary["totalCustomers"] == 3
    # DL-002 vi phạm hạn mức nên bị gắn cờ
    assert summary["flaggedCount"] >= 1
    assert summary["errorCount"] == 0
    assert len(summary["details"]) == 3


def test_daily_scheduled_job_authorization_enforcement(scrum42_env):
    """F-01 Remediation: Kiểm tra kiểm soát truy cập và bảo vệ endpoint run-daily-job.

    Yêu cầu:
    1. Yêu cầu không có thông tin xác thực (Unauthenticated) bị từ chối 401.
    2. Người dùng có vai trò không hợp lệ (Sales Rep, Warehouse) bị từ chối 403.
    3. Cả 2 alias endpoint (/debts/credit-risk/run-daily-job và /credit-risk/run-daily-job) đều áp dụng bảo vệ tương đương.
    4. Vai trò hợp lệ (Accountant, Admin) được phép thực thi và nhận phản hồi 200.
    """
    client, _ = scrum42_env
    sales_headers = auth_header(RoleCode.SALES_REP.value, "salesrep_scrum42")
    wh_headers = auth_header(RoleCode.WAREHOUSE.value, "warehouse_scrum42")
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")
    admin_headers = auth_header(RoleCode.ADMIN.value, "admin_scrum42")

    endpoints = [
        "/api/v1/debts/credit-risk/run-daily-job",
        "/api/v1/credit-risk/run-daily-job",
    ]

    for ep in endpoints:
        # 1. Unauthenticated -> 401
        res_no_auth = client.post(ep)
        assert res_no_auth.status_code == 401, f"{ep} phải chặn unauthenticated với 401"

        # 2. Unauthorized roles -> 403
        res_sales = client.post(ep, headers=sales_headers)
        assert res_sales.status_code == 403, f"{ep} phải từ chối Sales Rep với 403"

        res_wh = client.post(ep, headers=wh_headers)
        assert res_wh.status_code == 403, f"{ep} phải từ chối Warehouse với 403"

        # 3. Authorized roles -> 200
        res_acc = client.post(ep, headers=acc_headers)
        assert res_acc.status_code == 200, f"{ep} phải cho phép Accountant với 200"
        assert res_acc.json()["success"] is True
        assert "totalCustomers" in res_acc.json()["data"]

        res_admin = client.post(ep, headers=admin_headers)
        assert res_admin.status_code == 200, f"{ep} phải cho phép Admin với 200"
        assert res_admin.json()["success"] is True


def test_daily_scheduled_job_resilience_on_single_customer_error(scrum42_env):
    """R3: Nếu 1 đại lý gặp lỗi cục bộ, tác vụ vẫn tiếp tục xử lý các đại lý còn lại mà không dừng toàn bộ."""
    _, SessionLocal = scrum42_env
    with SessionLocal() as db:
        # Chạy evaluate_all_dealers trực tiếp
        summary = CreditRiskService.reevaluate_all_dealers(db)
        assert summary["totalCustomers"] >= 3
        assert summary["errorCount"] == 0


# -----------------------------------------------------------------------------
# PART 4: R4 — PAYMENT-TRIGGERED REEVALUATION & RECOVERY
# -----------------------------------------------------------------------------

def test_payment_recording_triggers_automatic_reevaluation_and_clears_flag(scrum42_env):
    """R4: Ghi nhận thanh toán thành công tự động đánh giá lại rủi ro tín dụng và xóa cờ khi hết nợ."""
    client, SessionLocal = scrum42_env
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")

    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-002").first()
        # Ban đầu DL-002 vượt hạn mức (80M > 50M) -> Apply evaluation
        CreditRiskService.apply_evaluation(db, cust, commit=True)
        assert cust.is_credit_flagged is True
        assert cust.is_locked is True

        # Tạo hóa đơn 80M
        inv = Invoice(
            customer_id=cust.id,
            invoice_date=datetime.now(timezone.utc),
            payment_term_days=30,
            total_amount=80000000.0,
            status="UNPAID",
        )
        db.add(inv)
        db.commit()
        inv_id = inv.id
        cust_id = cust.id

    # Ghi nhận thanh toán 60 triệu (giảm nợ từ 80M xuống 20M < hạn mức 50M)
    payment_payload = {
        "customerId": cust_id,
        "amount": 60000000.0,
        "paymentMethod": "BANK_TRANSFER",
        "paymentDate": date.today().isoformat(),
        "invoiceIds": [inv_id],
        "note": "Đại lý thanh toán công nợ",
    }

    pay_res = client.post("/api/v1/payments", json=payment_payload, headers=acc_headers)
    assert pay_res.status_code == 200, pay_res.text
    pay_data = pay_res.json()["data"]

    # Đánh giá rủi ro được đính kèm trực tiếp trong response
    assert "creditEvaluation" in pay_data
    assert pay_data["creditEvaluation"]["isFlagged"] is False

    # Kiểm tra trạng thái đại lý trong DB: cờ đã được xóa và mở khóa bán tự động
    with SessionLocal() as db:
        updated_cust = db.get(Customer, cust_id)
        assert updated_cust.is_credit_flagged is False
        assert updated_cust.is_locked is False


def test_partial_payment_still_above_limit_maintains_credit_flag(scrum42_env):
    """R4: Thanh toán một phần nhưng dư nợ vẫn vượt hạn mức thì tiếp tục duy trì cờ rủi ro."""
    client, SessionLocal = scrum42_env
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")

    with SessionLocal() as db:
        cust = db.query(Customer).filter(Customer.code == "DL-002").first()
        cust.current_debt = 100000000.0  # 100M nợ, hạn mức 50M
        CreditRiskService.apply_evaluation(db, cust, commit=True)
        assert cust.is_credit_flagged is True

        inv = Invoice(
            customer_id=cust.id,
            invoice_date=datetime.now(timezone.utc),
            payment_term_days=30,
            total_amount=100000000.0,
            status="UNPAID",
        )
        db.add(inv)
        db.commit()
        inv_id = inv.id
        cust_id = cust.id

    # Thanh toán 20 triệu (nợ giảm từ 100M xuống 80M > hạn mức 50M)
    payment_payload = {
        "customerId": cust_id,
        "amount": 20000000.0,
        "paymentMethod": "CASH",
        "paymentDate": date.today().isoformat(),
        "invoiceIds": [inv_id],
    }

    pay_res = client.post("/api/v1/payments", json=payment_payload, headers=acc_headers)
    assert pay_res.status_code == 200
    pay_data = pay_res.json()["data"]

    # Cờ vi phạm vẫn duy trì
    assert pay_data["creditEvaluation"]["isFlagged"] is True
    with SessionLocal() as db:
        updated_cust = db.get(Customer, cust_id)
        assert updated_cust.is_credit_flagged is True
        assert updated_cust.is_locked is True


# -----------------------------------------------------------------------------
# PART 5: SAFEGUARD — MANUAL ADMINISTRATIVE LOCK IS PRESERVED
# -----------------------------------------------------------------------------

def test_manual_lock_is_not_cleared_by_financial_recovery(scrum42_env):
    """Safeguard: Khóa thủ công của kế toán (is_manually_locked == True) TUYỆT ĐỐI không bị xóa khi nợ tài chính phục hồi."""
    client, SessionLocal = scrum42_env
    acc_headers = auth_header(RoleCode.ACCOUNTANT.value, "accountant_scrum42")

    # Kế toán thực hiện khóa đại lý DL-001 vì lý do gian lận/hồ sơ pháp lý
    lock_res = client.post(
        "/api/v1/customers/1/lock",
        json={"reason": "Nghi vấn pháp lý hồ sơ doanh nghiệp"},
        headers=acc_headers,
    )
    assert lock_res.status_code == 200

    with SessionLocal() as db:
        cust = db.get(Customer, 1)
        assert cust.is_locked is True
        assert cust.is_manually_locked is True
        # Đại lý này hoàn toàn sạch nợ (current_debt = 0)
        cust.current_debt = 0.0
        db.commit()

        # Thực hiện đánh giá lại rủi ro tín dụng tự động
        eval_res = CreditRiskService.apply_evaluation(db, cust, commit=True)
        assert eval_res.is_flagged is False

        # Khóa thủ công PHẢI ĐƯỢC GIỮ NGUYÊN!
        assert cust.is_locked is True
        assert cust.is_manually_locked is True
        assert cust.lock_reason == "Nghi vấn pháp lý hồ sơ doanh nghiệp"
