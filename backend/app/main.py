"""FastAPI application factory for the EdgeRAG local foundation."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.benchmarks import router as benchmarks_router
from app.api.documents import router as documents_router
from app.api.health import OllamaClient, OllamaHealthClient, router as health_router
from app.api.models import router as models_router
from app.api.rag import router as rag_router
from app.benchmarks.repository import BenchmarkRepository
from app.core.config import Settings, get_settings
from app.documents.pipeline import DocumentPipeline
from app.documents.repository import DocumentRepository
from app.persistence.database import Database
from app.providers.ollama import OllamaProvider
from app.services.benchmark import BenchmarkEngine
from app.services.monitoring import HardwareMonitor
from app.services.rag import RAGService


def create_app(
    *,
    settings: Settings | None = None,
    database: Database | None = None,
    ollama_client: OllamaHealthClient | None = None,
    ollama_provider: OllamaProvider | None = None,
    document_pipeline: DocumentPipeline | None = None,
    rag_service: RAGService | None = None,
    benchmark_repository: BenchmarkRepository | None = None,
    benchmark_engine: BenchmarkEngine | None = None,
    hardware_monitor: HardwareMonitor | None = None,
) -> FastAPI:
    """Create an app with injectable local dependencies for safe test isolation."""

    resolved_settings = settings or get_settings()
    resolved_database = database or Database(resolved_settings.database_path)

    resolved_ollama_provider = ollama_provider or OllamaProvider(
        base_url=resolved_settings.ollama_base_url,
        timeout_seconds=60.0,
        health_timeout_seconds=resolved_settings.ollama_timeout_seconds,
    )
    resolved_ollama_client = ollama_client or resolved_ollama_provider

    resolved_pipeline = document_pipeline or DocumentPipeline.from_settings(
        resolved_settings,
        DocumentRepository(resolved_database),
    )
    resolved_rag_service = rag_service or RAGService(
        pipeline=resolved_pipeline,
        ollama_provider=resolved_ollama_provider,
    )

    resolved_benchmark_repo = benchmark_repository or BenchmarkRepository(resolved_database)
    resolved_hw_monitor = hardware_monitor or HardwareMonitor()
    resolved_benchmark_engine = benchmark_engine or BenchmarkEngine(
        repository=resolved_benchmark_repo,
        pipeline=resolved_pipeline,
        ollama_provider=resolved_ollama_provider,
        hardware_monitor=resolved_hw_monitor,
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.database = resolved_database
        application.state.ollama_client = resolved_ollama_client
        application.state.ollama_provider = resolved_ollama_provider
        application.state.document_pipeline = resolved_pipeline
        application.state.rag_service = resolved_rag_service
        application.state.benchmark_repository = resolved_benchmark_repo
        application.state.benchmark_engine = resolved_benchmark_engine
        try:
            resolved_database.initialize()
            resolved_pipeline.initialize_and_validate_index()
        except Exception as exc:
            # The health route reports database failures as structured readiness data.
            application.state.database_initialization_error = str(exc)
        try:
            yield
        finally:
            resolved_hw_monitor.close()
            try:
                import pynvml

                pynvml.nvmlShutdown()
            except Exception:
                pass

    application = FastAPI(
        title=resolved_settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    application.state.database = resolved_database
    application.state.ollama_client = resolved_ollama_client
    application.state.ollama_provider = resolved_ollama_provider
    application.state.document_pipeline = resolved_pipeline
    application.state.rag_service = resolved_rag_service
    application.state.benchmark_repository = resolved_benchmark_repo
    application.state.benchmark_engine = resolved_benchmark_engine

    application.include_router(health_router)
    application.include_router(documents_router)
    application.include_router(models_router)
    application.include_router(rag_router)
    application.include_router(benchmarks_router)

    # Static asset and SPA mounting
    dist_dir: Path | None = None
    if resolved_settings.static_files_path and resolved_settings.static_files_path.is_dir():
        dist_dir = resolved_settings.static_files_path
    else:
        for candidate in (
            Path("frontend/dist"),
            Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
            Path("/app/frontend/dist"),
        ):
            if candidate.is_dir():
                dist_dir = candidate
                break

    if dist_dir is not None:
        resolved_dist = dist_dir.resolve()
        assets_dir = resolved_dist / "assets"
        if assets_dir.is_dir():
            application.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @application.get("/", include_in_schema=False)
        async def serve_root() -> FileResponse:
            index_path = resolved_dist / "index.html"
            if index_path.is_file():
                return FileResponse(index_path)
            raise HTTPException(status_code=404, detail="Frontend index not found")

        @application.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str) -> FileResponse:
            if full_path.startswith("api/") or full_path == "api":
                raise HTTPException(status_code=404, detail="API endpoint not found")

            # Prevent directory traversal attacks
            unquoted_path = unquote(full_path).lstrip("/\\")
            try:
                candidate = (resolved_dist / unquoted_path).resolve()
            except (ValueError, OSError):
                raise HTTPException(status_code=404, detail="Page not found")

            if not candidate.is_relative_to(resolved_dist):
                raise HTTPException(status_code=404, detail="Page not found")

            if candidate.is_file():
                return FileResponse(candidate)

            # Do not fall back to index.html for missing files with extensions
            if "." in candidate.name:
                raise HTTPException(status_code=404, detail="Page not found")

            index_path = resolved_dist / "index.html"
            if index_path.is_file():
                return FileResponse(index_path)
            raise HTTPException(status_code=404, detail="Page not found")

    return application


app = create_app()
