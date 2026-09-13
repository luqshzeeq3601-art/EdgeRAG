"""Ollama provider implementation for dynamic model discovery, health checks, and streaming generation."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import httpx


@dataclass(frozen=True)
class OllamaModelInfo:
    """Metadata describing an installed Ollama model."""

    name: str
    model: str
    modified_at: str
    size: int
    digest: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OllamaGenerateChunk:
    """A streaming chunk or final summary from Ollama /api/generate."""

    response: str
    done: bool
    total_duration: int | None = None
    load_duration: int | None = None
    prompt_eval_count: int | None = None
    prompt_eval_duration: int | None = None
    eval_count: int | None = None
    eval_duration: int | None = None


@dataclass(frozen=True)
class OllamaReadiness:
    """Readiness probe result for Ollama connectivity."""

    ready: bool
    status_code: int | None = None
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class OllamaProviderError(Exception):
    """Base exception for Ollama provider failures."""


class OllamaTimeoutError(OllamaProviderError):
    """Raised when Ollama request exceeds configured timeout."""


class OllamaConnectionError(OllamaProviderError):
    """Raised when unable to connect to Ollama daemon."""


class OllamaResponseError(OllamaProviderError):
    """Raised when Ollama returns an HTTP error status or malformed payload."""


class OllamaProvider:
    """Native Ollama provider managing connectivity, discovery, and generation streaming."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        *,
        timeout_seconds: float = 60.0,
        health_timeout_seconds: float = 2.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.health_timeout_seconds = health_timeout_seconds
        self.transport = transport

    async def check_readiness(self) -> OllamaReadiness:
        """Check whether the configured Ollama service responds."""
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.health_timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.get("/api/tags")
            response.raise_for_status()
            return OllamaReadiness(
                ready=True,
                status_code=response.status_code,
                details={"endpoint": "/api/tags"},
            )
        except httpx.HTTPStatusError as exc:
            return OllamaReadiness(
                ready=False,
                status_code=exc.response.status_code,
                details={"endpoint": "/api/tags"},
                error=f"Ollama returned HTTP {exc.response.status_code}",
            )
        except httpx.RequestError as exc:
            return OllamaReadiness(
                ready=False,
                details={"endpoint": "/api/tags", "error_type": type(exc).__name__},
                error=f"Ollama is unavailable at {self.base_url}",
            )
        except Exception as exc:
            return OllamaReadiness(
                ready=False,
                details={"endpoint": "/api/tags", "error_type": type(exc).__name__},
                error=f"Ollama health check failed: {exc}",
            )

    async def list_models(self) -> list[OllamaModelInfo]:
        """Discover installed models from Ollama's /api/tags endpoint."""
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.get("/api/tags")
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(f"Ollama tags request timed out: {exc}") from exc
        except httpx.RequestError as exc:
            raise OllamaConnectionError(f"Failed to connect to Ollama at {self.base_url}: {exc}") from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaResponseError(f"Ollama returned HTTP {exc.response.status_code}: {exc.response.text}") from exc

        try:
            data = response.json()
        except Exception as exc:
            raise OllamaResponseError(f"Malformed JSON from Ollama /api/tags: {exc}") from exc

        raw_models = data.get("models", [])
        models: list[OllamaModelInfo] = []
        for item in raw_models:
            models.append(
                OllamaModelInfo(
                    name=item.get("name", ""),
                    model=item.get("model", item.get("name", "")),
                    modified_at=item.get("modified_at", ""),
                    size=item.get("size", 0),
                    digest=item.get("digest", ""),
                    details=dict(item.get("details", {})),
                )
            )
        return models

    async def unload_model(self, model: str, *, poll_timeout: float = 5.0) -> bool:
        """Unload a model from Ollama memory/VRAM by setting keep_alive to 0, then poll /api/ps to verify eviction."""
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                await client.post(
                    "/api/generate",
                    json={"model": model, "keep_alive": 0},
                )
        except Exception:
            pass

        # Poll /api/ps up to poll_timeout seconds to verify eviction
        model_normalized = model.strip().lower()
        poll_start = time.perf_counter()
        while time.perf_counter() - poll_start < poll_timeout:
            running = await self.list_running_models()
            running_lower = [r.lower() for r in running]
            still_resident = any(
                model_normalized in r or r in model_normalized
                for r in running_lower
            )
            if not still_resident:
                return True
            await asyncio.sleep(0.2)
        return False

    async def list_running_models(self) -> list[str]:
        """List currently running/resident models from Ollama /api/ps."""
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.get("/api/ps")
            if response.status_code == 200:
                data = response.json()
                return [m.get("name", "") for m in data.get("models", [])]
        except Exception:
            pass
        return []

    async def stream_generate(
        self,
        model: str,
        prompt: str,
        *,
        system: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> AsyncIterator[OllamaGenerateChunk]:
        """Stream token fragments from Ollama's /api/generate endpoint."""
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": True,
        }
        if system is not None:
            payload["system"] = system
        if options is not None:
            payload["options"] = options

        client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(self.timeout_seconds, connect=10.0),
            transport=self.transport,
        )

        try:
            async with client.stream("POST", "/api/generate", json=payload) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise OllamaResponseError(
                        f"Ollama /api/generate returned HTTP {response.status_code}: {error_text.decode('utf-8', errors='replace')}"
                    )

                async for line in response.aiter_lines():
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    try:
                        chunk_data = json.loads(trimmed)
                    except json.JSONDecodeError as exc:
                        raise OllamaResponseError(f"Malformed JSON chunk from Ollama: {trimmed}") from exc

                    if "error" in chunk_data:
                        raise OllamaResponseError(f"Ollama streaming error: {chunk_data['error']}")

                    yield OllamaGenerateChunk(
                        response=chunk_data.get("response", ""),
                        done=bool(chunk_data.get("done", False)),
                        total_duration=chunk_data.get("total_duration"),
                        load_duration=chunk_data.get("load_duration"),
                        prompt_eval_count=chunk_data.get("prompt_eval_count"),
                        prompt_eval_duration=chunk_data.get("prompt_eval_duration"),
                        eval_count=chunk_data.get("eval_count"),
                        eval_duration=chunk_data.get("eval_duration"),
                    )
        except httpx.TimeoutException as exc:
            raise OllamaTimeoutError(f"Ollama generation stream timed out: {exc}") from exc
        except httpx.RequestError as exc:
            raise OllamaConnectionError(f"Failed to stream from Ollama at {self.base_url}: {exc}") from exc
        finally:
            await client.aclose()
