"""Benchmark engine executing reproducible local LLM evaluation with hardware telemetry."""

from __future__ import annotations

import asyncio
import json
import statistics
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Literal

from app.benchmarks.repository import BenchmarkRecord, BenchmarkRepository, TrialRecord
from app.documents.pipeline import DocumentPipeline
from app.providers.ollama import OllamaGenerateChunk, OllamaProvider
from app.services.monitoring import HardwareMonitor
from app.services.rag import (
    SYSTEM_PROMPT,
    build_user_prompt,
    format_context,
    validate_citations,
)


DEFAULT_SUITES_PATH = Path("evaluation/questions/suites.json")


def calculate_throughput(eval_count: int | None, eval_duration_ns: int | None) -> float:
    """Calculate generated tokens per second from Ollama nanosecond metrics, safe against division by zero."""
    if not eval_count or not eval_duration_ns or eval_duration_ns <= 0 or eval_count <= 0:
        return 0.0
    duration_sec = eval_duration_ns / 1_000_000_000.0
    if duration_sec <= 0:
        return 0.0
    return round(float(eval_count) / duration_sec, 2)


def calculate_stats(values: list[float]) -> dict[str, float | None]:
    """Derive mean, median, min, max, and sample standard deviation."""
    if not values:
        return {"mean": None, "median": None, "min": None, "max": None, "stdev": None}
    mean_val = round(statistics.mean(values), 2)
    median_val = round(statistics.median(values), 2)
    min_val = round(min(values), 2)
    max_val = round(max(values), 2)
    stdev_val = round(statistics.stdev(values), 2) if len(values) > 1 else 0.0
    return {
        "mean": mean_val,
        "median": median_val,
        "min": min_val,
        "max": max_val,
        "stdev": stdev_val,
    }


def aggregate_model_metrics(trials: list[TrialRecord]) -> dict[str, Any]:
    """Aggregate evaluated trials by model name, excluding warm-up trials."""
    by_model: dict[str, list[TrialRecord]] = {}
    for t in trials:
        if t.is_warmup:
            continue
        by_model.setdefault(t.model_name, []).append(t)

    result: dict[str, Any] = {}
    for model, m_trials in by_model.items():
        completed = [t for t in m_trials if t.status == "completed"]
        failed = [t for t in m_trials if t.status == "failed"]
        cancelled = [t for t in m_trials if t.status == "cancelled"]

        ttft_vals = [t.ttft_ms for t in completed if t.ttft_ms is not None]
        tps_vals = [t.tokens_per_second for t in completed if t.tokens_per_second is not None]
        eval_dur_vals = [t.eval_duration_ms for t in completed if t.eval_duration_ms is not None]
        total_dur_vals = [t.total_duration_ms for t in completed if t.total_duration_ms is not None]
        retrieval_dur_vals = [t.retrieval_duration_ms for t in completed if t.retrieval_duration_ms is not None]
        load_dur_vals = [t.load_duration_ms for t in completed if t.load_duration_ms is not None]

        result[model] = {
            "total_trials": len(m_trials),
            "completed_trials": len(completed),
            "failed_trials": len(failed),
            "cancelled_trials": len(cancelled),
            "tokens_per_second": calculate_stats(tps_vals),
            "ttft_ms": calculate_stats(ttft_vals),
            "eval_duration_ms": calculate_stats(eval_dur_vals),
            "total_duration_ms": calculate_stats(total_dur_vals),
            "retrieval_duration_ms": calculate_stats(retrieval_dur_vals),
            "load_duration_ms": calculate_stats(load_dur_vals),
        }
    return result


def load_question_suites(suites_path: Path | None = None) -> list[dict[str, Any]]:
    """Load question suites from evaluation file."""
    path = suites_path or DEFAULT_SUITES_PATH
    if not path.exists():
        # Fallback to search from repo root or backend parent
        alt_path = Path("..") / path
        if alt_path.exists():
            path = alt_path
        else:
            return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("suites", [])


def get_suite_by_id(suite_id: str, suites_path: Path | None = None) -> dict[str, Any] | None:
    suites = load_question_suites(suites_path)
    for s in suites:
        if s.get("id") == suite_id:
            return s
    return None


@dataclass
class BenchmarkExecutionPlan:
    benchmark_id: str
    name: str
    suite_id: str
    mode: Literal["fixed_context", "end_to_end"]
    temperature_type: Literal["warm", "cold"]
    models: list[str]
    repetitions: int = 3
    top_k: int = 5


