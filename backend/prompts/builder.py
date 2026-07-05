from backend.prompts.system_prompt import SYSTEM_PROMPT
from backend.prompts.output_format import OUTPUT_FORMAT


def build_prompt(question: str) -> str:
    return f"""
{SYSTEM_PROMPT}

{OUTPUT_FORMAT}

Student question:
{question}
""".strip()
