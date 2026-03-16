"""Phase 3 — Runtime Failure Handling.

Tests for:
  UC-ACDS-014  Handle provider timeout gracefully
  UC-ACDS-015  Fall back to baseline on provider failure
  UC-ACDS-025  Prevent silent partial success
  UC-ACDS-016  Concurrent execution with independent failure isolation

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import pytest

from process_swarm.acds_client import TaskType


# ──────────────────────────────────────────────
# UC-ACDS-014  Handle provider timeout gracefully
# ──────────────────────────────────────────────


class TestProviderTimeout:
    """The runtime must handle provider timeouts without crashing
    and must record the timeout event in the ledger."""

    def test_timeout_produces_failure_result(self):
        """A simulated timeout yields a failed ProviderInvocationResult."""
        from process_swarm.evaluation.runtime import (
            ProviderInvocationResult,
            ProviderRuntime,
        )

        runtime = ProviderRuntime()
        result = runtime.invoke(
            provider_id="acds",
            task_id="task-timeout-001",
            simulate_timeout=True,
        )

        assert not result.success
        assert result.error_type == "timeout"
        assert result.provider_output is None

    def test_timeout_recorded_in_ledger(self):
        """A timeout event is recorded in the ledger with error details."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import ProviderRuntime

        ledger = ProviderEventLedger()
        runtime = ProviderRuntime(ledger=ledger)

        runtime.invoke(
            provider_id="acds",
            task_id="task-timeout-002",
            workflow_id="wf-timeout",
            simulate_timeout=True,
        )

        events = ledger.get_events(event_type="provider_invoked")
        assert len(events) == 1
        assert events[0]["status"] == "timeout"
        assert events[0]["error"] is not None
        assert "timeout" in events[0]["error"].lower()

    def test_timeout_does_not_raise(self):
        """Timeouts are handled gracefully — no exception propagates."""
        from process_swarm.evaluation.runtime import ProviderRuntime

        runtime = ProviderRuntime()
        # Should not raise
        result = runtime.invoke(
            provider_id="acds",
            task_id="task-timeout-003",
            simulate_timeout=True,
        )
        assert result is not None


# ──────────────────────────────────────────────
# UC-ACDS-015  Fall back to baseline on provider failure
# ──────────────────────────────────────────────


