from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path


SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".tsv"}

_EXERCISE_HEADER_RE = re.compile(
    r"^\s*(?:ejercicio\s+)?(\d{1,3})\s*[.)]\s*(\S.*)$",
    re.IGNORECASE,
)
_NAMED_EXERCISE_HEADER_RE = re.compile(
    r"^\s*(?:ejercicio|pregunta|problema|numeral)\s+(\d{1,3})\s*[:.)-]?\s*(.*)$",
    re.IGNORECASE,
)
_ITEM_HEADER_RE = re.compile(r"^\s*([a-z])\s*[.)]\s*(.*)$", re.IGNORECASE)
_INLINE_ITEM_MARKER_RE = re.compile(r"(?:^|\s)([a-z])\s*[.)]\s+", re.IGNORECASE)


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


@dataclass(frozen=True)
class StructuredChunk:
    text: str
    page_start: int | None = None
    page_end: int | None = None
    exercise_number: str | None = None
    exercise_ordinal: int | None = None
    item_label: str | None = None
    heading: str | None = None


@dataclass
class _ExerciseSection:
    number: str
    ordinal: int
    heading: str
    page_start: int
    lines: list[tuple[int, str]] = field(default_factory=list)

    @property
    def page_end(self) -> int:
        return self.lines[-1][0] if self.lines else self.page_start


