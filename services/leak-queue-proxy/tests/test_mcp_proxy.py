"""Component tests for mcp_proxy.py: proxy_call() against a fake/mocked
backend_client. No real network calls anywhere in this file.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

import pytest
from mcp_types import CallToolResult, TextContent

from app.backend_client import BackendCallError
from app.mcp_proxy import proxy_call, service_tool_name
from app.memory_queue_store import MemoryQueueStore
from app.queue_manager import QueueManager, TicketState


def _call_result(text: str, *, is_error: bool = False) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=text)],
        structuredContent=None,
        isError=is_error,
    )


class FakeBackendClient:
    """Stands in for `BackendClient`: records calls, optionally delays or errors."""

    def __init__(self, *, delay: float = 0.0, raise_error: Optional[Exception] = None) -> None:
        self.delay = delay
        self.raise_error = raise_error
        self.calls: list[tuple[str, Dict[str, Any]]] = []
        self.started = asyncio.Event()

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any], *, request_id: str) -> CallToolResult:
        self.calls.append((tool_name, arguments))
        self.started.set()
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.raise_error is not None:
            raise self.raise_error
        return _call_result(f"ok:{tool_name}")


class FakeBackendRegistry:
    def __init__(self, clients: Dict[str, FakeBackendClient]) -> None:
        self._clients = clients

    def get(self, service_name: str) -> FakeBackendClient:
        return self._clients[service_name]


def _queue_manager(concurrency_limits: Optional[Dict[str, int]] = None) -> QueueManager:
    return QueueManager(store=MemoryQueueStore(), concurrency_limits=concurrency_limits or {"svc": 1})


def test_service_tool_name_replaces_hyphens():
    assert service_tool_name("leak-ii") == "call_leak_ii"
    assert service_tool_name("leak-iv") == "call_leak_iv"


async def test_proxy_call_happy_path_enqueues_calls_backend_and_releases():
    qm = _queue_manager()
    backend = FakeBackendClient()
    registry = FakeBackendRegistry({"svc": backend})

    result = await proxy_call(
        service_name="svc",
        queue_manager=qm,
        backend_registry=registry,
        tool_name="apply_tactic",
        arguments={"goal": "trivial"},
    )

    assert backend.calls == [("apply_tactic", {"goal": "trivial"})]
    assert result.is_error is False
    assert result.content[0].text == "ok:apply_tactic"

    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 0, "active": 0, "concurrency_limit": 1}


async def test_proxy_call_defaults_missing_arguments_to_empty_dict():
    qm = _queue_manager()
    backend = FakeBackendClient()
    registry = FakeBackendRegistry({"svc": backend})

    await proxy_call(
        service_name="svc", queue_manager=qm, backend_registry=registry,
        tool_name="ping", arguments=None,
    )

    assert backend.calls == [("ping", {})]


async def test_proxy_call_surfaces_backend_call_error_as_tool_error_and_releases():
    qm = _queue_manager()
    backend = FakeBackendClient(raise_error=BackendCallError("backend unreachable"))
    registry = FakeBackendRegistry({"svc": backend})

    result = await proxy_call(
        service_name="svc", queue_manager=qm, backend_registry=registry,
        tool_name="apply_tactic", arguments={},
    )

    assert result.is_error is True
    assert "backend unreachable" in result.content[0].text

    # The ticket must have been released, not left dangling, so the next
    # caller isn't blocked by this failure.
    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 0, "active": 0, "concurrency_limit": 1}


async def test_proxy_call_serializes_two_concurrent_calls_to_a_concurrency_one_backend():
    qm = _queue_manager(concurrency_limits={"svc": 1})
    backend = FakeBackendClient(delay=0.05)
    registry = FakeBackendRegistry({"svc": backend})

    async def make_call(tool: str):
        return await proxy_call(
            service_name="svc", queue_manager=qm, backend_registry=registry,
            tool_name=tool, arguments={},
        )

    task_a = asyncio.create_task(make_call("first"))
    await asyncio.sleep(0.01)  # let `first` actually reach the backend
    assert backend.calls == [("first", {})]

    task_b = asyncio.create_task(make_call("second"))
    await asyncio.sleep(0.01)
    # `second` must still be queued -- the concurrency=1 backend is busy with `first`.
    assert backend.calls == [("first", {})]

    await asyncio.gather(task_a, task_b)
    assert [name for name, _ in backend.calls] == ["first", "second"]


async def test_proxy_call_cancelled_while_waiting_evicts_and_does_not_block_next(monkeypatch):
    qm = _queue_manager(concurrency_limits={"svc": 1})
    backend = FakeBackendClient(delay=0.05)
    registry = FakeBackendRegistry({"svc": backend})

    # Occupy the only slot first.
    blocker_task = asyncio.create_task(
        proxy_call(service_name="svc", queue_manager=qm, backend_registry=registry, tool_name="blocker", arguments={})
    )
    await asyncio.sleep(0.01)

    # This one queues behind the blocker, then gets cancelled before its turn.
    cancelled_task = asyncio.create_task(
        proxy_call(service_name="svc", queue_manager=qm, backend_registry=registry, tool_name="cancel-me", arguments={})
    )
    await asyncio.sleep(0.01)
    cancelled_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancelled_task

    # A third call must be served once the blocker finishes -- it must not
    # be stuck behind the evicted, cancelled second call.
    third_task = asyncio.create_task(
        proxy_call(service_name="svc", queue_manager=qm, backend_registry=registry, tool_name="third", arguments={})
    )

    await blocker_task
    result = await asyncio.wait_for(third_task, timeout=1)

    assert result.is_error is False
    called_tools = [name for name, _ in backend.calls]
    assert called_tools == ["blocker", "third"]  # "cancel-me" must never reach the backend
