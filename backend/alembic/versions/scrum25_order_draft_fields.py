"""Add sales order draft fields.

Revision ID: scrum25draft01
Revises: 9ac1f36c47d4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "scrum25draft01"
down_revision: Union[str, Sequence[str], None] = "9ac1f36c47d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("delivery_address_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("desired_delivery_date", sa.Date(), nullable=True))
    op.add_column(
        "orders",
        sa.Column("subtotal_amount", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("discount_amount", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column("order_items", sa.Column("unit_name", sa.String(length=50), nullable=True))
    op.add_column(
        "order_items",
        sa.Column("conversion_factor", sa.Float(), server_default="1", nullable=False),
    )
    op.add_column(
        "order_items",
        sa.Column("discount_percent", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column(
        "order_items",
        sa.Column("line_subtotal", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column(
        "order_items",
        sa.Column("discount_amount", sa.Float(), server_default="0", nullable=False),
    )
    op.add_column(
        "order_items",
        sa.Column("line_total", sa.Float(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("order_items", "line_total")
    op.drop_column("order_items", "discount_amount")
    op.drop_column("order_items", "line_subtotal")
    op.drop_column("order_items", "discount_percent")
    op.drop_column("order_items", "conversion_factor")
    op.drop_column("order_items", "unit_name")
    op.drop_column("orders", "discount_amount")
    op.drop_column("orders", "subtotal_amount")
    op.drop_column("orders", "desired_delivery_date")
    op.drop_column("orders", "delivery_address_id")
