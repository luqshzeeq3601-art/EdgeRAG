"""Unit tests for throughput calculations, CPU normalization, metric aggregation, and cancellation."""

from __future__ import annotations

import pytest

from app.benchmarks.repository import TrialRecord
from app.services.benchmark import (
    aggregate_model_metrics,
    calculate_stats,
    calculate_throughput,
)
from app.services.monitoring import normalize_cpu_percent


def test_calculate_throughput_normal() -> None:
    # 50 tokens in 1 second (1,000,000,000 ns) = 50.0 tokens/sec
    tps = calculate_throughput(eval_count=50, eval_duration_ns=1_000_000_000)
    assert tps == 50.0


def test_calculate_throughput_zero_division_safety() -> None:
    assert calculate_throughput(eval_count=0, eval_duration_ns=1_000_000_000) == 0.0
    assert calculate_throughput(eval_count=50, eval_duration_ns=0) == 0.0
    assert calculate_throughput(eval_count=None, eval_duration_ns=1_000_000_000) == 0.0
    assert calculate_throughput(eval_count=50, eval_duration_ns=None) == 0.0
    assert calculate_throughput(eval_count=-5, eval_duration_ns=1_000_000_000) == 0.0


def test_normalize_cpu_percent() -> None:
    # Within valid bounds
    assert normalize_cpu_percent(45.2) == 45.2
    assert normalize_cpu_percent(0.0) == 0.0
    assert normalize_cpu_percent(100.0) == 100.0

    # Negative clamped to 0
    assert normalize_cpu_percent(-10.0) == 0.0

    # Greater than 100 with cpu_count
    # 240% across 4 cores -> 60%
    assert normalize_cpu_percent(240.0, num_cores=4) == 60.0

    # Extreme value clamped to 100.0
    assert normalize_cpu_percent(150.0, num_cores=1) == 100.0


def test_calculate_stats() -> None:
    stats = calculate_stats([10.0, 20.0, 30.0])
    assert stats["mean"] == 20.0
    assert stats["median"] == 20.0
    assert stats["min"] == 10.0
    assert stats["max"] == 30.0
    assert stats["stdev"] == 10.0

    # Single value
    single_stats = calculate_stats([42.0])
    assert single_stats["mean"] == 42.0
    assert single_stats["stdev"] == 0.0

    # Empty
    empty_stats = calculate_stats([])
    assert empty_stats["mean"] is None


def test_aggregate_model_metrics_excludes_warmup() -> None:
    trials = [
        # Warm-up trial (should be excluded from stats)
        TrialRecord(
            id="t0",
            benchmark_id="b1",
            model_name="model_a",
            question_id="q1",
            question_text="Q1",
            repetition_index=0,
            is_warmup=True,
            status="completed",
            error=None,
            retrieval_duration_ms=5.0,
            ttft_ms=100.0,
            eval_duration_ms=500.0,
            eval_count=20,
            tokens_per_second=40.0,
            load_duration_ms=100.0,
            total_duration_ms=600.0,
            answer_text="Ans",
        ),
        # Evaluated repetition 1
        TrialRecord(
            id="t1",
            benchmark_id="b1",
            model_name="model_a",
            question_id="q1",
            question_text="Q1",
            repetition_index=1,
            is_warmup=False,
            status="completed",
            error=None,
            retrieval_duration_ms=4.0,
            ttft_ms=50.0,
            eval_duration_ms=250.0,
            eval_count=25,
            tokens_per_second=100.0,
            load_duration_ms=0.0,
            total_duration_ms=300.0,
            answer_text="Ans",
        ),
        # Evaluated repetition 2
        TrialRecord(
            id="t2",
            benchmark_id="b1",
            model_name="model_a",
            question_id="q1",
            question_text="Q1",
            repetition_index=2,
            is_warmup=False,
            status="completed",
            error=None,
            retrieval_duration_ms=6.0,
            ttft_ms=70.0,
            eval_duration_ms=350.0,
            eval_count=35,
            tokens_per_second=100.0,
            load_duration_ms=0.0,
            total_duration_ms=420.0,
            answer_text="Ans",
        ),
    ]

    aggregated = aggregate_model_metrics(trials)
    assert "model_a" in aggregated
    stats_a = aggregated["model_a"]
    assert stats_a["total_trials"] == 2
    assert stats_a["completed_trials"] == 2
    assert stats_a["tokens_per_second"]["mean"] == 100.0
    assert stats_a["ttft_ms"]["mean"] == 60.0  # (50 + 70) / 2
