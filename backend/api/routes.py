from fastapi import APIRouter
from pydantic import BaseModel

from backend.llm.service import generate_response

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

    answer = generate_response(request.question)
    
    return {
        "response": answer
    }

