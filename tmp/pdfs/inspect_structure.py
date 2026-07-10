from collections import defaultdict
from pathlib import Path

from backend.rag.text import chunk_document, extract_pages


for path in Path("data/rag_uploads").glob("*.pdf"):
    pages = extract_pages(path, "application/pdf")
    chunks = chunk_document(pages, chunk_size=1200, overlap=200)
    structure: dict[str, set[str]] = defaultdict(set)
    for chunk in chunks:
        if chunk.exercise_number and chunk.item_label:
            structure[chunk.exercise_number].add(chunk.item_label)
        elif chunk.exercise_number:
            structure.setdefault(chunk.exercise_number, set())
    print(
        f"--- {path.name}: pages={len(pages)} chunks={len(chunks)} "
        f"structured={sum(c.exercise_number is not None for c in chunks)}"
    )
    print("structure", [(key, sorted(value)) for key, value in structure.items()])
    print(
        "first",
        [
            (
                chunk.page_start,
                chunk.exercise_number,
                chunk.exercise_ordinal,
                chunk.item_label,
                chunk.heading,
            )
            for chunk in chunks[:15]
        ],
    )
