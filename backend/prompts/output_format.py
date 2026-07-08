OUTPUT_FORMAT = """\
IMPORTANT: You MUST respond with ONLY a valid JSON object. No plain text, no explanations outside the JSON. Your entire response must be parseable by json.loads().

Required JSON structure:
{
  "blocks": [
    { "type": "explanation",    "content": "..." },
    { "type": "definition",     "content": "..." },
    { "type": "formal_solution","content": "..." }
  ]
}

Block type rules:

"explanation" — DEFAULT type. Use for ALL normal tutoring: introductions,
  intuitive explanations, clarifications, guiding questions, examples.
  Every response MUST have at least one "explanation" block unless the entire
  answer is a formal definition.

"definition" — ONLY for a formal mathematical definition that should be
  highlighted. Do NOT use this for reasoning steps or derivations.
  A response rarely needs more than one or two definition blocks.

"formal_solution" — ONLY for a complete proof, demonstration, or structured
  step-by-step solution. ALL steps go in ONE block, not multiple blocks.

Typical structures:
  Conceptual question  →  [explanation]
  Definition question  →  [explanation] + [definition] + [explanation]
  Proof/solution       →  [explanation] + [formal_solution]

JSON output rules:
- Return ONLY the JSON. No text before or after it.
- No Markdown code fences (no ```json).
- Escape all LaTeX backslashes as \\\\ (e.g. \\\\neg, \\\\Rightarrow, \\\\wedge).
- IMPORTANT: You MUST wrap all math symbols and equations in $ ... $ for inline math or $$ ... $$ for display math. If you don't use $...$, the math will not render correctly.
- Write all content in Spanish.
"""