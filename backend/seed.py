import asyncio
from app.core.database import SessionLocal
from app.models.models import User, Role, UserRole
from app.core.security import get_password_hash

async def seed():
    db = SessionLocal()
    
    # Check if admin exists
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            full_name="System Administrator",
            status="ACTIVE"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        role = Role(code="ADMIN", name="Quản trị hệ thống", description="Full access")
        db.add(role)
        db.commit()
        db.refresh(role)
        
        user_role = UserRole(user_id=admin.id, role_id=role.id)
        db.add(user_role)

    sales = db.query(User).filter(User.username == "sales").first()
    if not sales:
        sales = User(
            username="sales",
            email="sales@example.com",
            hashed_password=get_password_hash("sales123"),
            full_name="Nhân viên Kinh doanh",
            status="ACTIVE"
        )
        db.add(sales)
        db.commit()
        db.refresh(sales)

        s_role = Role(code="SALES_REP", name="Nhân viên kinh doanh", description="Sales access")
        db.add(s_role)
        db.commit()
        db.refresh(s_role)
        
        s_user_role = UserRole(user_id=sales.id, role_id=s_role.id)
        db.add(s_user_role)
        
    db.commit()
    db.close()
    print("Seeded users!")

if __name__ == "__main__":
    asyncio.run(seed())
