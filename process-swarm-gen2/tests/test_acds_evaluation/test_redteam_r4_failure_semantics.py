"""Red-Team Phase R4 — Failure Semantics and Fallback Integrity.

Tests for:
  RT-ACDS-016  Induce mid-run failure after partial progress
  RT-ACDS-017  Induce timeout followed by stale artifact reuse
  RT-ACDS-018  Force repeated failure to trigger hidden retry loops
"""
from __future__ import annotations

import pytest


class TestPartialProgressFailure:
    """Partial work must not masquerade as completion."""

    def test_partial_state_not_marked_success(self):
        from process_swarm.evaluation.integrity import RunStateValidator

        validator = RunStateValidator()
        result = validator.check(
            steps_completed=["routing", "invocation"],
            steps_required=["routing", "invocation", "validation", "scoring"],
            claimed_status="success",
        )

        assert not result.passed
        assert any("partial" in e.lower() or "incomplete" in e.lower()
                    for e in result.errors)

    def test_all_steps_completed_allows_success(self):
        from process_swarm.evaluation.integrity import RunStateValidator

        validator = RunStateValidator()
        result = validator.check(
            steps_completed=["routing", "invocation", "validation", "scoring"],
            steps_required=["routing", "invocation", "validation", "scoring"],
            claimed_status="success",
        )

        assert result.passed

    def test_failed_status_always_valid(self):
        from process_swarm.evaluation.integrity import RunStateValidator

        validator = RunStateValidator()
        result = validator.check(
            steps_completed=["routing"],
            steps_required=["routing", "invocation", "validation", "scoring"],
            claimed_status="failed",
        )

        assert result.passed


class TestStaleArtifactReuse:
    """Timed-out runs must not reuse stale prior content."""

    def test_stale_artifact_detected(self):
        from process_swarm.evaluation.integrity import FreshnessDetector

        detector = FreshnessDetector()
        result = detector.check(
            artifact_run_id="run-002",
            artifact_invocation_id="inv-old",
            current_run_id="run-002",
            current_invocation_id="inv-new",
        )

        assert not result.passed
        assert any("stale" in e.lower() or "mismatch" in e.lower()
                    for e in result.errors)

    def test_fresh_artifact_passes(self):
        from process_swarm.evaluation.integrity import FreshnessDetector

        detector = FreshnessDetector()
        result = detector.check(
            artifact_run_id="run-003",
            artifact_invocation_id="inv-003",
            current_run_id="run-003",
            current_invocation_id="inv-003",
        )

        assert result.passed

    def test_wrong_run_id_detected(self):
        from process_swarm.evaluation.integrity import FreshnessDetector

        detector = FreshnessDetector()
        result = detector.check(
            artifact_run_id="run-001",
            artifact_invocation_id="inv-001",
            current_run_id="run-002",
            current_invocation_id="inv-002",
        )

        assert not result.passed


class TestHiddenRetryLoops:
    """Retries must be explicit, bounded, and ledger-visible."""

    def test_retry_count_exceeding_max_blocked(self):
        from process_swarm.evaluation.integrity import RetryVisibilityTracker

        tracker = RetryVisibilityTracker(max_retries=3)
        result = tracker.check(
            observed_attempts=5,
            logged_attempts=5,
        )

        assert not result.passed
        assert any("retry" in e.lower() or "exceeded" in e.lower()
                    for e in result.errors)

    def test_retries_within_bound_passes(self):
        from process_swarm.evaluation.integrity import RetryVisibilityTracker

        tracker = RetryVisibilityTracker(max_retries=3)
        result = tracker.check(
            observed_attempts=2,
            logged_attempts=2,
        )

        assert result.passed

    def test_unlogged_retries_detected(self):
        """If observed attempts exceed logged, retries are hidden."""
        from process_swarm.evaluation.integrity import RetryVisibilityTracker

        tracker = RetryVisibilityTracker(max_retries=5)
        result = tracker.check(
            observed_attempts=4,
            logged_attempts=1,
        )

        assert not result.passed
        assert any("hidden" in e.lower() or "unlogged" in e.lower()
                    for e in result.errors)
