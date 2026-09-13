from __future__ import annotations

from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.core.config import Settings
from app.documents.chunking import ChunkingService
from app.documents.ingestion import PDFIngestionService
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.embeddings.service import EmbeddingService
from app.main import create_app
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
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class KeywordEncoder:
    def get_sentence_embedding_dimension(self) -> int:
        return 3

    def encode(self, texts: list[str], **_: object) -> np.ndarray:
        rows = []
        for text in texts:
            lower = text.lower()
            rows.append(
                [1.0, 0.0, 0.0]
                if "temperature" in lower
                else [0.0, 1.0, 0.0]
                if "pressure" in lower
                else [0.0, 0.0, 1.0]
            )
        return np.asarray(rows, dtype=np.float32)


def test_one_pdf_produces_cited_retrieval_source(tmp_path) -> None:
    database = Database(tmp_path / "edgerag.sqlite3")
    repository = DocumentRepository(database)
    pipeline = DocumentPipeline(
        repository=repository,
        ingestion=PDFIngestionService(),
        chunking=ChunkingService(),
        embeddings=EmbeddingService(encoder=KeywordEncoder()),
        vector_store=VectorStore(3),
        vector_index_path=tmp_path / "index.faiss",
        document_storage_path=tmp_path / "documents",
    )
    application = create_app(
        settings=Settings(database_path=tmp_path / "edgerag.sqlite3", _env_file=None),
        database=database,
        document_pipeline=pipeline,
    )
    pdf = make_pdf("Temperature limit is 80 C.", "Pressure limit is 5 bar.")

    with TestClient(application) as client:
        upload = client.post(
            "/api/v1/documents",
            files={"file": ("manual.pdf", pdf, "application/pdf")},
        )
        assert upload.status_code == 201
        document = upload.json()

        listing = client.get("/api/v1/documents")
        detail = client.get(f"/api/v1/documents/{document['id']}")
        retrieval = client.post(
            "/api/v1/retrieval",
            json={"query": "What is the temperature limit?", "top_k": 1},
        )
        duplicate = client.post(
            "/api/v1/documents",
            files={"file": ("manual-again.pdf", pdf, "application/pdf")},
        )
        deleted = client.delete(f"/api/v1/documents/{document['id']}")
        missing = client.get(f"/api/v1/documents/{document['id']}")
        after_delete = client.post(
            "/api/v1/retrieval",
            json={"query": "What is the temperature limit?", "top_k": 1},
        )

    assert listing.status_code == 200
    assert listing.json()[0]["status"] == "ready"
    assert detail.status_code == 200
    assert detail.json()["chunk_count"] == 2
    assert retrieval.status_code == 200
    sources = retrieval.json()["sources"]
    assert len(sources) == 1
    assert sources[0]["source_id"] == "S1"
    assert sources[0]["page_number"] == 1
    assert sources[0]["filename"] == "manual.pdf"
    assert "Temperature limit" in sources[0]["text"]
    assert duplicate.status_code == 409
    assert deleted.status_code == 204
    assert missing.status_code == 404
    assert after_delete.json()["sources"] == []
