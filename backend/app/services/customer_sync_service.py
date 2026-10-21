import logging
import random
import time
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.models import User, Customer

logger = logging.getLogger(__name__)

DEALER_ROLE_CODES = {"CUSTOMER", "DEALER", "AGENCY", "ĐẠI LÝ", "DAI_LY"}


def is_dealer_user(user: User) -> bool:
    """Kiểm tra xem user có vai trò là Đại lý (CUSTOMER / DEALER) hay không."""
    if not user or not user.roles:
        return False
    for r in user.roles:
        code_clean = (r.code or "").strip().upper().replace(" ", "_")
        name_clean = (r.name or "").strip().upper()
        if code_clean in DEALER_ROLE_CODES or name_clean in DEALER_ROLE_CODES:
            return True
        if "ĐẠI LÝ" in name_clean or "DAI LY" in name_clean or "CUSTOMER" in name_clean:
            return True
    return False


def generate_unique_customer_code(db: Session, prefix: str = "DL-") -> str:
    """Tự sinh Mã Đại lý dạng DL-XXXX (4 số) không trùng lặp."""
    for _ in range(100):
        code = f"{prefix}{random.randint(1000, 9999)}"
        exists = db.query(Customer.id).filter(Customer.code == code).first()
        if not exists:
            return code
    # Nếu dải 4 số trùng nhiều, thử dải 5 số
    for _ in range(100):
        code = f"{prefix}{random.randint(10000, 99999)}"
        exists = db.query(Customer.id).filter(Customer.code == code).first()
        if not exists:
            return code
    return f"{prefix}{int(time.time()) % 1000000:06d}"


def ensure_customer_profile_for_user(db: Session, user: User) -> Optional[Customer]:
    """
    Tự động tạo hoặc liên kết hồ sơ Customer cho User có vai trò Đại lý:
    1. Kiểm tra vai trò của user.
    2. Nếu đã liên kết qua user_id, trả về customer đó.
    3. Nếu có hồ sơ cũ trùng code / username / phone / email chưa gắn user_id, liên kết lại.
    4. Nếu chưa có, tạo bản ghi mới với đầy đủ giá trị mặc định:
       - user_id: ID của user
       - code: DL-XXXX tự sinh
       - name: Họ tên user hoặc Username
       - phone, email lấy từ user
       - region: "Chưa cập nhật"
       - sales_rep_id: NULL (để vào danh sách Chưa phân công)
       - credit_limit = 0.0, current_debt = 0.0
       - is_active = True, is_locked = False
    """
    if not is_dealer_user(user):
        return None

    # 1. Kiểm tra đã có customer gắn với user_id này chưa
    customer = db.query(Customer).filter(Customer.user_id == user.id).first()
    if customer:
        return customer

    # 2. Tìm hồ sơ cũ chưa có user_id để liên kết
    if user.username:
        customer_by_code = (
            db.query(Customer)
            .filter(Customer.code == user.username, Customer.user_id.is_(None))
            .first()
        )
        if customer_by_code:
            customer_by_code.user_id = user.id
            db.commit()
            db.refresh(customer_by_code)
            logger.info(
                f"Linked existing Customer {customer_by_code.code} with User ID {user.id} ({user.username})"
            )
            return customer_by_code

    clean_phone = user.phone.strip() if user.phone else None
    if clean_phone:
        customer_by_phone = (
            db.query(Customer)
            .filter(Customer.phone == clean_phone, Customer.user_id.is_(None))
            .first()
        )
        if customer_by_phone:
            customer_by_phone.user_id = user.id
            db.commit()
            db.refresh(customer_by_phone)
            logger.info(
                f"Linked Customer {customer_by_phone.code} with User ID {user.id} by phone {clean_phone}"
            )
            return customer_by_phone

    # 3. Tạo mới customer
    code = generate_unique_customer_code(db)
    name = (user.full_name or user.username or "Đại lý mới").strip()

    # Kiểm tra tránh vi phạm unique constraint trên phone của bảng customers
    phone_to_use = clean_phone
    if phone_to_use:
        phone_conflict = (
            db.query(Customer.id).filter(Customer.phone == phone_to_use).first()
        )
        if phone_conflict:
            logger.warning(
                f"Phone '{phone_to_use}' already exists in customers table. Setting NULL for new customer {code}."
            )
            phone_to_use = None

    new_customer = Customer(
        user_id=user.id,
        code=code,
        name=name,
        phone=phone_to_use,
        email=user.email.strip() if user.email else None,
        region="Chưa cập nhật",
        territory_id=None,
        sales_rep_id=None,
        assigned_sales_id=None,
        customer_group="RETAIL",
        is_active=True,
        is_locked=False,
        credit_limit=0.0,
        current_debt=0.0,
        max_due_days=30,
        max_debt_days=30,
        warning_threshold_percent=80.0,
        warning_threshold=80.0,
    )
    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)
    logger.info(
        f"Created Customer record {new_customer.code} ({new_customer.name}) for User ID {user.id} ({user.username})."
    )
    return new_customer


def sync_all_dealer_users(db: Session) -> List[Customer]:
    """Quét toàn bộ users có role đại lý chưa có trong customers và tự động INSERT bản ghi tương ứng."""
    all_users = db.query(User).all()
    synced_customers: List[Customer] = []
    for u in all_users:
        if is_dealer_user(u):
            try:
                cust = ensure_customer_profile_for_user(db, u)
                if cust:
                    synced_customers.append(cust)
            except Exception as e:
                logger.error(
                    f"Error syncing customer profile for user {u.username} (ID {u.id}): {e}"
                )
                db.rollback()
    return synced_customers
