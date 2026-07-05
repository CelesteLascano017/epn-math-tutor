from backend.prompts.system_prompt import SYSTEM_PROMPT


def build_prompt(question: str) -> str:
    return f"""
{SYSTEM_PROMPT}

Student question:
{question}
""".strip()
