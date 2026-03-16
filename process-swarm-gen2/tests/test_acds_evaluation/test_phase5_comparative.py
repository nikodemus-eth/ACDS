"""Phase 5 — Comparative Evaluation.

Tests for:
  UC-ACDS-017  Run same task through ACDS and baseline, compare scores
  UC-ACDS-018  ACDS should outperform baseline on qualified tasks
  UC-ACDS-019  Baseline should perform adequately on excluded tasks

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import pytest

from process_swarm.acds_client import TaskType


# ──────────────────────────────────────────────
# UC-ACDS-017  Comparative evaluation framework
# ──────────────────────────────────────────────


class TestComparativeFramework:
    """The comparative evaluator must run the same task through both
    providers and produce a structured comparison report."""

    def test_comparison_report_has_both_scores(self):
        """A ComparisonReport contains scores for both providers."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
            ComparisonReport,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Analyze quarterly revenue trends",
            task_type=TaskType.ANALYTICAL.value,
            acds_output="Revenue grew 15% with strong Q3 performance in all regions.",
            baseline_output="Revenue numbers are available.",
        )

        assert isinstance(report, ComparisonReport)
        assert report.acds_scores is not None
        assert report.baseline_scores is not None

    def test_comparison_report_has_deltas(self):
        """The report includes per-dimension score deltas (acds - baseline)."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Summarize the report",
            task_type=TaskType.SUMMARIZATION.value,
            acds_output="A detailed summary covering all key points.",
            baseline_output="Summary.",
        )

        assert hasattr(report, "deltas")
        assert "accuracy" in report.deltas
        assert "relevance" in report.deltas
        assert "coherence" in report.deltas
        assert "composite" in report.deltas

    def test_deltas_are_acds_minus_baseline(self):
        """Each delta is acds_score - baseline_score."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Analyze data",
            task_type=TaskType.ANALYTICAL.value,
            acds_output="Detailed analytical output with comprehensive data review.",
            baseline_output="Data analyzed.",
        )

        expected_composite_delta = (
            report.acds_scores.composite - report.baseline_scores.composite
        )
        assert abs(report.deltas["composite"] - expected_composite_delta) < 0.01

    def test_comparison_report_identifies_winner(self):
        """The report identifies which provider scored higher overall."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Summarize findings",
            task_type=TaskType.SUMMARIZATION.value,
            acds_output="Comprehensive summary of all findings with analysis.",
            baseline_output="Findings.",
        )

        assert report.winner in ("acds", "baseline", "tie")

    def test_tie_when_scores_equal(self):
        """When both providers score identically, result is a tie."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        # Same output → same scores → tie
        report = evaluator.compare(
            task_description="Echo the input",
            task_type=TaskType.ANALYTICAL.value,
            acds_output="Identical output text for both providers.",
            baseline_output="Identical output text for both providers.",
        )

        assert report.winner == "tie"
        assert report.deltas["composite"] == 0.0

    def test_comparison_report_serializable(self):
        """The report can be serialized to a dict."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Test task",
            task_type=TaskType.ANALYTICAL.value,
            acds_output="ACDS output text.",
            baseline_output="Baseline output text.",
        )

        d = report.to_dict()
        assert isinstance(d, dict)
        assert "acds_scores" in d
        assert "baseline_scores" in d
        assert "deltas" in d
        assert "winner" in d
        assert "task_type" in d

    def test_comparison_with_ground_truth(self):
        """Ground truth is passed to the scorer for both providers."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Report sales figures",
            task_type=TaskType.RETRIEVAL_SYNTHESIS.value,
            acds_output="Sales increased 15% year-over-year in Q3.",
            baseline_output="Sales data exists.",
            ground_truth="Sales increased 15% year-over-year",
        )

        # ACDS output contains the ground truth, baseline does not
        assert report.acds_scores.accuracy > report.baseline_scores.accuracy


# ──────────────────────────────────────────────
# UC-ACDS-018  ACDS outperforms baseline on qualified tasks
# ──────────────────────────────────────────────


class TestACDSOutperformance:
    """On tasks where ACDS is the qualified provider, its output
    should score higher than the minimal baseline."""

    def test_acds_wins_on_rich_vs_minimal_output(self):
        """Rich ACDS output beats minimal baseline output."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Analyze the quarterly financial performance",
            task_type=TaskType.ANALYTICAL.value,
            acds_output=(
                "The quarterly financial analysis reveals three key trends. "
                "First, revenue grew by 15% compared to the previous quarter. "
                "Second, operating margins improved from 22% to 27%. "
                "Third, customer acquisition costs decreased by 8%. "
                "In conclusion, the company's financial performance is strong."
            ),
            baseline_output="Financial data reviewed.",
        )

        assert report.winner == "acds"
        assert report.deltas["composite"] > 0

    def test_acds_higher_coherence_than_baseline(self):
        """ACDS output with structure scores higher coherence."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Summarize research findings",
            task_type=TaskType.SUMMARIZATION.value,
            acds_output=(
                "The research yielded significant findings. "
                "First, the treatment group showed 40% improvement. "
                "Furthermore, side effects were minimal across all cohorts. "
                "Therefore, the treatment is recommended for wider trials."
            ),
            baseline_output="Research done. Results ok.",
        )

        assert report.acds_scores.coherence > report.baseline_scores.coherence


# ──────────────────────────────────────────────
# UC-ACDS-019  Baseline performs adequately on excluded tasks
# ──────────────────────────────────────────────


class TestBaselineAdequacy:
    """On tasks excluded from ACDS, the baseline provider should
    still produce adequate scores."""

    def test_baseline_scores_above_minimum(self):
        """Baseline output with some content scores above minimum."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Classify the document type",
            task_type=TaskType.CLASSIFICATION.value,
            acds_output="Document classified as financial report.",
            baseline_output="Document classified as financial report.",
        )

        # Both should score identically and above minimum
        assert report.baseline_scores.composite > 1.0

    def test_baseline_adequate_for_coding_tasks(self):
        """For coding tasks (excluded from ACDS), baseline is sufficient."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Write a function to parse JSON",
            task_type=TaskType.CODING.value,
            acds_output="def parse_json(text): return json.loads(text)",
            baseline_output="def parse_json(text): return json.loads(text)",
        )

        # Same output → tie, both adequate
        assert report.winner == "tie"
        assert report.baseline_scores.composite >= 2.0

    def test_comparison_report_includes_task_type(self):
        """The report carries the task_type for context."""
        from process_swarm.evaluation.comparative import (
            ComparativeEvaluator,
        )

        evaluator = ComparativeEvaluator()
        report = evaluator.compare(
            task_description="Extract entities",
            task_type=TaskType.EXTRACTION.value,
            acds_output="Entities extracted.",
            baseline_output="Entities extracted.",
        )

        assert report.task_type == TaskType.EXTRACTION.value
