from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import time
import unicodedata
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.models import RAGChunk, RAGConversationDocument, RAGDocument
from backend.rag.embeddings import cosine_similarity, embed_query, embed_texts
from backend.rag.references import DocumentReference
from backend.rag.text import StructuredChunk, chunk_document, extract_pages


logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = PROJECT_ROOT / "data" / "rag_uploads"
INDEX_VERSION = 2
STRUCTURED_CONTEXT_LIMIT = 10_000
STRUCTURED_CHUNK_LIMIT = 20


@dataclass
class RetrievedChunk:
    document_id: str
    chunk_id: str
    title: str
    text: str
    score: float
    semantic_score: float = 0.0
    lexical_score: float = 0.0
    page_start: int | None = None
    page_end: int | None = None
    exercise_number: str | None = None
    exercise_ordinal: int | None = None
    item_label: str | None = None


_STOPWORDS = {
    "a", "al", "como", "con", "cual", "de", "del", "el", "en", "es",
    "esta", "este", "la", "las", "lo", "los", "me", "para", "por", "que",
    "se", "su", "un", "una", "y",
}
_NUMBER_WORDS = {
    "uno": "1", "una": "1", "primer": "1", "primero": "1", "primera": "1",
    "dos": "2", "segundo": "2", "segunda": "2",
    "tres": "3", "tercer": "3", "tercero": "3", "tercera": "3",
    "cuatro": "4", "cuarto": "4", "cuarta": "4",
    "cinco": "5", "quinto": "5", "quinta": "5",
    "seis": "6", "siete": "7", "ocho": "8", "nueve": "9", "diez": "10",
}


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
        if existing.index_version < INDEX_VERSION:
            reindex_document(db, existing)
            db.commit()
            db.refresh(existing)
        return existing

    document = RAGDocument(
        id=str(uuid.uuid4()),
        filename=filename,
        mime_type=mime_type or "application/octet-stream",
        source_path=str(source_path),
        content_sha256=digest,
        index_version=INDEX_VERSION,
    )
    db.add(document)
    db.flush()
    _replace_document_chunks(db, document)
    db.commit()
    db.refresh(document)
    return document


def reindex_document(db: Session, document: RAGDocument) -> int:
    if not document.source_path:
        raise ValueError(f"El documento {document.filename} no tiene archivo fuente.")
    source_path = Path(document.source_path)
    if not source_path.exists():
        raise FileNotFoundError(f"No existe el archivo fuente: {source_path}")
    return _replace_document_chunks(db, document)


def reindex_all_documents(db: Session) -> dict[str, int]:
    result: dict[str, int] = {}
    for document in db.query(RAGDocument).order_by(RAGDocument.created_at).all():
        result[document.id] = reindex_document(db, document)
        db.commit()
    return result


def _replace_document_chunks(db: Session, document: RAGDocument) -> int:
    pages = extract_pages(Path(document.source_path or ""), document.mime_type)
    chunks = chunk_document(
        pages,
        chunk_size=settings.rag_chunk_size,
        overlap=settings.rag_chunk_overlap,
    )
    if not chunks:
        raise ValueError("No se encontro texto util para indexar en el archivo.")

    embeddings = embed_texts([chunk.text for chunk in chunks])
    if len(embeddings) != len(chunks):
        raise RuntimeError("La cantidad de embeddings no coincide con los chunks.")

    db.query(RAGChunk).filter(RAGChunk.document_id == document.id).delete(
        synchronize_session=False
    )
    for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.add(_chunk_model(document.id, index, chunk, embedding))
    document.index_version = INDEX_VERSION
    db.flush()

    structured_count = sum(chunk.exercise_number is not None for chunk in chunks)
    logger.info(
        "RAG indexed document=%s pages=%d chunks=%d structured=%d version=%d",
        document.filename,
        len(pages),
        len(chunks),
        structured_count,
        INDEX_VERSION,
    )
    return len(chunks)


