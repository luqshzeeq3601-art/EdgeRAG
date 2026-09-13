"""End-to-end integration test with live installed Ollama model and uploaded PDF."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.core.config import Settings
from app.main import create_app
from app.providers.ollama import OllamaProvider


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


def parse_sse_events(raw_body: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    current_event = "message"
    current_data: list[str] = []

    for line in raw_body.splitlines():
        if line.startswith("event: "):
            current_event = line[len("event: ") :].strip()
        elif line.startswith("data: "):
            current_data.append(line[len("data: ") :].strip())
        elif line == "":
            if current_data:
                parsed_json = json.loads("".join(current_data))
                events.append((current_event, parsed_json))
                current_data = []
                current_event = "message"

    if current_data:
        parsed_json = json.loads("".join(current_data))
        events.append((current_event, parsed_json))

    return events


def is_ollama_available_with_model(model_name: str) -> bool:
    try:
        r = httpx.get("http://127.0.0.1:11434/api/tags", timeout=2.0)
        if r.status_code != 200:
            return False
        models = [m["name"] for m in r.json().get("models", [])]
        return any(m.startswith(model_name) for m in models)
    except Exception:
        return False


LIVE_MODEL = "smollm2:135m"


@pytest.mark.skipif(
    not is_ollama_available_with_model(LIVE_MODEL),
    reason=f"Live Ollama service or model {LIVE_MODEL} is unavailable",
)
def test_live_ollama_rag_with_uploaded_pdf(tmp_path: Path) -> None:
    settings = Settings(
        database_path=tmp_path / "integration.db",
        vector_index_path=tmp_path / "integration.faiss",
        document_storage_path=tmp_path / "docs",
        _env_file=None,
    )
    provider = OllamaProvider(base_url=settings.ollama_base_url, timeout_seconds=60.0)
    app = create_app(settings=settings, ollama_provider=provider)

    with TestClient(app) as client:
        # 1. Discover models
        models_resp = client.get("/api/v1/models")
        assert models_resp.status_code == 200
        available_models = [m["name"] for m in models_resp.json()]
        assert any(LIVE_MODEL in name for name in available_models)

        # 2. Upload technical manual PDF
        pdf_bytes = make_pdf(
            "Emergency Cooling Pump Manual. The cooling pump operates at 2400 RPM with a flow rate of 350 L/min. Maximum operating pressure is 12.5 bar."
        )
        upload_resp = client.post(
            "/api/v1/documents",
            files={"file": ("cooling_pump.pdf", pdf_bytes, "application/pdf")},
        )
        assert upload_resp.status_code == 201
        doc_id = upload_resp.json()["id"]
        assert upload_resp.json()["status"] == "ready"

        # 3. Ask a grounded question against the document
        ask_resp = client.post(
            "/api/v1/rag/ask",
            json={
                "query": "What is the operating speed and maximum operating pressure of the cooling pump?",
                "model": LIVE_MODEL,
                "top_k": 3,
            },
        )
        assert ask_resp.status_code == 200
        assert "text/event-stream" in ask_resp.headers["content-type"]

        events = parse_sse_events(ask_resp.text)
        assert len(events) >= 3

        # First event must be sources
        event_types = [e[0] for e in events]
        assert event_types[0] == "sources"
        sources = events[0][1]["sources"]
        assert len(sources) >= 1
        assert sources[0]["source_id"] == "S1"
        assert sources[0]["filename"] == "cooling_pump.pdf"
        assert "2400 RPM" in sources[0]["text"]

        # Final event must be done
        assert event_types[-1] == "done"
        done_payload = events[-1][1]
        assert done_payload["abstained"] is False
        assert done_payload["sources_count"] >= 1
        assert len(done_payload["answer"]) > 0
        assert done_payload["timings"]["retrieval_ms"] > 0
        assert done_payload["timings"]["total_ms"] > 0
        assert "citations" in done_payload
