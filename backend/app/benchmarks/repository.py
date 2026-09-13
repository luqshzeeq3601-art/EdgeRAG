"""SQLite repository for benchmarks, trials, resource samples, and reviews."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.persistence.database import Database


class BenchmarkNotFoundError(Exception):
    """Raised when a requested benchmark is not found."""


@dataclass(frozen=True)
class BenchmarkRecord:
    id: str
    name: str
    suite_id: str
    mode: str
    temperature_type: str
    models: list[str]
    status: str
    error: str | None
    config: dict[str, Any]
    created_at: str
    started_at: str | None
    completed_at: str | None


@dataclass(frozen=True)
class TrialRecord:
    id: str
    benchmark_id: str
    model_name: str
    question_id: str
    question_text: str
    repetition_index: int
    is_warmup: bool
    status: str
    error: str | None
    retrieval_duration_ms: float | None
    ttft_ms: float | None
    eval_duration_ms: float | None
    eval_count: int | None
    tokens_per_second: float | None
    load_duration_ms: float | None
    total_duration_ms: float | None
    answer_text: str | None
    sources: list[dict[str, Any]] = field(default_factory=list)
    citations: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""


@dataclass(frozen=True)
class ResourceSampleRecord:
    benchmark_id: str
    timestamp: str
    host_cpu_percent: float
    host_ram_used_bytes: int
    backend_rss_bytes: int
    ollama_cpu_percent: float | None = None
    ollama_rss_bytes: int | None = None
    gpu_utilization_percent: float | None = None
    gpu_vram_used_bytes: int | None = None
    gpu_vram_total_bytes: int | None = None
    process_gpu_vram_reason: str | None = None
    trial_id: str | None = None
    id: int | None = None


class BenchmarkRepository:
    """Authoritative SQLite store for benchmark runs and metric history."""

    def __init__(self, database: Database) -> None:
        self.database = database

    def create_benchmark(
        self,
        *,
        benchmark_id: str,
        name: str,
        suite_id: str,
        mode: str,
        temperature_type: str,
        models: list[str],
        config: dict[str, Any] | None = None,
        status: str = "queued",
    ) -> BenchmarkRecord:
        now = datetime.now(timezone.utc).isoformat()
        models_json = json.dumps(models)
        config_json = json.dumps(config or {})

        conn = self.database.connect()
        try:
            conn.execute(
                """
                INSERT INTO benchmarks (
                    id, name, suite_id, mode, temperature_type, models, status, config, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    benchmark_id,
                    name,
                    suite_id,
                    mode,
                    temperature_type,
                    models_json,
                    status,
                    config_json,
                    now,
                ),
            )
            conn.commit()
            return BenchmarkRecord(
                id=benchmark_id,
                name=name,
                suite_id=suite_id,
                mode=mode,
                temperature_type=temperature_type,
                models=models,
                status=status,
                error=None,
                config=config or {},
                created_at=now,
                started_at=None,
                completed_at=None,
            )
        finally:
            conn.close()

    def get_benchmark(self, benchmark_id: str) -> BenchmarkRecord:
        conn = self.database.connect()
        try:
            row = conn.execute(
                "SELECT * FROM benchmarks WHERE id = ?", (benchmark_id,)
            ).fetchone()
            if row is None:
                raise BenchmarkNotFoundError(f"Benchmark {benchmark_id} not found")
            return BenchmarkRecord(
                id=row["id"],
                name=row["name"],
                suite_id=row["suite_id"],
                mode=row["mode"],
                temperature_type=row["temperature_type"],
                models=json.loads(row["models"]),
                status=row["status"],
                error=row["error"],
                config=json.loads(row["config"] or "{}"),
                created_at=row["created_at"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
            )
        finally:
            conn.close()

    def list_benchmarks(self) -> list[BenchmarkRecord]:
        conn = self.database.connect()
        try:
            rows = conn.execute(
                "SELECT * FROM benchmarks ORDER BY created_at DESC"
            ).fetchall()
            return [
                BenchmarkRecord(
                    id=row["id"],
                    name=row["name"],
                    suite_id=row["suite_id"],
                    mode=row["mode"],
                    temperature_type=row["temperature_type"],
                    models=json.loads(row["models"]),
                    status=row["status"],
                    error=row["error"],
                    config=json.loads(row["config"] or "{}"),
                    created_at=row["created_at"],
                    started_at=row["started_at"],
                    completed_at=row["completed_at"],
                )
                for row in rows
            ]
        finally:
            conn.close()

    def update_benchmark_status(
        self,
        benchmark_id: str,
        status: str,
        *,
        error: str | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
    ) -> None:
        conn = self.database.connect()
        try:
            updates: list[str] = ["status = ?"]
            params: list[Any] = [status]

            if error is not None:
                updates.append("error = ?")
                params.append(error)
            if started_at is not None:
                updates.append("started_at = ?")
                params.append(started_at)
            if completed_at is not None:
                updates.append("completed_at = ?")
                params.append(completed_at)

            params.append(benchmark_id)
            conn.execute(
                f"UPDATE benchmarks SET {', '.join(updates)} WHERE id = ?",
                tuple(params),
            )
            conn.commit()
        finally:
            conn.close()

    def delete_benchmark(self, benchmark_id: str) -> None:
        conn = self.database.connect()
        try:
            cur = conn.execute("DELETE FROM benchmarks WHERE id = ?", (benchmark_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise BenchmarkNotFoundError(f"Benchmark {benchmark_id} not found")
        finally:
            conn.close()

    def create_trial(
        self,
        *,
        trial_id: str,
        benchmark_id: str,
        model_name: str,
        question_id: str,
        question_text: str,
        repetition_index: int,
        is_warmup: bool = False,
        status: str = "pending",
    ) -> TrialRecord:
        now = datetime.now(timezone.utc).isoformat()
        conn = self.database.connect()
        try:
            conn.execute(
                """
                INSERT INTO benchmark_trials (
                    id, benchmark_id, model_name, question_id, question_text,
                    repetition_index, is_warmup, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trial_id,
                    benchmark_id,
                    model_name,
                    question_id,
                    question_text,
                    repetition_index,
                    1 if is_warmup else 0,
                    status,
                    now,
                ),
            )
            conn.commit()
            return TrialRecord(
                id=trial_id,
                benchmark_id=benchmark_id,
                model_name=model_name,
                question_id=question_id,
                question_text=question_text,
                repetition_index=repetition_index,
                is_warmup=is_warmup,
                status=status,
                error=None,
                retrieval_duration_ms=None,
                ttft_ms=None,
                eval_duration_ms=None,
                eval_count=None,
                tokens_per_second=None,
                load_duration_ms=None,
                total_duration_ms=None,
                answer_text=None,
                created_at=now,
            )
        finally:
            conn.close()

    def update_trial(
        self,
        trial_id: str,
        *,
        status: str,
        error: str | None = None,
        retrieval_duration_ms: float | None = None,
        ttft_ms: float | None = None,
        eval_duration_ms: float | None = None,
        eval_count: int | None = None,
        tokens_per_second: float | None = None,
        load_duration_ms: float | None = None,
        total_duration_ms: float | None = None,
        answer_text: str | None = None,
        sources: list[dict[str, Any]] | None = None,
        citations: dict[str, Any] | None = None,
    ) -> None:
        conn = self.database.connect()
        try:
            conn.execute(
                """
                UPDATE benchmark_trials SET
                    status = ?,
                    error = ?,
                    retrieval_duration_ms = ?,
                    ttft_ms = ?,
                    eval_duration_ms = ?,
                    eval_count = ?,
                    tokens_per_second = ?,
                    load_duration_ms = ?,
                    total_duration_ms = ?,
                    answer_text = ?,
                    sources_json = ?,
                    citations_json = ?
                WHERE id = ?
                """,
                (
                    status,
                    error,
                    retrieval_duration_ms,
                    ttft_ms,
                    eval_duration_ms,
                    eval_count,
                    tokens_per_second,
                    load_duration_ms,
                    total_duration_ms,
                    answer_text,
                    json.dumps(sources) if sources is not None else None,
                    json.dumps(citations) if citations is not None else None,
                    trial_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def list_trials(self, benchmark_id: str) -> list[TrialRecord]:
        conn = self.database.connect()
        try:
            rows = conn.execute(
                "SELECT * FROM benchmark_trials WHERE benchmark_id = ? ORDER BY rowid ASC",
                (benchmark_id,),
            ).fetchall()
            return [
                TrialRecord(
                    id=row["id"],
                    benchmark_id=row["benchmark_id"],
                    model_name=row["model_name"],
                    question_id=row["question_id"],
                    question_text=row["question_text"],
                    repetition_index=row["repetition_index"],
                    is_warmup=bool(row["is_warmup"]),
                    status=row["status"],
                    error=row["error"],
                    retrieval_duration_ms=row["retrieval_duration_ms"],
                    ttft_ms=row["ttft_ms"],
                    eval_duration_ms=row["eval_duration_ms"],
                    eval_count=row["eval_count"],
                    tokens_per_second=row["tokens_per_second"],
                    load_duration_ms=row["load_duration_ms"],
                    total_duration_ms=row["total_duration_ms"],
                    answer_text=row["answer_text"],
                    sources=json.loads(row["sources_json"] or "[]"),
                    citations=json.loads(row["citations_json"] or "{}"),
                    created_at=row["created_at"],
                )
                for row in rows
            ]
        finally:
            conn.close()

    def add_resource_samples(self, samples: list[ResourceSampleRecord]) -> None:
        if not samples:
            return
        conn = self.database.connect()
        try:
            conn.executemany(
                """
                INSERT INTO benchmark_resource_samples (
                    benchmark_id, trial_id, timestamp, host_cpu_percent,
                    host_ram_used_bytes, backend_rss_bytes, ollama_cpu_percent,
                    ollama_rss_bytes, gpu_utilization_percent, gpu_vram_used_bytes,
                    gpu_vram_total_bytes, process_gpu_vram_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        s.benchmark_id,
                        s.trial_id,
                        s.timestamp,
                        s.host_cpu_percent,
                        s.host_ram_used_bytes,
                        s.backend_rss_bytes,
                        s.ollama_cpu_percent,
                        s.ollama_rss_bytes,
                        s.gpu_utilization_percent,
                        s.gpu_vram_used_bytes,
                        s.gpu_vram_total_bytes,
                        s.process_gpu_vram_reason,
                    )
                    for s in samples
                ],
            )
            conn.commit()
        finally:
            conn.close()

    def list_resource_samples(
        self, benchmark_id: str, trial_id: str | None = None
    ) -> list[ResourceSampleRecord]:
        conn = self.database.connect()
        try:
            if trial_id is not None:
                rows = conn.execute(
                    "SELECT * FROM benchmark_resource_samples WHERE benchmark_id = ? AND trial_id = ? ORDER BY id ASC",
                    (benchmark_id, trial_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM benchmark_resource_samples WHERE benchmark_id = ? ORDER BY id ASC",
                    (benchmark_id,),
                ).fetchall()

            return [
                ResourceSampleRecord(
                    id=row["id"],
                    benchmark_id=row["benchmark_id"],
                    trial_id=row["trial_id"],
                    timestamp=row["timestamp"],
                    host_cpu_percent=row["host_cpu_percent"],
                    host_ram_used_bytes=row["host_ram_used_bytes"],
                    backend_rss_bytes=row["backend_rss_bytes"],
                    ollama_cpu_percent=row["ollama_cpu_percent"],
                    ollama_rss_bytes=row["ollama_rss_bytes"],
                    gpu_utilization_percent=row["gpu_utilization_percent"],
                    gpu_vram_used_bytes=row["gpu_vram_used_bytes"],
                    gpu_vram_total_bytes=row["gpu_vram_total_bytes"],
                    process_gpu_vram_reason=row["process_gpu_vram_reason"],
                )
                for row in rows
            ]
        finally:
            conn.close()
