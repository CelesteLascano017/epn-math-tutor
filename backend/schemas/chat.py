from typing import Literal

from pydantic import BaseModel


# ── Existing schemas (used by /ask legacy endpoint) ──────────────────────────

class QuestionRequest(BaseModel):
    question: str


class ContentBlock(BaseModel):
    type: Literal["explanation", "definition", "formal_solution"]
    content: str


class TutorResponse(BaseModel):
    blocks: list[ContentBlock]


# ── New schemas for the /chat endpoint (chatbot-ui compatible) ───────────────

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str  # plain text for user; JSON string of blocks for assistant


class ChatRequest(BaseModel):
    conversation_id: str
    messages: list[ChatMessage]  # full history; last item is the current user message
    model: str | None = None


class ChatResponse(BaseModel):
    """Non-streaming response for /chat. Frontend treats delta as the text to display."""
    delta: str          # content as plain markdown (fallback / copy text)
    blocks: list[ContentBlock]  # structured blocks for rich card rendering
    done: bool = True


# ── Conversation REST schemas ────────────────────────────────────────────────

class MessageOut(BaseModel):
    id: str
    role: str
    content: str  # user: plain text | assistant: JSON string of blocks
    created_at: float


class ConversationSummaryOut(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    model_id: str | None = None


class ConversationOut(ConversationSummaryOut):
    messages: list[MessageOut]


class CreateConversationRequest(BaseModel):
    title: str | None = None


class RenameConversationRequest(BaseModel):
    title: str