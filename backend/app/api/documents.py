"""Document and retrieval REST endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentNotFoundError, DuplicateDocumentError


router = APIRouter(prefix="/api/v1", tags=["documents"])


class DocumentSummary(BaseModel):
    id: str
    filename: str
    sha256: str
    size_bytes: int
    page_count: int
    chunk_count: int
    status: str
    error: str | None


class DocumentDetail(DocumentSummary):
    chunks: list[dict[str, Any]]


class RetrievalRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=10)


class RetrievalSource(BaseModel):
    source_id: str
    document_id: str
    filename: str
    page_number: int
    chunk_id: str
    text: str
    score: float


class RetrievalResponse(BaseModel):
    query: str
    top_k: int
    sources: list[RetrievalSource]


def get_pipeline(request: Request) -> DocumentPipeline:
    return request.app.state.document_pipeline


def _summary(record: Any) -> DocumentSummary:
    return DocumentSummary(
        id=record.id,
        filename=record.filename,
        sha256=record.sha256,
        size_bytes=record.size_bytes,
        page_count=record.page_count,
        chunk_count=record.chunk_count,
        status=record.status,
        error=record.error,
    )


@router.post("/documents", response_model=DocumentSummary, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    pipeline: DocumentPipeline = Depends(get_pipeline),
) -> DocumentSummary:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    data = await file.read()
    try:
        return _summary(pipeline.ingest(data, filename=file.filename))
    except DuplicateDocumentError:
        raise HTTPException(status_code=409, detail="document with same SHA-256 already exists") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents(pipeline: DocumentPipeline = Depends(get_pipeline)) -> list[DocumentSummary]:
    return [_summary(record) for record in pipeline.list_documents()]


@router.get("/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, pipeline: DocumentPipeline = Depends(get_pipeline)) -> DocumentDetail:
    try:
        record, chunks = pipeline.get_document(document_id)
    except DocumentNotFoundError:
        raise HTTPException(status_code=404, detail="document not found") from None
    result = _summary(record)
    return DocumentDetail(
        **result.model_dump(),
        chunks=[
            {
                "id": chunk.id,
                "chunk_id": chunk.chunk_id,
                "page_number": chunk.page_number,
                "ordinal": chunk.ordinal,
                "text": chunk.text,
                "token_count": chunk.token_count,
                "vector_id": chunk.vector_id,
            }
            for chunk in chunks
        ],
    )


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_document(document_id: str, pipeline: DocumentPipeline = Depends(get_pipeline)) -> None:
    try:
        pipeline.delete_document(document_id)
    except DocumentNotFoundError:
        raise HTTPException(status_code=404, detail="document not found") from None


@router.post("/retrieval", response_model=RetrievalResponse)
def retrieve(
    request: RetrievalRequest,
    pipeline: DocumentPipeline = Depends(get_pipeline),
) -> RetrievalResponse:
    try:
        matches = pipeline.retrieve(request.query, request.top_k)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    sources = [
        RetrievalSource(
            source_id=f"S{index}",
            document_id=chunk.document_id,
            filename=pipeline.repository.get(chunk.document_id).filename,
            page_number=chunk.page_number,
            chunk_id=chunk.chunk_id,
            text=chunk.text,
            score=match.score,
        )
        for index, (match, chunk) in enumerate(matches, start=1)
    ]
    return RetrievalResponse(query=request.query, top_k=request.top_k, sources=sources)
