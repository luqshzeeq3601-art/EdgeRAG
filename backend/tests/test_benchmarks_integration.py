"""Integration test executing a 2-question benchmark comparing smollm2:135m and qwen2.5:0.5b with live hardware logging."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.benchmarks.repository import BenchmarkRepository
from app.core.config import Settings
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.persistence.database import Database
from app.providers.ollama import OllamaProvider
from app.services.benchmark import (
    BenchmarkEngine,
    BenchmarkExecutionPlan,
    aggregate_model_metrics,
)
from app.services.monitoring import HardwareMonitor


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


def are_models_available(*models: str) -> bool:
    try:
        r = httpx.get("http://127.0.0.1:11434/api/tags", timeout=2.0)
        if r.status_code != 200:
            return False
        installed = [m["name"] for m in r.json().get("models", [])]
        return all(any(m in item for item in installed) for m in models)
    except Exception:
        return False


REQUIRED_MODELS = ("smollm2:135m", "qwen2.5:0.5b")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not are_models_available(*REQUIRED_MODELS),
    reason=f"Requires live Ollama with models {REQUIRED_MODELS}",
)
async def test_live_two_model_benchmark_with_hardware_telemetry(tmp_path: Path) -> None:
    db_path = tmp_path / "bench_integration.sqlite3"
    database = Database(db_path)
    database.initialize()

    settings = Settings(
        database_path=db_path,
        vector_index_path=tmp_path / "bench.faiss",
        document_storage_path=tmp_path / "docs",
        _env_file=None,
    )

    doc_repo = DocumentRepository(database)
    pipeline = DocumentPipeline.from_settings(settings, doc_repo)
    provider = OllamaProvider(base_url=settings.ollama_base_url, timeout_seconds=60.0)
    bench_repo = BenchmarkRepository(database)
    monitor = HardwareMonitor(sample_interval_seconds=0.2)
    engine = BenchmarkEngine(
        repository=bench_repo,
        pipeline=pipeline,
        ollama_provider=provider,
        hardware_monitor=monitor,
    )

    # 1. Ingest PDF manual
    pdf_bytes = make_pdf(
        "Emergency Cooling Pump Manual. The cooling pump operates at 2400 RPM with a rated flow rate of 350 L/min. Maximum operating pressure is 12.5 bar."
    )
    doc_record = pipeline.ingest(pdf_bytes, filename="pump_manual.pdf")
    assert doc_record.status == "ready"

    # 2. Create benchmark record
    benchmark_id = "bench_live_test_01"
    bench_record = bench_repo.create_benchmark(
        benchmark_id=benchmark_id,
        name="Live 2-Model Comparison",
        suite_id="quick_dev",
        mode="fixed_context",
        temperature_type="warm",
        models=list(REQUIRED_MODELS),
        config={"repetitions": 1, "top_k": 3},
        status="queued",
    )
    assert bench_record.status == "queued"

    # 3. Execute benchmark plan (warm run: 1 warm-up, 1 evaluated rep)
    plan = BenchmarkExecutionPlan(
        benchmark_id=benchmark_id,
        name="Live 2-Model Comparison",
        suite_id="quick_dev",
        mode="fixed_context",
        temperature_type="warm",
        models=list(REQUIRED_MODELS),
        repetitions=1,
        top_k=3,
    )

    completed_record = await engine.run_benchmark(plan)
    assert completed_record.status == "completed"
    assert completed_record.completed_at is not None

    # 4. Verify trials
    trials = bench_repo.list_trials(benchmark_id)
    assert len(trials) > 0

    # Ensure both models have trials recorded
    recorded_models = {t.model_name for t in trials}
    assert "smollm2:135m" in recorded_models
    assert "qwen2.5:0.5b" in recorded_models

    completed_trials = [t for t in trials if t.status == "completed"]
    assert len(completed_trials) >= 2

    for ct in completed_trials:
        assert ct.answer_text is not None and len(ct.answer_text) > 0
        assert ct.eval_count is not None and ct.eval_count > 0
        assert ct.eval_duration_ms is not None and ct.eval_duration_ms > 0
        assert ct.tokens_per_second is not None and ct.tokens_per_second > 0
        assert ct.total_duration_ms is not None and ct.total_duration_ms > 0
        assert len(ct.sources) > 0

    # 5. Verify hardware resource telemetry
    samples = bench_repo.list_resource_samples(benchmark_id)
    assert len(samples) > 0
    # Inspect sample data
    for s in samples[:3]:
        assert s.host_cpu_percent >= 0.0
        assert s.host_ram_used_bytes > 0
        assert s.backend_rss_bytes > 0
        assert s.process_gpu_vram_reason is not None

    # 6. Verify aggregated metrics
    aggregated = aggregate_model_metrics(trials)
    assert "smollm2:135m" in aggregated
    assert "qwen2.5:0.5b" in aggregated
    assert aggregated["smollm2:135m"]["completed_trials"] >= 1
    assert aggregated["qwen2.5:0.5b"]["completed_trials"] >= 1
    assert aggregated["smollm2:135m"]["tokens_per_second"]["mean"] > 0
    assert aggregated["qwen2.5:0.5b"]["tokens_per_second"]["mean"] > 0
