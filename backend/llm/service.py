import json

from backend.llm.colab import generate_response as colab_generate_response
from backend.prompts.builder import build_prompt
from backend.schemas.chat import TutorResponse


def generate_response(question: str) -> TutorResponse:
    prompt = build_prompt(question)

    raw_response = colab_generate_response(prompt)
    print("RAW COLAB RESPONSE:")
    print(raw_response)
    parsed_response = json.loads(raw_response)
    validated_response = TutorResponse.model_validate(parsed_response)

    return validated_response

    