"""Health endpoint and the fixed, testable Ollama connectivity check."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Protocol

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.persistence.database import Database, DatabaseReadiness


@dataclass(frozen=True)
class OllamaReadiness:
    """The observable result of the fixed Ollama connectivity request."""

    ready: bool
    status_code: int | None = None
    details: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class OllamaHealthClient(Protocol):
    """Minimal client contract used by the health route."""

    async def check_readiness(self) -> OllamaReadiness:
        """Check whether the configured Ollama service responds."""


class OllamaClient:
    """Ollama client restricted to the service connectivity endpoint."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout_seconds: float = 2.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    async def check_readiness(self) -> OllamaReadiness:
        """Request Ollama's tags endpoint and turn failures into readiness data."""

        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout_seconds,
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


HealthComponentStatus = Literal["ready", "degraded", "unavailable"]
OverallHealthStatus = Literal["healthy", "degraded", "unavailable"]


class HealthComponent(BaseModel):
    """Readiness and diagnostics for one local dependency."""

    status: HealthComponentStatus
    ready: bool
    details: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class HealthResponse(BaseModel):
    """Stable response contract for ``GET /api/v1/health``."""

    status: OverallHealthStatus
    sqlite: HealthComponent
    ollama: HealthComponent


router = APIRouter(prefix="/api/v1", tags=["health"])


def get_database(request: Request) -> Database:
    """Resolve the application database for dependency injection."""

    return request.app.state.database


def get_ollama_client(request: Request) -> OllamaHealthClient:
    """Resolve the injectable Ollama health client."""

    return request.app.state.ollama_client


def _sqlite_component(readiness: DatabaseReadiness) -> HealthComponent:
    details: dict[str, Any] = {}
    if readiness.foreign_keys is not None:
        details["foreign_keys"] = readiness.foreign_keys
    if readiness.journal_mode is not None:
        details["journal_mode"] = readiness.journal_mode
    if readiness.schema_version is not None:
        details["schema_version"] = readiness.schema_version
    return HealthComponent(
        status="ready" if readiness.ready else "unavailable",
        ready=readiness.ready,
        details=details,
        error=readiness.error,
    )


def _ollama_component(readiness: OllamaReadiness) -> HealthComponent:
    return HealthComponent(
        status="ready" if readiness.ready else "unavailable",
        ready=readiness.ready,
        details=dict(readiness.details),
        error=readiness.error,
    )


def _coerce_ollama_readiness(value: Any) -> OllamaReadiness:
    """Accept the declared result type, duck-typed readiness objects, and simple fake-client return values."""

    if isinstance(value, OllamaReadiness):
        return value
    if hasattr(value, "ready"):
        return OllamaReadiness(
            ready=bool(getattr(value, "ready", False)),
            status_code=getattr(value, "status_code", None),
            details=dict(getattr(value, "details", {})),
            error=getattr(value, "error", None),
        )
    if isinstance(value, bool):
        return OllamaReadiness(ready=value)
    if isinstance(value, Mapping):
        return OllamaReadiness(
            ready=bool(value.get("ready", False)),
            status_code=value.get("status_code"),
            details=dict(value.get("details", {})),
            error=value.get("error"),
        )
    raise TypeError("Ollama health client returned an unsupported readiness value")


@router.get("/health", response_model=HealthResponse)
async def get_health(
    database: Database = Depends(get_database),
    ollama_client: OllamaHealthClient = Depends(get_ollama_client),
) -> HealthResponse:
    """Report SQLite and Ollama readiness without failing on Ollama outages."""

    try:
        sqlite_readiness = database.check_readiness()
    except Exception as exc:
        sqlite_readiness = DatabaseReadiness(
            ready=False,
            error=f"SQLite readiness check failed: {exc}",
        )

    try:
        ollama_readiness = _coerce_ollama_readiness(
            await ollama_client.check_readiness()
        )
    except Exception as exc:
        ollama_readiness = OllamaReadiness(
            ready=False,
            details={"error_type": type(exc).__name__},
            error=f"Ollama health check failed: {exc}",
        )

    sqlite = _sqlite_component(sqlite_readiness)
    ollama = _ollama_component(ollama_readiness)
    if not sqlite.ready:
        overall_status: OverallHealthStatus = "unavailable"
    elif not ollama.ready:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return HealthResponse(status=overall_status, sqlite=sqlite, ollama=ollama)
