"""Add missing auth columns to users table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-19

Adds columns that exist in users/models.py but may be absent from the DB
when the users table was created before these columns were added to the model.
All operations are idempotent (IF NOT EXISTS / column_exists checks).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

    # Columns required by users/models.py that may be missing from older DBs
    missing_columns = [
        ("role",             "VARCHAR(50)"),
        ("status",           "VARCHAR(50) NOT NULL DEFAULT 'pending_approval'"),
        ("profile_complete", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("password_hash",    "VARCHAR(255)"),
        ("fcm_token",        "VARCHAR(500)"),
        ("avatar_url",       "TEXT"),
        ("is_active",        "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("is_verified",      "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("last_login",       "TIMESTAMP"),
        ("updated_at",       "TIMESTAMP"),
    ]

    for col, definition in missing_columns:
        if not _column_exists(bind, "users", col):
            op.execute(sa.text(f"ALTER TABLE users ADD COLUMN {col} {definition}"))

    # Indexes (idempotent)
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_users_role ON users(role)"
    ))

    # Profile tables — create if not already present
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS store_profiles (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            owner_name VARCHAR(255) NOT NULL,
            store_name VARCHAR(255) NOT NULL,
            gstin VARCHAR(20),
            fssai VARCHAR(30),
            address TEXT,
            bank_account VARCHAR(30),
            bank_ifsc VARCHAR(15),
            is_open BOOLEAN NOT NULL DEFAULT TRUE,
            delivery_radius_km FLOAT DEFAULT 5.0,
            approved_by UUID REFERENCES users(id),
            approved_at TIMESTAMP,
            created_at TIMESTAMP
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_store_profiles_user_id ON store_profiles(user_id)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS restaurant_profiles (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            owner_name VARCHAR(255) NOT NULL,
            restaurant_name VARCHAR(255) NOT NULL,
            gstin VARCHAR(20),
            fssai VARCHAR(30),
            cuisine_type VARCHAR(100),
            address TEXT,
            bank_ifsc VARCHAR(15),
            is_open BOOLEAN NOT NULL DEFAULT TRUE,
            approved_by UUID REFERENCES users(id),
            approved_at TIMESTAMP,
            created_at TIMESTAMP
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_restaurant_profiles_user_id ON restaurant_profiles(user_id)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS delivery_agent_profiles (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            vehicle_type VARCHAR(50),
            license_no VARCHAR(30),
            aadhaar VARCHAR(20),
            bank_account VARCHAR(30),
            bank_ifsc VARCHAR(15),
            is_available BOOLEAN NOT NULL DEFAULT FALSE,
            current_lat FLOAT,
            current_lng FLOAT,
            last_location_at TIMESTAMP,
            approved_by UUID REFERENCES users(id),
            approved_at TIMESTAMP,
            created_at TIMESTAMP
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_delivery_agent_profiles_user_id ON delivery_agent_profiles(user_id)"
    ))


def downgrade() -> None:
    # Only remove columns added by this migration (non-destructive)
    for col in ["role", "status", "profile_complete", "password_hash",
                "fcm_token", "avatar_url", "is_active", "is_verified",
                "last_login", "updated_at"]:
        op.execute(sa.text(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}"))
