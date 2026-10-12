"""Add extended product fields: barcode, brand, ingredients, nutrition, owner_type, store_id

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-27 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Barcode scan fields (Feature 3)
    op.add_column('products', sa.Column('barcode', sa.String(20), nullable=True))
    op.add_column('products', sa.Column('brand', sa.String(255), nullable=True))
    op.add_column('products', sa.Column('ingredients', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('nutrition', postgresql.JSONB(), nullable=True))

    # Ownership fields (Feature 4)
    op.add_column('products', sa.Column('owner_type', sa.String(20), nullable=False,
                                        server_default='platform'))
    op.add_column('products', sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=True))

    # Indexes
    op.create_index('idx_product_barcode_unique', 'products', ['barcode'],
                    unique=True, postgresql_where=sa.text('barcode IS NOT NULL'))
    op.create_index('idx_product_store', 'products', ['store_id', 'owner_type'])

    # FK from store_id → users.id (soft — no cascade delete)
    op.create_foreign_key(
        'fk_products_store_id_users',
        'products', 'users',
        ['store_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_products_store_id_users', 'products', type_='foreignkey')
    op.drop_index('idx_product_store', table_name='products')
    op.drop_index('idx_product_barcode_unique', table_name='products')
    op.drop_column('products', 'store_id')
    op.drop_column('products', 'owner_type')
    op.drop_column('products', 'nutrition')
    op.drop_column('products', 'ingredients')
    op.drop_column('products', 'brand')
    op.drop_column('products', 'barcode')
