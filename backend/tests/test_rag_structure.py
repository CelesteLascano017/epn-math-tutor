import unittest

from backend.rag.references import resolve_document_reference
from backend.rag.text import ExtractedPage, chunk_document


class StructuredChunkingTests(unittest.TestCase):
    def test_preserves_exercises_and_literals(self):
        pages = [
            ExtractedPage(
                page_number=1,
                text=(
                    "Cabecera\n"
                    "1. Simboliza las proposiciones:\n"
                    "a. Primera proposicion.\n"
                    "b. Segunda proposicion.\n"
                    "2. Resuelve la ecuacion:\n"
                    "a) x + 2 = 5."
                ),
            )
        ]

        chunks = chunk_document(pages, chunk_size=500, overlap=50)

        structure = [
            (chunk.exercise_number, chunk.exercise_ordinal, chunk.item_label)
            for chunk in chunks
        ]
        self.assertEqual(
            structure,
            [("1", 1, "a"), ("1", 1, "b"), ("2", 2, "a")],
        )
        self.assertIn("Ejercicio 1", chunks[0].text)
        self.assertIn("Literal a", chunks[0].text)

    def test_normalizes_pdf_operator_artifacts(self):
        pages = [
            ExtractedPage(
                page_number=1,
                text="1. Logica:\na. p /uni02C4 q →→ →→ r",
            )
        ]

        chunks = chunk_document(pages)

        self.assertIn("p ∧ q → r", chunks[0].text)

    def test_formula_parenthesis_is_not_mistaken_for_an_inline_literal(self):
        pages = [
            ExtractedPage(
                page_number=1,
                text=(
                    "1. Simboliza:\n"
                    "h. Primera expresion.\n"
                    "i. Segunda expresion: (p ∧ q) ∨ r)\n"
                    "j. Tercera expresion."
                ),
            )
        ]

        chunks = chunk_document(pages)

        self.assertEqual([chunk.item_label for chunk in chunks], ["h", "i", "j"])

    def test_literal_marker_can_have_content_on_the_next_line(self):
        pages = [
            ExtractedPage(
                page_number=1,
                text="1. Funciones:\na) y = x\nb)\ny = 2x",
            )
        ]

        chunks = chunk_document(pages)

        self.assertEqual([chunk.item_label for chunk in chunks], ["a", "b"])
        self.assertIn("y = 2x", chunks[1].text)


class ReferenceResolutionTests(unittest.TestCase):
    def test_first_question_is_an_ordinal_reference(self):
        reference = resolve_document_reference("Responde la primera pregunta")

        self.assertEqual(reference.exercise_ordinal, 1)
        self.assertIsNone(reference.exercise_number)

    def test_explicit_exercise_number(self):
        reference = resolve_document_reference("Ayudame con el ejercicio dos")

        self.assertEqual(reference.exercise_number, "2")

    def test_literal_inherits_previous_exercise(self):
        reference = resolve_document_reference(
            "Ahora explica el literal b",
            [{"role": "user", "content": "Resuelve el ejercicio 3"}],
        )

        self.assertEqual(reference.exercise_number, "3")
        self.assertEqual(reference.item_label, "b")

    def test_next_and_previous_references(self):
        next_reference = resolve_document_reference(
            "El siguiente",
            [{"role": "user", "content": "Responde la primera pregunta"}],
        )
        previous_reference = resolve_document_reference(
            "El ejercicio anterior",
            [{"role": "user", "content": "Resuelve el ejercicio 4"}],
        )

        self.assertEqual(next_reference.exercise_ordinal, 2)
        self.assertEqual(previous_reference.exercise_number, "3")

    def test_next_literal_uses_item_sequence(self):
        reference = resolve_document_reference(
            "El literal siguiente",
            [
                {"role": "user", "content": "Resuelve el ejercicio 2"},
                {"role": "user", "content": "Explica el literal b"},
            ],
        )

        self.assertEqual(reference.exercise_number, "2")
        self.assertEqual(reference.item_label, "c")


if __name__ == "__main__":
    unittest.main()
