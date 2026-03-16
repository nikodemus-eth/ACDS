"""Evaluation runner for ACDS acceptance testing.

Orchestrates the complete evaluation workflow: route → invoke →
validate → score → compare.  Produces replayable EvaluationRun
artifacts and supports aggregation for trend analysis.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from process_swarm.evaluation.comparative import ComparativeEvaluator, ComparisonReport
from process_swarm.evaluation.ledger import ProviderEventLedger
from process_swarm.evaluation.routing import ProviderPolicy, ProviderSelector, RoutingDecision
from process_swarm.evaluation.runtime import (
    FallbackOrchestrator,
    ProviderInvocationResult,
    ProviderRuntime,
)
from process_swarm.evaluation.scoring import QualityScorer, ScoreResult
from process_swarm.evaluation.validation import AcceptanceGate, ValidationResult


@dataclass
class EvaluationRun:
    """A self-contained, serializable evaluation run.

    Captures every artifact from the evaluation workflow:
    routing decision, invocation result, validation result,
    quality scores, and optional comparison report.
    """
    run_id: str
    task_description: str
    task_type: str
    cognitive_grade: str
    routing_decision: RoutingDecision
    invocation_result: ProviderInvocationResult
    validation_result: ValidationResult
    quality_scores: ScoreResult
    comparison_report: Optional[ComparisonReport] = None

    def to_dict(self) -> dict:
        d = {
            "run_id": self.run_id,
            "task_description": self.task_description,
            "task_type": self.task_type,
            "cognitive_grade": self.cognitive_grade,
            "routing_decision": {
                "provider_id": self.routing_decision.provider_id,
                "routed": self.routing_decision.routed,
                "reason": self.routing_decision.reason,
                "task_type": self.routing_decision.task_type,
                "cognitive_grade": self.routing_decision.cognitive_grade,
            },
            "invocation_result": {
                "success": self.invocation_result.success,
                "provider_id": self.invocation_result.provider_id,
                "task_id": self.invocation_result.task_id,
                "error_type": self.invocation_result.error_type,
                "provider_output": self.invocation_result.provider_output,
                "fallback_used": self.invocation_result.fallback_used,
            },
            "validation_result": {
                "passed": self.validation_result.passed,
                "errors": self.validation_result.errors,
            },
            "quality_scores": self.quality_scores.to_dict(),
        }
        if self.comparison_report is not None:
            d["comparison_report"] = self.comparison_report.to_dict()
        return d


class EvaluationRunner:
    """Orchestrates the complete evaluation workflow."""

    def __init__(self) -> None:
        self._ledger = ProviderEventLedger()
        self._policy = ProviderPolicy.default()
        self._selector = ProviderSelector(self._policy, ledger=self._ledger)
        self._runtime = ProviderRuntime(ledger=self._ledger)
        self._gate = AcceptanceGate(ledger=self._ledger)
        self._scorer = QualityScorer()
        self._comparator = ComparativeEvaluator()

    @property
    def ledger(self) -> ProviderEventLedger:
        return self._ledger

    def execute(
        self,
        task_description: str,
        task_type: str,
        cognitive_grade: str,
        *,
        include_comparison: bool = False,
        ground_truth: Optional[str] = None,
    ) -> EvaluationRun:
        """Execute a complete evaluation run."""
        run_id = str(uuid.uuid4())
        task_id = f"eval-{run_id[:8]}"

        # 1. Route
        decision = self._selector.select(
            task_type=task_type,
            cognitive_grade=cognitive_grade,
            task_id=task_id,
        )

        # 2. Invoke
        invocation = self._runtime.invoke(
            provider_id=decision.provider_id,
            task_id=task_id,
        )

        # 3. Validate
        provider_event_id = ""
        invoked_events = self._ledger.get_events(
            event_type="provider_invoked", task_id=task_id,
        )
        if invoked_events:
            provider_event_id = invoked_events[-1]["event_id"]

        validation = self._gate.evaluate(
            provider_output=invocation.provider_output,
            provider_event_id=provider_event_id,
            task_id=task_id,
        )

        # 4. Score
        output_text = ""
        if invocation.provider_output:
            output_text = invocation.provider_output.get("normalizedOutput", "")

        scores = self._scorer.score(
            output_text=output_text,
            task_description=task_description,
            ground_truth=ground_truth,
        )

        # 5. Compare (optional)
        comparison = None
        if include_comparison:
            # Get baseline output for comparison
            baseline_invocation = self._runtime.invoke(
                provider_id="baseline",
                task_id=f"{task_id}-baseline",
            )
            baseline_text = ""
            if baseline_invocation.provider_output:
                baseline_text = baseline_invocation.provider_output.get(
                    "normalizedOutput", "",
                )

            comparison = self._comparator.compare(
                task_description=task_description,
                task_type=task_type,
                acds_output=output_text,
                baseline_output=baseline_text,
                ground_truth=ground_truth,
            )

        return EvaluationRun(
            run_id=run_id,
            task_description=task_description,
            task_type=task_type,
            cognitive_grade=cognitive_grade,
            routing_decision=decision,
            invocation_result=invocation,
            validation_result=validation,
            quality_scores=scores,
            comparison_report=comparison,
        )

    def replay(self, run_dict: dict) -> EvaluationRun:
        """Replay a serialized run, re-scoring from captured output.

        Produces a new run with a new run_id but identical scores
        (since the same output text is scored with the same scorer).
        """
        new_run_id = str(uuid.uuid4())

        rd = run_dict["routing_decision"]
        routing_decision = RoutingDecision(
            provider_id=rd["provider_id"],
            routed=rd["routed"],
            reason=rd["reason"],
            task_type=rd["task_type"],
            cognitive_grade=rd["cognitive_grade"],
        )

        ir = run_dict["invocation_result"]
        invocation_result = ProviderInvocationResult(
            success=ir["success"],
            provider_id=ir["provider_id"],
            task_id=ir["task_id"],
            error_type=ir.get("error_type"),
            provider_output=ir.get("provider_output"),
            fallback_used=ir.get("fallback_used", False),
        )

        vr = run_dict["validation_result"]
        validation_result = ValidationResult(
            passed=vr["passed"],
            errors=vr.get("errors", []),
        )

        # Re-score from captured output
        output_text = ""
        if ir.get("provider_output"):
            output_text = ir["provider_output"].get("normalizedOutput", "")

        scores = self._scorer.score(
            output_text=output_text,
            task_description=run_dict["task_description"],
        )

        return EvaluationRun(
            run_id=new_run_id,
            task_description=run_dict["task_description"],
            task_type=run_dict["task_type"],
            cognitive_grade=run_dict["cognitive_grade"],
            routing_decision=routing_decision,
            invocation_result=invocation_result,
            validation_result=validation_result,
            quality_scores=scores,
        )


def aggregate_runs(runs: list[EvaluationRun]) -> dict:
    """Aggregate multiple evaluation runs into a summary.

    Returns a dict with:
    - run_count: number of runs
    - mean_composite: average composite quality score
    - provider_counts: dict mapping provider_id to count
    - validation_pass_rate: fraction of runs that passed validation
    """
    if not runs:
        return {
            "run_count": 0,
            "mean_composite": 0.0,
            "provider_counts": {},
            "validation_pass_rate": 0.0,
        }

    composites = [r.quality_scores.composite for r in runs]
    provider_counts: dict[str, int] = {}
    passed_count = 0

    for r in runs:
        pid = r.routing_decision.provider_id
        provider_counts[pid] = provider_counts.get(pid, 0) + 1
        if r.validation_result.passed:
            passed_count += 1

    return {
        "run_count": len(runs),
        "mean_composite": sum(composites) / len(composites),
        "provider_counts": provider_counts,
        "validation_pass_rate": passed_count / len(runs),
    }
