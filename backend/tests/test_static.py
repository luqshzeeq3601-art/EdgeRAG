from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_serves_frontend_spa_and_assets() -> None:
    client = TestClient(create_app())
    response = client.get("/")
    assert response.status_code == 200
    assert "EdgeRAG" in response.text

    # Route fallback for client-side routing
    docs_response = client.get("/documents")
    assert docs_response.status_code == 200
    assert "EdgeRAG" in docs_response.text

    # API 404 does not serve SPA index
    api_response = client.get("/api/v1/nonexistent")
    assert api_response.status_code == 404
    assert api_response.json() == {"detail": "API endpoint not found"}
