from backend.prompts.system_prompt import SYSTEM_PROMPT
from backend.prompts.output_format import OUTPUT_FORMAT


def build_prompt(
    question: str, 
    history: list[dict] | None = None,
    rag_context: str | None = None
) -> str:
    """
    Build the full prompt for the LLM.

    Args:
        question: The student's current question.
        history:  Optional list of {role, content} dicts for conversation context.
                  Each dict has 'role' ('user'|'assistant') and 'content' (plain text).
        rag_context: Optional context extracted from PDFs for RAG.
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

    rag_section = ""
    if rag_context:
        rag_section = (
            "\n[Contexto adicional extraído de documentos del usuario]\n"
            "Usa este contexto cuando sea relevante. Si no contiene la respuesta, "
            "dilo con claridad y no inventes citas.\n"
            f"{rag_context}\n"
            "[Fin del contexto]\n"
        )

    return f"""\
{OUTPUT_FORMAT}

{SYSTEM_PROMPT}
{history_section}
{rag_section}
Student question:
{question}
""".strip()


def build_messages(
    question: str, 
    history: list[dict] | None = None,
    rag_context: str | None = None
) -> list[dict]:
    """
    Build a structured list of messages for the Ollama /api/chat endpoint.
    
    Returns a list of dicts: [{"role": "system", "content": "..."}, ...]
    """
    messages = []
    
    # 1. System prompt (includes the output format rules)
    system_content = f"{OUTPUT_FORMAT}\n\n{SYSTEM_PROMPT}".strip()
    
    # Future RAG support: Inject context into the system prompt instructions
    if rag_context:
        system_content += (
            "\n\n[Contexto adicional extraído de documentos del usuario]\n"
            "Usa este contexto cuando sea relevante. Si no contiene la respuesta, "
            "dilo con claridad y no inventes citas.\n"
            f"{rag_context}\n"
            "[Fin del contexto]"
        )
        
    messages.append({"role": "system", "content": system_content})
    
    # 2. Conversation history
    if history:
        for msg in history:
            messages.append({
                "role": msg["role"], 
                "content": msg["content"]
            })
            
    # 3. Current user question
    messages.append({"role": "user", "content": question})
    
    return messages
