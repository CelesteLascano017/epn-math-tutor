from typing import Literal

from pydantic import BaseModel


class ContentBlock(BaseModel):
    type: Literal["explanation", "definition", "formal_solution"]
    content: str
    

class TutorResponse(BaseModel):
    blocks: list[ContentBlock]