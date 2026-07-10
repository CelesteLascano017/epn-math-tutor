from __future__ import annotations

import math

import requests

from backend.config import settings


def embed_texts(texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
    if not texts:
        return []

    result: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        payload = {
            "model": settings.ollama_embedding_model,
            "input": batch,
            "truncate": True,
        }
        response = requests.post(
            settings.ollama_embedding_url,
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        embeddings = response.json().get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(batch):
            raise RuntimeError("Ollama no devolvio embeddings validos.")
        result.extend(
            _normalize([float(value) for value in embedding])
            for embedding in embeddings
        )
    return result


def embed_query(text: str) -> list[float]:
    embeddings = embed_texts([text])
    if not embeddings:
        raise RuntimeError("No se pudo generar el embedding de la pregunta.")
    return embeddings[0]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        return vector
    return [v / norm for v in vector]
