"""Initial schema — users, profiles, grocery, inventory

Revision ID: 0001
Revises:
Create Date: 2026-05-19

Covers:
  - users  (with role, status, profile_complete, password_hash, fcm_token)
  - store_profiles
  - restaurant_profiles
  - delivery_agent_profiles
  - product_categories
  - products
  - product_inventory_logs
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:t)"
        ),
        {"t": table_name},
    )
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=:t AND column_name=:c)"
        ),
        {"t": table_name, "c": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    bind = op.get_bind()

    # ── pg_trgm extension (needed for GIN text-search index on products) ──────
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── If DB already has tables (created by old init_db/create_all), ─────────
    # ── only add any missing columns; otherwise create everything fresh. ──────
    if _table_exists(bind, "users"):
        # Add columns that may not exist yet from previous sessions
        for col, definition in [
            ("role",             "VARCHAR(50)"),
            ("status",           "VARCHAR(50) NOT NULL DEFAULT 'pending_approval'"),
            ("profile_complete", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("password_hash",    "VARCHAR(255)"),
            ("fcm_token",        "VARCHAR(500)"),
            ("avatar_url",       "TEXT"),
            ("last_login",       "TIMESTAMP"),
        ]:
            if not _column_exists(bind, "users", col):
                op.execute(sa.text(f'ALTER TABLE users ADD COLUMN {col} {definition}'))

        # Ensure indexes exist
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_users_role ON users(role)"
        ))
        op.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS idx_product_search ON products "
            "USING gin (name gin_trgm_ops)"
        ))
        return   # rest of tables already exist — nothing more to do

    # ── Fresh DB: create all tables ───────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending_approval"),
        sa.Column("profile_complete", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("fcm_token", sa.String(500), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("last_login", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])

    # ── store_profiles ────────────────────────────────────────────────────────
    op.create_table(
        "store_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("owner_name", sa.String(255), nullable=False),
        sa.Column("store_name", sa.String(255), nullable=False),
        sa.Column("gstin", sa.String(20), nullable=True),
        sa.Column("fssai", sa.String(30), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("bank_account", sa.String(30), nullable=True),
        sa.Column("bank_ifsc", sa.String(15), nullable=True),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("delivery_radius_km", sa.Float(), nullable=True, server_default="5.0"),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_store_profiles_user_id", "store_profiles", ["user_id"], unique=True)

    # ── restaurant_profiles ───────────────────────────────────────────────────
    op.create_table(
        "restaurant_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("owner_name", sa.String(255), nullable=False),
        sa.Column("restaurant_name", sa.String(255), nullable=False),
        sa.Column("gstin", sa.String(20), nullable=True),
        sa.Column("fssai", sa.String(30), nullable=True),
        sa.Column("cuisine_type", sa.String(100), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("bank_ifsc", sa.String(15), nullable=True),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_restaurant_profiles_user_id", "restaurant_profiles", ["user_id"], unique=True)

    # ── delivery_agent_profiles ───────────────────────────────────────────────
    op.create_table(
        "delivery_agent_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("vehicle_type", sa.String(50), nullable=True),
        sa.Column("license_no", sa.String(30), nullable=True),
        sa.Column("aadhaar", sa.String(20), nullable=True),
        sa.Column("bank_account", sa.String(30), nullable=True),
        sa.Column("bank_ifsc", sa.String(15), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("current_lat", sa.Float(), nullable=True),
        sa.Column("current_lng", sa.Float(), nullable=True),
        sa.Column("last_location_at", sa.DateTime(), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_delivery_agent_profiles_user_id", "delivery_agent_profiles", ["user_id"], unique=True)

    # ── product_categories ────────────────────────────────────────────────────
    op.create_table(
        "product_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True, server_default="'🛒'"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("product_categories.id"), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_product_categories_name", "product_categories", ["name"])
    op.create_index("ix_product_categories_slug", "product_categories", ["slug"], unique=True)
    op.create_index("idx_category_active", "product_categories", ["is_active", "display_order"])

    # ── products ──────────────────────────────────────────────────────────────
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sku", sa.String(50), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("mrp", sa.Numeric(10, 2), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False, server_default="'piece'"),
        sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_quantity", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("low_stock_threshold", sa.Integer(), nullable=True, server_default="10"),
        sa.Column("category_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("product_categories.id"), nullable=False),
        sa.Column("image_urls", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("primary_image_url", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_products_name", "products", ["name"])
    op.create_index("ix_products_slug", "products", ["slug"], unique=True)
    op.create_index("ix_products_sku", "products", ["sku"], unique=True)
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("idx_product_category_active", "products",
                    ["category_id", "is_active", "display_order"])
    op.create_index("idx_product_featured", "products", ["is_featured", "is_active"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_search ON products "
        "USING gin (name gin_trgm_ops)"
    )

    # ── product_inventory_logs ────────────────────────────────────────────────
    op.create_table(
        "product_inventory_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("products.id"), nullable=False),
        sa.Column("previous_quantity", sa.Integer(), nullable=False),
        sa.Column("new_quantity", sa.Integer(), nullable=False),
        sa.Column("change_amount", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_product_inventory_logs_product_id", "product_inventory_logs", ["product_id"])


def downgrade() -> None:
    op.drop_table("product_inventory_logs")
    op.drop_table("products")
    op.drop_table("product_categories")
    op.drop_table("delivery_agent_profiles")
    op.drop_table("restaurant_profiles")
    op.drop_table("store_profiles")
    op.drop_table("users")
