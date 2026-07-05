OUTPUT_FORMAT = """
Return your answer as valid JSON using exactly this structure:

{
  "blocks": [
    {
      "type": "explanation",
      "content": "..."
    },
    {
      "type": "definition",
      "content": "..."
    },
    {
      "type": "formal_solution",
      "content": "..."
    }
  ]
}

Output rules:
- Return only valid JSON.
- Do not include Markdown code fences.
- Do not include text before or after the JSON.
- Use only these block types: "explanation", "definition", and "formal_solution".
- Include only the blocks that are necessary for the response.
- Preserve the order in which the student should read the blocks.
- Write the content shown to the student in Spanish.
"""