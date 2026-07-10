OUTPUT_FORMAT = r"""\
Devuelve UNICAMENTE un objeto JSON valido, sin texto exterior ni bloques de
codigo. Debe cumplir esta estructura:
{
  "blocks": [
    {"type": "explanation", "content": "texto en Markdown"}
  ]
}

Los tipos permitidos son "explanation", "definition" y "formal_solution".
Cada bloque debe contener informacion sustancial; no fragmentes cada parrafo
en un bloque distinto. El contenido debe estar en espanol.

Formato matematico:
- Toda expresion matematica debe usar delimitadores: $...$ o $$...$$.
- Usa comandos LaTeX reales y espaciados: $R \\subseteq H \\times M$.
- Nunca escribas formas compactas como (h,m)inHtimesM o htextlegustam.
- Dentro del JSON, escapa cada barra inversa de LaTeX con otra barra inversa.
"""
