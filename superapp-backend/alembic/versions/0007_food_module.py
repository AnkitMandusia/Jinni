"""Food module tables — restaurants, menu, options, food cart.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08

Creates:
  - restaurants
  - menu_categories
  - menu_items
  - menu_item_option_groups
  - menu_item_options
  - food_carts

Note: restaurant_profiles (owner KYC) already exists from 0001.
      This migration adds the public-facing Restaurant + full menu graph.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
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
    return bool(result.scalar())


def upgrade() -> None:
    bind = op.get_bind()

    # ── restaurants ───────────────────────────────────────────────────────────
    if not _table_exists(bind, "restaurants"):
        op.create_table(
            "restaurants",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, unique=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("slug", sa.String(255), nullable=False, unique=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("cuisines", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
            sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True, server_default="{}"),
            sa.Column("logo_url", sa.Text(), nullable=True),
            sa.Column("cover_image_url", sa.Text(), nullable=True),
            sa.Column("gallery", postgresql.ARRAY(sa.Text()), nullable=True, server_default="{}"),
            sa.Column("address_line1", sa.String(255), nullable=False),
            sa.Column("address_line2", sa.String(255), nullable=True),
            sa.Column("city", sa.String(100), nullable=False),
            sa.Column("state", sa.String(100), nullable=False),
            sa.Column("pincode", sa.String(10), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("is_open", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_accepting_orders", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("pure_veg", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("cost_for_two", sa.Integer(), nullable=True),
            sa.Column("min_order_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("delivery_fee", sa.Numeric(10, 2), nullable=False, server_default="30.00"),
            sa.Column("free_delivery_above", sa.Numeric(10, 2), nullable=True),
            sa.Column("packaging_fee", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("avg_prep_minutes", sa.Integer(), nullable=False, server_default="25"),
            sa.Column("delivery_radius_km", sa.Numeric(5, 2), nullable=False, server_default="8.00"),
            sa.Column("opens_at", sa.Time(), nullable=False, server_default="09:00:00"),
            sa.Column("closes_at", sa.Time(), nullable=False, server_default="23:00:00"),
            sa.Column("rating_avg", sa.Numeric(3, 2), nullable=False, server_default="0.00"),
            sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fssai_license", sa.String(30), nullable=True),
            sa.Column("gstin", sa.String(20), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_restaurants_name", "restaurants", ["name"])
        op.create_index("ix_restaurants_slug", "restaurants", ["slug"], unique=True)
        op.create_index("ix_restaurants_owner_id", "restaurants", ["owner_id"], unique=True)
        op.create_index("ix_restaurants_city", "restaurants", ["city"])
        op.create_index("ix_restaurants_pincode", "restaurants", ["pincode"])
        op.create_index("idx_restaurant_geo", "restaurants", ["latitude", "longitude"])
        op.create_index(
            "idx_restaurant_open_active",
            "restaurants",
            ["is_open", "is_active", "is_accepting_orders"],
        )
        op.create_index("idx_restaurant_city_pincode", "restaurants", ["city", "pincode"])

    # ── menu_categories ───────────────────────────────────────────────────────
    if not _table_exists(bind, "menu_categories"):
        op.create_table(
            "menu_categories",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "restaurant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("restaurants.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("restaurant_id", "name", name="uq_menu_category_name_per_restaurant"),
        )
        op.create_index("ix_menu_categories_restaurant_id", "menu_categories", ["restaurant_id"])
        op.create_index(
            "idx_menu_category_active",
            "menu_categories",
            ["restaurant_id", "is_active", "display_order"],
        )

    # ── menu_items ────────────────────────────────────────────────────────────
    if not _table_exists(bind, "menu_items"):
        op.create_table(
            "menu_items",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "restaurant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("restaurants.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "category_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("menu_categories.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("price", sa.Numeric(10, 2), nullable=False),
            sa.Column("discounted_price", sa.Numeric(10, 2), nullable=True),
            sa.Column("is_veg", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_egg", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("image_url", sa.Text(), nullable=True),
            sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("max_qty_per_order", sa.Integer(), nullable=True),
            sa.Column("prep_time_minutes", sa.Integer(), nullable=True),
            sa.Column("is_bestseller", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("order_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("hsn_code", sa.String(20), nullable=True),
            sa.Column("tax_percent", sa.Numeric(5, 2), nullable=False, server_default="5.00"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.CheckConstraint("price >= 0", name="ck_menu_item_price_nonneg"),
            sa.CheckConstraint(
                "discounted_price IS NULL OR discounted_price <= price",
                name="ck_menu_item_discount_lte_price",
            ),
        )
        op.create_index("ix_menu_items_name", "menu_items", ["name"])
        op.create_index("ix_menu_items_restaurant_id", "menu_items", ["restaurant_id"])
        op.create_index("ix_menu_items_category_id", "menu_items", ["category_id"])
        op.create_index(
            "idx_menu_item_list",
            "menu_items",
            ["restaurant_id", "is_active", "is_available", "display_order"],
        )
        op.create_index(
            "idx_menu_item_veg",
            "menu_items",
            ["restaurant_id", "is_veg", "is_available"],
        )

    # ── menu_item_option_groups ───────────────────────────────────────────────
    if not _table_exists(bind, "menu_item_option_groups"):
        op.create_table(
            "menu_item_option_groups",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "menu_item_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("menu_items.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("min_select", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_select", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.CheckConstraint("min_select >= 0", name="ck_option_group_min"),
            sa.CheckConstraint("max_select >= min_select", name="ck_option_group_max"),
        )
        op.create_index(
            "ix_menu_item_option_groups_menu_item_id",
            "menu_item_option_groups",
            ["menu_item_id"],
        )

    # ── menu_item_options ─────────────────────────────────────────────────────
    if not _table_exists(bind, "menu_item_options"):
        op.create_table(
            "menu_item_options",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "group_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("menu_item_option_groups.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("price_delta", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_veg", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        )
        op.create_index("ix_menu_item_options_group_id", "menu_item_options", ["group_id"])

    # ── food_carts ────────────────────────────────────────────────────────────
    if not _table_exists(bind, "food_carts"):
        op.create_table(
            "food_carts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column(
                "restaurant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("restaurants.id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column("items", postgresql.JSONB(), nullable=False, server_default="[]"),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_food_carts_user_id", "food_carts", ["user_id"], unique=True)
        op.create_index("ix_food_carts_restaurant_id", "food_carts", ["restaurant_id"])


def downgrade() -> None:
    op.drop_table("food_carts")
    op.drop_table("menu_item_options")
    op.drop_table("menu_item_option_groups")
    op.drop_table("menu_items")
    op.drop_table("menu_categories")
    op.drop_table("restaurants")
