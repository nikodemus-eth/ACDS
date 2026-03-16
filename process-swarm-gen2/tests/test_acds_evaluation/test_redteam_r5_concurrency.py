"""Red-Team Phase R5 — Concurrency and Event Integrity.

Tests for:
  RT-ACDS-019  Cross-contaminate concurrent runs
  RT-ACDS-020  Race provider event and validation event ordering
  RT-ACDS-021  Duplicate artifact emission under load
"""
from __future__ import annotations

import pytest


class TestCrossRunContamination:
    """One run's data must not bleed into another."""

    def test_mixed_source_references_detected(self):
        from process_swarm.evaluation.integrity import RunIsolationChecker

        checker = RunIsolationChecker()
        result = checker.check(
            run_id="run-A",
            artifact_source_refs=["source-1", "source-2", "source-B-only"],
            expected_source_refs=["source-1", "source-2"],
        )

        assert not result.passed
        assert any("contaminat" in e.lower() or "unexpected" in e.lower()
                    for e in result.errors)

    def test_clean_source_refs_passes(self):
        from process_swarm.evaluation.integrity import RunIsolationChecker

        checker = RunIsolationChecker()
        result = checker.check(
            run_id="run-A",
            artifact_source_refs=["source-1", "source-2"],
            expected_source_refs=["source-1", "source-2"],
        )

        assert result.passed


class TestEventOrdering:
    """Events must follow legal ordering: selected → invoked → validated."""

    def test_validation_before_invocation_rejected(self):
        from process_swarm.evaluation.integrity import EventOrderingValidator

        validator = EventOrderingValidator()
        result = validator.check(
            event_sequence=[
                {"event_type": "provider_selected", "timestamp": "2026-01-01T00:00:01Z"},
                {"event_type": "validation_outcome", "timestamp": "2026-01-01T00:00:02Z"},
                {"event_type": "provider_invoked", "timestamp": "2026-01-01T00:00:03Z"},
            ],
        )

        assert not result.passed
        assert any("order" in e.lower() for e in result.errors)

    def test_legal_ordering_passes(self):
        from process_swarm.evaluation.integrity import EventOrderingValidator

        validator = EventOrderingValidator()
        result = validator.check(
            event_sequence=[
                {"event_type": "provider_selected", "timestamp": "2026-01-01T00:00:01Z"},
                {"event_type": "provider_invoked", "timestamp": "2026-01-01T00:00:02Z"},
                {"event_type": "validation_outcome", "timestamp": "2026-01-01T00:00:03Z"},
            ],
        )

        assert result.passed

    def test_empty_sequence_passes(self):
        from process_swarm.evaluation.integrity import EventOrderingValidator

        validator = EventOrderingValidator()
        result = validator.check(event_sequence=[])
        assert result.passed


class TestDuplicateArtifactEmission:
    """Only one accepted artifact per run stage."""

    def test_duplicate_accepted_artifact_blocked(self):
        from process_swarm.evaluation.integrity import IdempotencyGuard

        guard = IdempotencyGuard()
        guard.record_acceptance(run_id="run-001", stage="text_generation")
        result = guard.check_acceptance(run_id="run-001", stage="text_generation")

        assert not result.passed
        assert any("duplicate" in e.lower() for e in result.errors)

    def test_first_acceptance_passes(self):
        from process_swarm.evaluation.integrity import IdempotencyGuard

        guard = IdempotencyGuard()
        result = guard.check_acceptance(run_id="run-002", stage="text_generation")

        assert result.passed

    def test_different_stages_independent(self):
        from process_swarm.evaluation.integrity import IdempotencyGuard

        guard = IdempotencyGuard()
        guard.record_acceptance(run_id="run-003", stage="text_generation")
        result = guard.check_acceptance(run_id="run-003", stage="audio_generation")

        assert result.passed
