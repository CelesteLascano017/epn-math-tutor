"""
Settings API — runtime configuration for the LLM provider and URLs.

All mutations are applied to the in-memory ``settings`` singleton and
take effect immediately for subsequent requests.  Nothing is persisted
to disk (by design — the server starts with sensible defaults).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.config import LLMProvider, settings

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Request / Response schemas ───────────────────────────────────────────────

class SettingsOut(BaseModel):
    """Full snapshot returned by GET /settings."""

    active_provider: str
    ngrok_url: str
    ollama_url: str
    ollama_model: str
    ollama_embedding_url: str
    ollama_embedding_model: str
    rag_enabled: bool
    rag_top_k: int
    rag_min_score: float
    rag_chunk_size: int
    rag_chunk_overlap: int


class UpdateProviderRequest(BaseModel):
    """Body for PUT /settings/provider."""

    provider: str = Field(
        ...,
        description="LLM provider to activate.  Must be 'ngrok' or 'ollama'.",
    )


class UpdateUrlsRequest(BaseModel):
    """Body for PUT /settings/urls.  All fields are optional."""

    ngrok_url: str | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None
    ollama_embedding_url: str | None = None
    ollama_embedding_model: str | None = None


class UpdateRAGRequest(BaseModel):
    """Body for PUT /settings/rag. All fields are optional."""

    rag_enabled: bool | None = None
    rag_top_k: int | None = Field(None, ge=1, le=12)
    rag_min_score: float | None = Field(None, ge=-1.0, le=1.0)
    rag_chunk_size: int | None = Field(None, ge=300, le=4000)
    rag_chunk_overlap: int | None = Field(None, ge=0, le=1000)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=SettingsOut)
def get_settings():
    """Return the current runtime settings."""
    return SettingsOut(**settings.snapshot())


@router.put("/rag", response_model=SettingsOut)
def update_rag(body: UpdateRAGRequest):
    """Update retrieval settings used before each LLM call."""
    updates = body.model_dump(exclude_none=True)

    if "rag_chunk_overlap" in updates:
        chunk_size = updates.get("rag_chunk_size", settings.rag_chunk_size)
        if updates["rag_chunk_overlap"] >= chunk_size:
            raise HTTPException(
                status_code=422,
                detail="rag_chunk_overlap must be smaller than rag_chunk_size.",
            )

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    settings.update(**updates)
    print(f"[settings] RAG updated: {updates}")
    return SettingsOut(**settings.snapshot())


@router.put("/provider", response_model=SettingsOut)
def update_provider(body: UpdateProviderRequest):
    """
    Switch the active LLM provider.

    Accepts ``"ngrok"`` or ``"ollama"``.  The change is effective
    immediately for all subsequent ``/ask`` and ``/chat`` requests.
    """
    try:
        provider = LLMProvider(body.provider)
    except ValueError:
        valid = ", ".join(p.value for p in LLMProvider)
        raise HTTPException(
            status_code=422,
            detail=f"Invalid provider '{body.provider}'. Must be one of: {valid}",
        )

    settings.update(active_provider=provider)
    print(f"[settings] Provider changed → {provider.value}")
    return SettingsOut(**settings.snapshot())


@router.put("/urls", response_model=SettingsOut)
def update_urls(body: UpdateUrlsRequest):
    """
    Update one or more endpoint URLs / model names at runtime.

    Only the fields present in the body are updated; omitted fields
    keep their current value.
    """
    updates: dict = {}
    if body.ngrok_url is not None:
        updates["ngrok_url"] = body.ngrok_url.rstrip("/")
    if body.ollama_url is not None:
        updates["ollama_url"] = body.ollama_url.rstrip("/")
    if body.ollama_model is not None:
        updates["ollama_model"] = body.ollama_model.strip()
    if body.ollama_embedding_url is not None:
        updates["ollama_embedding_url"] = body.ollama_embedding_url.rstrip("/")
    if body.ollama_embedding_model is not None:
        updates["ollama_embedding_model"] = body.ollama_embedding_model.strip()

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    settings.update(**updates)
    print(f"[settings] URLs updated → {updates}")
    return SettingsOut(**settings.snapshot())
