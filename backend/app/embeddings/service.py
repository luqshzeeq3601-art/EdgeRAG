"""CPU sentence embeddings with deterministic normalization and batching."""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class EmbeddingService:
    """Lazily load one CPU Sentence Transformer model."""

    def __init__(
        self,
        *,
        model_name: str = DEFAULT_EMBEDDING_MODEL,
        batch_size: int = 32,
        device: str = "cpu",
        encoder: Any | None = None,
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        self.model_name = model_name
        self.batch_size = batch_size
        self.device = device
        self._encoder = encoder

    @property
    def encoder(self) -> Any:
        if self._encoder is None:
            self._encoder = SentenceTransformer(self.model_name, device=self.device)
        return self._encoder

    @property
    def tokenizer(self) -> Any:
        return getattr(self.encoder, "tokenizer", None)

    @property
    def dimension(self) -> int:
        dimension = self.encoder.get_sentence_embedding_dimension()
        if dimension is None or dimension <= 0:
            raise ValueError("Embedding model did not provide a valid dimension")
        return int(dimension)

    def embed(self, texts: Sequence[str]) -> np.ndarray:
        """Encode text as row-major float32 unit vectors."""

        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)
        vectors = self.encoder.encode(
            list(texts),
            batch_size=self.batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        array = np.asarray(vectors, dtype=np.float32)
        if array.ndim != 2 or array.shape != (len(texts), self.dimension):
            raise ValueError(
                f"Embedding shape {array.shape} does not match ({len(texts)}, {self.dimension})"
            )
        norms = np.linalg.norm(array, axis=1, keepdims=True)
        if np.any(norms == 0):
            raise ValueError("Embedding model returned a zero vector")
        return array / norms
