"""Fault-injection and resilience tests for DocumentPipeline and FAISS index recovery."""

from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.core.config import Settings
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.persistence.database import Database
from app.vector_store import VectorStore


def make_pdf(*texts: str) -> bytes:
    writer = PdfWriter()
    font = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
    )
    for text in texts:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream.set_data(f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
def isolated_pipeline(tmp_path: Path) -> DocumentPipeline:
    db_path = tmp_path / "test.sqlite3"
    index_path = tmp_path / "test.faiss"
    docs_path = tmp_path / "docs"

    db = Database(db_path)
    db.initialize()
    repo = DocumentRepository(db)

    settings = Settings(
        database_path=db_path,
        vector_index_path=index_path,
        document_storage_path=docs_path,
    )
    pipeline = DocumentPipeline.from_settings(settings, repo)
    pipeline.initialize_and_validate_index()
    return pipeline


def test_faiss_auto_rebuilds_from_sqlite_when_file_corrupted(isolated_pipeline: DocumentPipeline) -> None:
    pipeline = isolated_pipeline
    pdf_bytes = make_pdf("Operating pressure is 12.5 bar for emergency cooling pump.")

    record = pipeline.ingest(pdf_bytes, filename="pump.pdf")
    assert record.status == "ready"
    assert pipeline.vector_store is not None
    assert pipeline.vector_store.count == 1

    # Corrupt the FAISS index file on disk
    pipeline.vector_index_path.write_bytes(b"CORRUPTED_GARBAGE_INDEX_BYTES")

    # Re-initialize/validate as occurs during startup lifespan
    pipeline.initialize_and_validate_index()

    # Verify auto-rebuild restored the vector count and search functionality
    assert pipeline.vector_store is not None
    assert pipeline.vector_store.count == 1
    matches = pipeline.retrieve("operating pressure", top_k=1)
    assert len(matches) == 1
    assert "12.5 bar" in matches[0][1].text


def test_faiss_auto_rebuilds_when_index_file_missing(isolated_pipeline: DocumentPipeline) -> None:
    pipeline = isolated_pipeline
    pdf_bytes = make_pdf("Bearing lubricant must be ISO VG 46 synthetic gear oil.")

    record = pipeline.ingest(pdf_bytes, filename="lubricant.pdf")
    assert record.status == "ready"

    # Delete the FAISS index file while SQLite still has the chunk
    pipeline.vector_index_path.unlink()
    assert not pipeline.vector_index_path.exists()

    # Re-validate
    pipeline.initialize_and_validate_index()

    assert pipeline.vector_index_path.exists()
    assert pipeline.vector_store.count == 1
    matches = pipeline.retrieve("bearing lubricant", top_k=1)
    assert len(matches) == 1
    assert "ISO VG 46" in matches[0][1].text


def test_partial_upload_failure_does_not_corrupt_vector_store(isolated_pipeline: DocumentPipeline) -> None:
    pipeline = isolated_pipeline
    pdf_bytes = make_pdf("Standard flow is 350 L/min.")

    # Ingest a healthy document first
    first = pipeline.ingest(pdf_bytes, filename="valid.pdf")
    assert first.status == "ready"
    initial_count = pipeline.vector_store.count

    # Inject a fault during chunk embedding for a second document
    bad_pdf_bytes = make_pdf("Faulty payload text.")
    with patch.object(pipeline.embeddings, "embed", side_effect=RuntimeError("GPU OOM fault simulation")):
        with pytest.raises(RuntimeError, match="GPU OOM fault simulation"):
            pipeline.ingest(bad_pdf_bytes, filename="faulty.pdf")

    # Verify vector store count remains clean and matching SQLite
    assert pipeline.vector_store.count == initial_count
    assert pipeline.repository.count_ready_chunks() == initial_count

    # Verify documents list has only the valid document
    docs = pipeline.list_documents()
    assert len(docs) == 1
    assert docs[0].filename == "valid.pdf"

    # Subsequent valid ingestion works properly
    second_pdf = make_pdf("Impeller wear rings clearance 0.8 mm.")
    second = pipeline.ingest(second_pdf, filename="second.pdf")
    assert second.status == "ready"
    assert pipeline.vector_store.count == initial_count + 1
