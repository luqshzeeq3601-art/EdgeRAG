"""Deterministic, page-bound, paragraph-aware document chunking."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable, Sequence

from app.documents.ingestion import ExtractedPage


Tokenize = Callable[[str], list[str]]


@dataclass(frozen=True)
class DocumentChunk:
    """One retrieval unit tied to one physical PDF page."""

    page_number: int
    ordinal: int
    text: str
    token_count: int
    token_start: int
    token_end: int


class ChunkingService:
    """Create bounded overlapping chunks without crossing page boundaries."""

    def __init__(
        self,
        *,
        chunk_size_tokens: int = 220,
        chunk_overlap_tokens: int = 40,
        tokenizer: Tokenize | None = None,
    ) -> None:
        if chunk_size_tokens <= 0:
            raise ValueError("chunk_size_tokens must be positive")
        if chunk_overlap_tokens < 0 or chunk_overlap_tokens >= chunk_size_tokens:
            raise ValueError("chunk_overlap_tokens must be less than chunk_size_tokens")
        self.chunk_size_tokens = chunk_size_tokens
        self.chunk_overlap_tokens = chunk_overlap_tokens
        self.tokenizer = tokenizer or _default_tokenizer

    def chunk_pages(self, pages: Iterable[ExtractedPage]) -> tuple[DocumentChunk, ...]:
        """Chunk each page independently and return chunks in page order."""

        chunks: list[DocumentChunk] = []
        for page in pages:
            page_tokens = self.tokenizer(page.text)
            if not page_tokens:
                continue
            paragraph_ends = _paragraph_end_offsets(page.text, self.tokenizer)
            page_chunk_number = 0
            start = 0
            while start < len(page_tokens):
                end = min(start + self.chunk_size_tokens, len(page_tokens))
                if end < len(page_tokens):
                    boundary = max(
                        (
                            offset
                            for offset in paragraph_ends
                            if start < offset <= end
                            and offset - start > self.chunk_overlap_tokens
                        ),
                        default=start,
                    )
                    if boundary > start:
                        end = boundary

                chunk_tokens = page_tokens[start:end]
                chunks.append(
                    DocumentChunk(
                        page_number=page.page_number,
                        ordinal=page_chunk_number,
                        text=" ".join(chunk_tokens),
                        token_count=len(chunk_tokens),
                        token_start=start,
                        token_end=end,
                    )
                )
                page_chunk_number += 1
                if end >= len(page_tokens):
                    break
                start = end - self.chunk_overlap_tokens
        return tuple(chunks)


def _default_tokenizer(text: str) -> list[str]:
    """Use whitespace tokens while preserving identifiers, values, and units."""

    return text.split()


def _paragraph_end_offsets(text: str, tokenizer: Tokenize) -> Sequence[int]:
    """Return cumulative token offsets at paragraph boundaries."""

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    offsets: list[int] = []
    total = 0
    for paragraph in paragraphs:
        total += len(tokenizer(paragraph))
        offsets.append(total)
    return offsets
