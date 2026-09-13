"""Typed runtime settings for the local EdgeRAG backend."""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from defaults, environment, or ``.env``."""

    model_config = SettingsConfigDict(
        env_prefix="EDGERAG_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "EdgeRAG"
    environment: str = "development"
    database_path: Path = Path("data/db/edgerag.sqlite3")
    document_storage_path: Path = Path("data/documents")
    vector_index_path: Path = Path("data/indexes/edgerag.faiss")
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_timeout_seconds: float = Field(default=2.0, gt=0, le=60)
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, gt=0)
    max_pdf_pages: int = Field(default=300, gt=0)
    chunk_size_tokens: int = Field(default=220, gt=0)
    chunk_overlap_tokens: int = Field(default=40, ge=0)
    top_k: int = Field(default=5, ge=1, le=10)
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_batch_size: int = Field(default=32, gt=0)
    embedding_device: str = "cpu"
    static_files_path: Path | None = None

    @model_validator(mode="after")
    def validate_chunk_window(self) -> "Settings":
        if self.chunk_overlap_tokens >= self.chunk_size_tokens:
            raise ValueError("chunk_overlap_tokens must be less than chunk_size_tokens")
        return self

    @field_validator("ollama_base_url")
    @classmethod
    def validate_ollama_base_url(cls, value: str) -> str:
        """Accept only HTTP(S) origins and normalize a trailing slash."""

        normalized = value.rstrip("/")
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("ollama_base_url must be an HTTP(S) URL")
        return normalized


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process settings singleton used by the default app."""

    return Settings()
