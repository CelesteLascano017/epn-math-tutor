import requests

from backend.config import settings

def generate_response(question: str) -> str:

    url = settings.OLLAMA_URL

    payload = {
        "model": settings.DEFAULT_MODEL,
        "prompt": question,
        "stream": False
    }

    response = requests.post(url, json=payload)

    result = response.json()

    return result["response"]


if __name__ == "__main__":
    answer = generate_response("What is the capital of France?")
    print(answer)
