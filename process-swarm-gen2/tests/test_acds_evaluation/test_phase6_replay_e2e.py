"""Phase 6 — Replay and End-to-End Workflows.

Tests for:
  UC-ACDS-020  Package evaluation as a replayable run
  UC-ACDS-022  Replay a run with identical results
  UC-ACDS-023  End-to-end workflow: route → invoke → validate → score → compare
  UC-ACDS-024  Aggregate multiple runs for trend analysis

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import pytest

from process_swarm.acds_client import TaskType, CognitiveGrade


# ──────────────────────────────────────────────
# UC-ACDS-020  Package evaluation as a replayable run
# ──────────────────────────────────────────────


class TestEvaluationRun:
    """An evaluation run packages all artifacts into a self-contained,
    serializable structure."""

    def test_run_captures_routing_decision(self):
        """The run includes the routing decision."""
        from process_swarm.evaluation.runner import EvaluationRunner, EvaluationRun

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Analyze quarterly data",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.ENHANCED.value,
        )

        assert isinstance(run, EvaluationRun)
        assert run.routing_decision is not None
        assert run.routing_decision.provider_id in ("acds", "baseline")

    def test_run_captures_invocation_results(self):
        """The run includes provider invocation results."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Summarize findings",
            task_type=TaskType.SUMMARIZATION.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        assert run.invocation_result is not None
        assert run.invocation_result.success

    def test_run_captures_validation_result(self):
        """The run includes validation gate outcome."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Creative writing task",
            task_type=TaskType.CREATIVE.value,
            cognitive_grade=CognitiveGrade.ENHANCED.value,
        )

        assert run.validation_result is not None
        assert run.validation_result.passed

    def test_run_captures_quality_scores(self):
        """The run includes quality scoring results."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Reason about the problem",
            task_type=TaskType.REASONING.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        assert run.quality_scores is not None
        assert 1 <= run.quality_scores.composite <= 5

    def test_run_has_unique_id(self):
        """Each run has a unique run_id."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run1 = runner.execute(
            task_description="Task A",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )
        run2 = runner.execute(
            task_description="Task B",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        assert run1.run_id != run2.run_id

    def test_run_serializable_to_dict(self):
        """An EvaluationRun can be serialized to a dict."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Test serialization",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        d = run.to_dict()
        assert isinstance(d, dict)
        assert "run_id" in d
        assert "routing_decision" in d
        assert "invocation_result" in d
        assert "validation_result" in d
        assert "quality_scores" in d
        assert "task_description" in d


# ──────────────────────────────────────────────
# UC-ACDS-022  Replay a run with identical results
# ──────────────────────────────────────────────


class TestRunReplay:
    """A serialized run can be replayed to produce identical results."""

    def test_replay_produces_same_scores(self):
        """Replaying a run produces the same quality scores."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        original = runner.execute(
            task_description="Analyze revenue data",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.ENHANCED.value,
        )

        replayed = runner.replay(original.to_dict())

        assert replayed.quality_scores.accuracy == original.quality_scores.accuracy
        assert replayed.quality_scores.relevance == original.quality_scores.relevance
        assert replayed.quality_scores.coherence == original.quality_scores.coherence
        assert replayed.quality_scores.composite == original.quality_scores.composite

    def test_replay_preserves_routing_decision(self):
        """Replaying preserves the original routing decision."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        original = runner.execute(
            task_description="Summarize report",
            task_type=TaskType.SUMMARIZATION.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        replayed = runner.replay(original.to_dict())

        assert replayed.routing_decision.provider_id == original.routing_decision.provider_id
        assert replayed.routing_decision.routed == original.routing_decision.routed

    def test_replay_gets_new_run_id(self):
        """A replay gets its own unique run_id (it's a new run)."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        original = runner.execute(
            task_description="Test replay",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        replayed = runner.replay(original.to_dict())
        assert replayed.run_id != original.run_id


# ──────────────────────────────────────────────
# UC-ACDS-023  End-to-end workflow
# ──────────────────────────────────────────────


class TestEndToEndWorkflow:
    """Complete workflow: route → invoke → validate → score → compare."""

    def test_e2e_qualified_task_through_acds(self):
        """A qualified task goes through the full ACDS pipeline."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Synthesize research findings from multiple sources",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            cognitive_grade=CognitiveGrade.ENHANCED.value,
        )

        assert run.routing_decision.provider_id == "acds"
        assert run.routing_decision.routed is True
        assert run.invocation_result.success
        assert run.validation_result.passed
        assert run.quality_scores.composite >= 1.0

    def test_e2e_excluded_task_through_baseline(self):
        """An excluded task routes to baseline and completes."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Write a Python function",
            task_type=TaskType.CODING.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        assert run.routing_decision.provider_id == "baseline"
        assert run.routing_decision.routed is False
        assert run.invocation_result.success
        assert run.validation_result.passed

    def test_e2e_with_comparison(self):
        """End-to-end with comparative evaluation included."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Analyze market trends for Q3",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.ENHANCED.value,
            include_comparison=True,
        )

        assert run.comparison_report is not None
        assert run.comparison_report.winner in ("acds", "baseline", "tie")

    def test_e2e_ledger_has_all_events(self):
        """After E2E, the ledger contains routing + invocation + validation."""
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        run = runner.execute(
            task_description="Decision support task",
            task_type=TaskType.DECISION_SUPPORT.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        )

        ledger = runner.ledger
        all_events = ledger.get_events()
        event_types = {e["event_type"] for e in all_events}

        assert "provider_selected" in event_types
        assert "provider_invoked" in event_types
        assert "validation_outcome" in event_types


