import os

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'tutormath.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields and closes a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables and apply additive migrations for the local SQLite DB."""
    from backend.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_rag_schema()


def _migrate_rag_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "rag_documents" not in tables or "rag_chunks" not in tables:
        return

    document_columns = {
        column["name"] for column in inspector.get_columns("rag_documents")
    }
    chunk_columns = {
        column["name"] for column in inspector.get_columns("rag_chunks")
    }
    link_columns = (
        {
            column["name"]
            for column in inspector.get_columns("rag_conversation_documents")
        }
        if "rag_conversation_documents" in tables
        else set()
    )

    with engine.begin() as connection:
        if "index_version" not in document_columns:
            connection.execute(text(
                "ALTER TABLE rag_documents "
                "ADD COLUMN index_version INTEGER NOT NULL DEFAULT 1"
            ))

        additions = {
            "page_start": "INTEGER",
            "page_end": "INTEGER",
            "exercise_number": "TEXT",
            "exercise_ordinal": "INTEGER",
            "item_label": "TEXT",
            "heading": "TEXT",
        }
        for column_name, column_type in additions.items():
            if column_name not in chunk_columns:
                connection.execute(text(
                    f"ALTER TABLE rag_chunks ADD COLUMN {column_name} {column_type}"
                ))

        if (
            "rag_conversation_documents" in tables
            and "last_used_at" not in link_columns
        ):
            connection.execute(text(
                "ALTER TABLE rag_conversation_documents "
                "ADD COLUMN last_used_at REAL"
            ))
            connection.execute(text(
                "UPDATE rag_conversation_documents "
                "SET last_used_at = created_at WHERE last_used_at IS NULL"
            ))

        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_rag_chunks_document_structure "
            "ON rag_chunks "
            "(document_id, exercise_number, exercise_ordinal, item_label)"
        ))
