"""Append-only ledger for per-branch quality signals across adaptive cycles."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum


class BranchId(str, Enum):
    SOURCE_INTAKE = "source_intake"
    BRIEFING_SYNTHESIS = "briefing_synthesis"
    BRIEFING_REFINEMENT = "briefing_refinement"
    SPEECH_SCRIPT_PREP = "speech_script_prep"
    TTS_GENERATION = "tts_generation"
    ARTIFACT_VALIDATION = "artifact_validation"


class SchedulerDecision(str, Enum):
    CONTINUE = "continue"
    INCREASE_BUDGET = "increase_budget"
    DEPRIORITIZE = "deprioritize"
    TERMINATE_BRANCH = "terminate_branch"
    REROUTE_TO_SPEECH_SCRIPT_PREP = "reroute_to_speech_script_prep"


@dataclass
class LedgerEntry:
    branch_id: str
    cycle: int
    score: float
    delta: float
    stagnation_count: int
    decision: str
    decision_reason: str = ""
    metadata: dict = field(default_factory=dict)


class ImprovementLedger:
    """Tracks per-branch quality signals across adaptive cycles."""

    def __init__(self, *, stagnation_threshold: float = 0.03):
        self._threshold = stagnation_threshold
        self._entries: list[LedgerEntry] = []

    def record(
        self,
        branch_id: str,
        cycle: int,
        score: float,
        decision: str,
        decision_reason: str = "",
        metadata: dict | None = None,
    ) -> LedgerEntry:
        prev = self.latest(branch_id)
        if prev is None:
            delta = 0.0
            stagnation_count = 0
        else:
            delta = score - prev.score
            if abs(delta) < self._threshold:
                stagnation_count = prev.stagnation_count + 1
            else:
                stagnation_count = 0

        entry = LedgerEntry(
            branch_id=branch_id,
            cycle=cycle,
            score=score,
            delta=delta,
            stagnation_count=stagnation_count,
            decision=decision,
            decision_reason=decision_reason,
            metadata=metadata or {},
        )
        self._entries.append(entry)
        return entry

    def latest(self, branch_id: str) -> LedgerEntry | None:
        for entry in reversed(self._entries):
            if entry.branch_id == branch_id:
                return entry
        return None

    def history(self, branch_id: str) -> list[LedgerEntry]:
        return [e for e in self._entries if e.branch_id == branch_id]

    def is_stagnant(self, branch_id: str, *, consecutive: int = 2) -> bool:
        entry = self.latest(branch_id)
        if entry is None:
            return False
        return entry.stagnation_count >= consecutive

    def to_dicts(self) -> list[dict]:
        return [asdict(e) for e in self._entries]
