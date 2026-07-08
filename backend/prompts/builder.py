from backend.prompts.system_prompt import SYSTEM_PROMPT
from backend.prompts.output_format import OUTPUT_FORMAT


def build_prompt(question: str, history: list[dict] | None = None) -> str:
    """
    Build the full prompt for the LLM.

    Args:
        question: The student's current question.
        history:  Optional list of {role, content} dicts for conversation context.
                  Each dict has 'role' ('user'|'assistant') and 'content' (plain text).
    """
    # Build history section if provided and non-empty
    history_section = ""
    if history:
        lines = []
        for msg in history:
            role_label = "Estudiante" if msg["role"] == "user" else "Tutor"
            lines.append(f"{role_label}: {msg['content']}")
        if lines:
            history_block = "\n\n".join(lines)
            history_section = (
                "\n[Historial de la conversación actual — "
                "úsalo para mantener coherencia y continuidad]\n"
                f"{history_block}\n"
                "[Fin del historial]\n"
            )

    return f"""\
{OUTPUT_FORMAT}

{SYSTEM_PROMPT}
{history_section}
Student question:
{question}
""".strip()
