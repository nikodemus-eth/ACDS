"""Phase 1 — Routing and Ledger Basics.

Tests for:
  UC-ACDS-001  Route a qualified synthesis task to ACDS
  UC-ACDS-002  Do not route a non-qualified task to ACDS
  UC-ACDS-003  Log provider choice deterministically

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from process_swarm.acds_client import TaskType


# ──────────────────────────────────────────────
# UC-ACDS-001  Route a qualified synthesis task to ACDS
# ──────────────────────────────────────────────


class TestProviderRouting:
    """Policy-driven provider selection."""

    def test_synthesis_task_routes_to_acds(self):
        """A retrieval_synthesis task qualifies for ACDS under default policy."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
        )

        assert decision.provider_id == "acds"
        assert decision.routed is True
        assert decision.reason != ""

    def test_analytical_task_routes_to_acds(self):
        """An analytical task also qualifies under default policy."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade="standard",
        )

        assert decision.provider_id == "acds"
        assert decision.routed is True

    # ──────────────────────────────────────────────
    # UC-ACDS-002  Do not route a non-qualified task to ACDS
    # ──────────────────────────────────────────────

    def test_excluded_task_does_not_route_to_acds(self):
        """A coding task is excluded from ACDS under default policy."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.CODING.value,
            cognitive_grade="standard",
        )

        assert decision.provider_id != "acds"
        assert decision.provider_id == "baseline"
        assert decision.routed is False
        assert "excluded" in decision.reason.lower() or "not qualified" in decision.reason.lower()

    def test_classification_routes_to_baseline(self):
        """Classification is handled locally, not through ACDS dispatch."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.CLASSIFICATION.value,
            cognitive_grade="basic",
        )

        assert decision.provider_id == "baseline"

    def test_custom_policy_can_include_coding(self):
        """A custom policy can override defaults to include coding tasks."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy(
            acds_qualified_task_types={
                TaskType.CODING.value,
                TaskType.RETRIEVAL_SYNTHESIS.value,
            },
            acds_min_cognitive_grade="basic",
        )
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.CODING.value,
            cognitive_grade="standard",
        )

        assert decision.provider_id == "acds"

    def test_cognitive_grade_below_minimum_routes_to_baseline(self):
        """Even a qualified task type routes to baseline if grade is too low."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy(
            acds_qualified_task_types={TaskType.RETRIEVAL_SYNTHESIS.value},
            acds_min_cognitive_grade="enhanced",
        )
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="basic",
        )

        assert decision.provider_id == "baseline"
        assert decision.routed is False

    def test_decision_includes_task_metadata(self):
        """Every routing decision carries the task_type and cognitive_grade used."""
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy)

        decision = selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
        )

        assert decision.task_type == TaskType.RETRIEVAL_SYNTHESIS.value
        assert decision.cognitive_grade == "enhanced"


# ──────────────────────────────────────────────
# UC-ACDS-003  Log provider choice deterministically
# ──────────────────────────────────────────────


class TestProviderEventLedger:
    """Every provider selection must produce a ledger event."""

    def test_routing_decision_is_logged(self):
        """Selecting a provider records an event in the ledger."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
            task_id="task-001",
            workflow_id="wf-001",
        )

        events = ledger.get_events()
        assert len(events) == 1
        event = events[0]
        assert event["event_type"] == "provider_selected"
        assert event["provider_id"] == "acds"
        assert event["task_id"] == "task-001"
        assert event["workflow_id"] == "wf-001"
        assert event["task_type"] == TaskType.RETRIEVAL_SYNTHESIS.value
        assert "timestamp" in event

    def test_excluded_task_also_logged(self):
        """Non-routing decisions are also ledger-visible."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.CODING.value,
            cognitive_grade="standard",
            task_id="task-002",
            workflow_id="wf-001",
        )

        events = ledger.get_events()
        assert len(events) == 1
        assert events[0]["provider_id"] == "baseline"
        assert events[0]["event_type"] == "provider_selected"

    def test_multiple_selections_produce_ordered_events(self):
        """Multiple routing decisions produce ordered, sequential events."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
            task_id="task-001",
        )
        selector.select(
            task_type=TaskType.CODING.value,
            cognitive_grade="standard",
            task_id="task-002",
        )

        events = ledger.get_events()
        assert len(events) == 2
        assert events[0]["task_id"] == "task-001"
        assert events[1]["task_id"] == "task-002"
        assert events[0]["provider_id"] == "acds"
        assert events[1]["provider_id"] == "baseline"

    def test_ledger_event_contains_routing_reason(self):
        """Each event records the reason for the routing decision."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
            task_id="task-001",
        )

        event = ledger.get_events()[0]
        assert "reason" in event
        assert event["reason"] != ""

    def test_ledger_events_have_unique_event_ids(self):
        """Each ledger event has a unique event_id."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        for i in range(5):
            selector.select(
                task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
                cognitive_grade="enhanced",
                task_id=f"task-{i:03d}",
            )

        events = ledger.get_events()
        event_ids = [e["event_id"] for e in events]
        assert len(set(event_ids)) == 5

    def test_ledger_get_events_by_workflow(self):
        """Events can be filtered by workflow_id."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
            task_id="t1",
            workflow_id="wf-A",
        )
        selector.select(
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade="standard",
            task_id="t2",
            workflow_id="wf-B",
        )
        selector.select(
            task_type=TaskType.CREATIVE.value,
            cognitive_grade="enhanced",
            task_id="t3",
            workflow_id="wf-A",
        )

        wf_a_events = ledger.get_events(workflow_id="wf-A")
        assert len(wf_a_events) == 2
        assert all(e["workflow_id"] == "wf-A" for e in wf_a_events)

    def test_ledger_get_events_by_provider(self):
        """Events can be filtered by provider_id."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector

        ledger = ProviderEventLedger()
        policy = ProviderPolicy.default()
        selector = ProviderSelector(policy, ledger=ledger)

        selector.select(
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade="enhanced",
            task_id="t1",
        )
        selector.select(
            task_type=TaskType.CODING.value,
            cognitive_grade="standard",
            task_id="t2",
        )

        acds_events = ledger.get_events(provider_id="acds")
        assert len(acds_events) == 1
        assert acds_events[0]["task_id"] == "t1"
