import json
import re

from backend.llm.colab import generate_response as colab_generate_response
from backend.prompts.builder import build_prompt
from backend.schemas.chat import ContentBlock, TutorResponse


# ---------------------------------------------------------------------------
# JSON sanitiser
# ---------------------------------------------------------------------------

_VALID_JSON_ESCAPES = set('"\\/' 'bfnrtu')


def _fix_backslashes(raw: str) -> str:
    """
    Scan the raw string character-by-character and double every backslash
    that is NOT followed by a valid JSON escape character.

    This correctly handles the tricky case where the LLM writes LaTeX like
    '\\neg' or '\\lor': the 'n' in '\\neg' is a valid JSON escape on its own
    (\\n = newline), but the INTENT is a LaTeX command.  We detect this by
    checking whether the character sequence after the backslash is actually a
    two-char LaTeX command instead of a lone escape letter.

    Strategy:
      - We operate outside of JSON string boundaries (we do a simple scan,
        not a full JSON parser).  The heuristic is: if a backslash is inside
        a JSON string and the next char is a valid JSON escape letter BUT the
        char after that is also a letter (i.e. it looks like \\neg, \\lor,
        \\Rightarrow), then it's a LaTeX command, not an escape — double it.
      - Otherwise follow the standard JSON escape rule.
    """
    result = []
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch != '\\':
            result.append(ch)
            i += 1
            continue

        # We have a backslash at position i
        next_ch = raw[i + 1] if i + 1 < n else ''

        if next_ch not in _VALID_JSON_ESCAPES:
            # Definitely invalid escape — double it
            result.append('\\\\')
            i += 1
            continue

        if next_ch == 'u':
            # \uXXXX — keep as-is, advance 6 chars
            result.append(raw[i:i + 6])
            i += 6
            continue

        # next_ch is one of: " \ / b f n r t
        # Check if the chars after next_ch form a letter sequence → LaTeX cmd
        # e.g.  \neg  →  next_ch='n', raw[i+2]='e'  → LaTeX, double it
        #        \n    →  next_ch='n', raw[i+2]='"'  → real newline, keep it
        after_next = raw[i + 2] if i + 2 < n else ''
        if next_ch in 'bfnrt' and after_next.isalpha():
            # Looks like a LaTeX command starting with one of b/f/n/r/t
            result.append('\\\\')
            i += 1  # don't consume next_ch — it's part of the LaTeX name
        else:
            # Legitimate JSON escape
            result.append('\\')
            result.append(next_ch)
            i += 2

    return ''.join(result)


def _sanitize_json(raw: str) -> str:
    """
    Fix common LLM JSON mistakes before parsing.

    1. Fix invalid/ambiguous backslash escapes (LaTeX inside JSON strings).
    2. Strip accidental markdown code fences around the JSON.
    """
    # Step 1: fix backslashes
    fixed = _fix_backslashes(raw)

    # Step 2: strip any accidental markdown fences
    fixed = fixed.strip()
    if fixed.startswith("```"):
        fixed = re.sub(r'^```[a-z]*\n?', '', fixed)
        fixed = re.sub(r'\n?```$', '', fixed.rstrip())

    return fixed


def _wrap_plain_text_response(text: str) -> TutorResponse:
    """
    Called when the LLM returned valid Markdown text instead of JSON.

    Rather than showing a generic error, we wrap the raw content in the
    most appropriate block type so the student still sees a useful answer.

    Heuristic:
      - If the text contains numbered list steps AND math ($...$), it looks
        like a formal proof/solution → wrap in 'formal_solution'.
      - Otherwise → wrap in 'explanation'.
    """
    text = text.strip()
    has_numbered_steps = bool(re.search(r'^\d+\.', text, re.MULTILINE))
    has_math = '$' in text

    block_type = "formal_solution" if (has_numbered_steps and has_math) else "explanation"
    print(f"[service] Wrapping plain-text response as '{block_type}'")

    return TutorResponse(blocks=[ContentBlock(type=block_type, content=text)])


def _error_response(message: str) -> TutorResponse:
    """Returns a graceful error block when there is truly nothing to show."""
    return TutorResponse(blocks=[ContentBlock(type="explanation", content=message)])


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_response(question: str) -> TutorResponse:
    prompt = build_prompt(question)
    raw_response = colab_generate_response(prompt)

    print("RAW COLAB RESPONSE:")
    print(raw_response)

    sanitized = _sanitize_json(raw_response)

    # ── Try to parse as JSON ──────────────────────────────────────────────────
    try:
        parsed_response = json.loads(sanitized)
    except json.JSONDecodeError as exc:
        print(f"[service] JSONDecodeError after sanitisation: {exc}")

        # If the sanitised string is non-empty, the model returned real content
        # but ignored the JSON format.  Wrap it so the student sees the answer.
        if sanitized.strip():
            return _wrap_plain_text_response(sanitized)

        # Truly empty or unparseable — show a generic error.
        return _error_response(
            "El tutor no pudo formatear su respuesta. "
            "Por favor, intenta de nuevo."
        )

    # ── Validate the parsed structure ─────────────────────────────────────────
    try:
        validated_response = TutorResponse.model_validate(parsed_response)
    except Exception as exc:
        print(f"[service] Validation error: {exc}")
        return _error_response(
            "El tutor devolvió una respuesta con estructura inesperada. "
            "Por favor, intenta de nuevo."
        )

    return validated_response