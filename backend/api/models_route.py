from fastapi import APIRouter

router = APIRouter(tags=["models"])


@router.get("/models")
def get_models():
    """Returns the list of available tutor models."""
    return [
        {
            "id": "tutormath-colab",
            "name": "TutorMath",
            "description": "Modelo LLM ejecutándose en Google Colab via ngrok",
        }
    ]
