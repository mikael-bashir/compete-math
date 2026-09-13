"""Thin wrapper around `fastmcp.Client` for talking to real backend MCP servers.

Every call opens a fresh SSE connection to the backend, makes one tool call,
and tears the connection back down -- this module does no queueing, caching
or retrying of its own. All admission control (deciding *when* a call is
allowed to happen) lives in `queue_manager.py` and is applied by
`mcp_proxy.py` before `BackendClient.call_tool` is ever invoked.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastmcp import Client
from fastmcp.client.transports import SSETransport
from mcp_types import CallToolResult, Tool

from app.logging_config import get_logger

logger = get_logger(__name__)


class BackendCallError(RuntimeError):
    """Raised when a call to a downstream backend MCP server fails outright.

    This covers connection/transport failures (backend unreachable, SSE
    handshake failed, timed out, ...) -- not an ordinary in-protocol tool
    error, which the backend reports as `CallToolResult(is_error=True)` and
    which this module passes straight through instead of raising.
    """


class BackendClient:
    """Calls one downstream MCP backend over SSE, one tool call at a time.

    Concurrency towards this backend is entirely controlled upstream, by
    `queue_manager.QueueManager`, before this class is ever invoked --
    nothing in here limits or queues calls itself.
    """

    def __init__(self, service_name: str, base_url: str, timeout: Optional[float] = None) -> None:
        self.service_name = service_name
        self.base_url = base_url
        self.timeout = timeout

    def _client(self) -> Client:
        return Client(SSETransport(self.base_url), timeout=self.timeout)

    async def list_tools(self) -> List[Tool]:
        """Return the backend's advertised tools (used for diagnostics/tests)."""
        async with self._client() as client:
            return await client.list_tools()

    async def call_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        *,
        request_id: str,
    ) -> CallToolResult:
        """Call `tool_name` on the backend and return its raw `CallToolResult`.

        In-protocol tool errors (`CallToolResult.is_error`) are returned, not
        raised, so the caller can relay the backend's own error content
        verbatim. Only connection/transport failures raise `BackendCallError`.
        """
        logger.debug(
            "backend_call_start request_id=%s backend=%s tool=%s",
            request_id,
            self.service_name,
            tool_name,
        )
        try:
            async with self._client() as client:
                result = await client.call_tool(
                    tool_name, arguments, raise_on_error=False
                )
        except Exception as exc:  # noqa: BLE001 - deliberately broad: any transport failure
            logger.error(
                "backend_call_error request_id=%s backend=%s tool=%s error=%s",
                request_id,
                self.service_name,
                tool_name,
                exc,
            )
            raise BackendCallError(
                f"call to backend '{self.service_name}' (tool={tool_name!r}) failed: {exc}"
            ) from exc

        logger.debug(
            "backend_call_end request_id=%s backend=%s tool=%s is_error=%s",
            request_id,
            self.service_name,
            tool_name,
            result.is_error,
        )
        return result


class BackendClientRegistry:
    """Builds and holds one `BackendClient` per configured backend service name."""

    def __init__(self, backend_urls: Dict[str, str], timeout: Optional[float] = None) -> None:
        self._clients: Dict[str, BackendClient] = {
            name: BackendClient(name, url, timeout=timeout) for name, url in backend_urls.items()
        }

    def get(self, service_name: str) -> BackendClient:
        try:
            return self._clients[service_name]
        except KeyError as exc:
            raise KeyError(
                f"Unknown backend service {service_name!r}; configured backends: "
                f"{list(self._clients)}"
            ) from exc

    def __contains__(self, service_name: str) -> bool:
        return service_name in self._clients

    def names(self) -> List[str]:
        return list(self._clients.keys())
