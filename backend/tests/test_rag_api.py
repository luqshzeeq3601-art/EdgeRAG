"""API tests for models discovery and RAG SSE streaming endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncIterator

import pytest
from fastapi.testclient import TestClient

from app.api.health import OllamaReadiness
from app.core.config import Settings
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.main import create_app
from app.persistence.database import Database
from app.providers.ollama import OllamaGenerateChunk, OllamaModelInfo, OllamaProvider
from app.services.rag import NO_CONTEXT_ABSTENTION_MESSAGE, RAGService


class FakeOllamaProvider(OllamaProvider):
    """Fake Ollama provider for API tests."""

    def __init__(
        self,
        models: list[OllamaModelInfo] | None = None,
        chunks: list[OllamaGenerateChunk] | None = None,
    ) -> None:
        super().__init__(base_url="http://127.0.0.1:11434")
        self._models = models or []
        self._chunks = chunks or []

    async def check_readiness(self) -> OllamaReadiness:
        return OllamaReadiness(ready=True, status_code=200)

    async def list_models(self) -> list[OllamaModelInfo]:
        return self._models

    async def stream_generate(
        self,
        model: str,
        prompt: str,
        *,
        system: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> AsyncIterator[OllamaGenerateChunk]:
        for chunk in self._chunks:
            yield chunk


def parse_sse_events(raw_body: str) -> list[tuple[str, dict[str, Any]]]:
    """Parse raw SSE body into list of (event_name, data_dict)."""
    events: list[tuple[str, dict[str, Any]]] = []
    current_event = "message"
    current_data: list[str] = []

    for line in raw_body.splitlines():
        if line.startswith("event: "):
            current_event = line[len("event: ") :].strip()
        elif line.startswith("data: "):
            current_data.append(line[len("data: ") :].strip())
        elif line == "":
            if current_data:
                parsed_json = json.loads("".join(current_data))
                events.append((current_event, parsed_json))
                current_data = []
                current_event = "message"

    if current_data:
        parsed_json = json.loads("".join(current_data))
        events.append((current_event, parsed_json))

    return events


def test_get_models_endpoint(tmp_path: Path) -> None:
    fake_models = [
        OllamaModelInfo(
            name="smollm2:135m",
            model="smollm2:135m",
            modified_at="2026-09-13T10:00:00Z",
            size=270898672,
            digest="9077fe9d2ae1",
            details={"family": "llama"},
        ),
        OllamaModelInfo(
            name="qwen2.5:0.5b",
            model="qwen2.5:0.5b",
            modified_at="2026-09-13T10:05:00Z",
            size=397000000,
            digest="a8b0c5157701",
            details={"family": "qwen2"},
        ),
    ]
    provider = FakeOllamaProvider(models=fake_models)
    app = create_app(
        settings=Settings(database_path=tmp_path / "test.db", _env_file=None),
        ollama_provider=provider,
    )
    with TestClient(app) as client:
        resp = client.get("/api/v1/models")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "smollm2:135m"
        assert data[1]["name"] == "qwen2.5:0.5b"


def test_post_rag_ask_abstention_when_empty_context(tmp_path: Path) -> None:
    provider = FakeOllamaProvider()
    app = create_app(
        settings=Settings(
            database_path=tmp_path / "test.db",
            vector_index_path=tmp_path / "test.faiss",
            _env_file=None,
        ),
        ollama_provider=provider,
    )
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/rag/ask",
            json={"query": "What is the speed?", "model": "smollm2:135m", "top_k": 5},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

        events = parse_sse_events(resp.text)
        assert len(events) == 3
        # 1. Sources event
        assert events[0][0] == "sources"
        assert events[0][1]["sources"] == []
        # 2. Delta event with abstention message
        assert events[1][0] == "delta"
        assert events[1][1]["text"] == NO_CONTEXT_ABSTENTION_MESSAGE
        # 3. Done event
        assert events[2][0] == "done"
        assert events[2][1]["abstained"] is True
        assert events[2][1]["sources_count"] == 0
        assert events[2][1]["answer"] == NO_CONTEXT_ABSTENTION_MESSAGE


def test_post_rag_ask_validation_error(tmp_path: Path) -> None:
    provider = FakeOllamaProvider()
    app = create_app(
        settings=Settings(database_path=tmp_path / "test.db", _env_file=None),
        ollama_provider=provider,
    )
    with TestClient(app) as client:
        # Invalid top_k > 10
        resp = client.post(
            "/api/v1/rag/ask",
            json={"query": "Test?", "model": "smollm2:135m", "top_k": 50},
        )
        assert resp.status_code == 422

        # Empty query
        resp = client.post(
            "/api/v1/rag/ask",
            json={"query": "", "model": "smollm2:135m"},
        )
        assert resp.status_code == 422
