import time
import uuid

from sqlalchemy import ForeignKey, Integer, Text
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
    document_links: Mapped[list["RAGConversationDocument"]] = relationship(
        "RAGConversationDocument",
        back_populates="conversation",
        cascade="all, delete-orphan",
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


class RAGDocument(Base):
    __tablename__ = "rag_documents"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False, default="text/plain")
    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_sha256: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    index_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[float] = mapped_column(nullable=False, default=time.time)

    chunks: Mapped[list["RAGChunk"]] = relationship(
        "RAGChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="RAGChunk.chunk_index",
    )
    conversation_links: Mapped[list["RAGConversationDocument"]] = relationship(
        "RAGConversationDocument",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class RAGConversationDocument(Base):
    """Explicitly scopes a library document to a conversation."""

    __tablename__ = "rag_conversation_documents"

    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    document_id: Mapped[str] = mapped_column(
        ForeignKey("rag_documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[float] = mapped_column(nullable=False, default=time.time)
    last_used_at: Mapped[float] = mapped_column(nullable=False, default=time.time)

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="document_links"
    )
    document: Mapped["RAGDocument"] = relationship(
        "RAGDocument", back_populates="conversation_links"
    )


class RAGChunk(Base):
    __tablename__ = "rag_chunks"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(
        ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[str] = mapped_column(Text, nullable=False)
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    exercise_ordinal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    heading: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[float] = mapped_column(nullable=False, default=time.time)

    document: Mapped["RAGDocument"] = relationship(
        "RAGDocument", back_populates="chunks"
    )
