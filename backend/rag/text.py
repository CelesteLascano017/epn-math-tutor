from __future__ import annotations

import re
from pathlib import Path


SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".tsv"}


def clean_text(text: str) -> str:
    """Normalize whitespace while preserving paragraph boundaries."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(path: Path, mime_type: str) -> str:
    suffix = path.suffix.lower()

    if suffix in SUPPORTED_TEXT_EXTENSIONS or mime_type.startswith("text/"):
        return clean_text(path.read_text(encoding="utf-8", errors="ignore"))

    if suffix == ".pdf" or mime_type == "application/pdf":
        return clean_text(_extract_pdf_text(path))

    raise ValueError(
        "Formato no soportado para RAG. Usa PDF, TXT, Markdown, CSV o TSV."
    )


def _extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "Para indexar PDFs instala la dependencia opcional: pip install pypdf"
        ) from exc

    reader = PdfReader(str(path))
    pages = []
    for page_num, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(f"[Pagina {page_num}]\n{page_text}")
    return "\n\n".join(pages)


def chunk_text(
    text: str,
    *,
    chunk_size: int = 1200,
    overlap: int = 200,
) -> list[str]:
    """
    Split text into overlapping character chunks on paragraph boundaries when
    possible. Character windows are simple, deterministic, and tokenizer-free.
    """
    text = clean_text(text)
    if not text:
        return []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current:
                chunks.append(current.strip())
                current = ""
            chunks.extend(_split_long_text(paragraph, chunk_size, overlap))
            continue

        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            chunks.append(current.strip())
            current = paragraph

    if current:
        chunks.append(current.strip())

    if overlap <= 0 or len(chunks) <= 1:
        return chunks

    overlapped = [chunks[0]]
    for idx in range(1, len(chunks)):
        prev_tail = chunks[idx - 1][-overlap:].strip()
        overlapped.append(f"{prev_tail}\n\n{chunks[idx]}".strip())
    return overlapped


def _split_long_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    chunks = []
    start = 0
    step = max(1, chunk_size - overlap)
    while start < len(text):
        chunks.append(text[start : start + chunk_size].strip())
        start += step
    return [chunk for chunk in chunks if chunk]
