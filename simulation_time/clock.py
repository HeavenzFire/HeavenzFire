"""Deterministic, bounded simulation-time scheduler (v0.1).

Virtual time is a logical clock. Advancing it does not sleep, speed up hardware,
or imply physical time dilation. Callbacks execute synchronously in stable order.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import heapq
import json
import math
from typing import Any, Callable


@dataclass(order=True, frozen=True)
class _Event:
    at: float
    sequence: int
    name: str = field(compare=False)
    payload: Any = field(compare=False, default=None)


class SimulationClock:
    """A deterministic event queue with bounded dispatch and append-only trace."""

    def __init__(self, *, max_events_per_advance: int = 10_000) -> None:
        if isinstance(max_events_per_advance, bool) or not isinstance(max_events_per_advance, int) or max_events_per_advance < 1:
            raise ValueError("max_events_per_advance must be a positive integer")
        self.now = 0.0
        self._limit = max_events_per_advance
        self._next_sequence = 0
        self._queue: list[_Event] = []
        self._handlers: dict[str, Callable[[Any], Any]] = {}
        self.trace: list[dict[str, Any]] = []

    def register(self, name: str, handler: Callable[[Any], Any]) -> None:
        if not isinstance(name, str) or not name.strip():
            raise ValueError("event name must be a non-empty string")
        if not callable(handler):
            raise TypeError("handler must be callable")
        if name in self._handlers:
            raise ValueError(f"handler already registered: {name}")
        self._handlers[name] = handler

    def schedule(self, at: float, name: str, payload: Any = None) -> int:
        at = self._finite_number(at, "at")
        if at < self.now:
            raise ValueError("cannot schedule an event in the past")
        if name not in self._handlers:
            raise ValueError(f"no handler registered for: {name}")
        self._canonical(payload)
        sequence = self._next_sequence
        self._next_sequence += 1
        heapq.heappush(self._queue, _Event(at, sequence, name, payload))
        self._record("scheduled", at=at, sequence=sequence, name=name, payload=payload)
        return sequence

    def advance_to(self, target: float) -> int:
        target = self._finite_number(target, "target")
        if target < self.now:
            raise ValueError("simulation clock cannot move backwards")
        # Preserve the all-or-nothing preflight for events already queued.
        due_count = sum(1 for event in self._queue if event.at <= target)
        if due_count > self._limit:
            raise RuntimeError(f"event budget exceeded: {due_count} due, limit {self._limit}")

        dispatched = 0
        while self._queue and self._queue[0].at <= target:
            # Handlers may enqueue more due events. Enforce the budget against
            # actual dispatches too, before removing the next event from the heap.
            if dispatched >= self._limit:
                self._record("event_budget_exceeded", target=target,
                             dispatched=dispatched, limit=self._limit)
                raise RuntimeError(
                    f"event budget exceeded during dispatch: limit {self._limit}"
                )
            event = heapq.heappop(self._queue)
            self.now = event.at
            try:
                result = self._handlers[event.name](event.payload)
                self._record("executed", at=event.at, sequence=event.sequence,
                             name=event.name, payload=event.payload, result=result)
            except Exception as exc:
                self._record("failed", at=event.at, sequence=event.sequence,
                             name=event.name, payload=event.payload,
                             error_type=type(exc).__name__, error=str(exc))
                raise
            dispatched += 1
        self.now = target
        self._record("clock_advanced", at=self.now, dispatched=dispatched)
        return dispatched

    def replay_digest(self) -> str:
        """SHA-256 of canonical trace records; integrity aid, not a signature."""
        data = json.dumps(self.trace, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False, allow_nan=False).encode("utf-8")
        return hashlib.sha256(data).hexdigest()

    def _record(self, event: str, **fields: Any) -> None:
        record = {"event": event, "clock": self.now, **fields}
        canonical = self._canonical(record)
        self.trace.append(json.loads(canonical))

    @staticmethod
    def _canonical(value: Any) -> str:
        try:
            return json.dumps(value, sort_keys=True, separators=(",", ":"),
                              ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ValueError("payload/trace must be finite JSON-compatible data") from exc

    @staticmethod
    def _finite_number(value: float, field_name: str) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"{field_name} must be a finite number")
        number = float(value)
        if not math.isfinite(number):
            raise ValueError(f"{field_name} must be finite")
        return number
