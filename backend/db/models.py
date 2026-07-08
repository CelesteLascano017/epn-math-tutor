import time
import uuid

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[float] = mapped_column(nullable=False, default=time.time)
    updated_at: Mapped[float] = mapped_column(nullable=False, default=time.time)

    messages: Mapped[list["DBMessage"]] = relationship(
        "DBMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="DBMessage.created_at",
    )


class DBMessage(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(nullable=False)  # 'user' | 'assistant'
    # User messages: plain text. Assistant messages: JSON string of blocks array.
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[float] = mapped_column(nullable=False, default=time.time)

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="messages"
    )
