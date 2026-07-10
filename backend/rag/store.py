from __future__ import annotations

import hashlib
import json
import os
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.models import RAGChunk, RAGDocument
from backend.rag.embeddings import cosine_similarity, embed_query, embed_texts
from backend.rag.text import chunk_text, extract_text


PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = PROJECT_ROOT / "data" / "rag_uploads"


@dataclass
class RetrievedChunk:
    document_id: str
    chunk_id: str
    title: str
    text: str
    score: float


def ingest_file(
    db: Session,
    *,
    source_path: Path,
    filename: str,
    mime_type: str,
) -> RAGDocument:
    file_bytes = source_path.read_bytes()
    digest = hashlib.sha256(file_bytes).hexdigest()

    existing = (
        db.query(RAGDocument)
        .filter(RAGDocument.content_sha256 == digest)
        .first()
    )
    if existing:
        if existing.source_path != str(source_path):
            try:
                source_path.unlink(missing_ok=True)
            except OSError:
                pass
        return existing

    text = extract_text(source_path, mime_type)
    chunks = chunk_text(
        text,
        chunk_size=settings.rag_chunk_size,
        overlap=settings.rag_chunk_overlap,
    )
    if not chunks:
        raise ValueError("No se encontro texto util para indexar en el archivo.")

    embeddings = embed_texts(chunks)
    if len(embeddings) != len(chunks):
        raise RuntimeError("La cantidad de embeddings no coincide con los chunks.")

    document = RAGDocument(
        id=str(uuid.uuid4()),
        filename=filename,
        mime_type=mime_type or "application/octet-stream",
        source_path=str(source_path),
        content_sha256=digest,
    )
    db.add(document)
    db.flush()

    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.add(
            RAGChunk(
                document_id=document.id,
                chunk_index=idx,
                text=chunk,
                embedding=json.dumps(embedding),
            )
        )

    db.commit()
    db.refresh(document)
    return document


def save_upload(fileobj, filename: str) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_filename(filename)
    target = UPLOAD_DIR / f"{uuid.uuid4()}_{safe_name}"
    with target.open("wb") as out:
        shutil.copyfileobj(fileobj, out)
    return target


def retrieve_context(
    db: Session,
    question: str,
    *,
    document_ids: list[str] | None = None,
) -> tuple[str | None, list[RetrievedChunk]]:
    if not settings.rag_enabled:
        return None, []

    query = db.query(RAGChunk).join(RAGDocument)
    if document_ids:
        query = query.filter(RAGChunk.document_id.in_(document_ids))

    chunks = query.all()
    if not chunks:
        return None, []

    question_embedding = embed_query(question)
    scored: list[RetrievedChunk] = []

    for chunk in chunks:
        try:
            embedding = json.loads(chunk.embedding)
        except json.JSONDecodeError:
            continue
        score = cosine_similarity(question_embedding, embedding)
        if score < settings.rag_min_score:
            continue
        scored.append(
            RetrievedChunk(
                document_id=chunk.document_id,
                chunk_id=chunk.id,
                title=chunk.document.filename,
                text=chunk.text,
                score=score,
            )
        )

    scored.sort(key=lambda item: item.score, reverse=True)
    selected = scored[: settings.rag_top_k]
    if not selected:
        return None, []

    context = "\n\n".join(
        f"[Fuente {idx}: {chunk.title} | score={chunk.score:.3f}]\n{chunk.text}"
        for idx, chunk in enumerate(selected, start=1)
    )
    return context, selected


def list_documents(db: Session) -> list[RAGDocument]:
    return (
        db.query(RAGDocument)
        .order_by(RAGDocument.created_at.desc())
        .all()
    )


def delete_document(db: Session, document_id: str) -> bool:
    document = db.query(RAGDocument).filter(RAGDocument.id == document_id).first()
    if not document:
        return False
    source_path = document.source_path
    db.delete(document)
    db.commit()
    if source_path and os.path.exists(source_path):
        try:
            os.remove(source_path)
        except OSError:
            pass
    return True


def _safe_filename(filename: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in filename)
    return cleaned.strip(" .") or "document"
