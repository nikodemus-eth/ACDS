"""Comparative evaluation for ACDS vs baseline providers.

Runs the same task through both providers' scoring pipelines and
produces a structured comparison report with per-dimension deltas.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from process_swarm.evaluation.scoring import QualityScorer, ScoreResult


@dataclass
class ComparisonReport:
    """Result of comparing ACDS and baseline provider outputs.

    Attributes:
        acds_scores:     ScoreResult for the ACDS output.
        baseline_scores: ScoreResult for the baseline output.
        deltas:          Per-dimension score differences (acds - baseline).
        winner:          "acds", "baseline", or "tie".
        task_type:       The task type that was evaluated.
    """
    acds_scores: ScoreResult
    baseline_scores: ScoreResult
    deltas: dict[str, float]
    winner: str
    task_type: str

    def to_dict(self) -> dict:
        return {
            "acds_scores": self.acds_scores.to_dict(),
            "baseline_scores": self.baseline_scores.to_dict(),
            "deltas": self.deltas,
            "winner": self.winner,
            "task_type": self.task_type,
        }


class ComparativeEvaluator:
    """Evaluates the same task through both ACDS and baseline scoring."""

    def __init__(self) -> None:
        self._scorer = QualityScorer()

    def compare(
        self,
        task_description: str,
        task_type: str,
        acds_output: str,
        baseline_output: str,
        *,
        ground_truth: Optional[str] = None,
        source_keywords: Optional[list[str]] = None,
        constraints_met: Optional[bool] = None,
    ) -> ComparisonReport:
        """Compare ACDS and baseline outputs for the same task."""
        score_kwargs = {
            "task_description": task_description,
            "ground_truth": ground_truth,
            "source_keywords": source_keywords,
            "constraints_met": constraints_met,
        }

        acds_scores = self._scorer.score(
            output_text=acds_output, **score_kwargs,
        )
        baseline_scores = self._scorer.score(
            output_text=baseline_output, **score_kwargs,
        )

        dimensions = [
            "accuracy", "relevance", "coherence",
            "constraint_adherence", "source_fidelity",
        ]
        deltas = {}
        for dim in dimensions:
            deltas[dim] = getattr(acds_scores, dim) - getattr(baseline_scores, dim)
        deltas["composite"] = acds_scores.composite - baseline_scores.composite

        if acds_scores.composite > baseline_scores.composite:
            winner = "acds"
        elif baseline_scores.composite > acds_scores.composite:
            winner = "baseline"
        else:
            winner = "tie"

        return ComparisonReport(
            acds_scores=acds_scores,
            baseline_scores=baseline_scores,
            deltas=deltas,
            winner=winner,
            task_type=task_type,
        )
