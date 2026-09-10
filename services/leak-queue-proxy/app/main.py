"""FastAPI application entrypoint.

Wiring only: builds the queue manager, the backend client registry and the
fastmcp ASGI app from `Settings`, then mounts the latter under `/mcp`. No
business logic lives here -- see `queue_manager.py`, `backend_client.py` and
`mcp_proxy.py` for that.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI

from app.backend_client import BackendClientRegistry
from app.config import Settings, get_settings
from app.logging_config import configure_logging, get_logger
from app.mcp_proxy import build_mcp_server
from app.memory_queue_store import MemoryQueueStore
from app.queue_manager import QueueManager

logger = get_logger(__name__)

#: Where the proxy's MCP endpoint is mounted. A client points its MCP
#: transport at "<this service's base URL>/mcp" exactly as it would point at
#: a real backend's own MCP URL.
MCP_MOUNT_PATH = "/mcp"


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """Build a fully wired FastAPI app. Each call produces an independent,
    isolated instance -- used directly by tests to point at a fake backend."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    logger.info(
        "startup backends=%s concurrency_limits=%s queue_backend=%s",
        list(settings.backend_urls),
        settings.concurrency_limits,
        settings.queue_backend,
    )

    queue_store = MemoryQueueStore()
    queue_manager = QueueManager(
        store=queue_store,
        concurrency_limits=settings.concurrency_limits,
        default_concurrency_limit=settings.default_concurrency_limit,
    )
    backend_registry = BackendClientRegistry(settings.backend_urls)
    # So GET /status is immediately useful -- every configured backend shows
    # up with a zeroed-out queue, not just ones that have already seen traffic.
    queue_manager.register_known_backends(backend_registry.names())

    mcp_server = build_mcp_server(queue_manager=queue_manager, backend_registry=backend_registry)
    mcp_app = mcp_server.http_app(path="/")

    fastapi_app = FastAPI(title="leak-queue-proxy", lifespan=mcp_app.lifespan)
    fastapi_app.state.queue_manager = queue_manager
    fastapi_app.state.backend_registry = backend_registry

    @fastapi_app.get("/healthz")
    async def healthz() -> dict:
        """Plain liveness check -- always 200 once the process is up."""
        return {"status": "ok"}

    @fastapi_app.get("/status")
    async def status() -> dict:
        """Per-backend queue depth / active count / concurrency limit."""
        return {
            "queue_backend": settings.queue_backend,
            "backends": await queue_manager.stats(),
        }

    fastapi_app.mount(MCP_MOUNT_PATH, mcp_app)

    return fastapi_app


app = create_app()
