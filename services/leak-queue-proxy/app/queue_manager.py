"""Core FIFO ticket queue with a per-backend concurrency cap.

This module is pure concurrency-control logic: no network calls, no
fastmcp, no FastAPI. It is fully unit-testable with nothing but asyncio.
Actual storage of each backend's waiting list and active-slot count is
delegated to a `QueueStore` implementation (see `memory_queue_store.py`) so
a future, shared/distributed store could be swapped in later without this
module -- or anything that calls it -- changing.
"""
from __future__ import annotations

import asyncio
import itertools
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Iterable, List, Optional, Protocol

from app.logging_config import get_logger

logger = get_logger(__name__)


class TicketState(str, Enum):
    """A ticket's place in its backend's lifecycle."""

    WAITING = "waiting"
    ACTIVE = "active"
    RELEASED = "released"
    EVICTED = "evicted"


@dataclass(eq=False)
class Ticket:
    """One request's claim on a spot in a backend's FIFO queue.

    `eq=False` keeps identity-based equality/hashing (the default `object`
    behaviour) instead of dataclass's generated field-by-field comparison --
    important because `granted` is an `asyncio.Event`, which isn't a
    meaningful thing to compare for equality, and because `QueueStore.
    remove_waiting` needs to find *this exact* ticket object, not merely one
    with equal-looking fields.
    """

    ticket_id: str
    service_name: str
    request_id: str
    state: TicketState = TicketState.WAITING
    granted: asyncio.Event = field(default_factory=asyncio.Event, repr=False)


class QueueStore(Protocol):
    """Storage interface for one backend's waiting list and active-slot count.

    `MemoryQueueStore` is the only implementation shipped in this PR. A
    Redis-backed (or otherwise shared) store could implement this same
    Protocol later without `QueueManager`, `mcp_proxy.py`, or any other
    caller changing at all.
    """

    def register_service(self, service_name: str, concurrency_limit: int) -> None:
        """Idempotently record `service_name`'s concurrency limit."""
        ...

    def concurrency_limit(self, service_name: str) -> int: ...

    def append_waiting(self, service_name: str, ticket: Ticket) -> None:
        """Add `ticket` to the back of `service_name`'s waiting line."""
        ...

    def pop_waiting(self, service_name: str) -> Optional[Ticket]:
        """Remove and return the ticket at the front of the waiting line, if any."""
        ...

    def remove_waiting(self, service_name: str, ticket: Ticket) -> bool:
        """Remove `ticket` from anywhere in the waiting line. Returns whether it was found."""
        ...

    def waiting_depth(self, service_name: str) -> int: ...

    def active_count(self, service_name: str) -> int: ...

    def increment_active(self, service_name: str) -> int: ...

    def decrement_active(self, service_name: str) -> int: ...

    def known_services(self) -> List[str]: ...


