from pathlib import Path

from fastapi.testclient import TestClient

from app.api.health import OllamaReadiness
from app.core.config import Settings
from app.main import create_app
from app.persistence.database import Database


class HealthyOllama:
    async def check_readiness(self) -> OllamaReadiness:
        return OllamaReadiness(
            ready=True,
            status_code=200,
            details={"endpoint": "/api/tags"},
        )


class UnavailableOllama:
    async def check_readiness(self) -> OllamaReadiness:
        return OllamaReadiness(
            ready=False,
            details={"error_type": "ConnectError"},
            error="Ollama is unavailable at http://127.0.0.1:11434",
        )


def make_test_app(database_path: Path, ollama_client: object):
    return create_app(
        settings=Settings(database_path=database_path, _env_file=None),
        ollama_client=ollama_client,
    )


def test_database_initialization_enables_integrity_pragmas(tmp_path: Path) -> None:
    database = Database(tmp_path / "edgerag.sqlite3")

    readiness = database.initialize()

    assert readiness.ready is True
    assert readiness.foreign_keys is True
    assert readiness.journal_mode == "wal"
    assert readiness.schema_version == 3

    connection = database.connect()
    try:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert connection.execute(
            "SELECT version FROM schema_migrations"
        ).fetchone()[0] == 1
    finally:
        connection.close()

    assert database.check_readiness().ready is True


def test_health_reports_healthy_sqlite_and_ollama(tmp_path: Path) -> None:
    application = make_test_app(tmp_path / "healthy.sqlite3", HealthyOllama())

    with TestClient(application) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["sqlite"]["ready"] is True
    assert body["sqlite"]["details"] == {
        "foreign_keys": True,
        "journal_mode": "wal",
        "schema_version": 3,
    }
    assert body["ollama"]["status"] == "ready"
    assert body["ollama"]["ready"] is True


def test_health_reports_degraded_when_ollama_is_unavailable(tmp_path: Path) -> None:
    application = make_test_app(tmp_path / "ollama-down.sqlite3", UnavailableOllama())

    with TestClient(application) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["sqlite"]["ready"] is True
    assert body["ollama"]["status"] == "unavailable"
    assert body["ollama"]["ready"] is False
    assert "unavailable" in body["ollama"]["error"]
