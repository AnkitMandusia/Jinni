"""Add pincode to delivery_agent_profiles.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "delivery_agent_profiles",
        sa.Column("pincode", sa.String(10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("delivery_agent_profiles", "pincode")
