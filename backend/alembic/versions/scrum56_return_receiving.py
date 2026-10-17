"""Persist return item receipt details and quarantined damaged stock.

Revision ID: scrum56returns01
Revises: scrum25draft01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "scrum56returns01"
down_revision: Union[str, Sequence[str], None] = "scrum25draft01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory", sa.Column("damaged_qty", sa.Float(), server_default="0", nullable=False))
    op.add_column("inventory_lots", sa.Column("damaged_qty", sa.Float(), server_default="0", nullable=False))
    with op.batch_alter_table("return_orders") as batch_op:
        batch_op.add_column(sa.Column("return_date", sa.Date(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "created_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", name="fk_return_orders_created_by_user", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "received_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", name="fk_return_orders_received_by_user", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("received_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("return_order_items") as batch_op:
        batch_op.add_column(
            sa.Column(
                "unit_id",
                sa.Integer(),
                sa.ForeignKey("product_units.id", name="fk_return_items_unit", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("unit_name", sa.String(length=50), nullable=True))
        batch_op.add_column(
            sa.Column("conversion_rate_snapshot", sa.Float(), server_default="1", nullable=False)
        )
        batch_op.add_column(sa.Column("base_quantity", sa.Float(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("lot_number", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("received_condition", sa.String(length=20), nullable=True))
    op.execute("UPDATE return_order_items SET base_quantity = quantity WHERE base_quantity = 0")
    op.execute("UPDATE return_orders SET return_date = CURRENT_DATE WHERE return_date IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("return_order_items") as batch_op:
        batch_op.drop_column("received_condition")
        batch_op.drop_column("lot_number")
        batch_op.drop_column("base_quantity")
        batch_op.drop_column("conversion_rate_snapshot")
        batch_op.drop_column("unit_name")
        batch_op.drop_column("unit_id")
    with op.batch_alter_table("return_orders") as batch_op:
        batch_op.drop_column("received_at")
        batch_op.drop_column("received_by_id")
        batch_op.drop_column("created_by_id")
        batch_op.drop_column("return_date")
    op.drop_column("inventory_lots", "damaged_qty")
    op.drop_column("inventory", "damaged_qty")
