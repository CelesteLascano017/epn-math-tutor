import json
import re
import requests

from backend.config import LLMProvider, settings
from backend.llm.colab import generate_response as colab_generate_response
from backend.llm.ollama import generate_response as ollama_generate_response
from backend.prompts.builder import build_messages, build_prompt
from backend.schemas.chat import ContentBlock, TutorResponse


# ---------------------------------------------------------------------------
# Provider dispatch
# ---------------------------------------------------------------------------

def _call_llm(
    question: str, 
    history: list[dict] | None = None,
    rag_context: str | None = None,
    provider_override: LLMProvider | None = None,
) -> str:
    """
    Route the request to the currently active LLM provider.

    Ollama uses a structured messages list (/api/chat).
    ngrok (Colab) uses a flat string prompt (/api/generate).
    """
    provider = provider_override or settings.active_provider

    if provider == LLMProvider.OLLAMA:
        print(f"[service] Using Ollama  → {settings.ollama_url}  model={settings.ollama_model}")
        messages = build_messages(question, history=history, rag_context=rag_context)
        return ollama_generate_response(messages)

    # Default: ngrok / Colab
    print(f"[service] Using ngrok  → {settings.ngrok_url}")
    prompt = build_prompt(question, history=history, rag_context=rag_context)
    return colab_generate_response(prompt)


# ---------------------------------------------------------------------------
# JSON sanitiser — handles LaTeX backslashes inside JSON strings
# ---------------------------------------------------------------------------

_VALID_JSON_ESCAPES = set('"\\/bfnrtu')


def _fix_backslashes(raw: str) -> str:
    """
    Scan char-by-char and double every backslash that is NOT a valid JSON
    escape. Correctly differentiates LaTeX \\neg (letter after n) from
    real JSON \\n (newline, non-letter after n).
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

        next_ch = raw[i + 1] if i + 1 < n else ''

        if next_ch not in _VALID_JSON_ESCAPES:
            result.append('\\\\')
            i += 1
            continue

        if next_ch == 'u':
            result.append(raw[i:i + 6])
            i += 6
            continue

        after_next = raw[i + 2] if i + 2 < n else ''
        if next_ch in 'bfnrt' and after_next.isalpha():
            # LaTeX command starting with one of b/f/n/r/t (e.g. \neg, \forall)
            result.append('\\\\')
            i += 1
        else:
            # Legitimate JSON escape (actual \n, \t, etc.)
            result.append('\\')
            result.append(next_ch)
            i += 2

    return ''.join(result)


def _sanitize_json(raw: str) -> str:
    """Fix common LLM JSON mistakes before parsing."""
    fixed = _fix_backslashes(raw)
    fixed = fixed.strip()
    if fixed.startswith('```'):
        fixed = re.sub(r'^```[a-z]*\n?', '', fixed)
        fixed = re.sub(r'\n?```$', '', fixed.rstrip())
    return fixed


# ---------------------------------------------------------------------------
# Fallback helpers
# ---------------------------------------------------------------------------

def _wrap_plain_text_response(text: str) -> TutorResponse:
    """
    When the LLM ignores the JSON format and returns plain Markdown,
    wrap the content in the most appropriate block type rather than
    showing a generic error.
    """
    text = text.strip()
    has_numbered_steps = bool(re.search(r'^\d+\.', text, re.MULTILINE))
    has_math = '$' in text
    block_type = "formal_solution" if (has_numbered_steps and has_math) else "explanation"
    print(f"[service] Wrapping plain-text response as '{block_type}'")
    return TutorResponse(blocks=[ContentBlock(type=block_type, content=text)])


def _error_response(message: str) -> TutorResponse:
    return TutorResponse(blocks=[ContentBlock(type="explanation", content=message)])


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_response(
    question: str,
    history: list[dict] | None = None,
    rag_context: str | None = None,
    provider: LLMProvider | None = None,
) -> TutorResponse:
    """
    Generate a tutor response for the given question.

    Args:
        question: The student's current question.
        history:  Optional list of previous {role, content} dicts representing
                  the conversation so far (excluding the current question).
                  Used to build conversation context in the prompt.
        rag_context: Optional context extracted from uploaded documents.
    """
    try:
        raw_response = _call_llm(
            question,
            history=history,
            rag_context=rag_context,
            provider_override=provider,
        )
    except requests.exceptions.HTTPError as exc:
        err_msg = "Error de comunicación con el modelo de IA."
        if exc.response is not None:
            if exc.response.status_code == 404:
                err_msg = f"No se encontró el modelo '{settings.ollama_model}' en el servidor Ollama. Verifica el nombre en los Ajustes."
            else:
                err_msg = f"El servidor LLM reportó un error ({exc.response.status_code}). Verifica la consola."
        print(f"[service] HTTP Error: {exc}")
        return _error_response(err_msg)
    except Exception as exc:
        print(f"[service] LLM connection error: {exc}")
        return _error_response("No se pudo conectar con el proveedor de IA. Revisa tu conexión o configuración.")

    print("RAW LLM RESPONSE:")
    print(raw_response)

    sanitized = _sanitize_json(raw_response)

    # ── Try to parse as JSON ──────────────────────────────────────────────────
    try:
        parsed_response = json.loads(sanitized)
    except json.JSONDecodeError as exc:
        print(f"[service] JSONDecodeError after sanitisation: {exc}")
        if sanitized.strip():
            return _wrap_plain_text_response(sanitized)
        return _error_response(
            "El tutor no pudo formatear su respuesta. Por favor, intenta de nuevo."
        )

    # ── Validate the parsed structure ─────────────────────────────────────────
    try:
        validated_response = TutorResponse.model_validate(parsed_response)
    except Exception as exc:
        print(f"[service] Validation error: {exc}")
        return _error_response(
            "El tutor devolvió una respuesta con estructura inesperada. Por favor, intenta de nuevo."
        )

    return validated_response
