from __future__ import annotations

import numpy as np

from app.embeddings.service import EmbeddingService


class FakeEncoder:
    def __init__(self, dimension: int = 384) -> None:
        self.dimension = dimension
        self.calls: list[dict[str, object]] = []

    def get_sentence_embedding_dimension(self) -> int:
        return self.dimension

    def encode(self, texts: list[str], **kwargs: object) -> np.ndarray:
        self.calls.append({"texts": texts, **kwargs})
        return np.arange(len(texts) * self.dimension, dtype=np.float32).reshape(
            len(texts), self.dimension
        ) + 1


def test_embeddings_are_float32_normalized_and_batched() -> None:
    encoder = FakeEncoder()
    service = EmbeddingService(encoder=encoder, batch_size=32, device="cpu")

    vectors = service.embed(["first", "second"])

    assert vectors.shape == (2, 384)
    assert vectors.dtype == np.float32
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0)
    assert encoder.calls[0]["batch_size"] == 32
    assert encoder.calls[0]["normalize_embeddings"] is True


def test_empty_embedding_result_keeps_model_dimension() -> None:
    service = EmbeddingService(encoder=FakeEncoder(3))

    vectors = service.embed([])

    assert vectors.shape == (0, 3)
    assert vectors.dtype == np.float32
