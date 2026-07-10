from typing import Literal

from pydantic import BaseModel, Field


# ── Existing schemas (used by /ask legacy endpoint) ──────────────────────────

class QuestionRequest(BaseModel):
    question: str


class ContentBlock(BaseModel):
    type: Literal["explanation", "definition", "formal_solution"]
    content: str


class Source(BaseModel):
    id: str
    title: str
    url: str | None = None
    snippet: str | None = None


class TutorResponse(BaseModel):
    blocks: list[ContentBlock]


# ── New schemas for the /chat endpoint (chatbot-ui compatible) ───────────────

class AttachmentIn(BaseModel):
    id: str
    name: str | None = None
    mimeType: str | None = None
    url: str | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str  # plain text for user; JSON string of blocks for assistant
    attachments: list[AttachmentIn] = Field(default_factory=list)


class ChatRequest(BaseModel):
    conversation_id: str
    messages: list[ChatMessage]  # full history; last item is the current user message
    model: str | None = None


class ChatResponse(BaseModel):
    """Non-streaming response for /chat. Frontend treats delta as the text to display."""
    delta: str          # content as plain markdown (fallback / copy text)
    blocks: list[ContentBlock]  # structured blocks for rich card rendering
    sources: list[Source] = []
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
