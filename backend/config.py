"""
Centralised application settings.

Provider and URL values live in memory and can be changed at runtime
via the /settings API.  A threading lock guards mutations so that
concurrent requests always see a consistent snapshot.
"""

from __future__ import annotations

import threading
import json
import os
from enum import Enum
from typing import Literal


class LLMProvider(str, Enum):
    """Supported LLM back-end providers."""

    NGROK = "ngrok"
    OLLAMA = "ollama"


class Settings:
    """
    Runtime-mutable application settings.

    All public attributes can be read freely.  Mutations MUST go through
    the ``update()`` helper so that the lock is held for the entire
    write, keeping reads consistent.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._filepath = "settings.json"

        # ── Defaults ─────────────────────────────────────────────────
        self.active_provider: LLMProvider = LLMProvider.OLLAMA
        self.ngrok_url: str = "https://tipper-skinning-directive.ngrok-free.dev/generate"
        self.ollama_url: str = "http://26.85.13.151:11434/api/chat"
        self.ollama_model: str = "qwen25-epn-tutor"
        self.ollama_embedding_url: str = "http://26.85.13.151:11434/api/embed"
        self.ollama_embedding_model: str = "nomic-embed-text"
        self.rag_enabled: bool = True
        self.rag_top_k: int = 4
        self.rag_min_score: float = 0.25
        self.rag_chunk_size: int = 1200
        self.rag_chunk_overlap: int = 200

        self._load()

    def _load(self) -> None:
        """Load settings from disk if the file exists."""
        if os.path.exists(self._filepath):
            try:
                with open(self._filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "active_provider" in data:
                        self.active_provider = LLMProvider(data["active_provider"])
                    if "ngrok_url" in data:
                        self.ngrok_url = data["ngrok_url"]
                    if "ollama_url" in data:
                        self.ollama_url = data["ollama_url"]
                    if "ollama_model" in data:
                        self.ollama_model = data["ollama_model"]
                    if "ollama_embedding_url" in data:
                        self.ollama_embedding_url = data["ollama_embedding_url"]
                    if "ollama_embedding_model" in data:
                        self.ollama_embedding_model = data["ollama_embedding_model"]
                    if "rag_enabled" in data:
                        self.rag_enabled = bool(data["rag_enabled"])
                    if "rag_top_k" in data:
                        self.rag_top_k = int(data["rag_top_k"])
                    if "rag_min_score" in data:
                        self.rag_min_score = float(data["rag_min_score"])
                    if "rag_chunk_size" in data:
                        self.rag_chunk_size = int(data["rag_chunk_size"])
                    if "rag_chunk_overlap" in data:
                        self.rag_chunk_overlap = int(data["rag_chunk_overlap"])
            except Exception as e:
                print(f"[config] Failed to load settings.json: {e}")

    def _save(self) -> None:
        """Save current settings to disk."""
        try:
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump(self.snapshot_unlocked(), f, indent=2)
        except Exception as e:
            print(f"[config] Failed to save settings.json: {e}")

    # ── Thread-safe batch update ─────────────────────────────────────

    def update(self, **kwargs: object) -> None:
        """
        Atomically update one or more settings.

        Accepts the same attribute names exposed on the instance.
        Unknown keys are silently ignored so that forward-compatible
        clients don't break older servers.
        """
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self, key) and not key.startswith("_"):
                    setattr(self, key, value)
            self._save()

    # ── Convenience snapshot (used by the /settings API) ─────────────

    def snapshot_unlocked(self) -> dict:
        return {
            "active_provider": self.active_provider.value,
            "ngrok_url": self.ngrok_url,
            "ollama_url": self.ollama_url,
            "ollama_model": self.ollama_model,
            "ollama_embedding_url": self.ollama_embedding_url,
            "ollama_embedding_model": self.ollama_embedding_model,
            "rag_enabled": self.rag_enabled,
            "rag_top_k": self.rag_top_k,
            "rag_min_score": self.rag_min_score,
            "rag_chunk_size": self.rag_chunk_size,
            "rag_chunk_overlap": self.rag_chunk_overlap,
        }

    def snapshot(self) -> dict:
        """Return a plain-dict copy of the current settings."""
        with self._lock:
            return self.snapshot_unlocked()


# Module-level singleton — imported everywhere via ``from backend.config import settings``
settings = Settings()