class BenchmarkEngine:
    """Coordinates benchmark trial scheduling, hardware telemetry, and cancellation."""

    def __init__(
        self,
        repository: BenchmarkRepository,
        pipeline: DocumentPipeline,
        ollama_provider: OllamaProvider,
        hardware_monitor: HardwareMonitor | None = None,
        suites_path: Path | None = None,
    ) -> None:
        self.repository = repository
        self.pipeline = pipeline
        self.ollama_provider = ollama_provider
        self.hardware_monitor = hardware_monitor or HardwareMonitor()
        self.suites_path = suites_path
        self._cancellation_events: dict[str, asyncio.Event] = {}
        self._lock = asyncio.Lock()
        self._current_trial_id: str | None = None

    def cancel_benchmark(self, benchmark_id: str) -> bool:
        """Signal cancellation for an active benchmark run."""
        event = self._cancellation_events.get(benchmark_id)
        if event is not None:
            event.set()
            return True
        return False

    async def run_benchmark(self, plan: BenchmarkExecutionPlan) -> BenchmarkRecord:
        """Execute a full benchmark suite sequentially with telemetry."""
        async with self._lock:
            cancel_event = asyncio.Event()
            self._cancellation_events[plan.benchmark_id] = cancel_event

            suite = get_suite_by_id(plan.suite_id, self.suites_path)
            if suite is None:
                err = f"Question suite '{plan.suite_id}' not found"
                self.repository.update_benchmark_status(
                    plan.benchmark_id, "failed", error=err
                )
                raise ValueError(err)

            questions = suite.get("questions", [])
            if not questions:
                err = f"Question suite '{plan.suite_id}' contains no questions"
                self.repository.update_benchmark_status(
                    plan.benchmark_id, "failed", error=err
                )
                raise ValueError(err)

            # Start benchmark record
            started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.repository.update_benchmark_status(
                plan.benchmark_id, "running", started_at=started_at
            )

            # Start hardware monitor
            def get_active_trial_id() -> str | None:
                return self._current_trial_id

            self.hardware_monitor.start(
                benchmark_id=plan.benchmark_id,
                trial_id_getter=get_active_trial_id,
            )

            is_cancelled = False
            error_msg: str | None = None

            try:
                # Determine trials schedule:
                # If warm: 1 warm-up trial (rep 0) per model, then `repetitions` evaluated runs
                # Model order alternates across repetitions
                total_reps = plan.repetitions

                for rep_idx in range(total_reps + (1 if plan.temperature_type == "warm" else 0)):
                    is_warmup = (plan.temperature_type == "warm" and rep_idx == 0)
                    eval_rep_num = rep_idx if not (plan.temperature_type == "warm") else (rep_idx)

                    # Alternate model order for fair testing
                    models_order = list(plan.models)
                    if rep_idx % 2 == 1:
                        models_order.reverse()

                    for q in questions:
                        q_id = q["id"]
                        q_text = q["question"]

                        # Precompute retrieval context if in fixed_context mode
                        fixed_context_data: tuple[str, list[dict[str, Any]], float] | None = None
                        if plan.mode == "fixed_context":
                            ret_start = time.perf_counter()
                            matches = self.pipeline.retrieve(q_text, top_k=plan.top_k)
                            ret_ms = (time.perf_counter() - ret_start) * 1000.0
                            sources = [
                                {
                                    "source_id": f"S{idx}",
                                    "document_id": chunk.document_id,
                                    "filename": self.pipeline.repository.get(chunk.document_id).filename
                                    if self.pipeline.repository.get(chunk.document_id)
                                    else "unknown.pdf",
                                    "page_number": chunk.page_number,
                                    "chunk_id": chunk.chunk_id,
                                    "text": chunk.text,
                                    "score": match.score,
                                }
                                for idx, (match, chunk) in enumerate(matches, start=1)
                            ]
                            f_context = format_context(sources)
                            fixed_context_data = (f_context, sources, ret_ms)

                        for model_name in models_order:
                            if cancel_event.is_set():
                                is_cancelled = True
                                break

                            # Cold run: ensure model is unloaded first
                            if plan.temperature_type == "cold":
                                await self.ollama_provider.unload_model(model_name)
                                await asyncio.sleep(0.5)

                            trial_id = f"trial_{uuid.uuid4().hex[:12]}"
                            self._current_trial_id = trial_id

                            trial = self.repository.create_trial(
                                trial_id=trial_id,
                                benchmark_id=plan.benchmark_id,
                                model_name=model_name,
                                question_id=q_id,
                                question_text=q_text,
                                repetition_index=eval_rep_num,
                                is_warmup=is_warmup,
                                status="running",
                            )

                            await self._execute_trial(
                                trial=trial,
                                plan=plan,
                                q_text=q_text,
                                fixed_context_data=fixed_context_data,
                            )

                            self._current_trial_id = None

                            if cancel_event.is_set():
                                is_cancelled = True
                                break

                        if is_cancelled:
                            break
                    if is_cancelled:
                        break

            except Exception as exc:
                error_msg = str(exc)
            finally:
                # Stop hardware monitor and store samples
                samples = self.hardware_monitor.stop()
                self.repository.add_resource_samples(samples)
                self._current_trial_id = None
                self._cancellation_events.pop(plan.benchmark_id, None)

                completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                final_status = "cancelled" if is_cancelled else ("failed" if error_msg else "completed")
                self.repository.update_benchmark_status(
                    plan.benchmark_id,
                    final_status,
                    error=error_msg,
                    completed_at=completed_at,
                )

            return self.repository.get_benchmark(plan.benchmark_id)

    async def _execute_trial(
        self,
        trial: TrialRecord,
        plan: BenchmarkExecutionPlan,
        q_text: str,
        fixed_context_data: tuple[str, list[dict[str, Any]], float] | None,
    ) -> None:
        """Execute a single model generation trial."""
        trial_start = time.perf_counter()

        retrieval_ms: float = 0.0
        sources: list[dict[str, Any]] = []
        formatted_context: str = ""

        if fixed_context_data is not None:
            formatted_context, sources, retrieval_ms = fixed_context_data
        else:
            r_start = time.perf_counter()
            matches = self.pipeline.retrieve(q_text, top_k=plan.top_k)
            retrieval_ms = (time.perf_counter() - r_start) * 1000.0
            sources = [
                {
                    "source_id": f"S{idx}",
                    "document_id": chunk.document_id,
                    "filename": self.pipeline.repository.get(chunk.document_id).filename
                    if self.pipeline.repository.get(chunk.document_id)
                    else "unknown.pdf",
                    "page_number": chunk.page_number,
                    "chunk_id": chunk.chunk_id,
                    "text": chunk.text,
                    "score": match.score,
                }
                for idx, (match, chunk) in enumerate(matches, start=1)
            ]
            formatted_context = format_context(sources)

        prompt = build_user_prompt(q_text, formatted_context)
        valid_source_ids = [s["source_id"] for s in sources]

        accumulated_text = ""
        ttft_ms: float | None = None
        final_chunk: OllamaGenerateChunk | None = None

        try:
            stream = self.ollama_provider.stream_generate(
                model=trial.model_name,
                prompt=prompt,
                system=SYSTEM_PROMPT,
            )
            async for chunk in stream:
                if chunk.response:
                    if ttft_ms is None:
                        ttft_ms = (time.perf_counter() - trial_start) * 1000.0
                    accumulated_text += chunk.response
                if chunk.done:
                    final_chunk = chunk

            total_duration_ms = (time.perf_counter() - trial_start) * 1000.0
            validation = validate_citations(accumulated_text, valid_source_ids)

            eval_dur_ms: float | None = None
            eval_count: int | None = None
            tokens_per_sec: float | None = None
            load_dur_ms: float | None = None

            if final_chunk:
                if final_chunk.eval_duration is not None:
                    eval_dur_ms = round(final_chunk.eval_duration / 1_000_000.0, 2)
                eval_count = final_chunk.eval_count
                tokens_per_sec = calculate_throughput(
                    final_chunk.eval_count, final_chunk.eval_duration
                )
                if final_chunk.load_duration is not None:
                    load_dur_ms = round(final_chunk.load_duration / 1_000_000.0, 2)

            self.repository.update_trial(
                trial.id,
                status="completed",
                retrieval_duration_ms=round(retrieval_ms, 2),
                ttft_ms=round(ttft_ms or 0.0, 2),
                eval_duration_ms=eval_dur_ms,
                eval_count=eval_count,
                tokens_per_second=tokens_per_sec,
                load_duration_ms=load_dur_ms,
                total_duration_ms=round(total_duration_ms, 2),
                answer_text=accumulated_text,
                sources=sources,
                citations=validation.to_dict(),
            )
        except Exception as exc:
            total_duration_ms = (time.perf_counter() - trial_start) * 1000.0
            self.repository.update_trial(
                trial.id,
                status="failed",
                error=str(exc),
                total_duration_ms=round(total_duration_ms, 2),
            )
