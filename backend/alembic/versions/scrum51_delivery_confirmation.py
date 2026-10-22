"""Persist delivery results and proof image references.

Revision ID: scrum51delivery01
Revises: scrum25draft01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "scrum51delivery01"
down_revision: Union[str, Sequence[str], None] = "scrum25draft01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_confirmations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dispatch_id", sa.Integer(), sa.ForeignKey("dispatches.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("result", sa.String(length=20), nullable=False),
        sa.Column("receiver_name", sa.String(length=150), nullable=True),
        sa.Column("received_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.String(length=40), nullable=True),
        sa.Column("return_warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("confirmed_by", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "delivery_proof_images",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("confirmation_id", sa.Integer(), sa.ForeignKey("delivery_confirmations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_name", sa.String(length=100), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("delivery_proof_images")
    op.drop_table("delivery_confirmations")
