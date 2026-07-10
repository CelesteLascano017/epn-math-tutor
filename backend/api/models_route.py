"""
Models endpoint — lists all available LLM providers.
"""

from fastapi import APIRouter

from backend.config import settings

router = APIRouter(tags=["models"])


@router.get("/models")
def get_models():
    """Returns the list of available tutor model providers and which is active."""
    return {
        "active": settings.active_provider.value,
        "models": [
            {
                "id": "ngrok",
                "name": "TutorMath — ngrok",
                "description": "Qwen 2.5 7B con adaptadores LoRA, ejecutándose en Google Colab vía ngrok",
            },
            {
                "id": "ollama",
                "name": "TutorMath — Ollama",
                "description": "Qwen 2.5 7B con adaptadores LoRA, ejecutándose en servidor Ollama",
            },
        ],
    }
