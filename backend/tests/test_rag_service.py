"""Unit tests for RAG prompt construction, citation validation, and deterministic abstention."""

from __future__ import annotations

import pytest

from app.services.rag import (
    INSUFFICIENT_INFORMATION_MESSAGE,
    NO_CONTEXT_ABSTENTION_MESSAGE,
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
