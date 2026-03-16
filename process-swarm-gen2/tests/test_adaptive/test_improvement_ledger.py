"""Tests for ImprovementLedger."""
from __future__ import annotations

import pytest

from swarm.adaptive.improvement_ledger import (
    BranchId,
    ImprovementLedger,
    LedgerEntry,
    SchedulerDecision,
)


class TestLedgerEntry:
    def test_fields(self):
        entry = LedgerEntry(
            branch_id="source_intake",
            cycle=1,
            score=0.8,
            delta=0.0,
            stagnation_count=0,
            decision="continue",
        )
        assert entry.branch_id == "source_intake"
        assert entry.metadata == {}


class TestImprovementLedger:
    def test_first_entry_delta_is_zero(self):
        ledger = ImprovementLedger()
        entry = ledger.record("branch_a", 1, 0.5, "continue")
        assert entry.delta == 0.0
        assert entry.stagnation_count == 0

    def test_delta_computed_from_previous(self):
        ledger = ImprovementLedger()
        ledger.record("branch_a", 1, 0.5, "continue")
        entry = ledger.record("branch_a", 2, 0.7, "continue")
        assert abs(entry.delta - 0.2) < 1e-9

    def test_stagnation_increments_below_threshold(self):
        ledger = ImprovementLedger(stagnation_threshold=0.03)
        ledger.record("b", 1, 0.5, "continue")
        e2 = ledger.record("b", 2, 0.51, "continue")  # delta=0.01 < 0.03
        assert e2.stagnation_count == 1
        e3 = ledger.record("b", 3, 0.52, "continue")  # delta=0.01 < 0.03
        assert e3.stagnation_count == 2

    def test_stagnation_resets_on_improvement(self):
        ledger = ImprovementLedger(stagnation_threshold=0.03)
        ledger.record("b", 1, 0.5, "continue")
        ledger.record("b", 2, 0.51, "continue")  # stagnation=1
        entry = ledger.record("b", 3, 0.60, "continue")  # delta=0.09 > 0.03
        assert entry.stagnation_count == 0

    def test_negative_delta_counts_as_stagnation(self):
        ledger = ImprovementLedger(stagnation_threshold=0.03)
        ledger.record("b", 1, 0.5, "continue")
        entry = ledger.record("b", 2, 0.49, "continue")  # delta=-0.01
        assert entry.stagnation_count == 1

    def test_is_stagnant_default_consecutive(self):
        ledger = ImprovementLedger(stagnation_threshold=0.03)
        ledger.record("b", 1, 0.5, "continue")
        ledger.record("b", 2, 0.51, "continue")
        assert not ledger.is_stagnant("b")  # 1 cycle, need 2
        ledger.record("b", 3, 0.52, "continue")
        assert ledger.is_stagnant("b")  # 2 consecutive

    def test_is_stagnant_custom_consecutive(self):
        ledger = ImprovementLedger(stagnation_threshold=0.03)
        ledger.record("b", 1, 0.5, "continue")
        ledger.record("b", 2, 0.51, "continue")
        ledger.record("b", 3, 0.52, "continue")
        assert not ledger.is_stagnant("b", consecutive=3)
        ledger.record("b", 4, 0.53, "continue")
        assert ledger.is_stagnant("b", consecutive=3)

    def test_is_stagnant_unknown_branch(self):
        ledger = ImprovementLedger()
        assert not ledger.is_stagnant("nonexistent")

    def test_latest_returns_most_recent(self):
        ledger = ImprovementLedger()
        ledger.record("b", 1, 0.3, "continue")
        ledger.record("b", 2, 0.5, "continue")
        assert ledger.latest("b").cycle == 2

    def test_latest_returns_none_for_unknown(self):
        ledger = ImprovementLedger()
        assert ledger.latest("nonexistent") is None

    def test_history_returns_ordered(self):
        ledger = ImprovementLedger()
        ledger.record("b", 1, 0.3, "continue")
        ledger.record("b", 2, 0.5, "continue")
        history = ledger.history("b")
        assert len(history) == 2
        assert history[0].cycle == 1
        assert history[1].cycle == 2

    def test_history_excludes_other_branches(self):
        ledger = ImprovementLedger()
        ledger.record("a", 1, 0.3, "continue")
        ledger.record("b", 1, 0.5, "continue")
        assert len(ledger.history("a")) == 1
        assert len(ledger.history("b")) == 1

    def test_to_dicts_serialization(self):
        ledger = ImprovementLedger()
        ledger.record("b", 1, 0.5, "continue")
        dicts = ledger.to_dicts()
        assert len(dicts) == 1
        assert dicts[0]["branch_id"] == "b"
        assert dicts[0]["score"] == 0.5

    def test_record_with_metadata(self):
        ledger = ImprovementLedger()
        entry = ledger.record("b", 1, 0.5, "continue", metadata={"key": "val"})
        assert entry.metadata == {"key": "val"}

    def test_decision_reason_recorded(self):
        ledger = ImprovementLedger()
        entry = ledger.record("b", 1, 0.5, "continue", decision_reason="first run")
        assert entry.decision_reason == "first run"


class TestEnums:
    def test_branch_ids(self):
        assert BranchId.SOURCE_INTAKE.value == "source_intake"
        assert BranchId.TTS_GENERATION.value == "tts_generation"

    def test_scheduler_decisions(self):
        assert SchedulerDecision.CONTINUE.value == "continue"
        assert SchedulerDecision.TERMINATE_BRANCH.value == "terminate_branch"
        assert SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP.value == "reroute_to_speech_script_prep"
