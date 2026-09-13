"""Models REST endpoint for discovering installed Ollama models."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.providers.ollama import OllamaProvider, OllamaProviderError


router = APIRouter(prefix="/api/v1", tags=["models"])


class ModelSummary(BaseModel):
    name: str
    model: str
    modified_at: str
    size: int
    digest: str
    details: dict[str, Any] = Field(default_factory=dict)


def get_ollama_provider(request: Request) -> OllamaProvider:
    return request.app.state.ollama_provider


@router.get("/models", response_model=list[ModelSummary])
async def list_models(
    provider: OllamaProvider = Depends(get_ollama_provider),
) -> list[ModelSummary]:
    """List installed models from Ollama."""
    try:
        models = await provider.list_models()
        return [
            ModelSummary(
                name=m.name,
                model=m.model,
                modified_at=m.modified_at,
                size=m.size,
                digest=m.digest,
                details=m.details,
            )
            for m in models
        ]
    except OllamaProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list models: {exc}") from exc
