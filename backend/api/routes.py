import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import Conversation, DBMessage
from backend.llm.service import generate_response
from backend.schemas.chat import (
    ChatRequest,
    ChatResponse,
    QuestionRequest,
    TutorResponse,
)

router = APIRouter()


# ── Health check ──────────────────────────────────────────────────────────────

@router.get("/")
def home():
    return {"message": "TutorMath API v2 funcionando"}


# ── Legacy endpoint (quick testing without conversation context) ───────────────

@router.post("/ask", response_model=TutorResponse)
def ask_question(request: QuestionRequest):
    """Legacy stateless endpoint — no conversation history. Kept for testing."""
    return generate_response(request.question)


# ── Main chat endpoint (used by the chatbot-ui frontend) ──────────────────────

@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    """
    Main chat endpoint for the React frontend.

    Accepts the current message history from the UI. Uses the DB history for
    LLM context (more reliable). Persists new messages to SQLite.
    Returns structured blocks for rich card rendering plus plain-text delta.
    """
    # 1. Validate: last message must be from user
    if not request.messages or request.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from user")

    current_question = request.messages[-1].content

    # 2. Get or lazily create the conversation
    conv = db.query(Conversation).filter(
        Conversation.id == request.conversation_id
    ).first()

    if not conv:
        now = time.time()
        conv = Conversation(
            id=request.conversation_id,
            title=_derive_title(current_question),
            created_at=now,
            updated_at=now,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # 3. Load history from DB (last 10 messages for context window)
    db_messages = (
        db.query(DBMessage)
        .filter(DBMessage.conversation_id == conv.id)
        .order_by(DBMessage.created_at)
        .all()
    )

    history = []
    for m in db_messages[-10:]:
        if m.role == "user":
            history.append({"role": "user", "content": m.content})
        else:
            # Assistant content is JSON blocks — flatten to plain text for context
            try:
                blocks_data = json.loads(m.content)
                text = " ".join(b.get("content", "") for b in blocks_data)
            except (json.JSONDecodeError, AttributeError):
                text = m.content
            history.append({"role": "assistant", "content": text})

    # 4. Save user message
    user_msg = DBMessage(
        id=str(uuid.uuid4()),
        conversation_id=conv.id,
        role="user",
        content=current_question,
        created_at=time.time(),
    )
    db.add(user_msg)

    # 5. Generate response from LLM
    tutor_response = generate_response(current_question, history=history)

    # 6. Save assistant response (blocks serialized as JSON string)
    blocks_json = json.dumps(
        [b.model_dump() for b in tutor_response.blocks],
        ensure_ascii=False,
    )
    assistant_msg = DBMessage(
        id=str(uuid.uuid4()),
        conversation_id=conv.id,
        role="assistant",
        content=blocks_json,
        created_at=time.time(),
    )
    db.add(assistant_msg)
    conv.updated_at = time.time()
    db.commit()

    # 7. Return structured response
    plain_text = "\n\n".join(b.content for b in tutor_response.blocks)
    return ChatResponse(
        delta=plain_text,
        blocks=tutor_response.blocks,
        done=True,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _derive_title(text: str, max_len: int = 40) -> str:
    clean = " ".join(text.split()).strip()
    if not clean:
        return "Nueva conversación"
    return clean[:max_len] + "…" if len(clean) > max_len else clean
