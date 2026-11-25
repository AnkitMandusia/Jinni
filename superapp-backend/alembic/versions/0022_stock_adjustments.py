"""Stock adjustment audit log (architecture plan: PUT /admin/grocery/products/{id}/stock with audit).

Revision ID: 0022
Revises: 0021
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("before_qty", sa.Integer(), nullable=False),
        sa.Column("after_qty", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_table("stock_adjustments")
