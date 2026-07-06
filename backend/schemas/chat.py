from typing import Literal

from pydantic import BaseModel

class QuestionRequest(BaseModel):
    question: str

    
class ContentBlock(BaseModel):
    type: Literal["explanation", "definition", "formal_solution"]
    content: str
    

class TutorResponse(BaseModel):
    blocks: list[ContentBlock]