"""Rule-based adaptive scheduling — explicit, configurable, auditable."""
from __future__ import annotations

from swarm.adaptive.improvement_ledger import (
    BranchId,
    ImprovementLedger,
    SchedulerDecision,
)


class AdaptiveScheduler:
    """Makes scheduling decisions based on improvement ledger state."""

    def __init__(
        self,
        *,
        stagnation_threshold: float = 0.03,
        stagnation_consecutive: int = 2,
        max_cycles: int = 5,
        completion_target: float = 0.75,
        low_score_terminate: float = 0.4,
        low_score_budget: float = 0.5,
    ):
        self._stagnation_threshold = stagnation_threshold
        self._stagnation_consecutive = stagnation_consecutive
        self._max_cycles = max_cycles
        self._completion_target = completion_target
        self._low_score_terminate = low_score_terminate
        self._low_score_budget = low_score_budget

    def decide(
        self,
        ledger: ImprovementLedger,
        branch_id: str,
        cycle: int,
    ) -> tuple[SchedulerDecision, str]:
        entry = ledger.latest(branch_id)
        if entry is None:
            return SchedulerDecision.CONTINUE, "no history — first cycle"

        score = entry.score
        is_stagnant = ledger.is_stagnant(
            branch_id, consecutive=self._stagnation_consecutive
        )

        # Rule 1: Convergence
        if score >= self._completion_target:
            return SchedulerDecision.CONTINUE, f"converged at {score:.2f}"

        # Rule 2: Max cycles
        if cycle >= self._max_cycles:
            return SchedulerDecision.TERMINATE_BRANCH, f"max cycles ({self._max_cycles}) reached"

        # Rule 3: TTS reroute
        if (
            branch_id == BranchId.TTS_GENERATION.value
            and is_stagnant
            and self._written_is_improving(ledger)
        ):
            return (
                SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP,
                "TTS stagnant while written branch improving",
            )

        # Rule 4: Stagnant + low
        if is_stagnant and score < self._low_score_terminate:
            return (
                SchedulerDecision.TERMINATE_BRANCH,
                f"stagnant at low score {score:.2f}",
            )

        # Rule 5: Stagnant + medium
        if is_stagnant:
            return SchedulerDecision.DEPRIORITIZE, f"stagnant at {score:.2f}"

        # Rule 6: Improving + low
        if entry.delta > 0 and score < self._low_score_budget:
            return (
                SchedulerDecision.INCREASE_BUDGET,
                f"improving (delta={entry.delta:.3f}) but low score {score:.2f}",
            )

        # Rule 7: Default
        return SchedulerDecision.CONTINUE, "normal progress"

    def plan_next_cycle(
        self,
        ledger: ImprovementLedger,
        active_branches: list[str],
        cycle: int,
    ) -> dict[str, tuple[SchedulerDecision, str]]:
        return {bid: self.decide(ledger, bid, cycle) for bid in active_branches}

    def should_reroute_tts(self, ledger: ImprovementLedger) -> bool:
        if not ledger.is_stagnant(
            BranchId.TTS_GENERATION.value,
            consecutive=self._stagnation_consecutive,
        ):
            return False
        return self._written_is_improving(ledger)

    def _written_is_improving(self, ledger: ImprovementLedger) -> bool:
        entry = ledger.latest(BranchId.BRIEFING_SYNTHESIS.value)
        if entry is None:
            return False
        return entry.delta > self._stagnation_threshold