def clean_text(text: str) -> str:
    """Normalize extraction noise while preserving structural line breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("/uni02C4", "∧").replace("/uni02C5", "∨")
    text = re.sub(r"([→↔∧∨])(?:\s*\1)+", r"\1", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(path: Path, mime_type: str) -> list[ExtractedPage]:
    suffix = path.suffix.lower()

    if suffix in SUPPORTED_TEXT_EXTENSIONS or mime_type.startswith("text/"):
        text = clean_text(path.read_text(encoding="utf-8", errors="ignore"))
        return [ExtractedPage(page_number=1, text=text)] if text else []

    if suffix == ".pdf" or mime_type == "application/pdf":
        return _extract_pdf_pages(path)

    raise ValueError(
        "Formato no soportado para RAG. Usa PDF, TXT, Markdown, CSV o TSV."
    )


def extract_text(path: Path, mime_type: str) -> str:
    """Compatibility helper returning all pages with explicit page markers."""
    return "\n\n".join(
        f"[Pagina {page.page_number}]\n{page.text}"
        for page in extract_pages(path, mime_type)
    )


def chunk_document(
    pages: list[ExtractedPage],
    *,
    chunk_size: int = 1200,
    overlap: int = 200,
) -> list[StructuredChunk]:
    """Split a document on exercise/literal boundaries before using windows."""
    sections, uncovered_pages = _parse_exercise_sections(pages)
    chunks: list[StructuredChunk] = []

    for section in sections:
        chunks.extend(_chunk_exercise(section, chunk_size=chunk_size))

    for page in uncovered_pages:
        for text_part in _split_long_text(page.text, chunk_size, overlap):
            chunks.append(
                StructuredChunk(
                    text=_with_metadata_prefix(text_part, page.page_number),
                    page_start=page.page_number,
                    page_end=page.page_number,
                )
            )

    return chunks


def chunk_text(
    text: str,
    *,
    chunk_size: int = 1200,
    overlap: int = 200,
) -> list[str]:
    """Legacy plain-text chunker retained for callers without page metadata."""
    text = clean_text(text)
    if not text:
        return []
    return _split_long_text(text, chunk_size, overlap)


def _extract_pdf_pages(path: Path) -> list[ExtractedPage]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "Para indexar PDFs instala la dependencia opcional: pip install pypdf"
        ) from exc

    reader = PdfReader(str(path))
    pages: list[ExtractedPage] = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = clean_text(page.extract_text() or "")
        if page_text:
            pages.append(ExtractedPage(page_number=page_number, text=page_text))
    return pages


def _parse_exercise_sections(
    pages: list[ExtractedPage],
) -> tuple[list[_ExerciseSection], list[ExtractedPage]]:
    sections: list[_ExerciseSection] = []
    pages_with_exercises: set[int] = set()
    current: _ExerciseSection | None = None

    for page in pages:
        for line in page.text.splitlines():
            stripped = line.strip()
            if not stripped:
                if current is not None:
                    current.lines.append((page.page_number, ""))
                continue

            header_match = _EXERCISE_HEADER_RE.match(stripped)
            if header_match is None:
                header_match = _NAMED_EXERCISE_HEADER_RE.match(stripped)

            if header_match is not None:
                if current is not None:
                    sections.append(current)
                number = header_match.group(1)
                heading = header_match.group(2).strip() or f"Ejercicio {number}"
                current = _ExerciseSection(
                    number=number,
                    ordinal=len(sections) + 1,
                    heading=heading,
                    page_start=page.page_number,
                )
                pages_with_exercises.add(page.page_number)
                continue

            if current is not None:
                current.lines.append((page.page_number, stripped))
                pages_with_exercises.add(page.page_number)

    if current is not None:
        sections.append(current)

    uncovered_pages = [
        page for page in pages if page.page_number not in pages_with_exercises
    ]
    return sections, uncovered_pages


def _chunk_exercise(
    section: _ExerciseSection,
    *,
    chunk_size: int,
) -> list[StructuredChunk]:
    preamble: list[tuple[int, str]] = []
    items: list[tuple[str, list[tuple[int, str]]]] = []
    current_item: tuple[str, list[tuple[int, str]]] | None = None

    for page_number, line in section.lines:
        inline_items = _split_inline_items(line)
        if inline_items:
            for item_label, item_text in inline_items:
                if current_item is not None:
                    items.append(current_item)
                current_item = (item_label, [(page_number, item_text)])
        elif current_item is not None:
            current_item[1].append((page_number, line))
        else:
            preamble.append((page_number, line))

    if current_item is not None:
        items.append(current_item)

    if not items:
        return _build_structured_chunks(
            section,
            item_label=None,
            lines=section.lines,
            chunk_size=chunk_size,
        )

    chunks: list[StructuredChunk] = []
    if any(line.strip() for _, line in preamble):
        chunks.extend(
            _build_structured_chunks(
                section,
                item_label=None,
                lines=preamble,
                chunk_size=chunk_size,
            )
        )
    for item_label, lines in items:
        chunks.extend(
            _build_structured_chunks(
                section,
                item_label=item_label,
                lines=lines,
                chunk_size=chunk_size,
            )
        )
    return chunks


def _split_inline_items(line: str) -> list[tuple[str, str]]:
    """Split sequences such as `a) ... b) ... c) ...` on one PDF line."""
    direct_match = _ITEM_HEADER_RE.match(line)
    markers = list(_INLINE_ITEM_MARKER_RE.finditer(line))
    if not markers:
        if direct_match is not None:
            return [(direct_match.group(1).lower(), direct_match.group(2).strip())]
        return []
    if len(markers) == 1:
        if direct_match is None:
            return []
        return [(direct_match.group(1).lower(), direct_match.group(2).strip())]

    labels = [marker.group(1).lower() for marker in markers]
    sequential = all(
        ord(current) == ord(previous) + 1
        for previous, current in zip(labels, labels[1:])
    )
    if markers[0].start() != 0 or not sequential:
        if direct_match is not None:
            return [(direct_match.group(1).lower(), direct_match.group(2).strip())]
        return []

    result: list[tuple[str, str]] = []
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(line)
        result.append((marker.group(1).lower(), line[marker.end() : end].strip()))
    return result


def _build_structured_chunks(
    section: _ExerciseSection,
    *,
    item_label: str | None,
    lines: list[tuple[int, str]],
    chunk_size: int,
) -> list[StructuredChunk]:
    content = clean_text("\n".join(line for _, line in lines))
    if not content:
        content = section.heading
    page_start = lines[0][0] if lines else section.page_start
    page_end = lines[-1][0] if lines else section.page_end
    prefix = _metadata_prefix(
        page_start=page_start,
        page_end=page_end,
        exercise_number=section.number,
        heading=section.heading,
        item_label=item_label,
    )
    available = max(300, chunk_size - len(prefix) - 2)
    parts = _split_long_text(content, available, overlap=0)
    return [
        StructuredChunk(
            text=f"{prefix}\n{part}",
            page_start=page_start,
            page_end=page_end,
            exercise_number=section.number,
            exercise_ordinal=section.ordinal,
            item_label=item_label,
            heading=section.heading,
        )
        for part in parts
    ]


def _metadata_prefix(
    *,
    page_start: int,
    page_end: int,
    exercise_number: str,
    heading: str,
    item_label: str | None,
) -> str:
    page_label = str(page_start) if page_start == page_end else f"{page_start}-{page_end}"
    parts = [f"Pagina {page_label}", f"Ejercicio {exercise_number}: {heading}"]
    if item_label:
        parts.append(f"Literal {item_label}")
    return "[" + " | ".join(parts) + "]"


def _with_metadata_prefix(text: str, page_number: int) -> str:
    return f"[Pagina {page_number}]\n{text}"


def _split_long_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = clean_text(text)
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        hard_end = min(len(text), start + chunk_size)
        end = hard_end
        if hard_end < len(text):
            newline = text.rfind("\n", start + (chunk_size // 2), hard_end)
            sentence = text.rfind(". ", start + (chunk_size // 2), hard_end)
            end = max(newline, sentence + 1)
            if end <= start:
                end = hard_end
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks
