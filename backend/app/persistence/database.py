"""SQLite connection, integrity pragmas, and versioned foundation schema."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Final


SCHEMA_VERSION: Final[int] = 3
_MIGRATIONS: Final[tuple[tuple[int, str], ...]] = (
    (
        1,
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        2,
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            sha256 TEXT NOT NULL UNIQUE,
            size_bytes INTEGER NOT NULL,
            page_count INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
            stored_path TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_id TEXT NOT NULL UNIQUE,
            page_number INTEGER NOT NULL,
            ordinal INTEGER NOT NULL,
            text TEXT NOT NULL,
            token_count INTEGER NOT NULL,
            vector_id INTEGER NOT NULL UNIQUE,
            UNIQUE (document_id, page_number, ordinal)
        );

        CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
            ON document_chunks(document_id);
        CREATE INDEX IF NOT EXISTS idx_document_chunks_vector_id
            ON document_chunks(vector_id);
        """,
    ),
    (
        3,
        """
        CREATE TABLE IF NOT EXISTS benchmarks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            suite_id TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('fixed_context', 'end_to_end')),
            temperature_type TEXT NOT NULL CHECK (temperature_type IN ('warm', 'cold')),
            models TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
            error TEXT,
            config TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS benchmark_trials (
            id TEXT PRIMARY KEY,
            benchmark_id TEXT NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
            model_name TEXT NOT NULL,
            question_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            repetition_index INTEGER NOT NULL,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
            error TEXT,
            retrieval_duration_ms REAL,
            ttft_ms REAL,
            eval_duration_ms REAL,
            eval_count INTEGER,
            tokens_per_second REAL,
            load_duration_ms REAL,
            total_duration_ms REAL,
            answer_text TEXT,
            sources_json TEXT,
            citations_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_benchmark_trials_benchmark_id
            ON benchmark_trials(benchmark_id);

        CREATE TABLE IF NOT EXISTS benchmark_resource_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            benchmark_id TEXT NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
            trial_id TEXT REFERENCES benchmark_trials(id) ON DELETE CASCADE,
            timestamp TEXT NOT NULL,
            host_cpu_percent REAL NOT NULL,
            host_ram_used_bytes INTEGER NOT NULL,
            backend_rss_bytes INTEGER NOT NULL,
            ollama_cpu_percent REAL,
            ollama_rss_bytes INTEGER,
            gpu_utilization_percent REAL,
            gpu_vram_used_bytes INTEGER,
            gpu_vram_total_bytes INTEGER,
            process_gpu_vram_reason TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_benchmark_samples_benchmark_id
            ON benchmark_resource_samples(benchmark_id);
        CREATE INDEX IF NOT EXISTS idx_benchmark_samples_trial_id
            ON benchmark_resource_samples(trial_id);

        CREATE TABLE IF NOT EXISTS benchmark_reviews (
            id TEXT PRIMARY KEY,
            trial_id TEXT NOT NULL REFERENCES benchmark_trials(id) ON DELETE CASCADE,
            score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 2),
            groundedness INTEGER NOT NULL CHECK (groundedness BETWEEN 0 AND 2),
            usefulness INTEGER NOT NULL CHECK (usefulness BETWEEN 0 AND 2),
            notes TEXT,
            reviewed_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_benchmark_reviews_trial_id
            ON benchmark_reviews(trial_id);
        """,
    ),
)


class DatabaseConfigurationError(RuntimeError):
    """Raised when SQLite cannot provide the required integrity settings."""


@dataclass(frozen=True)
class DatabaseReadiness:
    """The observable SQLite readiness state."""

    ready: bool
    foreign_keys: bool | None = None
    journal_mode: str | None = None
    schema_version: int | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, object | None]:
        """Return a JSON-friendly representation for API responses."""

        return {
            "ready": self.ready,
            "foreign_keys": self.foreign_keys,
            "journal_mode": self.journal_mode,
            "schema_version": self.schema_version,
            "error": self.error,
        }


class Database:
    """Small SQLite database wrapper used by the application and tests."""

    def __init__(self, path: str | Path, *, timeout_seconds: float = 5.0) -> None:
        self.path = path
        self.timeout_seconds = timeout_seconds

    def connect(self) -> sqlite3.Connection:
        """Open a connection after applying and verifying SQLite pragmas."""

        if str(self.path) != ":memory:":
            Path(self.path).expanduser().parent.mkdir(parents=True, exist_ok=True)

        connection: sqlite3.Connection | None = None
        try:
            connection = sqlite3.connect(
                self.path,
                timeout=self.timeout_seconds,
                check_same_thread=False,
            )
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            foreign_keys = connection.execute("PRAGMA foreign_keys").fetchone()[0]
            is_memory = str(self.path) == ":memory:"
            if is_memory:
                # In-memory databases use the memory journal; WAL is file-only.
                journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
            else:
                journal_mode = connection.execute("PRAGMA journal_mode = WAL").fetchone()[0]

            if foreign_keys != 1:
                raise DatabaseConfigurationError("SQLite foreign_keys pragma is not enabled")
            if not is_memory and str(journal_mode).lower() != "wal":
                raise DatabaseConfigurationError(
                    f"SQLite journal_mode is {journal_mode!r}, expected 'wal'"
                )
            return connection
        except Exception:
            if connection is not None:
                connection.close()
            raise

    def initialize(self) -> DatabaseReadiness:
        """Apply the foundation migration and return the verified readiness state."""

        connection = self.connect()
        try:
            connection.execute(_MIGRATIONS[0][1])
            current_version = connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
            ).fetchone()[0]

            for version, migration in _MIGRATIONS:
                if version <= current_version:
                    continue
                connection.executescript(migration)
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (version, datetime.now(timezone.utc).isoformat()),
                )
                connection.execute(f"PRAGMA user_version = {version}")

            connection.commit()
            readiness = self._readiness_from_connection(connection)
            if not readiness.ready:
                raise DatabaseConfigurationError(readiness.error or "SQLite is not ready")
            return readiness
        finally:
            connection.close()

    def check_readiness(self) -> DatabaseReadiness:
        """Check pragmas and the migration table without raising on failures."""

        connection: sqlite3.Connection | None = None
        try:
            connection = self.connect()
            return self._readiness_from_connection(connection)
        except Exception as exc:
            return DatabaseReadiness(ready=False, error=f"SQLite readiness check failed: {exc}")
        finally:
            if connection is not None:
                connection.close()

    def _readiness_from_connection(self, connection: sqlite3.Connection) -> DatabaseReadiness:
        foreign_keys = connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        journal_mode = str(connection.execute("PRAGMA journal_mode").fetchone()[0]).lower()

        table_exists = connection.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'schema_migrations'
            """
        ).fetchone()
        schema_version: int | None = None
        if table_exists:
            schema_version = connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations"
            ).fetchone()[0]

        errors: list[str] = []
        if not foreign_keys:
            errors.append("foreign_keys pragma is not enabled")
        # In-memory databases report journal_mode=memory; only file-backed DBs require WAL.
        if journal_mode not in ("wal", "memory"):
            errors.append(f"journal_mode is {journal_mode!r}, expected 'wal'")
        if not table_exists:
            errors.append("schema_migrations table is missing")
        elif (schema_version or 0) < SCHEMA_VERSION:
            errors.append(
                f"schema version is {schema_version}, expected at least {SCHEMA_VERSION}"
            )

        return DatabaseReadiness(
            ready=not errors,
            foreign_keys=foreign_keys,
            journal_mode=journal_mode,
            schema_version=schema_version,
            error="; ".join(errors) or None,
        )
