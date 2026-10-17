"""Add delivery ETA for SCRUM-50."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3d41c50scr50"
down_revision: Union[str, Sequence[str], None] = "9ac1f36c47d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("delivery_trips", sa.Column("estimated_delivery_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("delivery_trips", "estimated_delivery_at")
