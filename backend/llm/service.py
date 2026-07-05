from backend.llm.ollama import generate_response as ollama_generate_response
from backend.prompts.builder import build_prompt


def generate_response(question: str) -> str:
    prompt = build_prompt(question)

    return ollama_generate_response(prompt)