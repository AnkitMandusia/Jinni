"""Admin-managed festival / offer campaigns (home banners).

Revision ID: 0017
Revises: 0016
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("eyebrow", sa.String(40), nullable=False, server_default="OFFER"),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("subtitle", sa.String(120), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("target", sa.String(20), nullable=False, server_default="none"),
        sa.Column("coupon_code", sa.String(40), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_index("idx_campaign_active_window", "campaigns", ["is_active", "starts_at", "ends_at"])


def downgrade() -> None:
    op.drop_index("idx_campaign_active_window", table_name="campaigns")
    op.drop_table("campaigns")
