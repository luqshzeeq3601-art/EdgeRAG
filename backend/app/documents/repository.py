"""SQLite persistence for uploaded documents and authoritative chunk metadata."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Literal

from app.documents.chunking import DocumentChunk
from app.persistence.database import Database


DocumentStatus = Literal["processing", "ready", "failed"]


@dataclass(frozen=True)
class DocumentRecord:
    id: str
    filename: str
    sha256: str
    size_bytes: int
    page_count: int
    status: DocumentStatus
    stored_path: str | None
    error: str | None
    created_at: str
    updated_at: str
    chunk_count: int = 0


@dataclass(frozen=True)
class ChunkRecord:
    id: int
    document_id: str
    chunk_id: str
    page_number: int
    ordinal: int
    text: str
    token_count: int
    vector_id: int


class DuplicateDocumentError(ValueError):
    """Raised when document SHA-256 already exists."""


class DocumentNotFoundError(KeyError):
    """Raised when requested document does not exist."""


class DocumentRepository:
    """Small repository with explicit transactions per operation."""

    def __init__(self, database: Database) -> None:
        self.database = database

    def find_by_sha256(self, sha256: str) -> DocumentRecord | None:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                "SELECT * FROM documents WHERE sha256 = ?", (sha256,)
            ).fetchone()
        return self._document(row) if row else None

    def create(
        self,
        *,
        document_id: str,
        filename: str,
        sha256: str,
        size_bytes: int,
        page_count: int,
        stored_path: str,
    ) -> DocumentRecord:
        timestamp = datetime.now(timezone.utc).isoformat()
        try:
            with closing(self.database.connect()) as connection, connection:
                connection.execute(
                    """
                    INSERT INTO documents
                        (id, filename, sha256, size_bytes, page_count, status,
                         stored_path, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?, ?)
                    """,
                    (
                        document_id,
                        filename,
                        sha256,
                        size_bytes,
                        page_count,
                        stored_path,
                        timestamp,
                        timestamp,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            if "sha256" in str(exc):
                raise DuplicateDocumentError(sha256) from exc
            raise
        return self.get(document_id)

    def add_chunks(
        self,
        document_id: str,
        chunks: Iterable[DocumentChunk],
        chunk_ids: Iterable[str],
        vector_ids: Iterable[int],
    ) -> list[ChunkRecord]:
        chunk_list = list(chunks)
        chunk_id_list = list(chunk_ids)
        vector_id_list = list(vector_ids)
        if not (
            len(chunk_list) == len(chunk_id_list) == len(vector_id_list)
        ):
            raise ValueError("Chunk, chunk ID, and vector ID counts must match")
        with closing(self.database.connect()) as connection, connection:
            for chunk, chunk_id, vector_id in zip(
                chunk_list, chunk_id_list, vector_id_list
            ):
                connection.execute(
                    """
                    INSERT INTO document_chunks
                        (document_id, chunk_id, page_number, ordinal, text,
                         token_count, vector_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        document_id,
                        chunk_id,
                        chunk.page_number,
                        chunk.ordinal,
                        chunk.text,
                        chunk.token_count,
                        vector_id,
                    ),
                )
        return self.get_chunks(document_id)

    def mark_ready(self, document_id: str) -> DocumentRecord:
        return self._mark(document_id, "ready", None)

    def mark_failed(self, document_id: str, error: str) -> DocumentRecord:
        return self._mark(document_id, "failed", error)

    def list(self) -> list[DocumentRecord]:
        with closing(self.database.connect()) as connection, connection:
            rows = connection.execute(
                """
                SELECT d.*, COUNT(c.id) AS chunk_count
                FROM documents AS d
                LEFT JOIN document_chunks AS c ON c.document_id = d.id
                GROUP BY d.id
                ORDER BY d.created_at DESC
                """
            ).fetchall()
        return [self._document(row) for row in rows]

    def get(self, document_id: str) -> DocumentRecord:
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                """
                SELECT d.*, COUNT(c.id) AS chunk_count
                FROM documents AS d
                LEFT JOIN document_chunks AS c ON c.document_id = d.id
                WHERE d.id = ?
                GROUP BY d.id
                """,
                (document_id,),
            ).fetchone()
        if not row:
            raise DocumentNotFoundError(document_id)
        return self._document(row)

    def get_chunks(self, document_id: str) -> list[ChunkRecord]:
        with closing(self.database.connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ? ORDER BY page_number, ordinal",
                (document_id,),
            ).fetchall()
        return [self._chunk(row) for row in rows]

    def count_ready_chunks(self) -> int:
        """Count total chunks belonging to ready documents."""
        with closing(self.database.connect()) as connection:
            row = connection.execute(
                """
                SELECT COUNT(c.id) AS total
                FROM document_chunks AS c
                JOIN documents AS d ON d.id = c.document_id
                WHERE d.status = 'ready'
                """
            ).fetchone()
        return int(row["total"]) if row else 0

    def get_ready_chunks(self) -> list[ChunkRecord]:
        """Return all chunks belonging to ready documents, ordered by id."""
        with closing(self.database.connect()) as connection:
            rows = connection.execute(
                """
                SELECT c.*
                FROM document_chunks AS c
                JOIN documents AS d ON d.id = c.document_id
                WHERE d.status = 'ready'
                ORDER BY c.id ASC
                """
            ).fetchall()
        return [self._chunk(row) for row in rows]

    def cleanup_stale_processing(self) -> int:
        """Mark any interrupted 'processing' documents as failed."""
        timestamp = datetime.now(timezone.utc).isoformat()
        with closing(self.database.connect()) as connection, connection:
            cur = connection.execute(
                """
                UPDATE documents
                SET status = 'failed', error = 'Interrupted during ingestion', updated_at = ?
                WHERE status = 'processing'
                """,
                (timestamp,),
            )
            return cur.rowcount

    def get_chunks_by_vector_ids(self, vector_ids: Iterable[int]) -> dict[int, ChunkRecord]:
        ids = list(vector_ids)
        if not ids:
            return {}
        placeholders = ",".join("?" for _ in ids)
        with closing(self.database.connect()) as connection:
            rows = connection.execute(
                f"SELECT * FROM document_chunks WHERE vector_id IN ({placeholders})",
                ids,
            ).fetchall()
        return {row["vector_id"]: self._chunk(row) for row in rows}

    def delete(self, document_id: str) -> list[int]:
        chunks = self.get_chunks(document_id)
        with closing(self.database.connect()) as connection, connection:
            deleted = connection.execute(
                "DELETE FROM documents WHERE id = ?", (document_id,)
            ).rowcount
        if not deleted:
            raise DocumentNotFoundError(document_id)
        return [chunk.vector_id for chunk in chunks]

    def _mark(
        self, document_id: str, status: DocumentStatus, error: str | None
    ) -> DocumentRecord:
        timestamp = datetime.now(timezone.utc).isoformat()
        with closing(self.database.connect()) as connection, connection:
            connection.execute(
                "UPDATE documents SET status = ?, error = ?, updated_at = ? WHERE id = ?",
                (status, error, timestamp, document_id),
            )
        return self.get(document_id)

    @staticmethod
    def _document(row: sqlite3.Row) -> DocumentRecord:
        return DocumentRecord(
            id=row["id"],
            filename=row["filename"],
            sha256=row["sha256"],
            size_bytes=row["size_bytes"],
            page_count=row["page_count"],
            status=row["status"],
            stored_path=row["stored_path"],
            error=row["error"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            chunk_count=row["chunk_count"] if "chunk_count" in row.keys() else 0,
        )

    @staticmethod
    def _chunk(row: sqlite3.Row) -> ChunkRecord:
        return ChunkRecord(
            id=row["id"],
            document_id=row["document_id"],
            chunk_id=row["chunk_id"],
            page_number=row["page_number"],
            ordinal=row["ordinal"],
            text=row["text"],
            token_count=row["token_count"],
            vector_id=row["vector_id"],
        )