class TestProviderFallback:
    """When the primary provider fails, the system must automatically
    fall back to the baseline provider and record the fallback."""

    def test_fallback_on_timeout(self):
        """A timeout on ACDS triggers fallback to baseline."""
        from process_swarm.evaluation.runtime import (
            FallbackOrchestrator,
        )

        orchestrator = FallbackOrchestrator()
        result = orchestrator.execute(
            task_id="task-fb-001",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            simulate_primary_timeout=True,
        )

        assert result.success
        assert result.provider_id == "baseline"
        assert result.fallback_used is True

    def test_fallback_on_error(self):
        """A provider error triggers fallback to baseline."""
        from process_swarm.evaluation.runtime import (
            FallbackOrchestrator,
        )

        orchestrator = FallbackOrchestrator()
        result = orchestrator.execute(
            task_id="task-fb-002",
            task_type=TaskType.ANALYTICAL.value,
            simulate_primary_error=True,
        )

        assert result.success
        assert result.provider_id == "baseline"
        assert result.fallback_used is True

    def test_fallback_recorded_in_ledger(self):
        """The fallback event is recorded in the ledger."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import FallbackOrchestrator

        ledger = ProviderEventLedger()
        orchestrator = FallbackOrchestrator(ledger=ledger)

        orchestrator.execute(
            task_id="task-fb-003",
            workflow_id="wf-fb",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            simulate_primary_timeout=True,
        )

        fallback_events = ledger.get_events(event_type="provider_fallback")
        assert len(fallback_events) == 1
        assert fallback_events[0]["original_provider_id"] == "acds"
        assert fallback_events[0]["fallback_provider_id"] == "baseline"
        assert "timeout" in fallback_events[0]["reason"].lower()

    def test_no_fallback_when_primary_succeeds(self):
        """When primary provider succeeds, no fallback occurs."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import FallbackOrchestrator

        ledger = ProviderEventLedger()
        orchestrator = FallbackOrchestrator(ledger=ledger)

        result = orchestrator.execute(
            task_id="task-fb-004",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
        )

        assert result.success
        assert result.provider_id == "acds"
        assert result.fallback_used is False
        assert ledger.get_events(event_type="provider_fallback") == []

    def test_fallback_ledger_records_both_invocations(self):
        """Both the failed primary and successful fallback are in the ledger."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import FallbackOrchestrator

        ledger = ProviderEventLedger()
        orchestrator = FallbackOrchestrator(ledger=ledger)

        orchestrator.execute(
            task_id="task-fb-005",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            simulate_primary_error=True,
        )

        invocations = ledger.get_events(event_type="provider_invoked")
        assert len(invocations) == 2
        assert invocations[0]["provider_id"] == "acds"
        assert invocations[0]["status"] == "error"
        assert invocations[1]["provider_id"] == "baseline"
        assert invocations[1]["status"] == "completed"


# ──────────────────────────────────────────────
# UC-ACDS-025  Prevent silent partial success
# ──────────────────────────────────────────────


class TestSilentPartialSuccess:
    """The system must detect and reject output that appears successful
    but is actually incomplete or truncated."""

    def test_truncated_output_detected(self):
        """Output below minimum length threshold is flagged as partial."""
        from process_swarm.evaluation.runtime import (
            CompletenessChecker,
        )

        checker = CompletenessChecker(min_output_length=50)
        result = checker.check(
            provider_output={
                "executionId": "exec-partial-001",
                "status": "completed",
                "normalizedOutput": "Short",
            },
        )

        assert not result.passed
        assert any("length" in e.lower() or "short" in e.lower() or "minimum" in e.lower()
                    for e in result.errors)

    def test_adequate_output_passes(self):
        """Output meeting minimum length passes completeness check."""
        from process_swarm.evaluation.runtime import (
            CompletenessChecker,
        )

        checker = CompletenessChecker(min_output_length=10)
        result = checker.check(
            provider_output={
                "executionId": "exec-partial-002",
                "status": "completed",
                "normalizedOutput": "This output is long enough to pass the check.",
            },
        )

        assert result.passed

    def test_completed_status_with_empty_output_rejected(self):
        """Status='completed' but empty output is a silent partial success."""
        from process_swarm.evaluation.runtime import (
            CompletenessChecker,
        )

        checker = CompletenessChecker(min_output_length=1)
        result = checker.check(
            provider_output={
                "executionId": "exec-partial-003",
                "status": "completed",
                "normalizedOutput": "",
            },
        )

        assert not result.passed

    def test_none_output_with_completed_status_rejected(self):
        """Status='completed' but None output is a silent partial success."""
        from process_swarm.evaluation.runtime import (
            CompletenessChecker,
        )

        checker = CompletenessChecker(min_output_length=1)
        result = checker.check(
            provider_output={
                "executionId": "exec-partial-004",
                "status": "completed",
                "normalizedOutput": None,
            },
        )

        assert not result.passed

    def test_partial_success_triggers_fallback(self):
        """When completeness check fails, the orchestrator falls back."""
        from process_swarm.evaluation.runtime import (
            FallbackOrchestrator,
        )

        orchestrator = FallbackOrchestrator(
            min_output_length=100,
        )
        result = orchestrator.execute(
            task_id="task-partial-005",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            simulate_primary_partial=True,
        )

        assert result.success
        assert result.provider_id == "baseline"
        assert result.fallback_used is True


# ──────────────────────────────────────────────
# UC-ACDS-016  Concurrent execution with independent failure isolation
# ──────────────────────────────────────────────


class TestConcurrentExecution:
    """Multiple provider invocations must be independently isolated.
    A failure in one must not corrupt or affect the other."""

    def test_independent_invocations_isolated(self):
        """Two invocations operate independently."""
        from process_swarm.evaluation.runtime import ProviderRuntime

        runtime = ProviderRuntime()

        result_a = runtime.invoke(
            provider_id="acds",
            task_id="task-concurrent-A",
            simulate_timeout=True,
        )
        result_b = runtime.invoke(
            provider_id="acds",
            task_id="task-concurrent-B",
        )

        assert not result_a.success
        assert result_b.success
        assert result_a.task_id == "task-concurrent-A"
        assert result_b.task_id == "task-concurrent-B"

    def test_failure_in_one_does_not_affect_ledger_of_other(self):
        """Each invocation's ledger entry is independent."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import ProviderRuntime

        ledger = ProviderEventLedger()
        runtime = ProviderRuntime(ledger=ledger)

        runtime.invoke(
            provider_id="acds",
            task_id="task-iso-A",
            simulate_timeout=True,
        )
        runtime.invoke(
            provider_id="acds",
            task_id="task-iso-B",
        )

        events_a = ledger.get_events(task_id="task-iso-A")
        events_b = ledger.get_events(task_id="task-iso-B")

        assert len(events_a) == 1
        assert events_a[0]["status"] == "timeout"
        assert len(events_b) == 1
        assert events_b[0]["status"] == "completed"

    def test_multiple_orchestrator_executions_isolated(self):
        """Multiple orchestrator.execute() calls are independent."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import FallbackOrchestrator

        ledger = ProviderEventLedger()
        orchestrator = FallbackOrchestrator(ledger=ledger)

        r1 = orchestrator.execute(
            task_id="task-multi-001",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            simulate_primary_error=True,
        )
        r2 = orchestrator.execute(
            task_id="task-multi-002",
            task_type=TaskType.ANALYTICAL.value,
        )

        assert r1.fallback_used is True
        assert r2.fallback_used is False
        assert r1.provider_id == "baseline"
        assert r2.provider_id == "acds"

    def test_ledger_preserves_order_across_concurrent_invocations(self):
        """Events from interleaved invocations maintain insertion order."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.runtime import ProviderRuntime

        ledger = ProviderEventLedger()
        runtime = ProviderRuntime(ledger=ledger)

        for i in range(5):
            runtime.invoke(
                provider_id="acds",
                task_id=f"task-order-{i:03d}",
                simulate_timeout=(i % 2 == 0),
            )

        events = ledger.get_events(event_type="provider_invoked")
        assert len(events) == 5
        for i, event in enumerate(events):
            assert event["task_id"] == f"task-order-{i:03d}"
