"""Swarm lifecycle state machine.

Enforces governance transitions for swarm definitions.
Only authorized transitions are allowed; all others are rejected.

Lifecycle states (from Governance Model spec):
  drafting → reviewing → approved → enabled → paused → revoked
                       ↘ rejected
                                    enabled → revoked
                                    paused  → enabled
                                    paused  → revoked

Governance artifacts are recorded for each transition.
"""

from __future__ import annotations

from typing import Optional

from swarm.events.recorder import EventRecorder
from swarm.governance.warnings import (
    build_reduced_assurance_event,
    evaluate_reduced_assurance_governance,
    persist_warning_records,
)
from swarm.registry.repository import SwarmRepository

# Valid lifecycle states
LIFECYCLE_STATES = frozenset({
    "drafting",
    "reviewing",
    "approved",
    "rejected",
    "enabled",
    "paused",
    "revoked",
})

# Allowed transitions: {from_state: {to_state, ...}}
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "drafting": {"reviewing", "revoked"},
    "reviewing": {"approved", "rejected", "drafting"},
    "approved": {"enabled", "revoked"},
    "rejected": {"drafting"},
    "enabled": {"paused", "revoked"},
    "paused": {"enabled", "revoked"},
    "revoked": set(),  # terminal state
}

# Required governance roles per transition
TRANSITION_ROLES: dict[tuple[str, str], str] = {
    ("drafting", "reviewing"): "author",
    ("reviewing", "approved"): "reviewer",
    ("reviewing", "rejected"): "reviewer",
    ("reviewing", "drafting"): "reviewer",
    ("approved", "enabled"): "publisher",
    ("approved", "revoked"): "publisher",
    ("rejected", "drafting"): "author",
    ("enabled", "paused"): "publisher",
    ("enabled", "revoked"): "publisher",
    ("paused", "enabled"): "publisher",
    ("paused", "revoked"): "publisher",
    ("drafting", "revoked"): "publisher",
}