def _chunk_model(
    document_id: str,
    index: int,
    chunk: StructuredChunk,
    embedding: list[float],
) -> RAGChunk:
    return RAGChunk(
        document_id=document_id,
        chunk_index=index,
        text=chunk.text,
        embedding=json.dumps(embedding),
        page_start=chunk.page_start,
        page_end=chunk.page_end,
        exercise_number=chunk.exercise_number,
        exercise_ordinal=chunk.exercise_ordinal,
        item_label=chunk.item_label,
        heading=chunk.heading,
    )


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
    conversation_id: str,
    document_ids: list[str] | None = None,
    reference: DocumentReference | None = None,
) -> tuple[str | None, list[RetrievedChunk]]:
    if not settings.rag_enabled:
        return None, []

    links = (
        db.query(RAGConversationDocument)
        .filter(RAGConversationDocument.conversation_id == conversation_id)
        .order_by(
            RAGConversationDocument.last_used_at.desc(),
            RAGConversationDocument.created_at.desc(),
        )
        .all()
    )
    linked_ids = [link.document_id for link in links]
    if document_ids is not None:
        candidate_document_ids = [
            document_id for document_id in document_ids if document_id in linked_ids
        ]
    elif reference and reference.is_structured and linked_ids:
        candidate_document_ids = [linked_ids[0]]
    else:
        candidate_document_ids = linked_ids

    if not candidate_document_ids:
        logger.info(
            "RAG retrieval conversation=%s no scoped documents",
            conversation_id,
        )
        return None, []

    _ensure_current_indexes(db, candidate_document_ids)
    chunks = (
        db.query(RAGChunk)
        .join(RAGDocument)
        .filter(RAGChunk.document_id.in_(candidate_document_ids))
        .order_by(RAGDocument.created_at, RAGChunk.chunk_index)
        .all()
    )
    if not chunks:
        return None, []

    logger.info(
        "RAG retrieval conversation=%s docs=%s query=%r reference=%s candidates=%d",
        conversation_id,
        candidate_document_ids,
        question[:160],
        reference.describe() if reference else "semantic",
        len(chunks),
    )

    if reference and reference.is_structured:
        return _retrieve_structured(chunks, reference)
    return _retrieve_semantic(chunks, question)


def _retrieve_structured(
    chunks: list[RAGChunk],
    reference: DocumentReference,
) -> tuple[str, list[RetrievedChunk]]:
    if not reference.resolved or (
        reference.item_label
        and not (reference.exercise_number or reference.exercise_ordinal)
    ):
        context = _reference_not_found_context(chunks, reference)
        logger.warning("RAG structured reference unresolved: %s", reference.describe())
        return context, []

    matches = chunks
    if reference.exercise_number:
        matches = [
            chunk for chunk in matches
            if chunk.exercise_number == reference.exercise_number
        ]
        if matches:
            first_occurrence = min(
                chunk.exercise_ordinal
                for chunk in matches
                if chunk.exercise_ordinal is not None
            )
            matches = [
                chunk for chunk in matches
                if chunk.exercise_ordinal == first_occurrence
            ]
    elif reference.exercise_ordinal:
        matches = [
            chunk for chunk in matches
            if chunk.exercise_ordinal == reference.exercise_ordinal
        ]
    if reference.item_label:
        matches = [
            chunk for chunk in matches if chunk.item_label == reference.item_label
        ]

    if not matches:
        context = _reference_not_found_context(chunks, reference)
        logger.warning(
            "RAG structured reference not found: %s available=%s",
            reference.describe(),
            _available_structure(chunks),
        )
        return context, []

    selected: list[RetrievedChunk] = []
    context_size = 0
    for chunk in matches[:STRUCTURED_CHUNK_LIMIT]:
        if selected and context_size + len(chunk.text) > STRUCTURED_CONTEXT_LIMIT:
            break
        item = _retrieved_chunk(chunk, score=1.0)
        selected.append(item)
        context_size += len(chunk.text)

    logger.info(
        "RAG structured selected=%d chars=%d targets=%s",
        len(selected),
        context_size,
        [
            f"p{item.page_start}:e{item.exercise_number}:{item.item_label or '-'}"
            for item in selected
        ],
    )
    return _format_context(selected), selected


def _retrieve_semantic(
    chunks: list[RAGChunk],
    question: str,
) -> tuple[str | None, list[RetrievedChunk]]:
    question_embedding = embed_query(question)
    question_tokens = _search_tokens(question)
    scored: list[RetrievedChunk] = []

    for chunk in chunks:
        try:
            embedding = json.loads(chunk.embedding)
        except json.JSONDecodeError:
            continue
        semantic_score = cosine_similarity(question_embedding, embedding)
        lexical_score = _lexical_score(question_tokens, _search_tokens(chunk.text))
        if semantic_score < settings.rag_min_score and lexical_score < 0.18:
            continue
        score = semantic_score + (0.2 * lexical_score)
        scored.append(
            _retrieved_chunk(
                chunk,
                score=score,
                semantic_score=semantic_score,
                lexical_score=lexical_score,
            )
        )

    scored.sort(key=lambda item: item.score, reverse=True)
    selected = scored[: settings.rag_top_k]
    if not selected:
        logger.info("RAG semantic retrieval returned no chunks")
        return None, []

    logger.info(
        "RAG semantic selected=%s",
        [
            {
                "page": item.page_start,
                "exercise": item.exercise_number,
                "item": item.item_label,
                "score": round(item.score, 4),
                "semantic": round(item.semantic_score, 4),
                "lexical": round(item.lexical_score, 4),
            }
            for item in selected
        ],
    )
    return _format_context(selected), selected


