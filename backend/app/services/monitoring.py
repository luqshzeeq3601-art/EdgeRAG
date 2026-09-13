"""Hardware monitoring engine sampling host CPU, RAM, process RSS, and NVIDIA GPU metrics."""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import psutil

try:
    import pynvml

    HAS_NVML = True
except ImportError:
    HAS_NVML = False

from app.benchmarks.repository import ResourceSampleRecord


WDDM_PROCESS_GPU_REASON = "Windows WDDM driver does not expose per-process GPU memory isolation"


def normalize_cpu_percent(raw_percent: float, num_cores: int | None = None) -> float:
    """Clamp CPU percentage into valid 0.0 - 100.0 range."""
    if num_cores and num_cores > 0 and raw_percent > 100.0:
        # If raw_percent exceeds 100% due to multi-core sum, normalize by core count
        normalized = raw_percent / num_cores
    else:
        normalized = raw_percent
    return max(0.0, min(100.0, round(float(normalized), 2)))


class NVMLReader:
    """Safe wrapper around NVIDIA NVML for GPU utilization and VRAM reading."""

    def __init__(self) -> None:
        self._available = False
        self._handle = None
        if HAS_NVML:
            try:
                pynvml.nvmlInit()
                self._handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                self._available = True
            except Exception:
                self._available = False

    @property
    def is_available(self) -> bool:
        return self._available

    def sample(self) -> tuple[float | None, int | None, int | None]:
        """Return (gpu_utilization_percent, vram_used_bytes, vram_total_bytes)."""
        if not self._available or self._handle is None:
            return None, None, None
        try:
            util = pynvml.nvmlDeviceGetUtilizationRates(self._handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(self._handle)
            return float(util.gpu), int(mem.used), int(mem.total)
        except Exception:
            return None, None, None

    def close(self) -> None:
        if self._available:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
            self._available = False


class HardwareMonitor:
    """Background sampling thread recording host and device metrics every 500 ms."""

    def __init__(
        self,
        *,
        sample_interval_seconds: float = 0.5,
        nvml_reader: NVMLReader | None = None,
    ) -> None:
        self.sample_interval = sample_interval_seconds
        self.nvml_reader = nvml_reader or NVMLReader()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._samples: list[ResourceSampleRecord] = []
        self._samples_lock = threading.Lock()
        self._current_benchmark_id: str | None = None
        self._current_trial_id_getter: Callable[[], str | None] | None = None
        self._sample_callback: Callable[[ResourceSampleRecord], None] | None = None

    def sample_now(
        self, benchmark_id: str, trial_id: str | None = None
    ) -> ResourceSampleRecord:
        """Capture an instantaneous hardware reading."""
        raw_cpu = psutil.cpu_percent(interval=None)
        host_cpu = normalize_cpu_percent(raw_cpu)
        ram = psutil.virtual_memory()
        backend_proc = psutil.Process()
        backend_rss = backend_proc.memory_info().rss

        ollama_cpu, ollama_rss = self._sample_ollama_process()
        gpu_util, vram_used, vram_total = self.nvml_reader.sample()

        return ResourceSampleRecord(
            benchmark_id=benchmark_id,
            trial_id=trial_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            host_cpu_percent=host_cpu,
            host_ram_used_bytes=ram.used,
            backend_rss_bytes=backend_rss,
            ollama_cpu_percent=ollama_cpu,
            ollama_rss_bytes=ollama_rss,
            gpu_utilization_percent=gpu_util,
            gpu_vram_used_bytes=vram_used,
            gpu_vram_total_bytes=vram_total,
            process_gpu_vram_reason=WDDM_PROCESS_GPU_REASON,
        )

    def _sample_ollama_process(self) -> tuple[float | None, int | None]:
        total_cpu = 0.0
        total_rss = 0
        found = False
        for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            try:
                name = (p.info["name"] or "").lower()
                if "ollama" in name:
                    found = True
                    cpu = p.info.get("cpu_percent") or 0.0
                    mem = p.info.get("memory_info")
                    rss = mem.rss if mem else 0
                    total_cpu += cpu
                    total_rss += rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        if found:
            cpu_count = psutil.cpu_count() or 1
            return normalize_cpu_percent(total_cpu, cpu_count), total_rss
        return None, None

    def start(
        self,
        benchmark_id: str,
        trial_id_getter: Callable[[], str | None],
        *,
        sample_callback: Callable[[ResourceSampleRecord], None] | None = None,
    ) -> None:
        """Start the background sampling thread after priming CPU counters."""
        self._current_benchmark_id = benchmark_id
        self._current_trial_id_getter = trial_id_getter
        self._sample_callback = sample_callback
        self._stop_event.clear()
        with self._samples_lock:
            self._samples.clear()

        # Prime psutil CPU counters and discard initial reading per benchmark methodology
        psutil.cpu_percent(interval=None)

        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"hw-monitor-{benchmark_id}",
            daemon=True,
        )
        self._thread.start()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            if self._current_benchmark_id is not None:
                trial_id = (
                    self._current_trial_id_getter()
                    if self._current_trial_id_getter
                    else None
                )
                sample = self.sample_now(self._current_benchmark_id, trial_id)
                with self._samples_lock:
                    self._samples.append(sample)
                if self._sample_callback:
                    try:
                        self._sample_callback(sample)
                    except Exception:
                        pass
            self._stop_event.wait(self.sample_interval)

    def stop(self) -> list[ResourceSampleRecord]:
        """Stop sampling and return all captured samples."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        with self._samples_lock:
            return list(self._samples)
