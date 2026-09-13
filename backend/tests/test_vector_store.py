from __future__ import annotations

import numpy as np

from app.vector_store import VectorStore


def test_faiss_id_mapping_search_remove_and_reload(tmp_path) -> None:
    store = VectorStore(3)
    vectors = np.array(
        [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.8, 0.2, 0.0]],
        dtype=np.float32,
    )
    store.add(vectors, [101, 202, 303])

    matches = store.search(np.array([1.0, 0.0, 0.0], dtype=np.float32), top_k=2)
    assert [match.vector_id for match in matches] == [101, 303]
    assert matches[0].score > matches[1].score

    path = tmp_path / "index.faiss"
    store.save_atomic(path)
    loaded = VectorStore.load(path)
    assert loaded.count == 3
    assert [match.vector_id for match in loaded.search(vectors[1], top_k=1)] == [202]

    assert loaded.remove([202]) == 1
    assert loaded.count == 2
    assert [match.vector_id for match in loaded.search(vectors[1], top_k=3)] == [303, 101]


def test_vector_store_rejects_wrong_shape_and_zero_vector() -> None:
    store = VectorStore(2)

    try:
        store.add(np.ones((1, 3), dtype=np.float32), [1])
    except ValueError as exc:
        assert "dimension" in str(exc)
    else:
        raise AssertionError("wrong vector dimension was accepted")

    try:
        store.add(np.zeros((1, 2), dtype=np.float32), [1])
    except ValueError as exc:
        assert "zero" in str(exc)
    else:
        raise AssertionError("zero vector was accepted")
