"""Targeted tests to close remaining coverage gaps in the evaluation module."""
from __future__ import annotations

import pytest


# ── routing.py lines 29-30: _grade_index with unknown grade ──

class TestGradeIndexUnknownGrade:
    def test_unknown_grade_returns_negative(self):
        from process_swarm.evaluation.routing import _grade_index

        assert _grade_index("nonexistent_grade") == -1


# ── scoring.py line 21: _overlap_ratio with both sets empty ──

class TestOverlapRatioEdgeCases:
    def test_both_empty_returns_zero(self):
        from process_swarm.evaluation.scoring import _overlap_ratio

        assert _overlap_ratio(set(), set()) == 0.0


# ── scoring.py lines 30, 32, 34: _ratio_to_score intermediate thresholds ──

class TestRatioToScoreThresholds:
    def test_score_5_at_0_6(self):
        from process_swarm.evaluation.scoring import _ratio_to_score

        assert _ratio_to_score(0.6) == 5

    def test_score_4_at_0_4(self):
        from process_swarm.evaluation.scoring import _ratio_to_score

        assert _ratio_to_score(0.4) == 4

    def test_score_3_at_0_25(self):
        from process_swarm.evaluation.scoring import _ratio_to_score

        assert _ratio_to_score(0.25) == 3


# ── scoring.py line 127: _score_accuracy with empty ground_truth ──

class TestAccuracyEdgeCases:
    def test_empty_ground_truth_returns_neutral(self):
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some output text here.",
            task_description="A task",
            ground_truth="",  # empty string, not None
        )
        # Empty ground truth → _tokenize returns empty set → returns 3
        assert result.accuracy == 3


# ── scoring.py line 148: _score_relevance with empty task_description ──

class TestRelevanceEdgeCases:
    def test_empty_task_description_returns_neutral(self):
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some output text.",
            task_description="",  # empty
        )
        assert result.relevance == 3


# ── scoring.py line 173: _score_coherence with no sentences ──

class TestCoherenceEdgeCases:
    def test_no_sentences_returns_1(self):
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        # Text with no sentence-ending punctuation and only whitespace after split
        result = scorer.score(
            output_text="...",
            task_description="task",
        )
        assert result.coherence == 1


# ── scoring.py lines 208, 215: _score_source_fidelity empty list / untokenizable ──

class TestSourceFidelityEdgeCases:
    def test_empty_source_keywords_list(self):
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some text.",
            task_description="task",
            source_keywords=[],  # empty list, not None
        )
        assert result.source_fidelity == 3

    def test_untokenizable_source_keywords(self):
        """Keywords that produce no tokens after tokenization."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="Some text.",
            task_description="task",
            source_keywords=["---", "***"],  # no alphanumeric chars
        )
        assert result.source_fidelity == 3


# ── scoring.py lines 223, 225: source_fidelity score 4 and score 3 thresholds ──

class TestSourceFidelityThresholds:
    def test_fidelity_score_4(self):
        """50-75% keyword overlap → score 4."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        # 3 keywords, output has 2 of them → ~67% → score 4
        result = scorer.score(
            output_text="alpha beta something else entirely.",
            task_description="task",
            source_keywords=["alpha", "beta", "gamma"],
        )
        assert result.source_fidelity == 4

    def test_fidelity_score_3(self):
        """25-50% keyword overlap → score 3."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        # 4 keywords, output has 1 → 25% → score 3
        result = scorer.score(
            output_text="alpha something else entirely.",
            task_description="task",
            source_keywords=["alpha", "beta", "gamma", "delta"],
        )
        assert result.source_fidelity == 3


# ── scoring.py line 234: _score_ranking_quality with >=3 numbered items ──

class TestRankingQualityEdgeCases:
    def test_three_or_more_numbered_items(self):
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text="1. First item\n2. Second item\n3. Third item\n",
            task_description="Rank items",
        )
        assert result.ranking_quality == 4


# ── runner.py line 71: EvaluationRun.to_dict with comparison_report ──

class TestEvaluationRunToDictWithComparison:
    def test_to_dict_includes_comparison_report(self):
        from process_swarm.evaluation.runner import EvaluationRunner

        runner = EvaluationRunner()
        evaluation = runner.execute(
            task_description="Summarize quarterly results",
            task_type="summarization",
            cognitive_grade="standard",
            include_comparison=True,
        )

        d = evaluation.to_dict()
        assert "comparison_report" in d
        assert isinstance(d["comparison_report"], dict)


# ── integrity.py line 92: RoutingIntegrityChecker skip matching task_type ──

class TestRoutingIntegritySkipMatching:
    def test_claimed_type_in_indicator_dict_is_skipped(self):
        """When claimed_task_type is a key in _TASK_TYPE_INDICATORS,
        the loop skips it (line 92 continue)."""
        from process_swarm.evaluation.integrity import RoutingIntegrityChecker

        checker = RoutingIntegrityChecker()
        # claimed_task_type="coding" IS in _TASK_TYPE_INDICATORS
        # indicators don't overlap enough with other types → passes
        result = checker.check(
            claimed_task_type="coding",
            actual_task_indicators=["code", "function"],
        )
        assert result.passed


# ── integrity.py line 255: ClaimSectionScanner with empty keyword_tokens ──

class TestClaimSectionScannerEmptyKeywords:
    def test_empty_keyword_tokens_passes(self):
        from process_swarm.evaluation.integrity import ClaimSectionScanner

        scanner = ClaimSectionScanner()
        result = scanner.scan(
            sections={"Body": "Some content here."},
            source_keywords=["---", "***"],  # untokenizable → empty keyword_tokens
        )
        assert result.passed


# ── integrity.py line 384: ConflictDetector with fewer than 2 claims ──

class TestConflictDetectorFewClaims:
    def test_single_claim_passes(self):
        from process_swarm.evaluation.integrity import ConflictDetector

        detector = ConflictDetector()
        result = detector.check(
            output_text="Revenue grew significantly.",
            conflicting_claims=["Revenue grew"],
        )
        assert result.passed

    def test_empty_claims_passes(self):
        from process_swarm.evaluation.integrity import ConflictDetector

        detector = ConflictDetector()
        result = detector.check(
            output_text="Revenue grew significantly.",
            conflicting_claims=[],
        )
        assert result.passed


# ── integrity.py line 755: DriftVisibilityTracker validator-only drift ──

class TestValidatorOnlyDrift:
    def test_validator_drift_detected(self):
        from process_swarm.evaluation.integrity import DriftVisibilityTracker

        tracker = DriftVisibilityTracker()
        tracker.record_run(run_id="r1", policy_version="v1.0", validator_version="v2.0")
        tracker.record_run(run_id="r2", policy_version="v1.0", validator_version="v2.1")

        result = tracker.check_drift()
        assert not result.passed
        assert any("validator" in e.lower() for e in result.errors)