class QueueManager:
    """FIFO ticket queue with a per-backend concurrency cap.

    - `enqueue()` files a ticket at the back of its backend's line and, if a
      concurrency slot is free, grants it immediately (in FIFO order).
    - `wait_for_turn()` blocks until that ticket is granted. If the awaiting
      task is cancelled (the caller disconnected while still waiting), the
      ticket is evicted automatically before the cancellation propagates.
    - `release()` frees the slot an ACTIVE ticket held and dispatches the
      next eligible ticket(s), still respecting FIFO order.
    - `evict()` removes a ticket outright, whether it was still waiting or
      already active, freeing its slot if it held one. This is what a mid-
      flight caller disconnect ultimately triggers, so one abandoned client
      can never stall everyone queued behind it.

    All mutating operations are serialized through a single `asyncio.Lock`.
    That lock is only ever held for in-memory bookkeeping (no `await` of
    anything but the lock itself happens while it's held), so it never
    becomes a real bottleneck.
    """

    def __init__(
        self,
        store: QueueStore,
        concurrency_limits: Optional[Dict[str, int]] = None,
        default_concurrency_limit: int = 1,
    ) -> None:
        self._store = store
        self._configured_limits = dict(concurrency_limits or {})
        self._default_concurrency_limit = default_concurrency_limit
        self._lock = asyncio.Lock()
        self._ticket_seq = itertools.count(1)
        self._known_services: set[str] = set()

    def _ensure_service_registered(self, service_name: str) -> None:
        if service_name in self._known_services:
            return
        limit = self._configured_limits.get(service_name, self._default_concurrency_limit)
        self._store.register_service(service_name, limit)
        self._known_services.add(service_name)
        logger.info(
            "service_registered backend=%s concurrency_limit=%d", service_name, limit
        )

    def register_known_backends(self, service_names: Iterable[str]) -> None:
        """Eagerly register every given backend so `stats()` reflects it
        immediately, even before any request has ever been enqueued for it.

        Safe to call synchronously during app construction, before the event
        loop has any concurrent access to this `QueueManager` -- unlike every
        other mutating method here, it does not acquire `self._lock`.
        """
        for service_name in service_names:
            self._ensure_service_registered(service_name)

    async def enqueue(self, service_name: str, request_id: str) -> Ticket:
        """File a new ticket for `service_name` and return it.

        If a concurrency slot is immediately free, the ticket is granted
        before this call returns (its `granted` event is already set).
        """
        async with self._lock:
            self._ensure_service_registered(service_name)
            ticket = Ticket(
                ticket_id=f"{service_name}-{next(self._ticket_seq)}",
                service_name=service_name,
                request_id=request_id,
            )
            self._store.append_waiting(service_name, ticket)
            logger.info(
                "enqueue request_id=%s ticket_id=%s backend=%s queue_depth=%d",
                request_id,
                ticket.ticket_id,
                service_name,
                self._store.waiting_depth(service_name),
            )
            self._dispatch_locked(service_name)
            return ticket

    def _dispatch_locked(self, service_name: str) -> None:
        """Grant tickets FIFO while `service_name` has a free concurrency slot.

        Caller must already hold `self._lock`.
        """
        limit = self._store.concurrency_limit(service_name)
        while self._store.active_count(service_name) < limit:
            ticket = self._store.pop_waiting(service_name)
            if ticket is None:
                return
            ticket.state = TicketState.ACTIVE
            active = self._store.increment_active(service_name)
            ticket.granted.set()
            logger.info(
                "dispatch ticket_id=%s request_id=%s backend=%s queue_depth=%d active=%d/%d",
                ticket.ticket_id,
                ticket.request_id,
                service_name,
                self._store.waiting_depth(service_name),
                active,
                limit,
            )

    async def wait_for_turn(self, ticket: Ticket) -> None:
        """Block until `ticket` is granted its turn.

        Cancellable: if the awaiting task is cancelled (e.g. the caller's
        connection dropped while still queued), the ticket is evicted before
        `asyncio.CancelledError` is re-raised, so it never occupies a queue
        slot after its caller is gone.
        """
        try:
            await ticket.granted.wait()
        except asyncio.CancelledError:
            logger.info(
                "wait_for_turn cancelled ticket_id=%s request_id=%s backend=%s -- evicting",
                ticket.ticket_id,
                ticket.request_id,
                ticket.service_name,
            )
            await self.evict(ticket)
            raise

    async def release(self, ticket: Ticket) -> None:
        """Free the concurrency slot an ACTIVE `ticket` held and advance the queue.

        A no-op (aside from a debug log) if `ticket` isn't ACTIVE -- e.g. it
        was already evicted -- so callers can call this unconditionally from
        a `finally` block without extra bookkeeping.
        """
        async with self._lock:
            if ticket.state is not TicketState.ACTIVE:
                logger.debug(
                    "release no-op ticket_id=%s backend=%s state=%s",
                    ticket.ticket_id,
                    ticket.service_name,
                    ticket.state.value,
                )
                return
            ticket.state = TicketState.RELEASED
            active = self._store.decrement_active(ticket.service_name)
            logger.info(
                "release ticket_id=%s request_id=%s backend=%s queue_depth=%d active=%d/%d",
                ticket.ticket_id,
                ticket.request_id,
                ticket.service_name,
                self._store.waiting_depth(ticket.service_name),
                active,
                self._store.concurrency_limit(ticket.service_name),
            )
            self._dispatch_locked(ticket.service_name)

    async def evict(self, ticket: Ticket) -> None:
        """Remove `ticket` outright, whether it was WAITING or ACTIVE.

        Frees its concurrency slot (and dispatches the next ticket) if it
        held one. A no-op if the ticket was already RELEASED or EVICTED.
        """
        async with self._lock:
            if ticket.state in (TicketState.RELEASED, TicketState.EVICTED):
                return
            previous_state = ticket.state
            was_active = previous_state is TicketState.ACTIVE
            ticket.state = TicketState.EVICTED

            if was_active:
                self._store.decrement_active(ticket.service_name)
            else:
                self._store.remove_waiting(ticket.service_name, ticket)

            logger.info(
                "evict ticket_id=%s request_id=%s backend=%s previous_state=%s "
                "queue_depth=%d active=%d/%d",
                ticket.ticket_id,
                ticket.request_id,
                ticket.service_name,
                previous_state.value,
                self._store.waiting_depth(ticket.service_name),
                self._store.active_count(ticket.service_name),
                self._store.concurrency_limit(ticket.service_name),
            )

            if was_active:
                self._dispatch_locked(ticket.service_name)

    async def stats(self) -> Dict[str, Dict[str, int]]:
        """A read-only snapshot of every known backend's queue state."""
        async with self._lock:
            return {
                name: {
                    "waiting": self._store.waiting_depth(name),
                    "active": self._store.active_count(name),
                    "concurrency_limit": self._store.concurrency_limit(name),
                }
                for name in self._store.known_services()
            }
