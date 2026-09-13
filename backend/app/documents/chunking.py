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
        is_model_tok = hasattr(self.tokenizer, "tokenize") and callable(self.tokenizer)

        for page in pages:
            if is_model_tok:
                page_chunks = self._chunk_page_with_model_tokenizer(page)
                chunks.extend(page_chunks)
                continue

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

    def _chunk_page_with_model_tokenizer(self, page: ExtractedPage) -> list[DocumentChunk]:
        """Chunk page using exact subword model tokens and character offset slicing."""
        text = page.text.strip()
        if not text:
            return []

        try:
            enc = self.tokenizer(text, return_offsets_mapping=True, add_special_tokens=False)
            offsets = enc.get("offset_mapping", [])
        except Exception:
            # Fallback if return_offsets_mapping is unsupported
            tokens = self.tokenizer.tokenize(text)
            offsets = []

        if not offsets:
            tokens = self.tokenizer.tokenize(text) if hasattr(self.tokenizer, "tokenize") else text.split()
            chunks: list[DocumentChunk] = []
            start = 0
            page_chunk_number = 0
            while start < len(tokens):
                end = min(start + self.chunk_size_tokens, len(tokens))
                chunk_slice = tokens[start:end]
                chunks.append(
                    DocumentChunk(
                        page_number=page.page_number,
                        ordinal=page_chunk_number,
                        text=" ".join(chunk_slice),
                        token_count=len(chunk_slice),
                        token_start=start,
                        token_end=end,
                    )
                )
                page_chunk_number += 1
                if end >= len(tokens):
                    break
                start = end - self.chunk_overlap_tokens
            return chunks

        total_tokens = len(offsets)
        paragraph_splits = [m.start() for m in re.finditer(r"\n\s*\n", text)]
        paragraph_token_boundaries: list[int] = []
        for p_char in paragraph_splits:
            for tok_idx, (s_char, _) in enumerate(offsets):
                if s_char >= p_char:
                    paragraph_token_boundaries.append(tok_idx)
                    break

        chunks: list[DocumentChunk] = []
        start = 0
        page_chunk_number = 0

        while start < total_tokens:
            end = min(start + self.chunk_size_tokens, total_tokens)
            if end < total_tokens:
                boundary = max(
                    (
                        boundary_idx
                        for boundary_idx in paragraph_token_boundaries
                        if start < boundary_idx <= end
                        and boundary_idx - start > self.chunk_overlap_tokens
                    ),
                    default=start,
                )
                if boundary > start:
                    end = boundary

            start_char = offsets[start][0]
            end_char = offsets[end - 1][1]
            chunk_text = text[start_char:end_char].strip()

            # Ensure re-tokenized text does not exceed chunk_size_tokens due to subword boundary artifacts
            if hasattr(self.tokenizer, "tokenize"):
                while end > start + 1:
                    tok_len = len(self.tokenizer.tokenize(chunk_text))
                    if tok_len <= self.chunk_size_tokens:
                        break
                    end -= 1
                    end_char = offsets[end - 1][1]
                    chunk_text = text[start_char:end_char].strip()

            token_count = end - start

            chunks.append(
                DocumentChunk(
                    page_number=page.page_number,
                    ordinal=page_chunk_number,
                    text=chunk_text,
                    token_count=token_count,
                    token_start=start,
                    token_end=end,
                )
            )
            page_chunk_number += 1
            if end >= total_tokens:
                break
            start = end - self.chunk_overlap_tokens

        return chunks


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
