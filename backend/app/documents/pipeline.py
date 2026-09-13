"""End-to-end local document ingestion and exact-Top-K retrieval."""

from __future__ import annotations

import hashlib
import threading
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from app.core.config import Settings
from app.documents.chunking import ChunkingService, DocumentChunk
from app.documents.ingestion import PDFIngestionService
from app.documents.repository import (
    ChunkRecord,
    DocumentNotFoundError,
    DocumentRecord,
    DocumentRepository,
    DuplicateDocumentError,
)
from app.embeddings.service import EmbeddingService
from app.vector_store import VectorMatch, VectorStore


class DocumentPipeline:
    """Coordinate validated PDFs, SQLite metadata, embeddings, and FAISS."""

    def __init__(
        self,
        *,
        repository: DocumentRepository,
        ingestion: PDFIngestionService,
        chunking: ChunkingService,
        embeddings: EmbeddingService,
        vector_store: VectorStore | None,
        vector_index_path: str | Path,
        document_storage_path: str | Path,
    ) -> None:
        self.repository = repository
        self.ingestion = ingestion
        self.chunking = chunking
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.vector_index_path = Path(vector_index_path)
        self.document_storage_path = Path(document_storage_path)
        self._lock = threading.RLock()

    @classmethod
    def from_settings(cls, settings: Settings, repository: DocumentRepository) -> "DocumentPipeline":
        # Vector store loading is deferred to startup lifespan / initialize_and_validate_index
        embeddings = EmbeddingService(
            model_name=settings.embedding_model_name,
            batch_size=settings.embedding_batch_size,
            device=settings.embedding_device,
        )
        return cls(
            repository=repository,
            ingestion=PDFIngestionService(
                max_upload_bytes=settings.max_upload_bytes,
                max_pdf_pages=settings.max_pdf_pages,
            ),
            chunking=ChunkingService(
                chunk_size_tokens=settings.chunk_size_tokens,
                chunk_overlap_tokens=settings.chunk_overlap_tokens,
                tokenizer=embeddings.tokenizer,
            ),
            embeddings=embeddings,
            vector_store=None,
            vector_index_path=settings.vector_index_path,
            document_storage_path=settings.document_storage_path,
        )

    def initialize_and_validate_index(self) -> None:
        """Validate FAISS index against SQLite authoritative chunks; auto-rebuild if missing or corrupt."""
        with self._lock:
            self.repository.cleanup_stale_processing()
            expected_count = self.repository.count_ready_chunks()
            expected_dim = self.embeddings.dimension

            needs_rebuild = False
            if not self.vector_index_path.exists():
                if expected_count > 0:
                    needs_rebuild = True
                else:
                    self.vector_store = VectorStore(expected_dim)
                    return

            if not needs_rebuild:
                try:
                    store = VectorStore.load(self.vector_index_path)
                    if store.dimension != expected_dim or store.count != expected_count:
                        needs_rebuild = True
                    else:
                        self.vector_store = store
                except Exception:
                    needs_rebuild = True

            if needs_rebuild:
                self.rebuild_index()

    def rebuild_index(self) -> None:
        """Rebuild the FAISS index atomically from all ready chunks in SQLite."""
        ready_chunks = self.repository.get_ready_chunks()
        expected_dim = self.embeddings.dimension
        new_store = VectorStore(expected_dim)

        if ready_chunks:
            texts = [chunk.text for chunk in ready_chunks]
            vector_ids = [chunk.vector_id for chunk in ready_chunks]
            vectors = self.embeddings.embed(texts)
            new_store.add(vectors, vector_ids)

        new_store.save_atomic(self.vector_index_path)
        self.vector_store = new_store

    def ingest(self, data: bytes, *, filename: str) -> DocumentRecord:
        with self._lock:
            if self.vector_store is None:
                self.initialize_and_validate_index()

            extracted = self.ingestion.ingest(data, filename=filename)
            if self.repository.find_by_sha256(extracted.sha256):
                raise DuplicateDocumentError(extracted.sha256)

            document_id = str(uuid5(NAMESPACE_URL, f"edgerag:document:{extracted.sha256}"))
            stored_path = self.document_storage_path / f"{extracted.sha256}.pdf"
            record = self.repository.create(
                document_id=document_id,
                filename=extracted.filename,
                sha256=extracted.sha256,
                size_bytes=extracted.size_bytes,
                page_count=extracted.page_count,
                stored_path=str(stored_path),
            )
            vector_ids: list[int] = []
            temp_stored: Path | None = None
            try:
                chunks = self.chunking.chunk_pages(extracted.pages)
                if not chunks:
                    raise ValueError("PDF produced no usable chunks")
                chunk_ids = [_chunk_id(extracted.sha256, chunk) for chunk in chunks]
                vector_ids = [_vector_id(chunk_id) for chunk_id in chunk_ids]
                vectors = self.embeddings.embed([chunk.text for chunk in chunks])
                if self.vector_store is None:
                    self.vector_store = VectorStore(vectors.shape[1])
                self.repository.add_chunks(record.id, chunks, chunk_ids, vector_ids)
                self.vector_store.add(vectors, vector_ids)
                self.vector_store.save_atomic(self.vector_index_path)

                # Staged atomic file write for raw PDF
                self.document_storage_path.mkdir(parents=True, exist_ok=True)
                temp_stored = stored_path.with_suffix(".tmp")
                temp_stored.write_bytes(data)
                temp_stored.replace(stored_path)

                return self.repository.mark_ready(record.id)
            except Exception:
                if self.vector_store is not None and vector_ids:
                    self.vector_store.remove(vector_ids)
                    self.vector_store.save_atomic(self.vector_index_path)
                try:
                    self.repository.delete(record.id)
                except DocumentNotFoundError:
                    pass
                if temp_stored is not None and temp_stored.exists():
                    temp_stored.unlink(missing_ok=True)
                if stored_path.exists():
                    stored_path.unlink(missing_ok=True)
                raise

    def list_documents(self) -> list[DocumentRecord]:
        return self.repository.list()

    def get_document(self, document_id: str) -> tuple[DocumentRecord, list[ChunkRecord]]:
        return self.repository.get(document_id), self.repository.get_chunks(document_id)

    def delete_document(self, document_id: str) -> None:
        with self._lock:
            if self.vector_store is None:
                self.initialize_and_validate_index()
            vector_ids = self.repository.delete(document_id)
            if self.vector_store is not None:
                self.vector_store.remove(vector_ids)
                self.vector_store.save_atomic(self.vector_index_path)

    def retrieve(self, query: str, top_k: int = 5) -> list[tuple[VectorMatch, ChunkRecord]]:
        if not query.strip():
            raise ValueError("query must not be empty")
        if self.vector_store is None:
            self.initialize_and_validate_index()
        if self.vector_store is None or self.vector_store.count == 0:
            return []
        query_vector = self.embeddings.embed([query])
        matches = self.vector_store.search(query_vector[0], top_k=top_k)
        records = self.repository.get_chunks_by_vector_ids(match.vector_id for match in matches)
        return [(match, records[match.vector_id]) for match in matches if match.vector_id in records]


def _chunk_id(document_sha256: str, chunk: DocumentChunk) -> str:
    payload = f"{document_sha256}:{chunk.page_number}:{chunk.ordinal}:{chunk.text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _vector_id(chunk_id: str) -> int:
    return int.from_bytes(hashlib.sha256(chunk_id.encode("ascii")).digest()[:8], "big") & 0x7FFF_FFFF_FFFF_FFFF
