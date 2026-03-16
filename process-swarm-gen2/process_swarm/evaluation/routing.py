"""Provider routing policy and selector.

Implements explicit, policy-driven provider selection for ACDS evaluation.
Every routing decision is inspectable and logged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from process_swarm.acds_client import CognitiveGrade, TaskType


# Ordered list of cognitive grades from lowest to highest.
# Used for minimum-grade comparisons in policy evaluation.
_GRADE_ORDER = [
    CognitiveGrade.BASIC.value,
    CognitiveGrade.STANDARD.value,
    CognitiveGrade.ENHANCED.value,
    CognitiveGrade.FRONTIER.value,
    CognitiveGrade.SPECIALIZED.value,
]


def _grade_index(grade: str) -> int:
    """Return ordinal index for a cognitive grade string."""
    try:
        return _GRADE_ORDER.index(grade)
    except ValueError:
        return -1


@dataclass
class RoutingDecision:
    """Result of a provider selection decision.

    Attributes:
        provider_id:     Which provider was selected ("acds" or "baseline").
        routed:          True if the task was routed to ACDS.
        reason:          Human-readable explanation for the decision.
        task_type:       The task type that was evaluated.
        cognitive_grade: The cognitive grade that was evaluated.
    """
    provider_id: str
    routed: bool
    reason: str
    task_type: str
    cognitive_grade: str


@dataclass
class ProviderPolicy:
    """Defines which tasks qualify for ACDS routing.

    Attributes:
        acds_qualified_task_types: Set of TaskType values that may be sent
            to ACDS.  Tasks not in this set route to the baseline provider.
        acds_min_cognitive_grade: Minimum cognitive grade required for ACDS
            routing.  Tasks below this grade route to baseline even if the
            task type qualifies.
    """
    acds_qualified_task_types: set[str] = field(default_factory=set)
    acds_min_cognitive_grade: str = CognitiveGrade.STANDARD.value

    @classmethod
    def default(cls) -> ProviderPolicy:
        """Return the default ACDS routing policy.

        Default qualified task types:
        - retrieval_synthesis  (complex multi-source synthesis)
        - analytical           (analytical reasoning)
        - creative             (creative generation)
        - summarization        (summarization tasks)
        - reasoning            (reasoning tasks)
        - decision_support     (decision support)

        Default excluded task types:
        - coding               (handled by specialized code models)
        - classification       (lightweight, rules-based is sufficient)
        - extraction           (lightweight, rules-based is sufficient)
        - transformation       (deterministic transformations)
        - critique             (handled locally)
        - planning             (handled locally)
        - generation           (generic generation, handled locally)
        """
        return cls(
            acds_qualified_task_types={
                TaskType.RETRIEVAL_SYNTHESIS.value,
                TaskType.ANALYTICAL.value,
                TaskType.CREATIVE.value,
                TaskType.SUMMARIZATION.value,
                TaskType.REASONING.value,
                TaskType.DECISION_SUPPORT.value,
            },
            acds_min_cognitive_grade=CognitiveGrade.STANDARD.value,
        )


class ProviderSelector:
    """Selects a provider based on policy.

    Every call to select() produces an inspectable RoutingDecision and
    optionally records a provider event in the ledger.
    """

    def __init__(
        self,
        policy: ProviderPolicy,
        ledger: Optional[object] = None,
    ):
        self._policy = policy
        self._ledger = ledger

    def select(
        self,
        task_type: str,
        cognitive_grade: str,
        *,
        task_id: str = "",
        workflow_id: str = "",
    ) -> RoutingDecision:
        """Select a provider for the given task.

        Returns a RoutingDecision indicating which provider was chosen
        and why.  If a ledger is attached, records a provider_selected event.
        """
        decision = self._evaluate(task_type, cognitive_grade)

        if self._ledger is not None:
            self._ledger.record_provider_selected(
                provider_id=decision.provider_id,
                task_type=decision.task_type,
                cognitive_grade=decision.cognitive_grade,
                reason=decision.reason,
                routed=decision.routed,
                task_id=task_id,
                workflow_id=workflow_id,
            )

        return decision

    def _evaluate(self, task_type: str, cognitive_grade: str) -> RoutingDecision:
        """Core policy evaluation logic."""
        # Check task type qualification
        if task_type not in self._policy.acds_qualified_task_types:
            return RoutingDecision(
                provider_id="baseline",
                routed=False,
                reason=f"Task type '{task_type}' not qualified for ACDS — excluded by policy",
                task_type=task_type,
                cognitive_grade=cognitive_grade,
            )

        # Check cognitive grade minimum
        min_idx = _grade_index(self._policy.acds_min_cognitive_grade)
        actual_idx = _grade_index(cognitive_grade)
        if actual_idx < min_idx:
            return RoutingDecision(
                provider_id="baseline",
                routed=False,
                reason=(
                    f"Cognitive grade '{cognitive_grade}' below minimum "
                    f"'{self._policy.acds_min_cognitive_grade}' for ACDS"
                ),
                task_type=task_type,
                cognitive_grade=cognitive_grade,
            )

        # Qualified — route to ACDS
        return RoutingDecision(
            provider_id="acds",
            routed=True,
            reason=(
                f"Task type '{task_type}' qualified for ACDS at grade "
                f"'{cognitive_grade}'"
            ),
            task_type=task_type,
            cognitive_grade=cognitive_grade,
        )
