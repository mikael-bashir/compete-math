# leak-queue-proxy

A standalone FIFO "waiting room" proxy that sits in front of shared, remote
Lean 4 theorem-proving MCP servers (**Leak-II**, a single resident stateful
proof daemon, and **Leak-IV**, a compute-heavy verifier). It is a fully
self-contained Python microservice: it has no dependency on, and is not
imported by, anything else in this repository.

**Leak-I is deliberately out of scope.** It's stateless/cacheable and needs
no queueing, so nothing in this service does anything for it.

## Why this exists

- **Leak-II** is a single resident, stateful daemon. It must process exactly
  one request at a time (concurrency = 1) or its internal state desyncs.
- **Leak-IV** can safely run several verifications at once -- concurrency is
  a function of available compute, not a protocol constraint -- but nothing
  should let one huge job or an unbounded queue starve everyone else.

This proxy presents itself as an ordinary MCP server. A client points at it
*exactly* the way it would point at a real backend's MCP URL. Under the
hood, every tool call:

1. is filed as a FIFO ticket for its backend,
2. waits until that ticket's turn comes (respecting that backend's
   configured concurrency limit),
3. is forwarded to the real backend only once admitted,
4. streams its result back through the same held client connection.

If the caller disconnects (or is cancelled) at any point -- while still
queued, or mid-flight against the backend -- its ticket is evicted
immediately, freeing that slot for whoever is next. One abandoned client can
never stall everyone behind it.

## Architecture

```
app/
  main.py                FastAPI app; mounts the fastmcp ASGI app. Wiring only.
  config.py               Env-driven settings (BACKEND_URLS, CONCURRENCY_LIMITS, ...).
  queue_manager.py         Pure FIFO + per-backend concurrency control. No I/O.
  memory_queue_store.py     The in-process store queue_manager.py uses.
  backend_client.py         fastmcp.Client wrapper, calls real backends over SSE.
  mcp_proxy.py               The proxy tool handlers + the FastMCP server they're on.
  logging_config.py          One shared logging setup.
```

For each backend configured in `BACKEND_URLS`, `mcp_proxy.py` registers one
MCP tool named `call_<service_name>` (e.g. `call_leak_ii`, `call_leak_iv`)
that takes `{"tool": "<real tool name>", "arguments": {...}}` and forwards
it, queued, to that backend. `queue_manager.py` has no idea fastmcp or
backend URLs exist -- it's pure `asyncio` ticket/concurrency bookkeeping,
unit-tested with zero I/O.

`QUEUE_BACKEND=memory` is the only supported store today. The
`QueueStore` Protocol in `queue_manager.py` and its one implementation,
`MemoryQueueStore`, exist specifically so a future shared/distributed store
(e.g. Redis, for a multi-replica deployment) could be swapped in later
without `QueueManager` or anything above it changing. Building that store is
explicitly out of scope for this PR.

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URLS` | `{}` | JSON map of backend name -> real backend MCP URL (SSE endpoint), e.g. `{"leak-ii": "https://leak-ii.example.com/sse", "leak-iv": "https://leak-iv.example.com/sse"}` |
| `CONCURRENCY_LIMITS` | `{"leak-ii": 1}` | JSON map of backend name -> max concurrent in-flight calls. `leak-ii` defaults to `1` even if omitted; any other configured backend without an explicit entry falls back to `DEFAULT_CONCURRENCY_LIMIT`. |
| `DEFAULT_CONCURRENCY_LIMIT` | `4` | Concurrency limit used for a configured backend with no entry in `CONCURRENCY_LIMITS` (e.g. set `CONCURRENCY_LIMITS='{"leak-iv": 8}'` explicitly instead of relying on this for anything that matters). |
| `QUEUE_BACKEND` | `memory` | Queue storage backend. Only `memory` is implemented; any other value fails fast at startup. |
| `LOG_LEVEL` | `INFO` | Log level for the `leak_queue_proxy` logger hierarchy. |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | Only consulted if you use them yourself (e.g. in your own uvicorn invocation); the Dockerfile's `CMD` hardcodes `0.0.0.0:8000`. |

Example:

```bash
export BACKEND_URLS='{"leak-ii": "https://leak-ii.internal:8443/sse", "leak-iv": "https://leak-iv.internal:8443/sse"}'
export CONCURRENCY_LIMITS='{"leak-ii": 1, "leak-iv": 8}'
```

## Endpoints

- `GET /healthz` -- plain liveness check (`{"status": "ok"}`).
- `GET /status` -- per-backend `{waiting, active, concurrency_limit}`, for
  every backend in `BACKEND_URLS` (shown even before it's seen any traffic).
- `/mcp` -- the proxy's own MCP server (streamable-HTTP transport). Point
  your MCP client here exactly as you would at a real backend's URL, then
  call `call_<service_name>(tool, arguments)`.

## Running locally

```bash
cd services/leak-queue-proxy
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export BACKEND_URLS='{"leak-ii": "https://leak-ii.internal:8443/sse"}'
export CONCURRENCY_LIMITS='{"leak-ii": 1}'

uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Running in Docker

```bash
docker build -t leak-queue-proxy services/leak-queue-proxy
docker run --rm -p 8000:8000 \
  -e BACKEND_URLS='{"leak-ii": "https://leak-ii.internal:8443/sse"}' \
  -e CONCURRENCY_LIMITS='{"leak-ii": 1}' \
  leak-queue-proxy
```

The image needs no Lean toolchain -- this service does no Lean work itself,
it only queues and forwards MCP calls.

## Testing

Unlike the rest of this repo's Python services, this one uses a real test
framework (pytest + pytest-asyncio + httpx) -- that's an intentional,
approved decision for this service specifically.

```bash
cd services/leak-queue-proxy
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests -v
```

Three layers, from the inside out:

- `tests/test_queue_manager.py` -- **unit**: FIFO ordering, per-backend
  concurrency caps, ticket eviction on cancellation. No network, no
  FastAPI, no fastmcp -- just `asyncio`.
- `tests/test_mcp_proxy.py` -- **component**: the `enqueue -> wait_for_turn
  -> backend call -> release` flow, against a fake/mocked backend client.
  Still no real network calls.
- `tests/test_integration.py` -- **integration**: boots the real
  FastAPI/fastmcp app in-process (`httpx.AsyncClient` + `httpx.ASGITransport`
  for the plain `/healthz`/`/status` endpoints; fastmcp's own `Client`,
  wired to an in-process ASGI transport, for the proxied MCP tool calls --
  see the module docstring in that file for why two HTTP clients are
  involved) against a small fake downstream MCP server. Asserts that two
  concurrent requests to a concurrency=1 backend are actually serialized in
  submission order, that a concurrency=N backend allows N in flight and
  blocks the (N+1)th until one finishes, and that a cancelled/disconnected
  waiting request does not block the next ticket.
