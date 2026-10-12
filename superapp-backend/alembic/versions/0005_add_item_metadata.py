"""Add item_metadata to order_items

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-26 14:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add item_metadata JSON column to order_items table
    op.add_column('order_items', sa.Column('item_metadata', sa.JSON(), nullable=True))


def downgrade() -> None:
    # Remove item_metadata column
    op.drop_column('order_items', 'item_metadata')
