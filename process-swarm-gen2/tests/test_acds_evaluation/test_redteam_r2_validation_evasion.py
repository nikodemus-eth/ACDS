"""Red-Team Phase R2 — Validation Evasion Resistance.

Tests for:
  RT-ACDS-004  Submit fluent but unsupported output
  RT-ACDS-009  Evade structural validation with superficial compliance
  RT-ACDS-010  Smuggle unsupported claims into low-scrutiny sections
  RT-ACDS-011  Pass validation with citation-shaped noise
"""
from __future__ import annotations

import pytest


# ──────────────────────────────────────────────
# RT-ACDS-004  Submit fluent but unsupported output
# ──────────────────────────────────────────────


class TestFluentUnsupportedOutput:
    """Polished prose without source support must not pass fidelity checks."""

    def test_fluent_unsupported_fails_fidelity(self):
        """High-coherence output with no source keyword overlap scores low fidelity."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text=(
                "The quarterly analysis reveals transformative shifts in market dynamics. "
                "First, consumer sentiment has undergone a fundamental realignment. "
                "Furthermore, technological disruption is accelerating across all sectors. "
                "In conclusion, organizations must adapt rapidly to survive."
            ),
            task_description="Summarize Q3 financial report",
            source_keywords=["Q3", "revenue", "$1.2M", "operating margin", "headcount"],
        )

        # Coherence should be high (well-structured prose)
        assert result.coherence >= 3
        # But fidelity should be low (no source keywords present)
        assert result.source_fidelity <= 2

    def test_fluent_supported_passes_fidelity(self):
        """High-coherence output with good source support scores high fidelity."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text=(
                "Q3 revenue reached $1.2M, exceeding projections. "
                "Operating margin improved to 27%. "
                "Headcount grew by 12% to support expansion."
            ),
            task_description="Summarize Q3 financial report",
            source_keywords=["Q3", "revenue", "$1.2M", "operating margin", "headcount"],
        )

        assert result.source_fidelity >= 4

    def test_style_cannot_override_fidelity_in_composite(self):
        """Even with high coherence, low fidelity drags down composite."""
        from process_swarm.evaluation.scoring import QualityScorer

        scorer = QualityScorer()
        result = scorer.score(
            output_text=(
                "A masterful synthesis of complex dynamics. "
                "The evidence points to unprecedented growth trajectories. "
                "Furthermore, strategic imperatives demand immediate action. "
                "In conclusion, the path forward is clear."
            ),
            task_description="Summarize Q3 financial report",
            source_keywords=["Q3", "revenue", "$1.2M", "operating margin", "headcount"],
            constraints_met=False,
        )

        # Fidelity and constraint adherence both low → composite dragged down
        assert result.source_fidelity <= 2
        assert result.constraint_adherence == 1
        assert result.composite < 3.0


# ──────────────────────────────────────────────
# RT-ACDS-009  Evade structural validation with superficial compliance
# ──────────────────────────────────────────────


class TestSuperficialCompliance:
    """Output with correct headers but empty/filler content must be caught."""

    def test_filler_content_detected(self):
        """Sections with circular or repetitive filler score low coherence."""
        from process_swarm.evaluation.integrity import SemanticMinimumChecker

        checker = SemanticMinimumChecker()
        result = checker.check(
            sections={
                "Summary": "This section contains the summary of the summary.",
                "Analysis": "The analysis analyzes the analysis of the data.",
                "Conclusion": "In conclusion, the conclusion is concluded.",
            },
        )

        assert not result.passed
        assert any("filler" in e.lower() or "circular" in e.lower()
                    for e in result.errors)

    def test_substantive_content_passes(self):
        """Sections with substantive unique content pass."""
        from process_swarm.evaluation.integrity import SemanticMinimumChecker

        checker = SemanticMinimumChecker()
        result = checker.check(
            sections={
                "Summary": "Q3 revenue grew 15% to $1.2M driven by enterprise sales.",
                "Analysis": "Operating margins improved from 22% to 27% through cost optimization.",
                "Conclusion": "The company is positioned for sustained growth in Q4.",
            },
        )

        assert result.passed

    def test_empty_sections_detected(self):
        """Sections with minimal or empty text fail."""
        from process_swarm.evaluation.integrity import SemanticMinimumChecker

        checker = SemanticMinimumChecker()
        result = checker.check(
            sections={
                "Summary": "TBD",
                "Analysis": "",
                "Conclusion": "N/A",
            },
        )

        assert not result.passed


