"""A plain TCP forwarder: listens on one port and copies bytes to a host:port inside the lab network.

Why it exists: the lab tool servers run on a Docker network with no way out (`internal: true`), because a tool that runs other people's
formulas should not be able to reach anything. Docker cannot publish a port of a container that is only on such a network, so this small
gate sits on both networks and is the only thing published (on 127.0.0.1 only). It reads nothing and decides nothing.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def serve(listen_port: int, target_host: str, target_port: int, listen_host: str = "127.0.0.1") -> None:
    async def handle(client_r: asyncio.StreamReader, client_w: asyncio.StreamWriter) -> None:
        try:
            up_r, up_w = await asyncio.open_connection(target_host, target_port)
        except OSError:
            client_w.close()
            return
        await asyncio.gather(_pipe(client_r, up_w), _pipe(up_r, client_w))

    server = await asyncio.start_server(handle, listen_host, listen_port)
    async with server:
        await server.serve_forever()


SERVICE_NAME = re.compile(r"[a-z][a-z0-9-]{0,62}")


def target_of(spec: str) -> tuple[str, int]:
    """`service:port` of a lab server, nothing else: a name on the lab network, never an address, so the gate cannot be pointed at anything outside it."""
    host, _, port = spec.rpartition(":")
    if not SERVICE_NAME.fullmatch(host) or not port.isdigit() or not 1024 <= int(port) <= 65535:
        raise SystemExit(f"gate: GATE_TARGET must be <service>:<port> (a service name and a port from 1024), not {spec!r}")
    return host, int(port)


def main() -> None:
    listen = int(os.environ["GATE_LISTEN_PORT"])
    host, port = target_of(os.environ["GATE_TARGET"])
    print(f"gate: 127.0.0.1:{listen} -> {host}:{port}", file=sys.stderr, flush=True)
    asyncio.run(serve(listen, host, port))


if __name__ == "__main__":
    main()
