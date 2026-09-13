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


def test_blocks_directory_traversal() -> None:
    client = TestClient(create_app())

    traversal_paths = [
        "/%2e%2e/pyproject.toml",
        "/..%2fbackend%2fpyproject.toml",
        "/../../pyproject.toml",
        "/%2e%2e%2f%2e%2e%2fpyproject.toml",
        "/..\\pyproject.toml",
        "/%2e%2e%5cbackend%5cpyproject.toml",
    ]
    for path in traversal_paths:
        response = client.get(path)
        assert response.status_code == 404
        assert "edgerag-backend" not in response.text

