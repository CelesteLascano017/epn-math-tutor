import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import Conversation, DBMessage
from backend.schemas.chat import (
    ConversationOut,
    ConversationSummaryOut,
    CreateConversationRequest,
    MessageOut,
    RenameConversationRequest,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummaryOut])
def list_conversations(db: Session = Depends(get_db)):
    """Return all conversations ordered by most recently updated."""
    convos = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    return [
        ConversationSummaryOut(
            id=c.id,
            title=c.title,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in convos
    ]


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(
    body: CreateConversationRequest,
    db: Session = Depends(get_db),
):
    """Create a new conversation and return it (starts with empty messages)."""
    now = time.time()
    conv = Conversation(
        id=str(uuid.uuid4()),
        title=body.title or "Nueva conversación",
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    """Return a conversation with its full message history."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
    )


@router.patch("/{conversation_id}", status_code=204)
def rename_conversation(
    conversation_id: str,
    body: RenameConversationRequest,
    db: Session = Depends(get_db),
):
    """Rename a conversation."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.title = body.title
    conv.updated_at = time.time()
    db.commit()


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    """Delete a conversation and all its messages (cascade)."""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
