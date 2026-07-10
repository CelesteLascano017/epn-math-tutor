from backend.prompts.output_format import OUTPUT_FORMAT
from backend.prompts.system_prompt import SYSTEM_PROMPT


def _document_section(rag_context: str | None) -> str:
    if not rag_context:
        return ""
    return (
        "\n\n[CONTEXTO DEL DOCUMENTO DE ESTA CONVERSACION]\n"
        "Los fragmentos y su metadata son la fuente principal para la pregunta. "
        "Respeta exactamente Documento, Pagina, Ejercicio y Literal. No mezcles "
        "fragmentos de otros numerales ni completes huecos con otro ejercicio. "
        "Si aparece REFERENCIA ESTRUCTURAL NO ENCONTRADA, no intentes resolver "
        "una pregunta parecida: pide una aclaracion concreta.\n"
        f"{rag_context}\n"
        "[FIN DEL CONTEXTO DEL DOCUMENTO]"
    )


def build_prompt(
    question: str,
    history: list[dict] | None = None,
    rag_context: str | None = None,
) -> str:
    """Build the flat prompt used by the legacy Colab provider."""
    history_section = ""
    if history:
        turns = []
        for message in history:
            role = "Estudiante" if message["role"] == "user" else "Tutor"
            turns.append(f"{role}: {message['content']}")
        history_section = (
            "\n\n[HISTORIAL DE ESTA CONVERSACION]\n"
            + "\n\n".join(turns)
            + "\n[FIN DEL HISTORIAL]"
        )

    return (
        f"{OUTPUT_FORMAT}\n\n{SYSTEM_PROMPT}"
        f"{history_section}{_document_section(rag_context)}"
        f"\n\nPregunta actual del estudiante:\n{question}"
    ).strip()


def build_messages(
    question: str,
    history: list[dict] | None = None,
    rag_context: str | None = None,
) -> list[dict]:
    """Build structured messages for Ollama's /api/chat endpoint."""
    system_content = (
        f"{OUTPUT_FORMAT}\n\n{SYSTEM_PROMPT}{_document_section(rag_context)}"
    ).strip()
    messages = [{"role": "system", "content": system_content}]
    if history:
        messages.extend(
            {"role": message["role"], "content": message["content"]}
            for message in history
            if message.get("role") in {"user", "assistant"}
        )
    messages.append({"role": "user", "content": question})
    return messages
