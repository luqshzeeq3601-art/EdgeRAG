"""Services package."""

from app.services.rag import (
    INSUFFICIENT_INFORMATION_MESSAGE,
    NO_CONTEXT_ABSTENTION_MESSAGE,
    CitationValidationResult,
    RAGService,
    build_user_prompt,
    extract_citations,
    format_context,
    format_passage,
    should_abstain,
    validate_citations,
)

__all__ = [
    "INSUFFICIENT_INFORMATION_MESSAGE",
    "NO_CONTEXT_ABSTENTION_MESSAGE",
    "CitationValidationResult",
    "RAGService",
    "build_user_prompt",
    "extract_citations",
    "format_context",
    "format_passage",
    "should_abstain",
    "validate_citations",
]
