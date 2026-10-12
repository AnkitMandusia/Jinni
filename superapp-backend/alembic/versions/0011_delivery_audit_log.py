"""Add delivery_audit_log table for Super Admin manual-delivery-completion records.

The previous implementation wrote audit entries to a Redis list
(`audit:manual_delivery_complete`, capped at 10k entries with LTRIM). That is
not durable (lost on Redis eviction/restart/flush) and not actually
immutable (anyone with redis-cli access can LSET/DEL entries). Manual
completion is a sensitive, compliance-relevant action — "Record the admin
ID, order ID, timestamp, reason, previous status, and new status in an
immutable audit trail" — so it belongs in Postgres with no UPDATE/DELETE
grants on the app's normal DB role, not in a cache.

Revision ID: 0011
Revises: 0010
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_audit_log",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", pg.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False, index=True),
        sa.Column("order_number", sa.String(length=20), nullable=False),
        sa.Column("admin_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("admin_phone", sa.String(length=20), nullable=True),
        sa.Column("previous_status", sa.String(length=50), nullable=False),
        sa.Column("new_status", sa.String(length=50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("completion_method", sa.String(length=30), nullable=False, server_default="admin_manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_delivery_audit_order_created", "delivery_audit_log", ["order_id", "created_at"]
    )

    # Belt-and-braces immutability: revoke UPDATE/DELETE from the app's own
    # role at the DB level, so even a bug (or a compromised app credential)
    # cannot alter or erase a past audit row — only INSERT and SELECT work.
    # If your deployment's DB role is not literally named this, update the
    # role name below (check DATABASE_URL) or drop this block; it is
    # defense-in-depth, not required for the table itself to function.
    bind = op.get_bind()
    app_role = bind.engine.url.username
    if app_role:
        try:
            op.execute(f'REVOKE UPDATE, DELETE ON delivery_audit_log FROM "{app_role}"')
        except Exception:
            # Non-fatal: some managed Postgres providers restrict REVOKE from
            # the connecting role itself, or the role owns the table (owners
            # can't be blocked this way without a separate non-owner app
            # role). Immutability is then enforced at the application layer
            # only (no UPDATE/DELETE statements exist against this table
            # anywhere in the codebase) — acceptable for most deployments,
            # but for strict compliance needs, create a dedicated low-privilege
            # app DB role that does NOT own this table.
            pass


def downgrade() -> None:
    op.drop_index("idx_delivery_audit_order_created", table_name="delivery_audit_log")
    op.drop_table("delivery_audit_log")
