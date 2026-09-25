import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from src.backend.config import DATABASE_URL, DEFAULT_ROLES
from src.backend.models import Base, Role, User
from src.backend.security import hash_password

# Đảm bảo thư mục database tồn tại nếu dùng SQLite
if "sqlite" in DATABASE_URL:
    db_path = DATABASE_URL.replace("sqlite:///", "")
    database_dir = os.path.dirname(db_path)
    if database_dir and not os.path.exists(database_dir):
        os.makedirs(database_dir, exist_ok=True)


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Khởi tạo bảng và nạp dữ liệu mẫu ban đầu"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Nạp roles nếu chưa có
        for r_data in DEFAULT_ROLES:
            existing_role = db.query(Role).filter(Role.code == r_data["code"]).first()
            if not existing_role:
                role = Role(
                    code=r_data["code"],
                    name=r_data["name"],
                    description=r_data["description"]
                )
                db.add(role)
        db.commit()

        # 2. Nạp dữ liệu mẫu người dùng (>20 bản ghi để test phân trang mặc định 20 dòng)
        user_count = db.query(User).count()
        if user_count == 0:
            default_hashed_pwd = hash_password("InitPassword123@")

            sample_users = [
                # Admin
                ("admin", "Nguyễn Văn An", "admin@hethong.vn", "0912345678", "ADMIN", "ACTIVE", False, True),
                # Sales Representatives (Nhân viên kinh doanh mới & cũ)
                ("sales_tuan", "Nông Quốc Tuấn", "tuan.nq@hethong.vn", "0981112233", "SALES", "ACTIVE", False, True),
                ("sales_anh", "Nguyễn Thị Ánh", "anh.nt@hethong.vn", "0982223344", "SALES", "ACTIVE", False, True),
                ("sales_tung", "Trần Khánh Tùng", "tung.tk@hethong.vn", "0983334455", "SALES", "ACTIVE", False, True),
                ("sales_truong", "Phùng Xuân Trường", "truong.px@hethong.vn", "0984445566", "SALES", "ACTIVE", False, True),
                ("sales_linh", "Lê Thùy Linh", "linh.lt@hethong.vn", "0985556677", "SALES", "PENDING_ACTIVATION", True, True),
                ("sales_nam", "Hoàng Hải Nam", "nam.hh@hethong.vn", "0986667788", "SALES", "PENDING_ACTIVATION", True, True),
                ("sales_hoa", "Phạm Thị Hoa", "hoa.pt@hethong.vn", "0987778899", "SALES", "ACTIVE", False, True),
                ("sales_minh", "Vũ Nhật Minh", "minh.vn@hethong.vn", "0988889900", "SALES", "ACTIVE", False, True),
                ("sales_dung", "Bùi Tiến Dũng", "dung.bt@hethong.vn", "0989990011", "SALES", "LOCKED", False, True),
                ("sales_thao", "Đỗ Phương Thảo", "thao.dp@hethong.vn", "0971112233", "SALES", "ACTIVE", False, True),
                ("sales_kien", "Lương Trung Kiên", "kien.lt@hethong.vn", "0972223344", "SALES", "PENDING_ACTIVATION", True, True),
                ("sales_huong", "Ngô Thu Hương", "huong.nt@hethong.vn", "0973334455", "SALES", "ACTIVE", False, True),
                ("sales_thanh", "Dương Văn Thành", "thanh.dv@hethong.vn", "0974445566", "SALES", "ACTIVE", False, True),
                ("sales_trang", "Đinh Quỳnh Trang", "trang.dq@hethong.vn", "0975556677", "SALES", "LOCKED", False, True),
                ("sales_long", "Hồ Phi Long", "long.hp@hethong.vn", "0976667788", "SALES", "ACTIVE", False, True),
                ("sales_yen", "Chu Hải Yến", "yen.ch@hethong.vn", "0977778899", "SALES", "ACTIVE", False, True),
                ("sales_huy", "Trịnh Quang Huy", "huy.tq@hethong.vn", "0978889900", "SALES", "PENDING_ACTIVATION", True, True),
                ("sales_mai", "Lý Thanh Mai", "mai.lt@hethong.vn", "0979990011", "SALES", "ACTIVE", False, True),
                ("sales_dat", "Đặng Tiến Đạt", "dat.dt@hethong.vn", "0931112233", "SALES", "ACTIVE", False, True),
                # Trang 2 (khi pageSize = 20)
                ("mgr_hung", "Phan Mạnh Hùng", "hung.pm@hethong.vn", "0932223344", "SALES_MANAGER", "ACTIVE", False, True),
                ("mgr_nhan", "Võ Thành Nhân", "nhan.vt@hethong.vn", "0933334455", "SALES_MANAGER", "ACTIVE", False, True),
                ("wh_khoa", "Nguyễn Đăng Khoa", "khoa.nd@hethong.vn", "0934445566", "WAREHOUSE", "ACTIVE", False, True),
                ("wh_phuc", "Lê Hồng Phúc", "phuc.lh@hethong.vn", "0935556677", "WAREHOUSE", "ACTIVE", False, True),
                ("sales_giang", "Nguyễn Trường Giang", "giang.nt@hethong.vn", "0936667788", "SALES", "PENDING_ACTIVATION", True, True),
            ]

            for u_data in sample_users:
                user = User(
                    username=u_data[0],
                    full_name=u_data[1],
                    email=u_data[2],
                    phone=u_data[3],
                    role_code=u_data[4],
                    status=u_data[5],
                    password_hash=default_hashed_pwd,
                    is_temporary_password=u_data[6],
                    email_sent=u_data[7]
                )
                db.add(user)
            db.commit()
    finally:
        db.close()
