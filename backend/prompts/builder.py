from backend.prompts.system_prompt import SYSTEM_PROMPT
from backend.prompts.output_format import OUTPUT_FORMAT


def build_prompt(question: str) -> str:
    return f"""\
{OUTPUT_FORMAT}

{SYSTEM_PROMPT}

Student question:
{question}
""".strip()
