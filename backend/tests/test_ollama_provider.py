"""Unit tests for OllamaProvider discovery, streaming, and error handling with mocked transports."""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx
import pytest

from app.providers.ollama import (
    OllamaConnectionError,
    OllamaGenerateChunk,
    OllamaModelInfo,
    OllamaProvider,
    OllamaResponseError,
    OllamaTimeoutError,
)


class MockTransport(httpx.AsyncBaseTransport):
    """Custom transport for mocking httpx responses and network behaviors."""

    def __init__(self, handler) -> None:
        self.handler = handler

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return await self.handler(request)


@pytest.mark.asyncio
async def test_list_models_success() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        payload = {
            "models": [
                {
                    "name": "smollm2:135m",
                    "model": "smollm2:135m",
                    "modified_at": "2026-09-13T10:00:00Z",
                    "size": 270898672,
                    "digest": "9077fe9d2ae1",
                    "details": {"family": "llama", "parameter_size": "134M"},
                },
                {
                    "name": "qwen2.5:0.5b",
                    "model": "qwen2.5:0.5b",
                    "modified_at": "2026-09-13T10:05:00Z",
                    "size": 397000000,
                    "digest": "a8b0c5157701",
                    "details": {"family": "qwen2", "parameter_size": "0.5B"},
                },
            ]
        }
        return httpx.Response(200, json=payload)

    provider = OllamaProvider(transport=MockTransport(handler))
    models = await provider.list_models()

    assert len(models) == 2
    assert models[0].name == "smollm2:135m"
    assert models[0].size == 270898672
    assert models[0].digest == "9077fe9d2ae1"
    assert models[0].details["family"] == "llama"
    assert models[1].name == "qwen2.5:0.5b"


@pytest.mark.asyncio
async def test_list_models_network_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaConnectionError, match="Failed to connect to Ollama"):
        await provider.list_models()


@pytest.mark.asyncio
async def test_list_models_timeout() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Timed out", request=request)

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaTimeoutError, match="timed out"):
        await provider.list_models()


@pytest.mark.asyncio
async def test_list_models_http_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaResponseError, match="HTTP 500"):
        await provider.list_models()


@pytest.mark.asyncio
async def test_stream_generate_success() -> None:
    async def streaming_body() -> AsyncIterator[bytes]:
        chunks = [
            {"model": "smollm2:135m", "response": "The ", "done": False},
            {"model": "smollm2:135m", "response": "turbine operates ", "done": False},
            {"model": "smollm2:135m", "response": "at 3000 RPM [S1].", "done": False},
            {
                "model": "smollm2:135m",
                "response": "",
                "done": True,
                "total_duration": 450000000,
                "load_duration": 50000000,
                "prompt_eval_count": 120,
                "prompt_eval_duration": 100000000,
                "eval_count": 15,
                "eval_duration": 300000000,
            },
        ]
        for c in chunks:
            yield (json.dumps(c) + "\n").encode("utf-8")

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/generate"
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "smollm2:135m"
        assert body["stream"] is True
        assert body["prompt"] == "Test prompt"
        return httpx.Response(200, content=streaming_body())

    provider = OllamaProvider(transport=MockTransport(handler))
    chunks: list[OllamaGenerateChunk] = []
    async for chunk in provider.stream_generate("smollm2:135m", "Test prompt"):
        chunks.append(chunk)

    assert len(chunks) == 4
    full_text = "".join(c.response for c in chunks)
    assert full_text == "The turbine operates at 3000 RPM [S1]."
    assert chunks[-1].done is True
    assert chunks[-1].total_duration == 450000000
    assert chunks[-1].eval_count == 15


@pytest.mark.asyncio
async def test_stream_generate_http_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="model 'unknown' not found")

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaResponseError, match="HTTP 404"):
        async for _ in provider.stream_generate("unknown", "prompt"):
            pass


@pytest.mark.asyncio
async def test_stream_generate_malformed_chunk() -> None:
    async def streaming_body() -> AsyncIterator[bytes]:
        yield b"{not-valid-json\n"

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=streaming_body())

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaResponseError, match="Malformed JSON chunk"):
        async for _ in provider.stream_generate("smollm2:135m", "prompt"):
            pass


@pytest.mark.asyncio
async def test_stream_generate_error_in_json() -> None:
    async def streaming_body() -> AsyncIterator[bytes]:
        yield b'{"error": "CUDA out of memory"}\n'

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=streaming_body())

    provider = OllamaProvider(transport=MockTransport(handler))
    with pytest.raises(OllamaResponseError, match="CUDA out of memory"):
        async for _ in provider.stream_generate("smollm2:135m", "prompt"):
            pass


@pytest.mark.asyncio
async def test_unload_model_polls_api_ps() -> None:
    ps_calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal ps_calls
        if request.url.path == "/api/generate":
            body = json.loads(request.content.decode("utf-8"))
            assert body["keep_alive"] == 0
            assert body["model"] == "smollm2:135m"
            return httpx.Response(200, json={"done": True})
        elif request.url.path == "/api/ps":
            ps_calls += 1
            if ps_calls == 1:
                # Still running on first poll
                return httpx.Response(200, json={"models": [{"name": "smollm2:135m"}]})
            else:
                # Evicted on second poll
                return httpx.Response(200, json={"models": []})
        return httpx.Response(404)

    provider = OllamaProvider(transport=MockTransport(handler))
    evicted = await provider.unload_model("smollm2:135m", poll_timeout=2.0)
    assert evicted is True
    assert ps_calls >= 2

