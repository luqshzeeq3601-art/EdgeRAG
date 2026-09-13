from pathlib import Path

import pytest

from app.core.config import Settings


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EDGERAG_DATABASE_PATH", raising=False)
    monkeypatch.delenv("EDGERAG_OLLAMA_BASE_URL", raising=False)
    monkeypatch.delenv("EDGERAG_OLLAMA_TIMEOUT_SECONDS", raising=False)

    settings = Settings(_env_file=None)

    assert settings.app_name == "EdgeRAG"
    assert settings.database_path == Path("data/db/edgerag.sqlite3")
    assert settings.document_storage_path == Path("data/documents")
    assert settings.vector_index_path == Path("data/indexes/edgerag.faiss")
    assert settings.ollama_base_url == "http://127.0.0.1:11434"
    assert settings.ollama_timeout_seconds == 2.0
    assert settings.max_upload_bytes == 25 * 1024 * 1024
    assert settings.max_pdf_pages == 300
    assert settings.chunk_size_tokens == 220
    assert settings.chunk_overlap_tokens == 40
    assert settings.top_k == 5
    assert settings.embedding_model_name == "sentence-transformers/all-MiniLM-L6-v2"
    assert settings.embedding_batch_size == 32
    assert settings.embedding_device == "cpu"


def test_settings_environment_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    database_path = tmp_path / "isolated.sqlite3"
    monkeypatch.setenv("EDGERAG_DATABASE_PATH", str(database_path))
    monkeypatch.setenv("EDGERAG_OLLAMA_BASE_URL", "http://localhost:11434/")
    monkeypatch.setenv("EDGERAG_OLLAMA_TIMEOUT_SECONDS", "4.5")
    monkeypatch.setenv("EDGERAG_TOP_K", "7")

    settings = Settings(_env_file=None)

    assert settings.database_path == database_path
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_timeout_seconds == 4.5
    assert settings.top_k == 7


def test_settings_reject_non_http_ollama_url() -> None:
    with pytest.raises(ValueError, match=r"HTTP\(S\) URL"):
        Settings(ollama_base_url="ollama://local", _env_file=None)
