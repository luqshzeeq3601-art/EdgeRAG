"""Persistent FAISS store with explicit SQLite-facing vector IDs."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import faiss
import numpy as np


@dataclass(frozen=True)
class VectorMatch:
    """One FAISS result with its stable external vector ID."""

    vector_id: int
    score: float


class VectorStore:
    """IndexIDMap2 over cosine-compatible inner product vectors."""

    def __init__(self, dimension: int) -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        self.dimension = dimension
        self.index = faiss.IndexIDMap2(faiss.IndexFlatIP(dimension))

    @classmethod
    def load(cls, path: str | Path) -> "VectorStore":
        """Load an existing ID-mapped index safely via memory buffer."""

        data = Path(path).read_bytes()
        array = np.frombuffer(data, dtype=np.uint8)
        index = faiss.deserialize_index(array)
        if not isinstance(index, faiss.IndexIDMap2):
            raise ValueError("FAISS index must be IndexIDMap2")
        store = cls(index.d)
        store.index = index
        return store

    @property
    def count(self) -> int:
        return int(self.index.ntotal)

    def add(self, vectors: np.ndarray, vector_ids: Iterable[int]) -> None:
        array = np.asarray(vectors, dtype=np.float32)
        ids = np.asarray(list(vector_ids), dtype=np.int64)
        if array.ndim != 2 or array.shape[1] != self.dimension:
            raise ValueError(
                f"Vector shape {array.shape} does not match dimension {self.dimension}"
            )
        if array.shape[0] != ids.shape[0]:
            raise ValueError("Each vector must have one vector ID")
        if array.shape[0] == 0:
            return
        norms = np.linalg.norm(array, axis=1)
        if np.any(norms == 0):
            raise ValueError("VectorStore cannot index zero vectors")
        normalized = array / norms[:, None]
        self.index.add_with_ids(normalized, ids)

    def search(self, query: np.ndarray, top_k: int = 5) -> list[VectorMatch]:
        """Return at most exact requested Top-K matches, best score first."""

        if top_k < 1:
            raise ValueError("top_k must be at least 1")
        array = np.asarray(query, dtype=np.float32)
        if array.ndim == 1:
            array = array.reshape(1, -1)
        if array.shape != (1, self.dimension):
            raise ValueError(f"Query shape {array.shape} is invalid")
        if self.count == 0:
            return []
        norm = np.linalg.norm(array[0])
        if norm == 0:
            raise ValueError("Query cannot be a zero vector")
        scores, ids = self.index.search(array / norm, min(top_k, self.count))
        return [
            VectorMatch(vector_id=int(vector_id), score=float(score))
            for score, vector_id in zip(scores[0], ids[0])
            if vector_id != -1
        ]

    def remove(self, vector_ids: Iterable[int]) -> int:
        ids = np.asarray(list(vector_ids), dtype=np.int64)
        return int(self.index.remove_ids(ids)) if ids.size else 0

    def save_atomic(self, path: str | Path) -> None:
        """Write index beside target, then replace target atomically."""

        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        serialized = faiss.serialize_index(self.index)

        fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(serialized)
            os.replace(temporary, target)
        except Exception:
            if os.path.exists(temporary):
                os.unlink(temporary)
            raise
