"""Unit tests for RAG prompt construction, citation validation, and deterministic abstention."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

import pytest

from app.providers.ollama import OllamaGenerateChunk, OllamaProvider
from app.services.rag import (
    INSUFFICIENT_INFORMATION_MESSAGE,
    NO_CONTEXT_ABSTENTION_MESSAGE,
    RAGService,
    SYSTEM_PROMPT,
    build_user_prompt,
    extract_citations,
    format_context,
    format_passage,
    should_abstain,
    validate_citations,
)


def test_format_passage_and_context() -> None:
    passages = [
        {
            "source_id": "S1",
            "filename": "turbine_manual.pdf",
            "page_number": 4,
            "text": "The turbine operates at a nominal speed of 3000 RPM at 50 Hz.",
        },
        {
            "source_id": "S2",
            "filename": "turbine_manual.pdf",
            "page_number": 5,
            "text": "Maximum operating pressure must not exceed 16.5 MPa (165 bar).",
        },
    ]

    p1 = format_passage("S1", "turbine_manual.pdf", 4, passages[0]["text"])
    assert "[S1] Source: turbine_manual.pdf, Page: 4" in p1
    assert "3000 RPM" in p1

    context = format_context(passages)
    assert "[S1] Source: turbine_manual.pdf, Page: 4" in context
    assert "[S2] Source: turbine_manual.pdf, Page: 5" in context
    assert "16.5 MPa (165 bar)" in context


def test_build_user_prompt_contains_context_and_grounding() -> None:
    context = "[S1] Source: doc.pdf, Page: 1\nOperating temperature is 250 °C."
    query = "What is the operating temperature?"
    prompt = build_user_prompt(query, context)

    assert "Context Passages:" in prompt
    assert context in prompt
    assert f"Question: {query}" in prompt
    assert "[S1]" in prompt


def test_system_prompt_enforces_grounding_units_and_untrusted_data() -> None:
    assert "ONLY the provided numbered context passages" in SYSTEM_PROMPT
    assert "Preserve all technical identifiers, exact numbers, formulas, and units" in SYSTEM_PROMPT
    assert "untrusted data" in SYSTEM_PROMPT
    assert INSUFFICIENT_INFORMATION_MESSAGE in SYSTEM_PROMPT
    assert "conflicting statements" in SYSTEM_PROMPT


def test_extract_citations() -> None:
    text = "According to [S1], nominal voltage is 400 V. As detailed in [S2] and also [S1], current limit is 50 A."
    citations = extract_citations(text)
    # Deduplicated and order preserved
    assert citations == ["S1", "S2"]


def test_validate_citations_valid() -> None:
    text = "The turbine operates at 3000 RPM [S1] with a pressure of 165 bar [S2]."
    result = validate_citations(text, valid_source_ids=["S1", "S2", "S3"])

    assert result.is_valid is True
    assert result.cited_sources == ["S1", "S2"]
    assert result.invalid_citations == []
    assert result.uncited_sources == ["S3"]
    assert result.warnings == []


def test_validate_citations_invalid_flags_warning() -> None:
    text = "The component failed due to fatigue [S1] at cycle 5000 [S9]."
    result = validate_citations(text, valid_source_ids=["S1", "S2"])

    assert result.is_valid is False
    assert result.cited_sources == ["S1", "S9"]
    assert result.invalid_citations == ["S9"]
    assert result.uncited_sources == ["S2"]
    assert len(result.warnings) == 1
    assert "Citation [S9] is invalid: not in retrieved sources [S1, S2]" in result.warnings[0]


def test_deterministic_abstention_on_empty_context() -> None:
    assert should_abstain([]) is True
    assert should_abstain([{"source_id": "S1"}]) is False
    assert "no relevant context was found" in NO_CONTEXT_ABSTENTION_MESSAGE


def test_validate_citations_detects_malformed_tags() -> None:
    text = "The temperature is 100 C [s1] and pressure is 5 bar [S-2]."
    result = validate_citations(text, valid_source_ids=["S1", "S2"])

    assert result.is_valid is False
    assert "s1" in result.invalid_citations
    assert "S-2" in result.invalid_citations
    assert any("Malformed citation [s1]" in w for w in result.warnings)
    assert any("Malformed citation [S-2]" in w for w in result.warnings)


def test_validate_citations_requires_citations_for_non_abstaining() -> None:
    # Non-abstaining statement without citation should fail validation
    text = "The turbine operating limit is 3000 RPM."
    result = validate_citations(text, valid_source_ids=["S1", "S2"])

    assert result.is_valid is False
    assert any("Non-abstaining answer must contain at least one valid citation" in w for w in result.warnings)

    # Abstaining answer without citation should succeed
    abstaining_text = "The provided context does not contain sufficient information to answer this question."
    abstaining_result = validate_citations(abstaining_text, valid_source_ids=["S1", "S2"])
    assert abstaining_result.is_valid is True
    assert len(abstaining_result.warnings) == 0


def test_should_abstain_on_low_similarity_threshold() -> None:
    # High score -> do not abstain
    relevant_passages = [{"source_id": "S1", "score": 0.65}]
    assert should_abstain(relevant_passages, min_similarity=0.25) is False

    # Low score below threshold -> abstain
    irrelevant_passages = [{"source_id": "S1", "score": 0.12}, {"source_id": "S2", "score": 0.08}]
    assert should_abstain(irrelevant_passages, min_similarity=0.25) is True


@pytest.mark.asyncio
async def test_rag_stream_premature_termination_emits_error() -> None:
    class MockOllama(OllamaProvider):
        def __init__(self) -> None:
            super().__init__()

        async def stream_generate(self, model: str, prompt: str, **_: object) -> AsyncIterator[OllamaGenerateChunk]:
            # Yields partial delta without done=True
            yield OllamaGenerateChunk(response="Partial text...", done=False)

    class MockPipeline:
        def __init__(self) -> None:
            self.repository = type("Repo", (), {"get": lambda s, doc_id: None})()

        def retrieve(self, query: str, top_k: int) -> list:
            from app.vector_store import VectorMatch
            from app.documents.repository import ChunkRecord
            m = VectorMatch(vector_id=1, score=0.8)
            c = ChunkRecord(
                id=1,
                document_id="d1",
                chunk_id="chunk-1",
                page_number=1,
                ordinal=0,
                text="Turbine manual text",
                token_count=10,
                vector_id=1,
            )
            return [(m, c)]

    service = RAGService(pipeline=MockPipeline(), ollama_provider=MockOllama())
    events = [event async for event in service.ask_stream("query", "test-model")]
    event_types = [e[0] for e in events]
    assert "error" in event_types
    error_payload = next(e[1] for e in events if e[0] == "error")
    assert error_payload.get("code") == "STREAM_PREMATURE_TERMINATION"


@pytest.mark.asyncio
async def test_rag_stream_timeout_emits_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class HangingOllama(OllamaProvider):
        def __init__(self) -> None:
            super().__init__()

        async def stream_generate(self, model: str, prompt: str, **_: object) -> AsyncIterator[OllamaGenerateChunk]:
            await asyncio.sleep(5.0)
            yield OllamaGenerateChunk(response="late", done=True)

    class MockPipeline:
        def __init__(self) -> None:
            self.repository = type("Repo", (), {"get": lambda s, doc_id: None})()

        def retrieve(self, query: str, top_k: int) -> list:
            from app.vector_store import VectorMatch
            from app.documents.repository import ChunkRecord
            return [(VectorMatch(1, 0.9), ChunkRecord(1, "d1", "chunk-1", 1, 0, "text", 5, 1))]

    service = RAGService(pipeline=MockPipeline(), ollama_provider=HangingOllama())

    # Monkeypatch asyncio.timeout to 0.05 seconds to verify timeout trigger
    original_timeout = asyncio.timeout
    monkeypatch.setattr(asyncio, "timeout", lambda _: original_timeout(0.05))

    events = [event async for event in service.ask_stream("query", "test-model")]
    event_types = [e[0] for e in events]
    assert "error" in event_types
    error_payload = next(e[1] for e in events if e[0] == "error")
    assert error_payload.get("code") == "GENERATION_TIMEOUT"
