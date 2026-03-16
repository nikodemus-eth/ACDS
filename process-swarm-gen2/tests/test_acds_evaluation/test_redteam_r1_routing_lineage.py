"""Red-Team Phase R1 — Lineage and Routing Attack Resistance.

Tests for:
  RT-ACDS-001  Attempt silent provider substitution
  RT-ACDS-002  Attempt policy evasion through task mislabeling
  RT-ACDS-003  Attempt fallback disguised as primary success
  RT-ACDS-012  Omit provider event while emitting artifact
  RT-ACDS-013  Omit validation result while marking success

All tests written FIRST (TDD red phase).
"""
from __future__ import annotations

import pytest

from process_swarm.acds_client import TaskType, CognitiveGrade


# ──────────────────────────────────────────────
# RT-ACDS-001  Attempt silent provider substitution
# ──────────────────────────────────────────────


class TestSilentProviderSubstitution:
    """Detect when an artifact claims a different provider than routing chose."""

    def test_provenance_mismatch_detected(self):
        """If artifact claims provider_id differs from routing decision, flag it."""
        from process_swarm.evaluation.integrity import ProviderProvenanceChecker

        checker = ProviderProvenanceChecker()
        result = checker.check(
            routed_provider_id="acds",
            artifact_claimed_provider_id="openai-gpt4",
        )

        assert not result.passed
        assert any("mismatch" in e.lower() or "substitution" in e.lower()
                    for e in result.errors)

    def test_provenance_match_passes(self):
        """Matching provider IDs pass provenance check."""
        from process_swarm.evaluation.integrity import ProviderProvenanceChecker

        checker = ProviderProvenanceChecker()
        result = checker.check(
            routed_provider_id="acds",
            artifact_claimed_provider_id="acds",
        )

        assert result.passed

    def test_fallback_provider_requires_fallback_flag(self):
        """If provider is 'baseline' but routing chose 'acds', must have fallback flag."""
        from process_swarm.evaluation.integrity import ProviderProvenanceChecker

        checker = ProviderProvenanceChecker()

        # Without fallback flag — suspicious
        result = checker.check(
            routed_provider_id="acds",
            artifact_claimed_provider_id="baseline",
            fallback_declared=False,
        )
        assert not result.passed

        # With fallback flag — legitimate
        result = checker.check(
            routed_provider_id="acds",
            artifact_claimed_provider_id="baseline",
            fallback_declared=True,
        )
        assert result.passed

    def test_empty_provider_id_rejected(self):
        """An artifact with no provider ID is rejected."""
        from process_swarm.evaluation.integrity import ProviderProvenanceChecker

        checker = ProviderProvenanceChecker()
        result = checker.check(
            routed_provider_id="acds",
            artifact_claimed_provider_id="",
        )

        assert not result.passed


# ──────────────────────────────────────────────
# RT-ACDS-002  Attempt policy evasion through task mislabeling
# ──────────────────────────────────────────────


class TestPolicyEvasionMislabeling:
    """A task cannot gain ACDS access by claiming a different task type."""

    def test_mislabeled_coding_as_synthesis_blocked(self):
        """A coding-shaped task labeled as synthesis is caught by integrity check."""
        from process_swarm.evaluation.integrity import RoutingIntegrityChecker

        checker = RoutingIntegrityChecker()
        result = checker.check(
            claimed_task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            actual_task_indicators=["write", "function", "code", "implement"],
            workflow_origin="code_generation",
        )

        assert not result.passed
        assert any("mislabel" in e.lower() or "mismatch" in e.lower()
                    for e in result.errors)

    def test_legitimate_synthesis_passes(self):
        """A genuine synthesis task with matching indicators passes."""
        from process_swarm.evaluation.integrity import RoutingIntegrityChecker

        checker = RoutingIntegrityChecker()
        result = checker.check(
            claimed_task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            actual_task_indicators=["synthesize", "sources", "analysis", "findings"],
            workflow_origin="intelligence_brief",
        )

        assert result.passed

    def test_classification_as_analytical_caught(self):
        """A classification task mislabeled as analytical is flagged."""
        from process_swarm.evaluation.integrity import RoutingIntegrityChecker

        checker = RoutingIntegrityChecker()
        result = checker.check(
            claimed_task_type=TaskType.ANALYTICAL.value,
            actual_task_indicators=["classify", "categorize", "label", "tag"],
            workflow_origin="document_classification",
        )

        assert not result.passed

    def test_no_indicators_defaults_to_pass(self):
        """When no task indicators are available, trust the label (graceful degradation)."""
        from process_swarm.evaluation.integrity import RoutingIntegrityChecker

        checker = RoutingIntegrityChecker()
        result = checker.check(
            claimed_task_type=TaskType.ANALYTICAL.value,
            actual_task_indicators=[],
            workflow_origin="",
        )

        assert result.passed


# ──────────────────────────────────────────────
# RT-ACDS-003  Attempt fallback disguised as primary success
# ──────────────────────────────────────────────


