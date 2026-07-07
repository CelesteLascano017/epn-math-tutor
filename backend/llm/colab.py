import requests

COLAB_MODEL_URL = "https://tipper-skinning-directive.ngrok-free.dev/generate"


def generate_response(question: str) -> str:
    payload = {
        "question": question
    }

    response = requests.post(
        COLAB_MODEL_URL,
        json=payload,
        timeout=120
    )

    response.raise_for_status()

    result = response.json()

    return result["response"]


if __name__ == "__main__":
    answer = generate_response("¿Qué es una función?")
    print(answer)