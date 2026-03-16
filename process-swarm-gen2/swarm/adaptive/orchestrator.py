"""Adaptive cycle loop wrapping SwarmRunner with improvement-driven scheduling."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from swarm.adaptive.adaptive_scheduler import AdaptiveScheduler
from swarm.adaptive.branch_evaluator import BranchEvaluator
from swarm.adaptive.improvement_ledger import (
    ImprovementLedger,
    SchedulerDecision,
)

logger = logging.getLogger(__name__)


@dataclass
class BranchConfig:
    branch_id: str
    actions: list[dict]
    active: bool = True


@dataclass
class AdaptiveResult:
    success: bool
    artifacts: list[str] = field(default_factory=list)
    total_cycles: int = 0
    decisions_log: list[dict] = field(default_factory=list)
    final_validation: dict = field(default_factory=dict)

    @property
    def ledger_dicts(self) -> list[dict]:
        return self.final_validation.get("ledger", [])


class AdaptiveOrchestrator:
    """Improvement-driven cycle loop over swarm branches."""

    def __init__(
        self,
        runner: Any,
        *,
        max_cycles: int = 5,
        stagnation_threshold: float = 0.03,
        stagnation_consecutive: int = 2,
        completion_target: float = 0.75,
    ):
        self.runner = runner
        self._max_cycles = max_cycles
        self._completion_target = completion_target
        self.ledger = ImprovementLedger(stagnation_threshold=stagnation_threshold)
        self.evaluator = BranchEvaluator()
        self.scheduler = AdaptiveScheduler(
            stagnation_threshold=stagnation_threshold,
            stagnation_consecutive=stagnation_consecutive,
            max_cycles=max_cycles,
            completion_target=completion_target,
        )

    def run_adaptive(
        self,
        swarm_id: str,
        run_id: str,
        branch_configs: list[BranchConfig],
        *,
        workspace_root: Path | None = None,
    ) -> AdaptiveResult:
        all_artifacts: list[str] = []
        all_decisions: list[dict] = []
        final_cycle = 0

        for cycle in range(1, self._max_cycles + 1):
            final_cycle = cycle
            active = [b for b in branch_configs if b.active]
            if not active:
                break

            cycle_decisions: dict[str, dict] = {}

            for branch in active:
                # Execute
                result = self._execute_branch(
                    run_id, swarm_id, branch.branch_id, branch.actions
                )
                adapter_results = result.get("adapter_results", {})
                branch_artifacts = result.get("artifacts", [])
                all_artifacts.extend(branch_artifacts)

                # Score
                score = self.evaluator.evaluate(branch.branch_id, adapter_results)

                # Record with placeholder decision
                self.ledger.record(
                    branch_id=branch.branch_id,
                    cycle=cycle,
                    score=score.score,
                    decision="pending",
                    metadata={
                        "components": score.components,
                        "execution_status": result.get("execution_status"),
                    },
                )

                # Decide
                decision, reason = self.scheduler.decide(
                    self.ledger, branch.branch_id, cycle
                )

                # Update entry with actual decision
                entry = self.ledger.latest(branch.branch_id)
                if entry:
                    entry.decision = decision.value
                    entry.decision_reason = reason

                cycle_decisions[branch.branch_id] = {
                    "decision": decision.value,
                    "reason": reason,
                    "score": score.score,
                    "components": score.components,
                }

            # Apply decisions
            for branch in branch_configs:
                info = cycle_decisions.get(branch.branch_id)
                if not info:
                    continue
                dec = info["decision"]
                if dec == SchedulerDecision.TERMINATE_BRANCH.value:
                    branch.active = False
                elif dec == SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP.value:
                    branch.active = False
                    self._inject_speech_script_prep(branch_configs)

            # Record cycle event
            self._record_cycle_event(swarm_id, run_id, cycle, cycle_decisions)
            all_decisions.append({"cycle": cycle, "branches": cycle_decisions})

            # Check convergence
            if self._all_converged_or_terminated(branch_configs):
                break

        final_validation = self._build_final_validation(
            swarm_id, run_id, all_artifacts
        )
        if workspace_root:
            self._persist_validation(final_validation, workspace_root)

        return AdaptiveResult(
            success=True,
            artifacts=all_artifacts,
            total_cycles=final_cycle,
            decisions_log=all_decisions,
            final_validation=final_validation,
        )

    def _execute_branch(
        self,
        run_id: str,
        swarm_id: str,
        branch_id: str,
        actions: list[dict],
    ) -> dict:
        try:
            if hasattr(self.runner, "_execute_via_adapters"):
                return self.runner._execute_via_adapters(
                    run_id, swarm_id, actions
                )
            return {
                "execution_status": "skipped",
                "adapter_results": {},
                "artifacts": [],
            }
        except Exception as e:
            logger.warning("Branch %s execution failed: %s", branch_id, e)
            return {
                "execution_status": "failed",
                "adapter_results": {},
                "artifacts": [],
                "error": str(e),
            }

    def _inject_speech_script_prep(self, branch_configs: list[BranchConfig]) -> None:
        for bc in branch_configs:
            if bc.branch_id == "speech_script_prep":
                bc.active = True
                return
        branch_configs.append(
            BranchConfig(branch_id="speech_script_prep", actions=[], active=True)
        )

    def _record_cycle_event(
        self,
        swarm_id: str,
        run_id: str,
        cycle: int,
        decisions: dict,
    ) -> None:
        if hasattr(self.runner, "events"):
            try:
                self.runner.events.record(
                    swarm_id,
                    "adaptive_cycle_completed",
                    "system",
                    f"Cycle {cycle} completed",
                    details={"cycle": cycle, "decisions": decisions},
                )
            except Exception:
                pass

    def _all_converged_or_terminated(self, branch_configs: list[BranchConfig]) -> bool:
        for bc in branch_configs:
            if not bc.active:
                continue
            entry = self.ledger.latest(bc.branch_id)
            if entry and entry.score < self._completion_target:
                return False
        return True

    def _build_final_validation(
        self,
        swarm_id: str,
        run_id: str,
        artifacts: list[str],
    ) -> dict:
        final_scores: dict[str, float] = {}
        reroutes: list[str] = []
        for entry in self.ledger.to_dicts():
            final_scores[entry["branch_id"]] = entry["score"]
            if entry["decision"] == SchedulerDecision.REROUTE_TO_SPEECH_SCRIPT_PREP.value:
                reroutes.append(entry["branch_id"])

        return {
            "swarm_id": swarm_id,
            "run_id": run_id,
            "final_scores": final_scores,
            "reroutes_triggered": reroutes,
            "artifact_count": len(artifacts),
            "ledger": self.ledger.to_dicts(),
        }

    def _persist_validation(self, validation: dict, workspace_root: Path) -> None:
        output_dir = workspace_root / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / "adaptive_validation.json"
        path.write_text(json.dumps(validation, indent=2))
