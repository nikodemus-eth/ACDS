"""Tests for AdaptiveScheduler."""
from __future__ import annotations

import pytest

from swarm.adaptive.adaptive_scheduler import AdaptiveScheduler
from swarm.adaptive.improvement_ledger import (
    BranchId,
    ImprovementLedger,
    SchedulerDecision,
)


def _build_ledger(*, stagnation_threshold: float = 0.03) -> ImprovementLedger:
    return ImprovementLedger(stagnation_threshold=stagnation_threshold)


@pytest.fixture
def scheduler():
    return AdaptiveScheduler()


class TestAdaptiveScheduler:
    def test_no_history_returns_continue(self, scheduler):
        ledger = _build_ledger()
        decision, reason = scheduler.decide(ledger, "branch_a", 1)
        assert decision == SchedulerDecision.CONTINUE

    def test_score_above_target_continues(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.80, "continue")
        decision, _ = scheduler.decide(ledger, "b", 2)
        assert decision == SchedulerDecision.CONTINUE

    def test_max_cycles_terminates(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.3, "continue")
        decision, _ = scheduler.decide(ledger, "b", 5)
        assert decision == SchedulerDecision.TERMINATE_BRANCH

    def test_tts_stagnant_written_improving_reroutes(self, scheduler):
        ledger = _build_ledger()
        tts = BranchId.TTS_GENERATION.value
        written = BranchId.BRIEFING_SYNTHESIS.value

        # TTS stagnates for 2 cycles
        ledger.record(tts, 1, 0.3, "continue")
        ledger.record(tts, 2, 0.31, "continue")  # delta=0.01, stagnation=1
        ledger.record(tts, 3, 0.32, "continue")  # delta=0.01, stagnation=2

        # Written branch is improving
        ledger.record(written, 1, 0.4, "continue")
        ledger.record(written, 2, 0.5, "continue")  # delta=0.1 > 0.03

        decision, _ = scheduler.decide(ledger, tts, 3)
        assert decision == SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP

    def test_no_reroute_when_written_also_stagnant(self, scheduler):
        ledger = _build_ledger()
        tts = BranchId.TTS_GENERATION.value
        written = BranchId.BRIEFING_SYNTHESIS.value

        ledger.record(tts, 1, 0.3, "continue")
        ledger.record(tts, 2, 0.31, "continue")
        ledger.record(tts, 3, 0.32, "continue")

        # Written also stagnant
        ledger.record(written, 1, 0.5, "continue")
        ledger.record(written, 2, 0.51, "continue")  # delta=0.01 < 0.03

        decision, _ = scheduler.decide(ledger, tts, 3)
        assert decision != SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP

    def test_stagnant_low_score_terminates(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.2, "continue")
        ledger.record("b", 2, 0.21, "continue")
        ledger.record("b", 3, 0.22, "continue")
        decision, _ = scheduler.decide(ledger, "b", 3)
        assert decision == SchedulerDecision.TERMINATE_BRANCH

    def test_stagnant_medium_score_deprioritizes(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.5, "continue")
        ledger.record("b", 2, 0.51, "continue")
        ledger.record("b", 3, 0.52, "continue")
        decision, _ = scheduler.decide(ledger, "b", 3)
        assert decision == SchedulerDecision.DEPRIORITIZE

    def test_improving_but_low_increases_budget(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.2, "continue")
        ledger.record("b", 2, 0.35, "continue")  # delta=0.15, score < 0.5
        decision, _ = scheduler.decide(ledger, "b", 2)
        assert decision == SchedulerDecision.INCREASE_BUDGET

    def test_default_continue(self, scheduler):
        ledger = _build_ledger()
        ledger.record("b", 1, 0.5, "continue")
        ledger.record("b", 2, 0.55, "continue")  # improving, score >= 0.5
        decision, _ = scheduler.decide(ledger, "b", 2)
        assert decision == SchedulerDecision.CONTINUE

    def test_plan_next_cycle_all_branches(self, scheduler):
        ledger = _build_ledger()
        ledger.record("a", 1, 0.5, "continue")
        ledger.record("b", 1, 0.3, "continue")
        plan = scheduler.plan_next_cycle(ledger, ["a", "b"], 2)
        assert "a" in plan
        assert "b" in plan

    def test_should_reroute_tts_convenience(self, scheduler):
        ledger = _build_ledger()
        tts = BranchId.TTS_GENERATION.value
        written = BranchId.BRIEFING_SYNTHESIS.value
        ledger.record(tts, 1, 0.3, "continue")
        ledger.record(tts, 2, 0.31, "continue")
        ledger.record(tts, 3, 0.32, "continue")
        ledger.record(written, 1, 0.4, "continue")
        ledger.record(written, 2, 0.5, "continue")
        assert scheduler.should_reroute_tts(ledger) is True

    def test_should_reroute_tts_false_when_not_stagnant(self, scheduler):
        ledger = _build_ledger()
        tts = BranchId.TTS_GENERATION.value
        ledger.record(tts, 1, 0.3, "continue")
        ledger.record(tts, 2, 0.5, "continue")  # big delta, not stagnant
        assert scheduler.should_reroute_tts(ledger) is False

    def test_non_tts_branch_never_reroutes(self, scheduler):
        ledger = _build_ledger()
        written = BranchId.BRIEFING_SYNTHESIS.value
        ledger.record(written, 1, 0.3, "continue")
        ledger.record(written, 2, 0.31, "continue")
        ledger.record(written, 3, 0.32, "continue")
        decision, _ = scheduler.decide(ledger, written, 3)
        assert decision != SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP
