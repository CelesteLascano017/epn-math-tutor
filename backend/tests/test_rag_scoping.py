import json
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes import _build_retrieval_query, _document_sources
from backend.db.database import Base
from backend.db.models import Conversation, RAGChunk, RAGDocument
from backend.rag.store import (
    RetrievedChunk,
    link_documents_to_conversation,
    retrieve_context,
)
from backend.rag.references import resolve_document_reference


class RAGScopingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.db.add_all([
            Conversation(id="chat-a", title="A"),
            Conversation(id="chat-b", title="B"),
        ])
        self.db.add_all([
            RAGDocument(
                id="doc-a",
                filename="algebra.pdf",
                mime_type="application/pdf",
                content_sha256="hash-a",
                index_version=2,
            ),
            RAGDocument(
                id="doc-b",
                filename="fotografias.pdf",
                mime_type="application/pdf",
                content_sha256="hash-b",
                index_version=2,
            ),
        ])
        self.db.flush()
        self.db.add_all([
            RAGChunk(
                id="chunk-a",
                document_id="doc-a",
                chunk_index=0,
                text="Ejercicio 2: resuelve la ecuacion x + 3 = 8.",
                embedding=json.dumps([1.0, 0.0]),
                exercise_number="2",
                exercise_ordinal=2,
            ),
            RAGChunk(
                id="chunk-b",
                document_id="doc-b",
                chunk_index=0,
                text="Revelar 36 fotografias tiene un precio fijo.",
                embedding=json.dumps([1.0, 0.0]),
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @patch("backend.rag.store.embed_query", return_value=[1.0, 0.0])
    def test_retrieval_never_crosses_conversations(self, _embed_query):
        link_documents_to_conversation(
            self.db, conversation_id="chat-a", document_ids=["doc-a"]
        )
        link_documents_to_conversation(
            self.db, conversation_id="chat-b", document_ids=["doc-b"]
        )

        _context, chunks = retrieve_context(
            self.db,
            "Explica el ejercicio dos",
            conversation_id="chat-a",
        )

        self.assertEqual({chunk.document_id for chunk in chunks}, {"doc-a"})

    @patch("backend.rag.store.embed_query")
    def test_structured_reference_filters_before_embeddings(self, embed_query):
        self.db.add(
            RAGChunk(
                id="chunk-first",
                document_id="doc-a",
                chunk_index=1,
                text="Ejercicio 1: primera pregunta del documento.",
                embedding=json.dumps([0.0, 1.0]),
                page_start=1,
                page_end=1,
                exercise_number="1",
                exercise_ordinal=1,
            )
        )
        self.db.commit()
        link_documents_to_conversation(
            self.db, conversation_id="chat-a", document_ids=["doc-a"]
        )
        reference = resolve_document_reference("Responde la primera pregunta")

        _context, chunks = retrieve_context(
            self.db,
            "Responde la primera pregunta",
            conversation_id="chat-a",
            reference=reference,
        )

        self.assertEqual([chunk.exercise_number for chunk in chunks], ["1"])
        embed_query.assert_not_called()

    @patch("backend.rag.store.embed_query", return_value=[1.0, 0.0])
    def test_unlinked_chat_has_no_library_fallback(self, embed_query):
        context, chunks = retrieve_context(
            self.db,
            "Explica el ejercicio",
            conversation_id="chat-a",
        )

        self.assertIsNone(context)
        self.assertEqual(chunks, [])
        embed_query.assert_not_called()

    def test_follow_up_query_uses_only_current_chat_history(self):
        query = _build_retrieval_query(
            "Puedes explicarme lo que pide el enunciado?",
            [
                {"role": "user", "content": "Ayudame con el ejercicio dos."},
                {"role": "assistant", "content": "De acuerdo."},
            ],
        )

        self.assertIn("Ayudame con el ejercicio dos.", query)
        self.assertIn("Pregunta de seguimiento", query)

    def test_short_independent_question_does_not_reuse_previous_turn(self):
        question = "Que es una funcion?"

        query = _build_retrieval_query(
            question,
            [{"role": "user", "content": "Resuelve el ejercicio anterior."}],
        )

        self.assertEqual(query, question)

    def test_sources_are_grouped_by_document(self):
        chunks = [
            RetrievedChunk("doc-a", "1", "algebra.pdf", "pagina 1", 0.9),
            RetrievedChunk("doc-a", "2", "algebra.pdf", "pagina 2", 0.8),
        ]

        sources = _document_sources(chunks)

        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0].id, "doc-a")


if __name__ == "__main__":
    unittest.main()
