"""The actual proxy tool handlers, and the FastMCP server that exposes them.

For every configured backend (`leak-ii`, `leak-iv`, ...) this module
registers one MCP tool, `call_<service_name>`, that a client uses exactly as
it would call the real backend directly: `call_leak_ii(tool="apply_tactic",
arguments={...})`. Under the hood each call does:

    enqueue -> wait_for_turn -> backend_client call -> release

and the caller's own MCP request stays open the entire time -- it only gets
a response once the backend has actually answered. If the caller disconnects
(their request task is cancelled) at any point in that sequence, the ticket
is evicted immediately rather than left to block whoever is queued behind it.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, Optional

from fastmcp import FastMCP
from fastmcp.tools.base import ToolResult
from mcp_types import TextContent

from app.backend_client import BackendCallError, BackendClientRegistry
from app.logging_config import get_logger
from app.queue_manager import QueueManager

logger = get_logger(__name__)


def service_tool_name(service_name: str) -> str:
    """The MCP tool name a given backend is exposed under, e.g. "leak-ii" -> "call_leak_ii"."""
    return f"call_{service_name.replace('-', '_')}"


async def proxy_call(
    *,
    service_name: str,
    queue_manager: QueueManager,
    backend_registry: BackendClientRegistry,
    tool_name: str,
    arguments: Optional[Dict[str, Any]],
) -> ToolResult:
    """Run one proxied call end-to-end: enqueue, wait, call the backend, release.

    This is the piece exercised directly by `tests/test_mcp_proxy.py` (with a
    fake `backend_registry`), independent of fastmcp/FastAPI wiring.
    """
    request_id = uuid.uuid4().hex
    arguments = dict(arguments or {})

    ticket = await queue_manager.enqueue(service_name, request_id)
    logger.info(
        "proxy_call enqueued request_id=%s ticket_id=%s backend=%s tool=%s",
        request_id,
        ticket.ticket_id,
        service_name,
        tool_name,
    )

    try:
        await queue_manager.wait_for_turn(ticket)
    except asyncio.CancelledError:
        # queue_manager.wait_for_turn() already evicted the ticket; nothing
        # left to release, just let the cancellation continue propagating.
        logger.info(
            "proxy_call cancelled while waiting request_id=%s ticket_id=%s backend=%s",
            request_id,
            ticket.ticket_id,
            service_name,
        )
        raise

    # The ticket is ACTIVE from here on: whatever happens next, it must be
    # released or evicted exactly once so the next ticket in line can go.
    try:
        client = backend_registry.get(service_name)
        result = await client.call_tool(tool_name, arguments, request_id=request_id)
    except asyncio.CancelledError:
        logger.info(
            "proxy_call cancelled while active request_id=%s ticket_id=%s backend=%s -- evicting",
            request_id,
            ticket.ticket_id,
            service_name,
        )
        await queue_manager.evict(ticket)
        raise
    except BackendCallError as exc:
        logger.error(
            "proxy_call backend error request_id=%s ticket_id=%s backend=%s error=%s",
            request_id,
            ticket.ticket_id,
            service_name,
            exc,
        )
        await queue_manager.release(ticket)
        return ToolResult(content=[TextContent(type="text", text=str(exc))], is_error=True)

    await queue_manager.release(ticket)
    logger.info(
        "proxy_call completed request_id=%s ticket_id=%s backend=%s is_error=%s",
        request_id,
        ticket.ticket_id,
        service_name,
        result.is_error,
    )
    return ToolResult(
        content=result.content,
        structured_content=result.structured_content,
        is_error=result.is_error,
    )


def _register_backend_tool(
    mcp: FastMCP,
    service_name: str,
    queue_manager: QueueManager,
    backend_registry: BackendClientRegistry,
) -> None:
    tool_name = service_tool_name(service_name)

    async def handler(tool: str, arguments: Optional[Dict[str, Any]] = None) -> ToolResult:
        return await proxy_call(
            service_name=service_name,
            queue_manager=queue_manager,
            backend_registry=backend_registry,
            tool_name=tool,
            arguments=arguments,
        )

    handler.__name__ = tool_name
    mcp.tool(
        name=tool_name,
        description=(
            f"Forward a tool call to the '{service_name}' backend MCP server. "
            "Requests queue FIFO and respect that backend's configured "
            "concurrency limit before being forwarded."
        ),
    )(handler)
    logger.info("registered_tool tool=%s backend=%s", tool_name, service_name)


def build_mcp_server(
    *,
    queue_manager: QueueManager,
    backend_registry: BackendClientRegistry,
    name: str = "leak-queue-proxy",
) -> FastMCP:
    """Build the FastMCP server exposing one `call_<service_name>` tool per backend."""
    mcp = FastMCP(
        name=name,
        instructions=(
            "Waiting-room proxy in front of shared Leak MCP backends. Call "
            "call_<service_name>(tool, arguments) instead of calling that "
            "backend directly; this proxy takes care of FIFO ordering and "
            "per-backend concurrency limits."
        ),
    )
    for service_name in backend_registry.names():
        _register_backend_tool(mcp, service_name, queue_manager, backend_registry)
    return mcp
