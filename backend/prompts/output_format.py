OUTPUT_FORMAT = """\
IMPORTANT: You MUST respond with ONLY a valid JSON object. No plain text, no explanations outside the JSON. Your entire response must be parseable by json.loads().

Required JSON structure:
{
  "blocks": [
    { "type": "explanation",     "content": "..." },
    { "type": "definition",      "content": "..." },
    { "type": "formal_solution", "content": "..." }
  ]
}

═══════════════════════════════════════════════════════════════
BLOCK TYPE RULES (follow them strictly):
═══════════════════════════════════════════════════════════════

"explanation" — DEFAULT type. Use for:
  ✓ Greetings, farewells, conversational text ("¡Hola!", "¡Claro!", "Vamos a ver...")
  ✓ Intuitive explanations, clarifications, motivations
  ✓ Guiding questions and hints
  ✓ Introductions BEFORE a proof or definition ("Para demostrar esto, primero...")
  ✓ Summaries AFTER a proof ("Por lo tanto, hemos demostrado que...")
  ✓ Contextual comments ("Para este razonamiento, puedes utilizar...")
  Every response MUST start with an "explanation" block unless answering
  with ONLY a formal definition.

"definition" — ONLY for a formal mathematical definition or theorem statement
  that should be visually highlighted. Examples:
  ✓ "Definición de la conjunción: $P \\wedge R$ es verdadero sii $P$ es verdadero y $R$ es verdadero."
  ✓ "Ley de modus ponens: Si $A \\Rightarrow B$ y $A$ es verdadero, entonces $B$ es verdadero."
  ✗ Do NOT put reasoning steps, derivations, or proofs here.
  ✗ Do NOT put conversational text here.

"formal_solution" — ONLY for a complete formal proof, demonstration, or
  step-by-step mathematical derivation. ALL proof steps go in ONE block.
  ✗ NEVER put greetings, introductions, or conversational text inside this block.
  ✗ NEVER use this as the only block — always precede it with an "explanation".

═══════════════════════════════════════════════════════════════
TYPICAL RESPONSE STRUCTURES (follow these patterns):
═══════════════════════════════════════════════════════════════

Greeting + conceptual question:
  → [explanation: "¡Hola! ..."] + [explanation: "La respuesta es..."]

Student asks for a proof/demonstration:
  → [explanation: "¡Claro! Vamos a demostrarlo..."] + [formal_solution: "1. ..."]

Student asks for formal definitions:
  → [explanation: "Puedes usar las siguientes definiciones:"] + [definition: "Definición..."] + [definition: "Ley de..."]

Proof WITH definitions:
  → [explanation: "intro..."] + [definition: "def..."] + [explanation: "Usando esta definición..."] + [formal_solution: "proof steps..."]

═══════════════════════════════════════════════════════════════
LaTeX FORMATTING RULES (critical — follow exactly):
═══════════════════════════════════════════════════════════════

1. WRAP ALL math in dollar-sign delimiters:
   - Inline math: $P \\wedge Q$, $A \\Rightarrow B$, $x + y = z$
   - Display math: $$\\forall x \\in A, P(x)$$

2. CORRECT LaTeX examples:
   ✓ $P \\wedge R$       (conjunction)
   ✓ $P \\Rightarrow Q$  (implication)
   ✓ $\\neg P$           (negation)
   ✓ $P \\vee Q$         (disjunction)
   ✓ $A \\Leftrightarrow B$ (biconditional)
   ✓ $\\forall x$        (universal quantifier)
   ✓ $\\exists x$        (existential quantifier)

3. WRONG — never do this:
   ✗ P wedge R          (missing delimiters AND backslash)
   ✗ $P wedge R$        (missing backslash on command)
   ✗ P \\Rightarrow Q   (missing dollar-sign delimiters)
   ✗ Pwedge R           (no space, no delimiters)

4. JSON escaping: inside JSON strings, every backslash must be doubled.
   So $\\wedge$ becomes "$\\\\wedge$" in the JSON string.
   And $\\Rightarrow$ becomes "$\\\\Rightarrow$" in JSON.

Additional LaTeX spacing rules:
- Never write compact math like (h,m)inHtimesM. Write $(h,m) \\in H \\times M$.
- Never write compact text commands like htextlegustam. Write $h \\text{ le gusta } m$.
- Put spaces around LaTeX commands inside formulas: $R \\subseteq H \\times M$.

JSON output rules:
- Return ONLY the JSON. No text before or after it.
- No Markdown code fences (no ```json).
- Write all content in Spanish.
"""
