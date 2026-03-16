"""Phase 4 — Quality and Source Fidelity.

Tests for:
  UC-ACDS-004  Score output quality on ordinal 1-5 scale
  UC-ACDS-005  Measure accuracy against ground truth
  UC-ACDS-006  Score relevance to original task
  UC-ACDS-007  Evaluate ranking quality (when applicable)
  UC-ACDS-008  Assess coherence of output
  UC-ACDS-009  Check constraint adherence in scored output
  UC-ACDS-010  Verify source fidelity

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import pytest


# ──────────────────────────────────────────────
# UC-ACDS-004  Score output quality on ordinal 1-5 scale
# ──────────────────────────────────────────────


class TestQualityScoring:
    """The scoring model must produce ordinal 1-5 scores for each
    quality dimension and an overall composite score."""

    def test_score_result_has_all_dimensions(self):
        """A ScoreResult contains all required quality dimensions."""
        from process_swarm.evaluation.scoring import QualityScorer, ScoreResult

        scorer = QualityScorer()
        result = scorer.score(
            output_text="A thorough analysis of the dataset reveals...",
            task_description="Analyze the quarterly sales data",
            ground_truth="Sales increased 15% year-over-year",
        )

        assert isinstance(result, ScoreResult)
        assert hasattr(result, "accuracy")
        assert hasattr(result, "relevance")
        assert hasattr(result, "coherence")
        assert hasattr(result, "constraint_adherence")
        assert hasattr(result, "source_fidelity")

    def test_scores_are_in_1_to_5_range(self):
        """All dimension scores must be integers in [1, 5]."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Detailed output text with analysis",
            task_description="Summarize the report",
        )

        for dim in ["accuracy", "relevance", "coherence",
                     "constraint_adherence", "source_fidelity"]:
            score = getattr(result, dim)
            assert isinstance(score, int), f"{dim} must be int"
            assert 1 <= score <= 5, f"{dim}={score} outside [1,5]"

    def test_composite_score_is_average_of_dimensions(self):
        """The composite score is the mean of all dimension scores."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some output",
            task_description="Some task",
        )

        dimensions = [
            result.accuracy, result.relevance, result.coherence,
            result.constraint_adherence, result.source_fidelity,
        ]
        expected = sum(dimensions) / len(dimensions)
        assert abs(result.composite - expected) < 0.01

    def test_empty_output_scores_minimum(self):
        """Empty output text receives minimum scores across all dimensions."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="",
            task_description="Summarize the report",
        )

        assert result.accuracy == 1
        assert result.relevance == 1
        assert result.coherence == 1
        assert result.composite == 1.0


# ──────────────────────────────────────────────
# UC-ACDS-005  Measure accuracy against ground truth
# ──────────────────────────────────────────────


class TestAccuracyScoring:
    """Accuracy measures how well the output matches ground truth."""

    def test_exact_match_scores_5(self):
        """Output containing the exact ground truth scores maximum accuracy."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Sales increased 15% year-over-year in Q3.",
            task_description="Report on sales",
            ground_truth="Sales increased 15% year-over-year",
        )

        assert result.accuracy == 5

    def test_no_overlap_scores_1(self):
        """Output with zero overlap with ground truth scores minimum."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="The weather is nice today.",
            task_description="Report on sales",
            ground_truth="Sales increased 15% year-over-year",
        )

        assert result.accuracy == 1

    def test_partial_overlap_scores_between(self):
        """Output with partial ground truth overlap scores between 1 and 5."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Sales data shows a significant increase this year.",
            task_description="Report on sales",
            ground_truth="Sales increased 15% year-over-year",
        )

        assert 1 < result.accuracy < 5

    def test_no_ground_truth_defaults_to_3(self):
        """When no ground truth is provided, accuracy defaults to 3 (neutral)."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some analysis text here.",
            task_description="Analyze data",
        )

        assert result.accuracy == 3


# ──────────────────────────────────────────────
# UC-ACDS-006  Score relevance to original task
# ──────────────────────────────────────────────


class TestRelevanceScoring:
    """Relevance measures how well the output addresses the task."""

    def test_highly_relevant_output_scores_high(self):
        """Output using task keywords scores high relevance."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="The quarterly sales analysis reveals strong growth.",
            task_description="Analyze quarterly sales data",
        )

        assert result.relevance >= 4

    def test_irrelevant_output_scores_low(self):
        """Output unrelated to the task scores low relevance."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Photosynthesis is the process by which plants convert sunlight.",
            task_description="Analyze quarterly sales data",
        )

        assert result.relevance <= 2


