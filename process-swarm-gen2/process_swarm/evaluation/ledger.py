"""Provider event ledger for ACDS evaluation.

Records every provider selection, invocation, validation outcome, and
failure event.  All events are append-only and inspectable.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional


class ProviderEventLedger:
    """In-memory append-only ledger for provider events.

    Every provider selection, invocation, validation outcome, and failure
    is recorded as a structured event with a unique event_id and timestamp.

    Thread-safety note: This implementation is not thread-safe.  For
    concurrent use, wrap in a lock or use the queue-safe variant (Phase 3).
    """

    def __init__(self) -> None:
        self._events: list[dict] = []

    def record_provider_selected(
        self,
        *,
        provider_id: str,
        task_type: str,
        cognitive_grade: str,
        reason: str,
        routed: bool,
        task_id: str = "",
        workflow_id: str = "",
    ) -> dict:
        """Record a provider_selected event.

        Returns the event dict that was appended to the ledger.
        """
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "provider_selected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider_id": provider_id,
            "task_type": task_type,
            "cognitive_grade": cognitive_grade,
            "reason": reason,
            "routed": routed,
            "task_id": task_id,
            "workflow_id": workflow_id,
        }
        self._events.append(event)
        return event

    def record_provider_invoked(
        self,
        *,
        provider_id: str,
        task_id: str = "",
        workflow_id: str = "",
        latency_ms: int = 0,
        status: str = "",
        error: Optional[str] = None,
    ) -> dict:
        """Record a provider_invoked event (for Phase 3+)."""
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "provider_invoked",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider_id": provider_id,
            "task_id": task_id,
            "workflow_id": workflow_id,
            "latency_ms": latency_ms,
            "status": status,
            "error": error,
        }
        self._events.append(event)
        return event

    def record_validation_outcome(
        self,
        *,
        task_id: str = "",
        workflow_id: str = "",
        provider_event_id: str = "",
        validation_passed: bool,
        validation_errors: Optional[list[str]] = None,
    ) -> dict:
        """Record a validation_outcome event (for Phase 2+)."""
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "validation_outcome",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "workflow_id": workflow_id,
            "provider_event_id": provider_event_id,
            "validation_passed": validation_passed,
            "validation_errors": validation_errors or [],
        }
        self._events.append(event)
        return event

    def record_fallback(
        self,
        *,
        task_id: str = "",
        workflow_id: str = "",
        original_provider_id: str = "",
        fallback_provider_id: str = "",
        reason: str = "",
    ) -> dict:
        """Record a fallback event (for Phase 3+)."""
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "provider_fallback",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task_id": task_id,
            "workflow_id": workflow_id,
            "original_provider_id": original_provider_id,
            "fallback_provider_id": fallback_provider_id,
            "reason": reason,
        }
        self._events.append(event)
        return event

    def get_events(
        self,
        *,
        event_type: Optional[str] = None,
        workflow_id: Optional[str] = None,
        task_id: Optional[str] = None,
        provider_id: Optional[str] = None,
    ) -> list[dict]:
        """Return events, optionally filtered by criteria."""
        result = self._events
        if event_type is not None:
            result = [e for e in result if e.get("event_type") == event_type]
        if workflow_id is not None:
            result = [e for e in result if e.get("workflow_id") == workflow_id]
        if task_id is not None:
            result = [e for e in result if e.get("task_id") == task_id]
        if provider_id is not None:
            result = [e for e in result if e.get("provider_id") == provider_id]
        return result
