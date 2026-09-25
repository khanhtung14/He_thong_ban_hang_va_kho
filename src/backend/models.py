from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class Role(Base):
    __tablename__ = "roles"

    code = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    role_code = Column(String(50), ForeignKey("roles.code"), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="PENDING_ACTIVATION", index=True)
    password_hash = Column(String(255), nullable=False)
    is_temporary_password = Column(Boolean, nullable=False, default=True)
    email_sent = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


    role = relationship("Role", back_populates="users")