def _retrieved_chunk(
    chunk: RAGChunk,
    *,
    score: float,
    semantic_score: float = 0.0,
    lexical_score: float = 0.0,
) -> RetrievedChunk:
    return RetrievedChunk(
        document_id=chunk.document_id,
        chunk_id=chunk.id,
        title=chunk.document.filename,
        text=chunk.text,
        score=score,
        semantic_score=semantic_score,
        lexical_score=lexical_score,
        page_start=chunk.page_start,
        page_end=chunk.page_end,
        exercise_number=chunk.exercise_number,
        exercise_ordinal=chunk.exercise_ordinal,
        item_label=chunk.item_label,
    )


def _format_context(chunks: list[RetrievedChunk]) -> str:
    sections: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        metadata = [f"Documento: {chunk.title}"]
        if chunk.page_start:
            page = (
                str(chunk.page_start)
                if chunk.page_start == chunk.page_end or chunk.page_end is None
                else f"{chunk.page_start}-{chunk.page_end}"
            )
            metadata.append(f"Pagina: {page}")
        if chunk.exercise_number:
            metadata.append(f"Ejercicio: {chunk.exercise_number}")
        if chunk.item_label:
            metadata.append(f"Literal: {chunk.item_label}")
        sections.append(
            f"[Fragmento {index} | {' | '.join(metadata)}]\n{chunk.text}"
        )
    return "\n\n".join(sections)


def _reference_not_found_context(
    chunks: list[RAGChunk],
    reference: DocumentReference,
) -> str:
    return (
        "[REFERENCIA ESTRUCTURAL NO ENCONTRADA]\n"
        f"La solicitud ({reference.describe()}) no pudo resolverse de forma segura.\n"
        f"Estructura disponible en el documento activo: {_available_structure(chunks)}.\n"
        "No respondas otro ejercicio o literal. Pide al estudiante que aclare el "
        "numero de ejercicio o el literal."
    )


def _available_structure(chunks: list[RAGChunk]) -> str:
    structure: dict[str, set[str]] = {}
    for chunk in chunks:
        if not chunk.exercise_number:
            continue
        structure.setdefault(chunk.exercise_number, set())
        if chunk.item_label:
            structure[chunk.exercise_number].add(chunk.item_label)
    if not structure:
        return "sin numerales detectados"
    parts = []
    for exercise, items in structure.items():
        suffix = f" (literales {', '.join(sorted(items))})" if items else ""
        parts.append(f"{exercise}{suffix}")
    return "; ".join(parts[:30])


def _ensure_current_indexes(db: Session, document_ids: list[str]) -> None:
    documents = (
        db.query(RAGDocument)
        .filter(RAGDocument.id.in_(document_ids))
        .all()
    )
    for document in documents:
        if document.index_version < INDEX_VERSION:
            logger.info(
                "RAG lazy reindex document=%s from_version=%d",
                document.filename,
                document.index_version,
            )
            reindex_document(db, document)


def link_documents_to_conversation(
    db: Session,
    *,
    conversation_id: str,
    document_ids: list[str],
) -> list[str]:
    unique_ids = list(dict.fromkeys(document_ids))
    if not unique_ids:
        return []

    valid_ids = {
        row[0]
        for row in (
            db.query(RAGDocument.id)
            .filter(RAGDocument.id.in_(unique_ids))
            .all()
        )
    }
    links = {
        link.document_id: link
        for link in (
            db.query(RAGConversationDocument)
            .filter(
                RAGConversationDocument.conversation_id == conversation_id,
                RAGConversationDocument.document_id.in_(valid_ids),
            )
            .all()
        )
    }
    now = time.time()
    for document_id in valid_ids:
        if document_id in links:
            links[document_id].last_used_at = now
        else:
            db.add(
                RAGConversationDocument(
                    conversation_id=conversation_id,
                    document_id=document_id,
                    last_used_at=now,
                )
            )
    db.flush()
    return [document_id for document_id in unique_ids if document_id in valid_ids]


def list_documents(db: Session) -> list[RAGDocument]:
    return db.query(RAGDocument).order_by(RAGDocument.created_at.desc()).all()


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


def _search_tokens(text: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    tokens = re.findall(r"[a-z0-9]+", normalized)
    return {
        _NUMBER_WORDS.get(token, token)
        for token in tokens
        if token not in _STOPWORDS and len(token) > 1
    }


def _lexical_score(query_tokens: set[str], chunk_tokens: set[str]) -> float:
    if not query_tokens or not chunk_tokens:
        return 0.0
    return len(query_tokens & chunk_tokens) / len(query_tokens)
