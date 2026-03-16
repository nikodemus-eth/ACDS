"""Red-Team Phase R7 — Replay, Downstream Lineage, Comparative Fairness, Drift.

Tests for:
  RT-ACDS-014  Corrupt replay package integrity
  RT-ACDS-015  Break artifact lineage between upstream and downstream
  RT-ACDS-025  Make ACDS look better through easier fixtures
  RT-ACDS-026  Reward style over fidelity in comparative scoring
  RT-ACDS-028  Generate downstream audio from unsupported text
  RT-ACDS-029  Create quiet governance drift across repeated runs
"""
from __future__ import annotations

import pytest


class TestReplayPackageIntegrity:
    """Incomplete replay packages must not be marked replayable."""

    def test_missing_routing_decision_rejected(self):
        from process_swarm.evaluation.integrity import ReplayCompletenessValidator

        validator = ReplayCompletenessValidator()
        result = validator.check(replay_package={
            "run_id": "run-001",
            "invocation_result": {},
            "validation_result": {},
            "quality_scores": {},
            # routing_decision missing
        })

        assert not result.passed
        assert any("routing" in e.lower() for e in result.errors)

    def test_missing_validation_result_rejected(self):
        from process_swarm.evaluation.integrity import ReplayCompletenessValidator

        validator = ReplayCompletenessValidator()
        result = validator.check(replay_package={
            "run_id": "run-002",
            "routing_decision": {},
            "invocation_result": {},
            "quality_scores": {},
            # validation_result missing
        })

        assert not result.passed

    def test_complete_package_passes(self):
        from process_swarm.evaluation.integrity import ReplayCompletenessValidator

        validator = ReplayCompletenessValidator()
        result = validator.check(replay_package={
            "run_id": "run-003",
            "task_description": "Test task",
            "routing_decision": {"provider_id": "acds"},
            "invocation_result": {"success": True},
            "validation_result": {"passed": True},
            "quality_scores": {"composite": 3.5},
        })

        assert result.passed


class TestDownstreamLineageBreak:
    """Downstream artifacts must not be generated from unvalidated upstream."""

    def test_unvalidated_upstream_blocks_downstream(self):
        from process_swarm.evaluation.integrity import DownstreamLineageGate

        gate = DownstreamLineageGate()
        result = gate.check(
            upstream_validation_passed=False,
            downstream_stage="audio_generation",
        )

        assert not result.passed
        assert any("upstream" in e.lower() or "unvalidated" in e.lower()
                    for e in result.errors)

    def test_validated_upstream_allows_downstream(self):
        from process_swarm.evaluation.integrity import DownstreamLineageGate

        gate = DownstreamLineageGate()
        result = gate.check(
            upstream_validation_passed=True,
            downstream_stage="audio_generation",
        )

        assert result.passed


class TestComparativeFairness:
    """ACDS and baseline must be scored on same corpus and rubric."""

    def test_corpus_mismatch_detected(self):
        from process_swarm.evaluation.integrity import ComparativeFairnessGuard

        guard = ComparativeFairnessGuard()
        result = guard.check(
            acds_corpus_id="corpus-A",
            baseline_corpus_id="corpus-B",
            acds_rubric_version="v1",
            baseline_rubric_version="v1",
        )

        assert not result.passed
        assert any("corpus" in e.lower() or "mismatch" in e.lower()
                    for e in result.errors)

    def test_rubric_mismatch_detected(self):
        from process_swarm.evaluation.integrity import ComparativeFairnessGuard

        guard = ComparativeFairnessGuard()
        result = guard.check(
            acds_corpus_id="corpus-A",
            baseline_corpus_id="corpus-A",
            acds_rubric_version="v1",
            baseline_rubric_version="v2",
        )

        assert not result.passed

    def test_matching_corpus_and_rubric_passes(self):
        from process_swarm.evaluation.integrity import ComparativeFairnessGuard

        guard = ComparativeFairnessGuard()
        result = guard.check(
            acds_corpus_id="corpus-A",
            baseline_corpus_id="corpus-A",
            acds_rubric_version="v1",
            baseline_rubric_version="v1",
        )

        assert result.passed


class TestStyleOverFidelity:
    """Unsupported output must not win on style alone."""

    def test_polished_unsupported_cannot_beat_grounded(self):
        """Even if ACDS has better coherence, low fidelity should prevent winning."""
        from process_swarm.evaluation.comparative import ComparativeEvaluator

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Summarize Q3 financial data",
            task_type="retrieval_synthesis",
            acds_output=(
                "A masterful synthesis reveals unprecedented growth trajectories. "
                "Furthermore, strategic imperatives demand immediate action. "
                "In conclusion, the path forward is clear and transformative."
            ),
            baseline_output="Q3 revenue was $1.2M. Growth was 15%.",
            source_keywords=["Q3", "revenue", "$1.2M", "15%", "growth"],
        )

        # Baseline should have better fidelity
        assert report.baseline_scores.source_fidelity > report.acds_scores.source_fidelity


class TestGovernanceDrift:
    """Policy and validator versions must be observable across runs."""

    def test_drift_detected_across_runs(self):
        from process_swarm.evaluation.integrity import DriftVisibilityTracker

        tracker = DriftVisibilityTracker()
        tracker.record_run(
            run_id="run-001",
            policy_version="v1.0",
            validator_version="v2.1",
        )
        tracker.record_run(
            run_id="run-002",
            policy_version="v1.1",  # changed!
            validator_version="v2.1",
        )

        result = tracker.check_drift()
        assert not result.passed
        assert any("drift" in e.lower() or "policy" in e.lower()
                    for e in result.errors)

    def test_no_drift_passes(self):
        from process_swarm.evaluation.integrity import DriftVisibilityTracker

        tracker = DriftVisibilityTracker()
        tracker.record_run(run_id="run-001", policy_version="v1.0", validator_version="v2.1")
        tracker.record_run(run_id="run-002", policy_version="v1.0", validator_version="v2.1")
        tracker.record_run(run_id="run-003", policy_version="v1.0", validator_version="v2.1")

        result = tracker.check_drift()
        assert result.passed

    def test_single_run_passes(self):
        from process_swarm.evaluation.integrity import DriftVisibilityTracker

        tracker = DriftVisibilityTracker()
        tracker.record_run(run_id="run-001", policy_version="v1.0", validator_version="v2.1")

        result = tracker.check_drift()
        assert result.passed