# ──────────────────────────────────────────────
# UC-ACDS-024  Aggregate multiple runs for trend analysis
# ──────────────────────────────────────────────


class TestRunAggregation:
    """Multiple runs can be aggregated to identify quality trends."""

    def test_aggregate_computes_mean_composite(self):
        """Aggregation computes mean composite score across runs."""
        from process_swarm.evaluation.runner import (
            EvaluationRunner,
            aggregate_runs,
        )

        runner = EvaluationRunner()
        runs = []
        for i in range(3):
            run = runner.execute(
                task_description=f"Task {i}",
                task_type=TaskType.ANALYTICAL.value,
                cognitive_grade=CognitiveGrade.STANDARD.value,
            )
            runs.append(run)

        summary = aggregate_runs(runs)
        assert "mean_composite" in summary
        assert isinstance(summary["mean_composite"], float)

    def test_aggregate_counts_providers(self):
        """Aggregation counts how many runs used each provider."""
        from process_swarm.evaluation.runner import (
            EvaluationRunner,
            aggregate_runs,
        )

        runner = EvaluationRunner()
        runs = []

        # Qualified task → ACDS
        runs.append(runner.execute(
            task_description="Analyze data",
            task_type=TaskType.ANALYTICAL.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        ))
        # Excluded task → baseline
        runs.append(runner.execute(
            task_description="Write code",
            task_type=TaskType.CODING.value,
            cognitive_grade=CognitiveGrade.STANDARD.value,
        ))

        summary = aggregate_runs(runs)
        assert "provider_counts" in summary
        assert summary["provider_counts"].get("acds", 0) >= 1
        assert summary["provider_counts"].get("baseline", 0) >= 1

    def test_aggregate_computes_pass_rate(self):
        """Aggregation computes the validation pass rate."""
        from process_swarm.evaluation.runner import (
            EvaluationRunner,
            aggregate_runs,
        )

        runner = EvaluationRunner()
        runs = [
            runner.execute(
                task_description=f"Task {i}",
                task_type=TaskType.ANALYTICAL.value,
                cognitive_grade=CognitiveGrade.STANDARD.value,
            )
            for i in range(5)
        ]

        summary = aggregate_runs(runs)
        assert "validation_pass_rate" in summary
        assert 0.0 <= summary["validation_pass_rate"] <= 1.0

    def test_aggregate_empty_runs(self):
        """Aggregating zero runs returns sensible defaults."""
        from process_swarm.evaluation.runner import aggregate_runs

        summary = aggregate_runs([])
        assert summary["mean_composite"] == 0.0
        assert summary["provider_counts"] == {}
        assert summary["validation_pass_rate"] == 0.0
        assert summary["run_count"] == 0
