"""Support ticket model — backs Profile > Help & Support > Report an issue."""
from uuid import uuid4
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class SupportTicketStatus:
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    category = Column(String(60), nullable=False)
    subcategory = Column(String(80), nullable=False)
    reason = Column(String(120), nullable=False)
    description = Column(Text, nullable=False)

    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    contact_phone = Column(String(20), nullable=True)

    status = Column(String(20), nullable=False, default=SupportTicketStatus.OPEN)
    admin_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<SupportTicket(id={self.id}, category={self.category}, status={self.status})>"
