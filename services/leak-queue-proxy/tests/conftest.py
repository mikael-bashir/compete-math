"""Shared pytest fixtures.

`fake_backend` boots a tiny, real fastmcp server over SSE on a loopback
socket, inside this same test process, and tears it down again -- fastmcp's
SSE client transport (what `app/backend_client.py` uses in production)
needs an actual URL to connect to. Tests point `BACKEND_URLS` at it to stand
in for a real Leak-II/Leak-IV backend.
"""
from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, List, Tuple

import pytest
import pytest_asyncio
import uvicorn
from fastmcp import FastMCP

from app.memory_queue_store import MemoryQueueStore
from app.queue_manager import QueueManager


class FakeBackendActivity:
    """Records (label, start, end) for every `record` call the fake backend
    serves, so tests can assert calls did or didn't overlap in time."""

    def __init__(self) -> None:
        self.calls: List[Tuple[str, float, float]] = []

    def interval(self, label: str) -> Tuple[float, float]:
        for recorded_label, start, end in self.calls:
            if recorded_label == label:
                return start, end
        raise KeyError(f"no recorded call named {label!r}")

    def overlaps(self, label_a: str, label_b: str) -> bool:
        a_start, a_end = self.interval(label_a)
        b_start, b_end = self.interval(label_b)
        return a_start < b_end and b_start < a_end

    def order_by_start(self) -> List[str]:
        return [label for label, _start, _end in sorted(self.calls, key=lambda c: c[1])]


def build_fake_backend_mcp(activity: FakeBackendActivity) -> FastMCP:
    """A minimal downstream MCP server standing in for Leak-II/Leak-IV in tests."""
    mcp = FastMCP("fake-backend")

    @mcp.tool()
    async def echo(text: str) -> str:
        return text

    @mcp.tool()
    async def record(label: str, delay: float = 0.0) -> str:
        """Sleep `delay` seconds, then record the [start, end) interval under `label`."""
        start = time.monotonic()
        if delay:
            await asyncio.sleep(delay)
        end = time.monotonic()
        activity.calls.append((label, start, end))
        return label

    @mcp.tool()
    async def boom(message: str = "boom") -> str:
        raise RuntimeError(message)

    return mcp


_STARTUP_TIMEOUT_SECONDS = 10


@asynccontextmanager
async def _run_asgi_app(app: Any) -> AsyncIterator[str]:
    """Serve `app` on a real loopback socket (ephemeral port) for the fixture's lifetime."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    serve_task = asyncio.create_task(server.serve())
    try:
        async def _wait_until_started() -> None:
            while not server.started:
                await asyncio.sleep(0.01)

        try:
            await asyncio.wait_for(_wait_until_started(), timeout=_STARTUP_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"fake backend server did not start within {_STARTUP_TIMEOUT_SECONDS}s"
            ) from None

        port = server.servers[0].sockets[0].getsockname()[1]
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await serve_task


@pytest_asyncio.fixture
async def fake_backend() -> AsyncIterator[Dict[str, Any]]:
    """Yields `{"url": <sse endpoint>, "activity": FakeBackendActivity()}`."""
    activity = FakeBackendActivity()
    mcp = build_fake_backend_mcp(activity)
    sse_app = mcp.http_app(transport="sse")
    async with _run_asgi_app(sse_app) as base_url:
        yield {"url": f"{base_url}/sse", "activity": activity}


@pytest.fixture
def queue_manager_factory():
    """Builds a fresh, isolated `QueueManager` (+ its `MemoryQueueStore`) per call."""

    def _factory(concurrency_limits: Dict[str, int] | None = None, default_concurrency_limit: int = 1) -> QueueManager:
        store = MemoryQueueStore()
        return QueueManager(
            store=store,
            concurrency_limits=concurrency_limits or {},
            default_concurrency_limit=default_concurrency_limit,
        )

    return _factory
