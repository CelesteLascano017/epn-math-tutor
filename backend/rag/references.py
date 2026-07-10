from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


_CARDINALS = {
    "uno": 1,
    "una": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
    "once": 11,
    "doce": 12,
    "trece": 13,
    "catorce": 14,
    "quince": 15,
    "dieciseis": 16,
    "diecisiete": 17,
    "dieciocho": 18,
    "diecinueve": 19,
    "veinte": 20,
}
_ORDINALS = {
    "primer": 1,
    "primero": 1,
    "primera": 1,
    "segundo": 2,
    "segunda": 2,
    "tercer": 3,
    "tercero": 3,
    "tercera": 3,
    "cuarto": 4,
    "cuarta": 4,
    "quinto": 5,
    "quinta": 5,
    "sexto": 6,
    "sexta": 6,
    "septimo": 7,
    "septima": 7,
    "octavo": 8,
    "octava": 8,
    "noveno": 9,
    "novena": 9,
    "decimo": 10,
    "decima": 10,
}
_NUMBER_TOKEN = r"\d{1,3}|" + "|".join(_CARDINALS)
_ORDINAL_TOKEN = "|".join(_ORDINALS)
_UNIT = r"ejercicio|pregunta|problema|numeral"

_NUMBER_AFTER_UNIT_RE = re.compile(
    rf"\b(?:{_UNIT})\s*(?:n(?:umero)?\s*)?(?P<number>{_NUMBER_TOKEN})\b"
)
_ORDINAL_BEFORE_UNIT_RE = re.compile(
    rf"\b(?P<ordinal>{_ORDINAL_TOKEN})\s+(?:{_UNIT})\b"
)
_ORDINAL_AFTER_UNIT_RE = re.compile(
    rf"\b(?:{_UNIT})\s+(?P<ordinal>{_ORDINAL_TOKEN})\b"
)
_ITEM_RE = re.compile(r"\b(?:literal|inciso|apartado)\s+(?P<label>[a-z])\b")


@dataclass(frozen=True)
class DocumentReference:
    exercise_number: str | None = None
    exercise_ordinal: int | None = None
    item_label: str | None = None
    relation: str | None = None
    resolved: bool = True
    raw: str = ""

    @property
    def is_structured(self) -> bool:
        return any(
            (
                self.exercise_number,
                self.exercise_ordinal,
                self.item_label,
                self.relation,
            )
        )

    def describe(self) -> str:
        parts: list[str] = []
        if self.exercise_number:
            parts.append(f"ejercicio={self.exercise_number}")
        if self.exercise_ordinal:
            parts.append(f"ordinal={self.exercise_ordinal}")
        if self.item_label:
            parts.append(f"literal={self.item_label}")
        if self.relation:
            parts.append(f"relacion={self.relation}")
        parts.append(f"resuelta={self.resolved}")
        return ", ".join(parts)


def resolve_document_reference(
    question: str,
    history: list[dict] | None = None,
) -> DocumentReference | None:
    """Resolve explicit and relative exercise references within one chat."""
    state: DocumentReference | None = None
    for message in history or []:
        if message.get("role") != "user":
            continue
        parsed, mentioned = _apply_reference(message.get("content", ""), state)
        if mentioned:
            state = parsed

    current, mentioned = _apply_reference(question, state)
    return current if mentioned else None


def _apply_reference(
    text: str,
    base: DocumentReference | None,
) -> tuple[DocumentReference | None, bool]:
    normalized = _normalize(text)
    number_match = _NUMBER_AFTER_UNIT_RE.search(normalized)
    ordinal_match = (
        _ORDINAL_BEFORE_UNIT_RE.search(normalized)
        or _ORDINAL_AFTER_UNIT_RE.search(normalized)
    )
    item_match = _ITEM_RE.search(normalized)
    relation = _relation(normalized)
    mentioned = any((number_match, ordinal_match, item_match, relation))
    if not mentioned:
        return base, False

    exercise_number: str | None = None
    exercise_ordinal: int | None = None
    item_label: str | None = None

    if number_match:
        exercise_number = str(_number_value(number_match.group("number")))
    elif ordinal_match:
        exercise_ordinal = _ORDINALS[ordinal_match.group("ordinal")]
    elif base is not None:
        exercise_number = base.exercise_number
        exercise_ordinal = base.exercise_ordinal

    if item_match:
        item_label = item_match.group("label")
    elif base is not None and not number_match and not ordinal_match:
        item_label = base.item_label

    if relation:
        unit_hint = _relative_unit(normalized)
        shifted = _shift_reference(
            DocumentReference(
                exercise_number=exercise_number,
                exercise_ordinal=exercise_ordinal,
                item_label=item_label,
                raw=text,
            ),
            relation=relation,
            unit_hint=unit_hint,
        )
        return shifted, True

    resolved = bool(exercise_number or exercise_ordinal)
    if item_label and not resolved:
        resolved = False
    return (
        DocumentReference(
            exercise_number=exercise_number,
            exercise_ordinal=exercise_ordinal,
            item_label=item_label,
            resolved=resolved,
            raw=text,
        ),
        True,
    )


def _shift_reference(
    reference: DocumentReference,
    *,
    relation: str,
    unit_hint: str | None,
) -> DocumentReference:
    delta = 1 if relation == "next" else -1
    use_item = unit_hint == "item" or (
        unit_hint is None and reference.item_label is not None
    )

    if use_item and reference.item_label:
        next_code = ord(reference.item_label) + delta
        if ord("a") <= next_code <= ord("z"):
            return DocumentReference(
                exercise_number=reference.exercise_number,
                exercise_ordinal=reference.exercise_ordinal,
                item_label=chr(next_code),
                relation=relation,
                resolved=bool(reference.exercise_number or reference.exercise_ordinal),
                raw=reference.raw,
            )

    if reference.exercise_number and reference.exercise_number.isdigit():
        target = int(reference.exercise_number) + delta
        if target >= 1:
            return DocumentReference(
                exercise_number=str(target),
                relation=relation,
                resolved=True,
                raw=reference.raw,
            )

    if reference.exercise_ordinal:
        target = reference.exercise_ordinal + delta
        if target >= 1:
            return DocumentReference(
                exercise_ordinal=target,
                relation=relation,
                resolved=True,
                raw=reference.raw,
            )

    return DocumentReference(relation=relation, resolved=False, raw=reference.raw)


def _relation(text: str) -> str | None:
    if re.search(r"\b(?:siguiente|proximo|proxima)\b", text):
        return "next"
    if re.search(r"\b(?:anterior|previo|previa)\b", text):
        return "previous"
    return None


def _relative_unit(text: str) -> str | None:
    if re.search(r"\b(?:literal|inciso|apartado)\b", text):
        return "item"
    if re.search(rf"\b(?:{_UNIT})\b", text):
        return "exercise"
    return None


def _number_value(token: str) -> int:
    return int(token) if token.isdigit() else _CARDINALS[token]


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(
        char for char in normalized if not unicodedata.combining(char)
    )
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()
