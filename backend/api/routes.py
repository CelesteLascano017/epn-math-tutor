from fastapi import APIRouter


from backend.llm.service import generate_response
from backend.schemas.chat import QuestionRequest, TutorResponse

router = APIRouter()


@router.get("/")
def home():
    return {
        "message": "Tutor Matemático funcionando"
    }


@router.post("/ask", response_model=TutorResponse)
def ask_question(request: QuestionRequest):

    answer = generate_response(request.question)
    
    return answer

