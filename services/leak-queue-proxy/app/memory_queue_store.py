"""The in-process `QueueStore` implementation `QueueManager` uses today.

Plain dicts of deques, guarded entirely by `QueueManager`'s own
`asyncio.Lock` -- this module does no locking of its own and has no
persistence. That's fine for a single-replica proxy, which is the only
deployment `QUEUE_BACKEND=memory` supports; see `app/config.py` and
`app/queue_manager.py`'s `QueueStore` Protocol for how a future shared/
distributed store would slot in instead without any caller changing.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from app.queue_manager import Ticket


@dataclass
class _ServiceState:
    concurrency_limit: int
    waiting: Deque[Ticket] = field(default_factory=deque)
    active: int = 0


class MemoryQueueStore:
    """Holds every backend's waiting line and active-slot count in memory."""

    def __init__(self) -> None:
        self._services: Dict[str, _ServiceState] = {}

    def register_service(self, service_name: str, concurrency_limit: int) -> None:
        if service_name not in self._services:
            self._services[service_name] = _ServiceState(concurrency_limit=concurrency_limit)

    def _state(self, service_name: str) -> _ServiceState:
        try:
            return self._services[service_name]
        except KeyError as exc:
            raise KeyError(
                f"Unknown service {service_name!r}: register_service() was never "
                "called for it"
            ) from exc

    def concurrency_limit(self, service_name: str) -> int:
        return self._state(service_name).concurrency_limit

    def append_waiting(self, service_name: str, ticket: Ticket) -> None:
        self._state(service_name).waiting.append(ticket)

    def pop_waiting(self, service_name: str) -> Optional[Ticket]:
        state = self._state(service_name)
        return state.waiting.popleft() if state.waiting else None

    def remove_waiting(self, service_name: str, ticket: Ticket) -> bool:
        state = self._state(service_name)
        try:
            state.waiting.remove(ticket)
            return True
        except ValueError:
            return False

    def waiting_depth(self, service_name: str) -> int:
        return len(self._state(service_name).waiting)

    def active_count(self, service_name: str) -> int:
        return self._state(service_name).active

    def increment_active(self, service_name: str) -> int:
        state = self._state(service_name)
        state.active += 1
        return state.active

    def decrement_active(self, service_name: str) -> int:
        state = self._state(service_name)
        state.active = max(0, state.active - 1)
        return state.active

    def known_services(self) -> List[str]:
        return list(self._services.keys())
