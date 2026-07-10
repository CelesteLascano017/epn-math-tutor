"""
Ollama LLM client.

Uses the official Ollama REST API (``/api/chat``) to communicate with
a Qwen 2.5 7B model (with LoRA adapters) running on a remote host.

API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
"""

import requests

from backend.config import settings


def generate_response(messages: list[dict]) -> str:
    """
    Post *messages* to the Ollama ``/api/chat`` endpoint and return the
    raw LLM text.

    The call is **non-streaming** (``stream: false``) so the full response
    arrives in a single JSON object.

    Raises:
        requests.HTTPError: on 4xx/5xx responses.
        requests.ConnectionError: if the Ollama server is unreachable.
        requests.Timeout: if the model takes longer than 120 s.
    """
    payload = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_ctx": 4096,
            "num_predict": 1024,
            "repeat_penalty": 1.05,
        }
    }

    response = requests.post(
        settings.ollama_url,
        json=payload,
        timeout=120,
    )
    response.raise_for_status()

    return response.json()["message"]["content"]