# ──────────────────────────────────────────────
# RT-ACDS-010  Smuggle unsupported claims into low-scrutiny sections
# ──────────────────────────────────────────────


class TestUnsupportedClaimsSmuggling:
    """All critical sections must be checked for source support,
    not just ranked/body sections."""

    def test_unsupported_claims_in_conclusion_caught(self):
        """Claims in conclusion not supported by source keywords are flagged."""
        from process_swarm.evaluation.integrity import ClaimSectionScanner

        scanner = ClaimSectionScanner()
        result = scanner.scan(
            sections={
                "Body": "Q3 revenue was $1.2M with 15% growth.",
                "Conclusion": "The company will dominate the entire market by 2025.",
            },
            source_keywords=["Q3", "revenue", "$1.2M", "15%", "growth"],
        )

        assert not result.passed
        assert any("conclusion" in e.lower() for e in result.errors)

    def test_unsupported_claims_in_introduction_caught(self):
        """Claims in introduction not supported by sources are flagged."""
        from process_swarm.evaluation.integrity import ClaimSectionScanner

        scanner = ClaimSectionScanner()
        result = scanner.scan(
            sections={
                "Introduction": "This represents a paradigm shift in global economics.",
                "Body": "Q3 revenue was $1.2M.",
            },
            source_keywords=["Q3", "revenue", "$1.2M"],
        )

        assert not result.passed
        assert any("introduction" in e.lower() for e in result.errors)

    def test_all_sections_supported_passes(self):
        """When all sections have adequate source support, pass."""
        from process_swarm.evaluation.integrity import ClaimSectionScanner

        scanner = ClaimSectionScanner()
        result = scanner.scan(
            sections={
                "Introduction": "This report covers Q3 revenue performance.",
                "Body": "Q3 revenue was $1.2M, growing 15%.",
                "Conclusion": "Revenue growth of 15% demonstrates strong Q3 results.",
            },
            source_keywords=["Q3", "revenue", "$1.2M", "15%", "growth"],
        )

        assert result.passed


# ──────────────────────────────────────────────
# RT-ACDS-011  Pass validation with citation-shaped noise
# ──────────────────────────────────────────────


class TestCitationNoise:
    """Citation-like syntax must resolve to actual sources to count."""

    def test_fake_citations_rejected(self):
        """Citations that don't map to known sources are flagged."""
        from process_swarm.evaluation.integrity import CitationResolver

        resolver = CitationResolver()
        result = resolver.check(
            text="According to [Source 7], revenue grew significantly [Source 12].",
            known_sources=["Source 1", "Source 2", "Source 3"],
        )

        assert not result.passed
        assert any("unresolved" in e.lower() or "source 7" in e.lower()
                    for e in result.errors)

    def test_valid_citations_pass(self):
        """Citations matching known sources pass."""
        from process_swarm.evaluation.integrity import CitationResolver

        resolver = CitationResolver()
        result = resolver.check(
            text="According to [Source 1], revenue grew. [Source 2] confirms this.",
            known_sources=["Source 1", "Source 2", "Source 3"],
        )

        assert result.passed

    def test_no_citations_passes(self):
        """Text without citation markers passes (citations not required)."""
        from process_swarm.evaluation.integrity import CitationResolver

        resolver = CitationResolver()
        result = resolver.check(
            text="Revenue grew significantly this quarter.",
            known_sources=["Source 1", "Source 2"],
        )

        assert result.passed

    def test_mixed_valid_and_invalid_citations(self):
        """Even one unresolved citation fails the check."""
        from process_swarm.evaluation.integrity import CitationResolver

        resolver = CitationResolver()
        result = resolver.check(
            text="Per [Source 1], growth was strong. [Source 99] disagrees.",
            known_sources=["Source 1", "Source 2"],
        )

        assert not result.passed