class LifecycleManager:
    """Manages swarm lifecycle state transitions with governance enforcement.

    All transitions produce governance artifacts (events) recorded
    in the swarm_events table for auditability.
    """

    def __init__(self, repo: SwarmRepository, events: EventRecorder):
        self.repo = repo
        self.events = events

    def get_allowed_transitions(self, swarm_id: str) -> set[str]:
        """Return the set of states this swarm can transition to."""
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")
        current = swarm["lifecycle_status"]
        return ALLOWED_TRANSITIONS.get(current, set())

    def transition(
        self,
        swarm_id: str,
        to_state: str,
        actor_id: str,
        actor_role: str,
        reason: Optional[str] = None,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Transition a swarm to a new lifecycle state.

        Returns:
            The event_id of the governance event recorded.

        Raises:
            ValueError: If the transition is invalid or unauthorized.
        """
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")

        from_state = swarm["lifecycle_status"]

        # Validate target state
        if to_state not in LIFECYCLE_STATES:
            raise ValueError(f"Invalid lifecycle state: {to_state}")

        # Validate transition
        allowed = ALLOWED_TRANSITIONS.get(from_state, set())
        if to_state not in allowed:
            raise ValueError(
                f"Transition {from_state} → {to_state} is not allowed. "
                f"Allowed: {sorted(allowed)}"
            )

        # Validate role
        required_role = TRANSITION_ROLES.get((from_state, to_state))
        if required_role and actor_role != required_role:
            raise ValueError(
                f"Transition {from_state} → {to_state} requires role "
                f"'{required_role}', got '{actor_role}'"
            )

        warnings = self._evaluate_transition_warnings(
            swarm_id=swarm_id,
            actor_id=actor_id,
            actor_role=actor_role,
            to_state=to_state,
        )
        current_warns = [w for w in warnings if w["severity"] == "warn"]
        current_blocks = [w for w in warnings if w["severity"] == "block"]
        if current_blocks:
            persist_warning_records(
                self.repo,
                self.events,
                current_blocks,
                operator_decision="blocked_by_system",
            )
            raise ValueError(
                "Governance transition blocked by governance warning policy"
            )
        if current_warns:
            warning_ids = warning_ids or []
            provided_fingerprints = set()
            for warning_id in warning_ids:
                record = self.repo.get_governance_warning_record(warning_id)
                if record:
                    provided_fingerprints.add(record["decision_fingerprint"])
            missing = [
                warning for warning in current_warns
                if warning["decision_fingerprint"] not in provided_fingerprints
            ]
            if missing:
                persist_warning_records(
                    self.repo,
                    self.events,
                    missing,
                    operator_decision="deferred",
                )
                raise ValueError(
                    "Explicit governance warning acknowledgment is required before this transition"
                )
            persisted = persist_warning_records(
                self.repo,
                self.events,
                current_warns,
                operator_decision="acknowledged_and_proceeded",
                override_reason_category=override_reason_category,
                override_reason=override_reason,
                acknowledged=True,
            )
            for persisted_warning in persisted:
                if persisted_warning["warning_family"] != "reduced_assurance_governance":
                    continue
                event = build_reduced_assurance_event(
                    warning=persisted_warning,
                    governance_action_type=_to_governance_action_type(to_state),
                    affected_artifact_refs=[swarm_id],
                    actor_id=actor_id,
                    actor_role=actor_role,
                    reason_summary=(
                        f"Reduced-assurance governance accepted for "
                        f"{from_state} -> {to_state}"
                    ),
                    warning_record_ref=persisted_warning["warning_id"],
                    acknowledged_by=actor_id,
                    acknowledged_at=persisted_warning.get("acknowledged_at"),
                    normal_expected_governance=(
                        "Distinct operators perform sequential governance roles."
                    ),
                    actual_governance_path=(
                        f"Actor {actor_id} is acting as {actor_role} after "
                        f"previously holding {sorted(self.repo.get_actor_roles_for_swarm(swarm_id, actor_id))}."
                    ),
                    swarm_id=swarm_id,
                )
                event_id = self.repo.create_reduced_assurance_governance_event(event)
                self.events.reduced_assurance_governance_recorded(
                    swarm_id,
                    event_id,
                    actor_id,
                    event["reduction_type"],
                )

        # Perform transition
        self.repo.update_swarm(swarm_id, lifecycle_status=to_state)

        # Map transition to governance event type
        event_type = _transition_event_type(from_state, to_state)

        # Record governance event
        details = {
            "from_state": from_state,
            "to_state": to_state,
            "actor_role": actor_role,
        }
        if reason:
            details["reason"] = reason

        event_id = self.events.record(
            swarm_id=swarm_id,
            event_type=event_type,
            actor_id=actor_id,
            summary=f"Swarm {swarm_id}: {from_state} → {to_state}",
            details=details,
            related_entity_type="swarm",
            related_entity_id=swarm_id,
        )

        return event_id

    def submit_for_review(self, swarm_id: str, actor_id: str) -> str:
        """Submit a draft swarm for review."""
        return self.transition(swarm_id, "reviewing", actor_id, "author")

    def approve(
        self,
        swarm_id: str,
        actor_id: str,
        reason: Optional[str] = None,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Approve a swarm under review."""
        return self.transition(
            swarm_id,
            "approved",
            actor_id,
            "reviewer",
            reason,
            warning_ids,
            override_reason_category,
            override_reason,
        )

    def reject(
        self, swarm_id: str, actor_id: str, reason: Optional[str] = None
    ) -> str:
        """Reject a swarm under review."""
        return self.transition(
            swarm_id, "rejected", actor_id, "reviewer", reason
        )

    def publish(
        self,
        swarm_id: str,
        actor_id: str,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Activate an approved swarm for execution."""
        return self.transition(
            swarm_id,
            "enabled",
            actor_id,
            "publisher",
            None,
            warning_ids,
            override_reason_category,
            override_reason,
        )

    def pause(
        self,
        swarm_id: str,
        actor_id: str,
        reason: Optional[str] = None,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Pause an enabled swarm."""
        return self.transition(
            swarm_id,
            "paused",
            actor_id,
            "publisher",
            reason,
            warning_ids,
            override_reason_category,
            override_reason,
        )

    def revoke(
        self,
        swarm_id: str,
        actor_id: str,
        reason: Optional[str] = None,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Revoke a swarm permanently."""
        return self.transition(
            swarm_id,
            "revoked",
            actor_id,
            "publisher",
            reason,
            warning_ids,
            override_reason_category,
            override_reason,
        )

    def return_to_draft(self, swarm_id: str, actor_id: str) -> str:
        """Return a rejected swarm to drafting."""
        return self.transition(swarm_id, "drafting", actor_id, "author")

    def _evaluate_transition_warnings(
        self,
        swarm_id: str,
        actor_id: str,
        actor_role: str,
        to_state: str,
    ) -> list[dict]:
        if to_state not in {"approved", "enabled", "paused", "revoked"}:
            return []
        prior_roles = self.repo.get_actor_roles_for_swarm(swarm_id, actor_id)
        warnings = evaluate_reduced_assurance_governance(
            prior_roles=prior_roles,
            current_role=actor_role,
            trigger_stage="governance_transition",
            actor_id=actor_id,
            swarm_id=swarm_id,
            affected_artifact_refs=[swarm_id, f"state->{to_state}"],
        )
        for warning in warnings:
            warning["swarm_id"] = swarm_id
        return warnings


def _transition_event_type(from_state: str, to_state: str) -> str:
    """Map a state transition to its governance event type."""
    event_map = {
        ("drafting", "reviewing"): "swarm_submitted_for_review",
        ("reviewing", "approved"): "swarm_approved",
        ("reviewing", "rejected"): "swarm_rejected",
        ("reviewing", "drafting"): "swarm_returned_to_draft",
        ("approved", "enabled"): "swarm_activated",
        ("rejected", "drafting"): "swarm_returned_to_draft",
        ("enabled", "paused"): "swarm_paused",
        ("enabled", "revoked"): "swarm_revoked",
        ("paused", "enabled"): "swarm_reactivated",
        ("paused", "revoked"): "swarm_revoked",
        ("drafting", "revoked"): "swarm_revoked",
        ("approved", "revoked"): "swarm_revoked",
    }
    return event_map.get(
        (from_state, to_state), f"swarm_transition_{from_state}_to_{to_state}"
    )


def _to_governance_action_type(to_state: str) -> str:
    if to_state == "approved":
        return "plan_approval"
    if to_state == "enabled":
        return "publish_approval"
    return "other"
