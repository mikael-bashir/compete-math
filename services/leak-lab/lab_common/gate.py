"""A plain TCP forwarder: listens on one port and copies bytes to a host:port inside the lab network.

Why it exists: the lab tool servers run on a Docker network with no way out (`internal: true`), because a tool that runs other people's
formulas should not be able to reach anything. Docker cannot publish a port of a container that is only on such a network, so this small
gate sits on both networks and is the only thing published (on 127.0.0.1 only). It reads nothing and decides nothing.
"""
from __future__ import annotations

import asyncio
import os
import socket
import struct
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


def interface_addresses() -> list[str]:
    """The IPv4 address of every network interface of this container except loopback (Linux; main() adds loopback itself). The gate listens on exactly these, not on the
    wildcard address: the lab network's side and the published side are the two it needs, and nothing else a container may later gain."""
    import fcntl  # Linux only, and only needed here

    found: list[str] = []
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        for _, name in socket.if_nameindex():
            try:
                packed = fcntl.ioctl(s.fileno(), 0x8915, struct.pack("256s", name.encode()[:15]))  # SIOCGIFADDR
            except OSError:
                continue  # an interface without an IPv4 address
            addr = socket.inet_ntoa(packed[20:24])
            if not addr.startswith("127.") and addr not in found:
                found.append(addr)
    return found


async def serve(listen_port: int, target_host: str, target_port: int, listen_host: str | list[str] = "127.0.0.1") -> None:
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


def main() -> None:
    listen, target = int(os.environ["GATE_LISTEN_PORT"]), os.environ["GATE_TARGET"]
    host, _, port = target.rpartition(":")
    addresses = interface_addresses()
    if not addresses:
        raise SystemExit("gate: this container has no non-loopback IPv4 address to listen on")
    addresses = ["127.0.0.1", *addresses]  # loopback too: the container's own health check connects there
    print(f"gate: {','.join(addresses)}:{listen} -> {host}:{port}", file=sys.stderr, flush=True)
    asyncio.run(serve(listen, host, int(port), addresses))


if __name__ == "__main__":
    main()
