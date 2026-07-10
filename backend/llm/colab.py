"""
ngrok / Google Colab LLM client.

Sends the fully-built prompt to the remote Colab notebook exposed via
ngrok.  The notebook endpoint expects ``{"question": "<prompt>"}`` and
returns ``{"response": "<raw LLM text>"}``.
"""

import requests

from backend.config import settings


def generate_response(prompt: str) -> str:
    """
    Post *prompt* to the ngrok-tunnelled Colab endpoint and return the
    raw LLM text.

    Raises:
        requests.HTTPError: on 4xx/5xx responses.
        requests.ConnectionError: if the ngrok tunnel is down.
        requests.Timeout: if the model takes longer than 120 s.
    """
    payload = {"question": prompt}

    response = requests.post(
        settings.ngrok_url,
        json=payload,
        timeout=120,
    )
    response.raise_for_status()

    return response.json()["response"]


if __name__ == "__main__":
    answer = generate_response("¿Qué es una función?")
    print(answer)