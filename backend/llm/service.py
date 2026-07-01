from backend.llm.ollama import generate_response as ollama_generate_response


def generate_response(question: str) -> str:
    return ollama_generate_response(question)