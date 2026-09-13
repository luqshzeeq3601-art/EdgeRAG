"""API tests for benchmark suite listing, execution, details, cancellation, and deletion."""

from __future__ import annotations

from pathlib import Path
from typing import Any, AsyncIterator

import pytest
from fastapi.testclient import TestClient

from app.benchmarks.repository import BenchmarkRepository
from app.core.config import Settings
from app.main import create_app
from app.persistence.database import Database
from app.providers.ollama import OllamaGenerateChunk, OllamaModelInfo, OllamaProvider, OllamaReadiness
from app.services.benchmark import BenchmarkEngine


class FakeOllamaProvider(OllamaProvider):
    async def check_readiness(self) -> OllamaReadiness:
        return OllamaReadiness(ready=True, status_code=200)

    async def list_models(self) -> list[OllamaModelInfo]:
        return [
            OllamaModelInfo(
                name="smollm2:135m",
                model="smollm2:135m",
                modified_at="",
                size=100,
                digest="d1",
            ),
            OllamaModelInfo(
                name="qwen2.5:0.5b",
                model="qwen2.5:0.5b",
                modified_at="",
                size=200,
                digest="d2",
            ),
        ]

    async def stream_generate(
        self,
        model: str,
        prompt: str,
        *,
        system: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> AsyncIterator[OllamaGenerateChunk]:
        yield OllamaGenerateChunk(
            response=f"Answer from {model} [S1].",
            done=False,
        )
        yield OllamaGenerateChunk(
            response="",
            done=True,
            total_duration=200_000_000,
            load_duration=20_000_000,
            eval_count=10,
            eval_duration=100_000_000,
        )


def test_list_benchmark_suites(tmp_path: Path) -> None:
    app = create_app(
        settings=Settings(database_path=tmp_path / "test.db", _env_file=None),
        ollama_provider=FakeOllamaProvider(),
    )
    with TestClient(app) as client:
        resp = client.get("/api/v1/benchmarks/suites")
        assert resp.status_code == 200
        suites = resp.json()
        assert len(suites) >= 3
        suite_ids = [s["id"] for s in suites]
        assert "quick_dev" in suite_ids
        assert "technical_evaluation" in suite_ids
        assert "acceptance_20" in suite_ids


def test_benchmark_crud_and_cancel(tmp_path: Path) -> None:
    app = create_app(
        settings=Settings(database_path=tmp_path / "test.db", _env_file=None),
        ollama_provider=FakeOllamaProvider(),
    )
    with TestClient(app) as client:
        # 1. Start benchmark
        create_resp = client.post(
            "/api/v1/benchmarks",
            json={
                "name": "Test Run 1",
                "suite_id": "quick_dev",
                "mode": "fixed_context",
                "temperature_type": "warm",
                "models": ["smollm2:135m"],
                "repetitions": 1,
                "top_k": 3,
            },
        )
        assert create_resp.status_code == 201
        bench_data = create_resp.json()
        bench_id = bench_data["id"]
        assert bench_data["name"] == "Test Run 1"
        assert bench_data["status"] in ("queued", "running", "completed")

        # 2. List benchmarks
        list_resp = client.get("/api/v1/benchmarks")
        assert list_resp.status_code == 200
        all_benchmarks = list_resp.json()
        assert any(b["id"] == bench_id for b in all_benchmarks)

        # 3. Get benchmark detail
        detail_resp = client.get(f"/api/v1/benchmarks/{bench_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["id"] == bench_id
        assert "trials" in detail
        assert "aggregated_metrics" in detail

        # 4. Cancel benchmark
        cancel_resp = client.post(f"/api/v1/benchmarks/{bench_id}/cancel")
        assert cancel_resp.status_code == 200

        # 5. Delete benchmark
        del_resp = client.delete(f"/api/v1/benchmarks/{bench_id}")
        assert del_resp.status_code == 204

        # 6. Verify 404 after deletion
        get_deleted = client.get(f"/api/v1/benchmarks/{bench_id}")
        assert get_deleted.status_code == 404
