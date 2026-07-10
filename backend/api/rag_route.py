from __future__ import annotations

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from backend.db.database import get_db
from backend.rag.store import delete_document, ingest_file, list_documents, save_upload

router = APIRouter(prefix="/rag", tags=["rag"])


class RAGDocumentOut(BaseModel):
    id: str
    filename: str
    mime_type: str
    created_at: float
    chunks: int


class RAGUploadOut(BaseModel):
    id: str
    url: str
    filename: str
    chunks: int


@router.get("/documents", response_model=list[RAGDocumentOut])
def get_rag_documents(db: Session = Depends(get_db)):
    documents = list_documents(db)
    return [
        RAGDocumentOut(
            id=doc.id,
            filename=doc.filename,
            mime_type=doc.mime_type,
            created_at=doc.created_at,
            chunks=len(doc.chunks),
        )
        for doc in documents
    ]


@router.post("/documents", response_model=RAGUploadOut, status_code=201)
async def upload_rag_document(
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        form = await request.form()
    except AssertionError as exc:
        raise HTTPException(
            status_code=500,
            detail="Instala python-multipart para aceptar archivos: pip install python-multipart",
        ) from exc

    uploaded = form.get("file")
    if not isinstance(uploaded, UploadFile):
        raise HTTPException(status_code=400, detail="Field 'file' is required.")

    try:
        path = save_upload(uploaded.file, uploaded.filename or "document")
        document = ingest_file(
            db,
            source_path=path,
            filename=uploaded.filename or path.name,
            mime_type=uploaded.content_type or "application/octet-stream",
        )
    except requests.exceptions.HTTPError as exc:
        detail = "Ollama no pudo generar embeddings."
        if exc.response is not None and exc.response.status_code == 404:
            detail = "No se encontro el modelo de embeddings en Ollama."
        raise HTTPException(status_code=502, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RAGUploadOut(
        id=document.id,
        url=f"/rag/documents/{document.id}",
        filename=document.filename,
        chunks=len(document.chunks),
    )


@router.delete("/documents/{document_id}", status_code=204)
def remove_rag_document(document_id: str, db: Session = Depends(get_db)):
    deleted = delete_document(db, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")
