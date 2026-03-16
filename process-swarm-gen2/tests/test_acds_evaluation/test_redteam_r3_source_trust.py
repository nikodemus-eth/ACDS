"""Red-Team Phase R3 — Source-Trust and Synthesis Distortion.

Tests for:
  RT-ACDS-005  Inject plausible fabricated named entities
  RT-ACDS-006  Inflate minor signals into major findings
  RT-ACDS-007  Collapse source conflict into false certainty
  RT-ACDS-008  Overgeneralize from sparse evidence
  RT-ACDS-027  Produce valid-looking but strategically wrong brief
"""
from __future__ import annotations

import pytest


class TestFabricatedEntities:
    """Invented named entities must be caught by entity grounding checks."""

    def test_fabricated_entity_detected(self):
        from process_swarm.evaluation.integrity import EntityGroundingChecker

        checker = EntityGroundingChecker()
        result = checker.check(
            output_text="Dr. Helena Marchetti of the Nexus Research Institute confirmed the findings.",
            known_entities=["ACME Corp", "John Smith", "Q3 Report"],
        )

        assert not result.passed
        assert any("entity" in e.lower() or "fabricat" in e.lower()
                    for e in result.errors)

    def test_grounded_entities_pass(self):
        from process_swarm.evaluation.integrity import EntityGroundingChecker

        checker = EntityGroundingChecker()
        result = checker.check(
            output_text="ACME Corp reported strong results. John Smith presented the Q3 Report.",
            known_entities=["ACME Corp", "John Smith", "Q3 Report"],
        )

        assert result.passed

    def test_no_proper_nouns_passes(self):
        from process_swarm.evaluation.integrity import EntityGroundingChecker

        checker = EntityGroundingChecker()
        result = checker.check(
            output_text="Revenue grew significantly this quarter.",
            known_entities=["ACME Corp"],
        )

        assert result.passed


class TestSignalInflation:
    """Low-importance items must not be inflated into major findings."""

    def test_low_signal_in_top_position_detected(self):
        from process_swarm.evaluation.integrity import RankingDistortionChecker

        checker = RankingDistortionChecker()
        result = checker.check(
            ranked_items=["Office supply costs", "Revenue grew 15%", "Major acquisition"],
            high_importance_items=["Revenue grew 15%", "Major acquisition"],
            low_importance_items=["Office supply costs"],
        )

        assert not result.passed
        assert any("inflat" in e.lower() or "distort" in e.lower()
                    for e in result.errors)

    def test_correct_ranking_passes(self):
        from process_swarm.evaluation.integrity import RankingDistortionChecker

        checker = RankingDistortionChecker()
        result = checker.check(
            ranked_items=["Major acquisition", "Revenue grew 15%", "Office supply costs"],
            high_importance_items=["Revenue grew 15%", "Major acquisition"],
            low_importance_items=["Office supply costs"],
        )

        assert result.passed


class TestConflictFlattening:
    """Contradictory sources must not be collapsed into false certainty."""

    def test_conflict_flattened_detected(self):
        from process_swarm.evaluation.integrity import ConflictDetector

        detector = ConflictDetector()
        result = detector.check(
            output_text="Revenue definitely increased this quarter.",
            conflicting_claims=["Revenue increased 15%", "Revenue decreased 3%"],
        )

        assert not result.passed
        assert any("conflict" in e.lower() or "certainty" in e.lower()
                    for e in result.errors)

    def test_conflict_acknowledged_passes(self):
        from process_swarm.evaluation.integrity import ConflictDetector

        detector = ConflictDetector()
        result = detector.check(
            output_text="Sources disagree on revenue: one reports 15% growth while another shows a 3% decline.",
            conflicting_claims=["Revenue increased 15%", "Revenue decreased 3%"],
        )

        assert result.passed


class TestSparseOvergeneralization:
    """Sparse evidence must not yield confident broad conclusions."""

    def test_overgeneralization_from_sparse_detected(self):
        from process_swarm.evaluation.integrity import InsufficencyDetector

        detector = InsufficencyDetector()
        result = detector.check(
            output_text=(
                "The comprehensive global analysis reveals definitive market trends "
                "across all sectors and regions, pointing to an inevitable transformation."
            ),
            source_count=2,
            source_word_count=50,
        )

        assert not result.passed
        assert any("sparse" in e.lower() or "insufficient" in e.lower()
                    for e in result.errors)

    def test_bounded_conclusion_from_sparse_passes(self):
        from process_swarm.evaluation.integrity import InsufficencyDetector

        detector = InsufficencyDetector()
        result = detector.check(
            output_text="Based on the limited available data, initial indicators suggest modest growth.",
            source_count=2,
            source_word_count=50,
        )

        assert result.passed

    def test_rich_sources_allow_broad_conclusions(self):
        from process_swarm.evaluation.integrity import InsufficencyDetector

        detector = InsufficencyDetector()
        result = detector.check(
            output_text="Comprehensive analysis reveals definitive trends across sectors.",
            source_count=15,
            source_word_count=5000,
        )

        assert result.passed


class TestStrategicallyWrongBrief:
    """A structurally correct brief that misprioritizes content must be caught."""

    def test_misprioritized_brief_detected(self):
        from process_swarm.evaluation.integrity import RankingDistortionChecker

        checker = RankingDistortionChecker()
        result = checker.check(
            ranked_items=["Coffee machine upgrade", "Staff parking update", "Major security breach"],
            high_importance_items=["Major security breach"],
            low_importance_items=["Coffee machine upgrade", "Staff parking update"],
        )

        assert not result.passed
