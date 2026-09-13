"""Unit tests for queue_manager.py: pure concurrency-control logic, no I/O.

No network, no FastAPI, no fastmcp anywhere in this file -- QueueManager and
MemoryQueueStore are exercised directly with nothing but asyncio.
"""
from __future__ import annotations

import asyncio

import pytest

from app.queue_manager import TicketState


async def test_single_ticket_is_granted_immediately(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    ticket = await qm.enqueue("svc", "req-1")

    assert ticket.granted.is_set()
    assert ticket.state is TicketState.ACTIVE
    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 0, "active": 1, "concurrency_limit": 1}


async def test_second_ticket_waits_when_concurrency_is_one(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    first = await qm.enqueue("svc", "req-1")
    second = await qm.enqueue("svc", "req-2")

    assert first.granted.is_set()
    assert not second.granted.is_set()
    assert second.state is TicketState.WAITING

    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 1, "active": 1, "concurrency_limit": 1}


async def test_fifo_ordering_is_preserved_across_many_tickets(queue_manager_factory):
    """With concurrency=1, releasing tickets one at a time must grant them in
    exactly the order they were enqueued -- never out of order."""
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    tickets = [await qm.enqueue("svc", f"req-{i}") for i in range(5)]

    assert tickets[0].granted.is_set()
    assert all(not t.granted.is_set() for t in tickets[1:])

    granted_order = [tickets[0].ticket_id]
    for ticket in tickets[1:]:
        await qm.release(tickets[len(granted_order) - 1])
        await asyncio.wait_for(ticket.granted.wait(), timeout=1)
        granted_order.append(ticket.ticket_id)

    assert granted_order == [t.ticket_id for t in tickets]


async def test_concurrency_cap_of_n_allows_exactly_n_in_flight(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 2})
    tickets = [await qm.enqueue("svc", f"req-{i}") for i in range(3)]

    assert tickets[0].granted.is_set()
    assert tickets[1].granted.is_set()
    assert not tickets[2].granted.is_set()

    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 1, "active": 2, "concurrency_limit": 2}

    await qm.release(tickets[0])
    await asyncio.wait_for(tickets[2].granted.wait(), timeout=1)

    stats = await qm.stats()
    assert stats["svc"] == {"waiting": 0, "active": 2, "concurrency_limit": 2}


async def test_different_services_have_independent_queues(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"leak-ii": 1, "leak-iv": 4})
    ii_ticket = await qm.enqueue("leak-ii", "req-ii-1")
    ii_ticket_2 = await qm.enqueue("leak-ii", "req-ii-2")
    iv_tickets = [await qm.enqueue("leak-iv", f"req-iv-{i}") for i in range(4)]

    assert ii_ticket.granted.is_set()
    assert not ii_ticket_2.granted.is_set()
    assert all(t.granted.is_set() for t in iv_tickets)

    stats = await qm.stats()
    assert stats["leak-ii"] == {"waiting": 1, "active": 1, "concurrency_limit": 1}
    assert stats["leak-iv"] == {"waiting": 0, "active": 4, "concurrency_limit": 4}


async def test_unconfigured_service_falls_back_to_default_concurrency(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={}, default_concurrency_limit=3)
    tickets = [await qm.enqueue("mystery-backend", f"req-{i}") for i in range(4)]

    assert all(t.granted.is_set() for t in tickets[:3])
    assert not tickets[3].granted.is_set()


async def test_evict_while_waiting_removes_ticket_and_does_not_block_the_line(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    first = await qm.enqueue("svc", "req-1")
    second = await qm.enqueue("svc", "req-2")
    third = await qm.enqueue("svc", "req-3")

    assert first.granted.is_set()
    assert not second.granted.is_set()
    assert not third.granted.is_set()

    # Second ticket's caller gives up while still waiting.
    await qm.evict(second)
    assert second.state is TicketState.EVICTED

    stats = await qm.stats()
    assert stats["svc"]["waiting"] == 1  # only `third` remains queued

    # Releasing the first ticket must now grant `third` directly -- the
    # evicted `second` must never be granted and must never block `third`.
    await qm.release(first)
    assert third.granted.is_set()
    assert not second.granted.is_set()


async def test_cancelling_wait_for_turn_evicts_the_ticket(queue_manager_factory):
    """A caller that disconnects while still queued (its awaiting task is
    cancelled) must have its ticket evicted automatically, and must not
    block whoever is queued behind it."""
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    first = await qm.enqueue("svc", "req-1")
    second = await qm.enqueue("svc", "req-2")
    third = await qm.enqueue("svc", "req-3")

    waiter = asyncio.create_task(qm.wait_for_turn(second))
    await asyncio.sleep(0.01)  # let the task actually start awaiting the event
    assert not waiter.done()

    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter

    assert second.state is TicketState.EVICTED

    # `first` finishing must skip straight past the evicted `second` to `third`.
    await qm.release(first)
    assert third.granted.is_set()
    assert not second.granted.is_set()


async def test_evict_while_active_frees_its_slot_for_the_next_ticket(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    first = await qm.enqueue("svc", "req-1")
    second = await qm.enqueue("svc", "req-2")

    assert first.state is TicketState.ACTIVE
    assert not second.granted.is_set()

    # The active caller's connection drops mid-flight, rather than it calling release().
    await qm.evict(first)

    assert first.state is TicketState.EVICTED
    assert second.granted.is_set()
    assert second.state is TicketState.ACTIVE


async def test_release_is_a_no_op_once_already_released(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    ticket = await qm.enqueue("svc", "req-1")

    await qm.release(ticket)
    assert ticket.state is TicketState.RELEASED

    # Calling release() again must not raise and must not double-decrement
    # or otherwise corrupt the active count.
    await qm.release(ticket)
    stats = await qm.stats()
    assert stats["svc"]["active"] == 0


async def test_register_known_backends_makes_them_visible_in_stats_before_any_traffic(
    queue_manager_factory,
):
    qm = queue_manager_factory(concurrency_limits={"leak-ii": 1, "leak-iv": 8})
    qm.register_known_backends(["leak-ii", "leak-iv"])

    stats = await qm.stats()
    assert stats == {
        "leak-ii": {"waiting": 0, "active": 0, "concurrency_limit": 1},
        "leak-iv": {"waiting": 0, "active": 0, "concurrency_limit": 8},
    }


async def test_evict_is_a_no_op_once_already_released(queue_manager_factory):
    qm = queue_manager_factory(concurrency_limits={"svc": 1})
    ticket = await qm.enqueue("svc", "req-1")
    await qm.release(ticket)

    await qm.evict(ticket)  # must not raise, must not affect stats
    assert ticket.state is TicketState.RELEASED
    stats = await qm.stats()
    assert stats["svc"]["active"] == 0
