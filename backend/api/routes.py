from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class QuestionRequest(BaseModel):
    question: str


@router.get("/")
def home():
    return {
        "message": "Tutor Matemático funcionando"
    }


@router.post("/ask")
def ask_question(request: QuestionRequest):
    return {
        "response": f"I received your question: {request.question}"
    }

    