"""RAG SSE streaming REST endpoint."""

from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.rag import RAGService


router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


class RAGAskRequest(BaseModel):
    query: str = Field(min_length=1, description="User question to answer against ingested documents")
    model: str = Field(min_length=1, description="Ollama model tag to use for generation")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of passages to retrieve")


def get_rag_service(request: Request) -> RAGService:
    return request.app.state.rag_service


async def _sse_stream(
    rag_service: RAGService,
    request: RAGAskRequest,
) -> AsyncIterator[str]:
    """Yield Server-Sent Events formatted as event: ...\\ndata: ...\\n\\n."""
    async for event_type, payload in rag_service.ask_stream(
        query=request.query,
        model=request.model,
        top_k=request.top_k,
    ):
        yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


@router.post("/ask")
async def ask(
    request: RAGAskRequest,
    rag_service: RAGService = Depends(get_rag_service),
) -> StreamingResponse:
    """Stream answer fragments, sources, and citation validation metadata over SSE."""
    return StreamingResponse(
        _sse_stream(rag_service, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