# ──────────────────────────────────────────────
# UC-ACDS-007  Evaluate ranking quality
# ──────────────────────────────────────────────


class TestRankingQuality:
    """When output contains ranked items, the ranking quality dimension
    assesses ordering appropriateness."""

    def test_ranking_quality_dimension_exists(self):
        """ScoreResult has a ranking_quality dimension."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="1. Primary finding\n2. Secondary finding",
            task_description="Rank the findings",
        )

        assert hasattr(result, "ranking_quality")
        assert isinstance(result.ranking_quality, int)
        assert 1 <= result.ranking_quality <= 5

    def test_ranking_quality_not_in_composite_by_default(self):
        """ranking_quality is optional and excluded from composite by default."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some output",
            task_description="Some task",
        )

        # Composite is average of the 5 core dimensions, not 6
        dimensions = [
            result.accuracy, result.relevance, result.coherence,
            result.constraint_adherence, result.source_fidelity,
        ]
        expected = sum(dimensions) / len(dimensions)
        assert abs(result.composite - expected) < 0.01


# ──────────────────────────────────────────────
# UC-ACDS-008  Assess coherence of output
# ──────────────────────────────────────────────


class TestCoherenceScoring:
    """Coherence measures logical flow and structural quality."""

    def test_well_structured_output_scores_high(self):
        """Output with clear structure and sentences scores high coherence."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text=(
                "The analysis examines three key areas. "
                "First, revenue growth exceeded expectations. "
                "Second, customer retention improved significantly. "
                "Third, operational costs were reduced by 12%. "
                "In conclusion, the company is performing well."
            ),
            task_description="Analyze company performance",
        )

        assert result.coherence >= 4

    def test_incoherent_output_scores_low(self):
        """Fragmented, repetitive output scores low coherence."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="data data revenue. the. error? yes no maybe",
            task_description="Analyze company performance",
        )

        assert result.coherence <= 2


# ──────────────────────────────────────────────
# UC-ACDS-009  Check constraint adherence in scored output
# ──────────────────────────────────────────────


class TestConstraintAdherenceScoring:
    """Constraint adherence measures whether the output respects
    the constraints from the routing request."""

    def test_all_constraints_met_scores_5(self):
        """When all constraints are satisfied, score is 5."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text='{"analysis": "Revenue grew 15%"}',
            task_description="Provide structured analysis",
            constraints_met=True,
        )

        assert result.constraint_adherence == 5

    def test_constraints_violated_scores_1(self):
        """When constraints are violated, score is 1."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Plain text instead of JSON",
            task_description="Provide structured analysis",
            constraints_met=False,
        )

        assert result.constraint_adherence == 1


# ──────────────────────────────────────────────
# UC-ACDS-010  Verify source fidelity
# ──────────────────────────────────────────────


class TestSourceFidelity:
    """Source fidelity measures whether the output faithfully represents
    source material without hallucination or fabrication."""

    def test_output_with_source_keywords_scores_high(self):
        """Output containing source keywords scores high fidelity."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="The report states that Q3 revenue was $1.2M.",
            task_description="Summarize the Q3 financial report",
            source_keywords=["Q3", "revenue", "$1.2M", "report"],
        )

        assert result.source_fidelity >= 4

    def test_output_without_source_keywords_scores_low(self):
        """Output missing source keywords scores low fidelity."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="The economy is generally improving worldwide.",
            task_description="Summarize the Q3 financial report",
            source_keywords=["Q3", "revenue", "$1.2M", "report"],
        )

        assert result.source_fidelity <= 2

    def test_no_source_keywords_defaults_to_3(self):
        """When no source keywords are provided, fidelity defaults to 3."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some analysis text.",
            task_description="Analyze data",
        )

        assert result.source_fidelity == 3

    def test_score_result_is_serializable(self):
        """ScoreResult can be converted to a dict for ledger storage."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Analysis output",
            task_description="Analyze data",
        )

        d = result.to_dict()
        assert isinstance(d, dict)
        assert "accuracy" in d
        assert "relevance" in d
        assert "coherence" in d
        assert "constraint_adherence" in d
        assert "source_fidelity" in d
        assert "ranking_quality" in d
        assert "composite" in d
