"""Write and query audit history for inventory and receivables changes."""

from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

try:
    from app.core.database import get_db
    from app.models.models import BusinessAuditLog
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from app.core.database import get_db
    from app.models.models import BusinessAuditLog


EntityType = Literal["inventory", "price", "credit_limit", "invoice", "debt"]


class AuditLogCreate(BaseModel):
    actor_user_id: Optional[int] = Field(default=None, gt=0)
    actor_name: str = Field(min_length=1, max_length=150)
    entity_type: EntityType
    entity_id: str = Field(min_length=1, max_length=100)
    action: str = Field(min_length=1, max_length=80)
    before_value: Any
    after_value: Any
    happened_at: Optional[datetime] = None

    @field_validator("actor_name", "entity_id", "action")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Giá trị không được để trống.")
        return value

    @model_validator(mode="after")
    def validate_timestamp(self):
        if self.happened_at and self.happened_at.tzinfo is None:
            raise ValueError("happened_at phải có múi giờ.")
        return self


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: Optional[int]
    actor_name: str
    entity_type: str
    entity_id: str
    action: str
    before_value: Any
    after_value: Any
    happened_at: datetime


router = APIRouter(prefix="/api/v1/audit-logs", tags=["Nhật ký tồn kho và công nợ"])


def record_audit_log(db: Session, payload: AuditLogCreate) -> BusinessAuditLog:
    """Persist one immutable record in the same transaction as its caller."""
    row = BusinessAuditLog(
        actor_user_id=payload.actor_user_id,
        actor_name=payload.actor_name,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        action=payload.action,
        before_value=payload.before_value,
        after_value=payload.after_value,
        happened_at=payload.happened_at or datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    return row


def find_audit_logs(
    db: Session,
    *,
    actor_user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[BusinessAuditLog]:
    statement = select(BusinessAuditLog)
    if actor_user_id is not None:
        statement = statement.where(BusinessAuditLog.actor_user_id == actor_user_id)
    if entity_type is not None:
        statement = statement.where(BusinessAuditLog.entity_type == entity_type)
    if start_at is not None:
        statement = statement.where(BusinessAuditLog.happened_at >= start_at)
    if end_at is not None:
        statement = statement.where(BusinessAuditLog.happened_at <= end_at)
    return list(
        db.scalars(
            statement.order_by(BusinessAuditLog.happened_at.desc(), BusinessAuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )


@router.post("", response_model=AuditLogRead, status_code=201)
def create_audit_log(payload: AuditLogCreate, db: Session = Depends(get_db)):
    try:
        row = record_audit_log(db, payload)
        db.commit()
        db.refresh(row)
        return row
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Không thể lưu nhật ký thao tác.") from exc


@router.get("", response_model=List[AuditLogRead])
def list_audit_logs(
    actor_user_id: Optional[int] = Query(default=None, gt=0),
    entity_type: Optional[EntityType] = None,
    start_at: Optional[datetime] = None,
    end_at: Optional[datetime] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    if start_at and end_at and start_at > end_at:
        raise HTTPException(status_code=422, detail="start_at phải trước hoặc bằng end_at.")
    for value in (start_at, end_at):
        if value is not None and value.tzinfo is None:
            raise HTTPException(status_code=422, detail="Thời gian lọc phải có múi giờ.")
    return find_audit_logs(
        db,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        start_at=start_at,
        end_at=end_at,
        limit=limit,
        offset=offset,
    )
