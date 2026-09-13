from __future__ import annotations

import pytest

from app.documents.chunking import ChunkingService
from app.documents.ingestion import ExtractedPage
from app.embeddings.service import EmbeddingService


def numbered_tokens(prefix: str, count: int) -> str:
    return " ".join(f"{prefix}-{index}" for index in range(count))


def test_chunks_respect_limit_and_overlap_at_paragraph_boundary() -> None:
    page = ExtractedPage(
        page_number=2,
        text="\n\n".join(
            [numbered_tokens("alpha", 100), numbered_tokens("beta", 100), numbered_tokens("gamma", 100)]
        ),
    )

    chunks = ChunkingService().chunk_pages([page])

    assert len(chunks) == 2
    assert all(chunk.token_count <= 220 for chunk in chunks)
    assert chunks[0].text.split()[-40:] == chunks[1].text.split()[:40]
    assert chunks[0].text.split()[-1] == "beta-99"


def test_oversized_paragraph_uses_bounded_windows() -> None:
    page = ExtractedPage(page_number=1, text=numbered_tokens("token", 500))

    chunks = ChunkingService().chunk_pages([page])

    assert [chunk.token_count for chunk in chunks] == [220, 220, 140]
    assert chunks[0].text.split()[-40:] == chunks[1].text.split()[:40]
    assert chunks[1].text.split()[-40:] == chunks[2].text.split()[:40]


def test_chunks_never_cross_physical_pages() -> None:
    pages = [
        ExtractedPage(page_number=1, text=numbered_tokens("page-one", 230)),
        ExtractedPage(page_number=2, text=numbered_tokens("page-two", 10)),
    ]

    chunks = ChunkingService().chunk_pages(pages)

    assert [chunk.page_number for chunk in chunks] == [1, 1, 2]
    assert all("page-two" not in chunks[0].text for _ in [0])
    assert chunks[-1].token_count == 10


def test_short_page_returns_one_chunk() -> None:
    chunks = ChunkingService().chunk_pages(
        [ExtractedPage(page_number=3, text="one two three")]
    )

    assert len(chunks) == 1
    assert chunks[0].token_count == 3
    assert chunks[0].token_start == 0
    assert chunks[0].token_end == 3


def test_invalid_window_is_rejected() -> None:
    with pytest.raises(ValueError, match="less than"):
        ChunkingService(chunk_size_tokens=40, chunk_overlap_tokens=40)


def test_long_compound_technical_words_bounded_by_model_tokens() -> None:
    embeddings = EmbeddingService()
    service = ChunkingService(
        chunk_size_tokens=220,
        chunk_overlap_tokens=40,
        tokenizer=embeddings.tokenizer,
    )

    # Long compound technical words that expand to numerous subword tokens
    long_compound = "EmergencyCoolingPumpSkidHighPressureRecirculationAssemblyHydrochlorofluorocarbon"
    text = " ".join([long_compound] * 50)
    page = ExtractedPage(page_number=1, text=text)

    chunks = service.chunk_pages([page])

    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk.token_count <= 220
        # Verify subword token count via MiniLM tokenizer directly never exceeds 220
        enc = embeddings.tokenizer.tokenize(chunk.text)
        assert len(enc) <= 220
