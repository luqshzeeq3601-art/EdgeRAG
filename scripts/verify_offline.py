"""Verify 100% offline operation of EdgeRAG: ingestion, retrieval, and RAG streaming."""

from __future__ import annotations

import os
import socket
import sys

# Force offline environment variables before any library imports
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"

# Monkeypatch socket to block non-loopback network connections
_orig_connect = socket.socket.connect


def _guarded_connect(self, address):
    host = address[0] if isinstance(address, tuple) else address
    # Allow localhost and loopback IPv4/IPv6
    if host in ("127.0.0.1", "localhost", "::1"):
        return _orig_connect(self, address)
    raise ConnectionRefusedError(
        f"EXTERNAL NETWORK BLOCKED: Attempted connection to non-loopback host {host}"
    )


socket.socket.connect = _guarded_connect

from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

import httpx

from app.core.config import Settings
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.persistence.database import Database
from app.providers.ollama import OllamaProvider
from app.services.rag import RAGService


def make_offline_test_pdf() -> bytes:
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
    page = writer.add_blank_page(width=612, height=792)
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 72 720 Td (Offline Generator Core: 380V at 60Hz. Max vibration limit 1.8 mm/s.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)

    from io import BytesIO

    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def main() -> None:
    print("[1/4] Verifying offline environment flags...")
    assert os.environ.get("HF_HUB_OFFLINE") == "1"
    assert os.environ.get("TRANSFORMERS_OFFLINE") == "1"
    print("      Offline environment flags active.")

    print("[2/4] Initializing isolated offline pipeline & local embeddings...")
    import tempfile

    with tempfile.TemporaryDirectory(prefix="edgerag_offline_") as tmp_dir_str:
        temp_dir = Path(tmp_dir_str)
        db_path = temp_dir / "sqlite" / "test_offline.sqlite3"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        docs_dir = temp_dir / "documents"
        docs_dir.mkdir(parents=True, exist_ok=True)
        faiss_dir = temp_dir / "indexes"
        faiss_dir.mkdir(parents=True, exist_ok=True)
        index_path = faiss_dir / "test.faiss"

        db = Database(db_path)
        db.initialize()
        repo = DocumentRepository(db)

        settings = Settings(
            database_path=db_path,
            document_storage_path=docs_dir,
            vector_index_path=index_path,
            embedding_model_name="sentence-transformers/all-MiniLM-L6-v2",
            embedding_device="cpu",
            _env_file=None,
        )

        pipeline = DocumentPipeline.from_settings(settings, repo)

        print("[3/4] Ingesting PDF completely offline...")
        pdf_bytes = make_offline_test_pdf()
        record = pipeline.ingest(pdf_bytes, filename="offline_core_spec.pdf")
        print(f"      Document ingested: ID={record.id}, Chunks={record.chunk_count}, Status={record.status}")
        assert record.status == "ready"

        print("[4/4] Retrieving passages & streaming response via local Ollama...")
        matches = pipeline.retrieve("What is the maximum vibration limit?", top_k=1)
        assert len(matches) == 1
        matched_chunk = matches[0][1]
        print(f"      Retrieved passage: {matched_chunk.text}")
        assert "1.8 mm/s" in matched_chunk.text

        # Test local RAG service
        ollama_provider = OllamaProvider(base_url="http://127.0.0.1:11434")
        rag = RAGService(pipeline=pipeline, ollama_provider=ollama_provider)

        import asyncio

        async def run_rag():
            tokens = []
            async for event_type, payload in rag.ask_stream("What is the vibration limit?", model="smollm2:135m"):
                if event_type == "delta":
                    tokens.append(payload.get("text", ""))
            return "".join(tokens)

        answer = asyncio.run(run_rag())
        print(f"      Model Answer: {answer}")
        assert len(answer) > 0

        print("\nSUCCESS: All operations (embedding, indexing, retrieval, generation) completed with ZERO external network!")


if __name__ == "__main__":
    main()
