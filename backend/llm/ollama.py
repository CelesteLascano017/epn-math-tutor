import requests


def generate_response(question: str) -> str:

    url = "http://localhost:11434/api/generate"

    payload = {
        "model": "llama3.2:3b",
        "prompt": question,
        "stream": False
    }

    response = requests.post(url, json=payload)

    result = response.json()

    return result["response"]