class TestFallbackDisguisedAsSuccess:
    """Fallback output must never be recorded as primary ACDS success."""

    def test_fallback_without_fallback_event_rejected(self):
        """If ledger shows ACDS failure + baseline success but no fallback event,
        the run is flagged as having concealed fallback."""
        from process_swarm.evaluation.integrity import LineageCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()

        # Record ACDS failure
        ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-003",
            status="error", error="Connection refused",
        )
        # Record baseline success (but no fallback event!)
        ledger.record_provider_invoked(
            provider_id="baseline", task_id="task-rt-003",
            status="completed",
        )

        gate = LineageCompletenessGate()
        result = gate.check_fallback_lineage(
            ledger=ledger,
            task_id="task-rt-003",
        )

        assert not result.passed
        assert any("fallback" in e.lower() for e in result.errors)

    def test_fallback_with_fallback_event_passes(self):
        """When fallback event is present, lineage is complete."""
        from process_swarm.evaluation.integrity import LineageCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()

        ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-003b",
            status="error", error="Connection refused",
        )
        ledger.record_fallback(
            task_id="task-rt-003b",
            original_provider_id="acds",
            fallback_provider_id="baseline",
            reason="Primary provider failed",
        )
        ledger.record_provider_invoked(
            provider_id="baseline", task_id="task-rt-003b",
            status="completed",
        )

        gate = LineageCompletenessGate()
        result = gate.check_fallback_lineage(
            ledger=ledger,
            task_id="task-rt-003b",
        )

        assert result.passed

    def test_single_provider_no_fallback_needed(self):
        """If only one provider was invoked (no failure), no fallback lineage needed."""
        from process_swarm.evaluation.integrity import LineageCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-003c",
            status="completed",
        )

        gate = LineageCompletenessGate()
        result = gate.check_fallback_lineage(
            ledger=ledger,
            task_id="task-rt-003c",
        )

        assert result.passed


# ──────────────────────────────────────────────
# RT-ACDS-012  Omit provider event while emitting artifact
# ──────────────────────────────────────────────


class TestMissingProviderEvent:
    """No artifact can be accepted without provider-event lineage."""

    def test_artifact_without_provider_event_rejected(self):
        """Acceptance gate blocks when no provider_invoked event exists."""
        from process_swarm.evaluation.integrity import LineageCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        # No provider_invoked event recorded

        gate = LineageCompletenessGate()
        result = gate.check_provider_lineage(
            ledger=ledger,
            task_id="task-rt-012",
        )

        assert not result.passed
        assert any("provider" in e.lower() and "missing" in e.lower()
                    for e in result.errors)

    def test_artifact_with_provider_event_passes(self):
        """Acceptance passes when provider_invoked event exists."""
        from process_swarm.evaluation.integrity import LineageCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-012b",
            status="completed",
        )

        gate = LineageCompletenessGate()
        result = gate.check_provider_lineage(
            ledger=ledger,
            task_id="task-rt-012b",
        )

        assert result.passed


# ──────────────────────────────────────────────
# RT-ACDS-013  Omit validation result while marking success
# ──────────────────────────────────────────────


class TestMissingValidationResult:
    """No run can appear complete without visible validation outcome."""

    def test_success_without_validation_event_rejected(self):
        """A run with provider event but no validation event cannot be marked success."""
        from process_swarm.evaluation.integrity import ValidationCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-013",
            status="completed",
        )
        # No validation_outcome event recorded

        gate = ValidationCompletenessGate()
        result = gate.check(
            ledger=ledger,
            task_id="task-rt-013",
        )

        assert not result.passed
        assert any("validation" in e.lower() and "missing" in e.lower()
                    for e in result.errors)

    def test_success_with_validation_event_passes(self):
        """A run with both provider and validation events passes."""
        from process_swarm.evaluation.integrity import ValidationCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        ev = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-013b",
            status="completed",
        )
        ledger.record_validation_outcome(
            task_id="task-rt-013b",
            provider_event_id=ev["event_id"],
            validation_passed=True,
        )

        gate = ValidationCompletenessGate()
        result = gate.check(
            ledger=ledger,
            task_id="task-rt-013b",
        )

        assert result.passed

    def test_failed_validation_still_counts_as_present(self):
        """Even a failed validation satisfies the 'validation exists' gate."""
        from process_swarm.evaluation.integrity import ValidationCompletenessGate
        from process_swarm.evaluation.ledger import ProviderEventLedger

        ledger = ProviderEventLedger()
        ev = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-rt-013c",
            status="completed",
        )
        ledger.record_validation_outcome(
            task_id="task-rt-013c",
            provider_event_id=ev["event_id"],
            validation_passed=False,
            validation_errors=["Missing required field"],
        )

        gate = ValidationCompletenessGate()
        result = gate.check(
            ledger=ledger,
            task_id="task-rt-013c",
        )

        # Gate checks presence, not outcome
        assert result.passed
