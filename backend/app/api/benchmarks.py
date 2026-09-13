"""Benchmarks REST endpoints for suite listing, execution, cancellation, and metric history."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.benchmarks.repository import BenchmarkNotFoundError, BenchmarkRecord, BenchmarkRepository
from app.services.benchmark import (
    BenchmarkEngine,
    BenchmarkExecutionPlan,
    aggregate_model_metrics,
    get_suite_by_id,
    load_question_suites,
)


router = APIRouter(prefix="/api/v1/benchmarks", tags=["benchmarks"])


class CreateBenchmarkRequest(BaseModel):
    name: str = Field(min_length=1, description="Descriptive name of the benchmark run")
    suite_id: str = Field(default="quick_dev", description="Question suite ID")
    mode: Literal["fixed_context", "end_to_end"] = Field(
        default="fixed_context", description="Retrieval mode across models"
    )
    temperature_type: Literal["warm", "cold"] = Field(
        default="warm", description="Run profile: warm (with 1 warm-up trial) or cold (model unloaded)"
    )
    models: list[str] = Field(min_length=1, description="List of Ollama model tags to compare")
    repetitions: int = Field(default=3, ge=1, le=10, description="Evaluated repetitions per question")
    top_k: int = Field(default=5, ge=1, le=10, description="Top-K context passages retrieved")


class BenchmarkSummary(BaseModel):
    id: str
    name: str
    suite_id: str
    mode: str
    temperature_type: str
    models: list[str]
    status: str
    error: str | None
    created_at: str
    started_at: str | None
    completed_at: str | None


class BenchmarkDetail(BenchmarkSummary):
    config: dict[str, Any]
    trials: list[dict[str, Any]]
    aggregated_metrics: dict[str, Any]
    resource_samples_count: int


def get_benchmark_engine(request: Request) -> BenchmarkEngine:
    return request.app.state.benchmark_engine


def get_benchmark_repository(request: Request) -> BenchmarkRepository:
    return request.app.state.benchmark_repository


@router.get("/suites")
def list_suites(engine: BenchmarkEngine = Depends(get_benchmark_engine)) -> list[dict[str, Any]]:
    """List available benchmark question suites."""
    return load_question_suites(engine.suites_path)


@router.post("", response_model=BenchmarkSummary, status_code=status.HTTP_201_CREATED)
async def start_benchmark(
    request: CreateBenchmarkRequest,
    background_tasks: BackgroundTasks,
    engine: BenchmarkEngine = Depends(get_benchmark_engine),
    repo: BenchmarkRepository = Depends(get_benchmark_repository),
) -> BenchmarkSummary:
    """Queue and trigger a benchmark run comparing selected local models."""
    suite = get_suite_by_id(request.suite_id, engine.suites_path)
    if suite is None:
        raise HTTPException(
            status_code=400,
            detail=f"Question suite '{request.suite_id}' does not exist",
        )

    benchmark_id = f"bench_{uuid.uuid4().hex[:12]}"
    config_dict = {
        "repetitions": request.repetitions,
        "top_k": request.top_k,
    }

    record = repo.create_benchmark(
        benchmark_id=benchmark_id,
        name=request.name,
        suite_id=request.suite_id,
        mode=request.mode,
        temperature_type=request.temperature_type,
        models=request.models,
        config=config_dict,
        status="queued",
    )

    plan = BenchmarkExecutionPlan(
        benchmark_id=benchmark_id,
        name=request.name,
        suite_id=request.suite_id,
        mode=request.mode,
        temperature_type=request.temperature_type,
        models=request.models,
        repetitions=request.repetitions,
        top_k=request.top_k,
    )

    # Dispatch to background task worker
    background_tasks.add_task(engine.run_benchmark, plan)

    return BenchmarkSummary(
        id=record.id,
        name=record.name,
        suite_id=record.suite_id,
        mode=record.mode,
        temperature_type=record.temperature_type,
        models=record.models,
        status=record.status,
        error=record.error,
        created_at=record.created_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
    )


@router.get("", response_model=list[BenchmarkSummary])
def list_benchmarks(repo: BenchmarkRepository = Depends(get_benchmark_repository)) -> list[BenchmarkSummary]:
    """List benchmark execution records ordered by date."""
    records = repo.list_benchmarks()
    return [
        BenchmarkSummary(
            id=r.id,
            name=r.name,
            suite_id=r.suite_id,
            mode=r.mode,
            temperature_type=r.temperature_type,
            models=r.models,
            status=r.status,
            error=r.error,
            created_at=r.created_at,
            started_at=r.started_at,
            completed_at=r.completed_at,
        )
        for r in records
    ]


@router.get("/{benchmark_id}", response_model=BenchmarkDetail)
def get_benchmark(
    benchmark_id: str,
    repo: BenchmarkRepository = Depends(get_benchmark_repository),
) -> BenchmarkDetail:
    """Get full details of a benchmark run, including all trials and aggregated metrics."""
    try:
        record = repo.get_benchmark(benchmark_id)
    except BenchmarkNotFoundError:
        raise HTTPException(status_code=404, detail="Benchmark not found") from None

    trials = repo.list_trials(benchmark_id)
    aggregated = aggregate_model_metrics(trials)
    samples = repo.list_resource_samples(benchmark_id)

    trials_data = [
        {
            "id": t.id,
            "model_name": t.model_name,
            "question_id": t.question_id,
            "question_text": t.question_text,
            "repetition_index": t.repetition_index,
            "is_warmup": t.is_warmup,
            "status": t.status,
            "error": t.error,
            "retrieval_duration_ms": t.retrieval_duration_ms,
            "ttft_ms": t.ttft_ms,
            "eval_duration_ms": t.eval_duration_ms,
            "eval_count": t.eval_count,
            "tokens_per_second": t.tokens_per_second,
            "load_duration_ms": t.load_duration_ms,
            "total_duration_ms": t.total_duration_ms,
            "answer_text": t.answer_text,
            "sources": t.sources,
            "citations": t.citations,
            "created_at": t.created_at,
        }
        for t in trials
    ]

    return BenchmarkDetail(
        id=record.id,
        name=record.name,
        suite_id=record.suite_id,
        mode=record.mode,
        temperature_type=record.temperature_type,
        models=record.models,
        status=record.status,
        error=record.error,
        config=record.config,
        created_at=record.created_at,
        started_at=record.started_at,
        completed_at=record.completed_at,
        trials=trials_data,
        aggregated_metrics=aggregated,
        resource_samples_count=len(samples),
    )


@router.post("/{benchmark_id}/cancel")
def cancel_benchmark(
    benchmark_id: str,
    engine: BenchmarkEngine = Depends(get_benchmark_engine),
    repo: BenchmarkRepository = Depends(get_benchmark_repository),
) -> dict[str, Any]:
    """Request graceful cancellation of a running benchmark."""
    try:
        record = repo.get_benchmark(benchmark_id)
    except BenchmarkNotFoundError:
        raise HTTPException(status_code=404, detail="Benchmark not found") from None

    if record.status not in ("queued", "running"):
        return {"status": record.status, "message": f"Benchmark is already {record.status}"}

    engine.cancel_benchmark(benchmark_id)
    # Always update database status so queued or between-trial checks immediately detect cancellation
    repo.update_benchmark_status(benchmark_id, "cancelled")

    return {"status": "cancelled", "message": "Cancellation signaled"}


@router.delete("/{benchmark_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_benchmark(
    benchmark_id: str,
    repo: BenchmarkRepository = Depends(get_benchmark_repository),
) -> None:
    """Delete a benchmark and all cascading trial records."""
    try:
        repo.delete_benchmark(benchmark_id)
    except BenchmarkNotFoundError:
        raise HTTPException(status_code=404, detail="Benchmark not found") from None
