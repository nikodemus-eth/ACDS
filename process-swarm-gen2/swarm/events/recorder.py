"""Platform event recorder.

Records lifecycle events for audit and observability
as defined in the Process Swarm System Architecture.

Event types follow the swarm_events schema:
  draft_created, restatement_generated, intent_accepted,
  swarm_created, swarm_enabled, swarm_paused, swarm_disabled,
  schedule_created, schedule_updated, run_queued, run_started,
  run_succeeded, run_failed, delivery_sent, delivery_failed,
  swarm_archived

Pipeline event types (action table generation):
  archetype_classified, constraints_extracted,
  action_skeleton_loaded, action_table_specialized,
  dependencies_assigned, tool_matching_completed,
  action_table_reviewed, action_table_accepted,
  pipeline_completed
"""

from __future__ import annotations

from swarm.registry.repository import SwarmRepository


class EventRecorder:
    """Records platform-level lifecycle events into the swarm_events table.

    Provides convenience methods for common event types,
    ensuring consistent event_type values and summaries.
    """

    def __init__(self, repository: SwarmRepository):
        self.repo = repository

    def record(
        self,
        swarm_id: str,
        event_type: str,
        actor_id: str,
        summary: str,
        details: dict | None = None,
        related_entity_type: str | None = None,
        related_entity_id: str | None = None,
    ) -> str:
        """Record a generic platform event. Returns event_id."""
        return self.repo.record_event(
            swarm_id=swarm_id,
            event_type=event_type,
            actor_id=actor_id,
            summary=summary,
            details=details,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
        )

    # ──────────────────────────────────────────────
    # Intent lifecycle events
    # ──────────────────────────────────────────────

    def draft_created(
        self, swarm_id: str, draft_id: str, actor_id: str
    ) -> str:
        """Record that an intent draft was created."""
        return self.record(
            swarm_id=swarm_id,
            event_type="draft_created",
            actor_id=actor_id,
            summary=f"Intent draft {draft_id} created",
            related_entity_type="intent_draft",
            related_entity_id=draft_id,
        )

    def restatement_generated(
        self, swarm_id: str, restatement_id: str, actor_id: str
    ) -> str:
        """Record that an AI restatement was generated."""
        return self.record(
            swarm_id=swarm_id,
            event_type="restatement_generated",
            actor_id=actor_id,
            summary=f"Restatement {restatement_id} generated",
            related_entity_type="intent_restatement",
            related_entity_id=restatement_id,
        )

    def intent_accepted(
        self, swarm_id: str, acceptance_id: str, actor_id: str
    ) -> str:
        """Record that an intent was explicitly accepted."""
        return self.record(
            swarm_id=swarm_id,
            event_type="intent_accepted",
            actor_id=actor_id,
            summary=f"Intent accepted ({acceptance_id})",
            related_entity_type="intent_acceptance",
            related_entity_id=acceptance_id,
        )

    # ──────────────────────────────────────────────
    # Swarm lifecycle events
    # ──────────────────────────────────────────────

    def swarm_created(self, swarm_id: str, actor_id: str) -> str:
        """Record that a swarm was created."""
        return self.record(
            swarm_id=swarm_id,
            event_type="swarm_created",
            actor_id=actor_id,
            summary=f"Swarm {swarm_id} created",
            related_entity_type="swarm",
            related_entity_id=swarm_id,
        )

    def swarm_enabled(self, swarm_id: str, actor_id: str) -> str:
        """Record that a swarm was enabled."""
        return self.record(
            swarm_id=swarm_id,
            event_type="swarm_enabled",
            actor_id=actor_id,
            summary=f"Swarm {swarm_id} enabled",
        )

    def swarm_paused(self, swarm_id: str, actor_id: str) -> str:
        """Record that a swarm was paused."""
        return self.record(
            swarm_id=swarm_id,
            event_type="swarm_paused",
            actor_id=actor_id,
            summary=f"Swarm {swarm_id} paused",
        )

    # ──────────────────────────────────────────────
    # Run lifecycle events
    # ──────────────────────────────────────────────

    def run_queued(
        self, swarm_id: str, run_id: str, trigger_source: str
    ) -> str:
        """Record that a run was queued."""
        return self.record(
            swarm_id=swarm_id,
            event_type="run_queued",
            actor_id="system",
            summary=f"Run {run_id} queued (trigger: {trigger_source})",
            details={"trigger_source": trigger_source},
            related_entity_type="swarm_run",
            related_entity_id=run_id,
        )

    def run_started(self, swarm_id: str, run_id: str) -> str:
        """Record that a run started execution."""
        return self.record(
            swarm_id=swarm_id,
            event_type="run_started",
            actor_id="system",
            summary=f"Run {run_id} started",
            related_entity_type="swarm_run",
            related_entity_id=run_id,
        )

    def run_completed(
        self, swarm_id: str, run_id: str, status: str
    ) -> str:
        """Record that a run completed (succeeded or failed)."""
        event_type = "run_succeeded" if status == "succeeded" else "run_failed"
        return self.record(
            swarm_id=swarm_id,
            event_type=event_type,
            actor_id="system",
            summary=f"Run {run_id} {status}",
            details={"final_status": status},
            related_entity_type="swarm_run",
            related_entity_id=run_id,
        )

    # ──────────────────────────────────────────────
    # Delivery events
    # ──────────────────────────────────────────────

    def delivery_sent(
        self, swarm_id: str, run_id: str, receipt_id: str
    ) -> str:
        """Record that a delivery was sent."""
        return self.record(
            swarm_id=swarm_id,
            event_type="delivery_sent",
            actor_id="system",
            summary=f"Delivery sent for run {run_id} (receipt: {receipt_id})",
            related_entity_type="delivery_receipt",
            related_entity_id=receipt_id,
        )

    def delivery_failed(
        self, swarm_id: str, run_id: str, error: str
    ) -> str:
        """Record that a delivery failed."""
        return self.record(
            swarm_id=swarm_id,
            event_type="delivery_failed",
            actor_id="system",
            summary=f"Delivery failed for run {run_id}: {error}",
            details={"error": error},
            related_entity_type="swarm_run",
            related_entity_id=run_id,
        )

    def governance_warning_recorded(
        self,
        swarm_id: str,
        warning_id: str,
        warning_family: str,
        severity: str,
        actor_id: str,
        trigger_stage: str,
    ) -> str:
        """Record that a governance warning artifact was emitted."""
        return self.record(
            swarm_id=swarm_id,
            event_type="governance_warning_recorded",
            actor_id=actor_id,
            summary=(
                f"Governance warning {warning_id} recorded "
                f"({warning_family}, {severity})"
            ),
            details={
                "warning_family": warning_family,
                "severity": severity,
                "trigger_stage": trigger_stage,
            },
            related_entity_type="governance_warning_record",
            related_entity_id=warning_id,
        )

    def reduced_assurance_governance_recorded(
        self,
        swarm_id: str,
        event_id: str,
        actor_id: str,
        reduction_type: str,
    ) -> str:
        """Record that a reduced-assurance governance event was emitted."""
        return self.record(
            swarm_id=swarm_id,
            event_type="reduced_assurance_governance_recorded",
            actor_id=actor_id,
            summary=f"Reduced-assurance governance recorded ({reduction_type})",
            details={"reduction_type": reduction_type},
            related_entity_type="reduced_assurance_governance_event",
            related_entity_id=event_id,
        )

    # ──────────────────────────────────────────────
    # Action + capability events
    # ──────────────────────────────────────────────

    def actions_generated(
        self, swarm_id: str, count: int, actor_id: str = "system"
    ) -> str:
        """Record that actions were generated for a swarm."""
        return self.record(
            swarm_id=swarm_id,
            event_type="actions_generated",
            actor_id=actor_id,
            summary=f"{count} actions generated for swarm {swarm_id}",
            details={"action_count": count},
            related_entity_type="swarm",
            related_entity_id=swarm_id,
        )

    def preflight_completed(
        self,
        swarm_id: str,
        total: int,
        supported: int,
        ready: bool,
        actor_id: str = "preflight_engine",
    ) -> str:
        """Record that a capability preflight was completed."""
        return self.record(
            swarm_id=swarm_id,
            event_type="preflight_completed",
            actor_id=actor_id,
            summary=(
                f"Preflight: {supported}/{total} actions supported, "
                f"ready={ready}"
            ),
            details={
                "total_actions": total,
                "supported_actions": supported,
                "ready": ready,
            },
            related_entity_type="swarm",
            related_entity_id=swarm_id,
        )

    def action_updated(
        self,
        swarm_id: str,
        action_id: str,
        changed_fields: list[str],
        actor_id: str = "user",
    ) -> str:
        """Record that a swarm action was edited."""
        return self.record(
            swarm_id=swarm_id,
            event_type="action_updated",
            actor_id=actor_id,
            summary=f"Action {action_id} updated: {', '.join(changed_fields)}",
            details={"changed_fields": changed_fields},
            related_entity_type="swarm_action",
            related_entity_id=action_id,
        )

    def tool_registered(
        self,
        tool_id: str,
        tool_name: str,
        actor_id: str = "system",
    ) -> str:
        """Record that a new tool was registered in the tool registry."""
        return self.record(
            swarm_id="__platform__",
            event_type="tool_registered",
            actor_id=actor_id,
            summary=f"Tool '{tool_name}' registered ({tool_id})",
            details={"tool_id": tool_id, "tool_name": tool_name},
            related_entity_type="tool",
            related_entity_id=tool_id,
        )

    def schedule_config_changed(
        self,
        swarm_id: str,
        schedule_id: str,
        changes: dict,
        actor_id: str = "user",
    ) -> str:
        """Record that a schedule configuration was changed."""
        return self.record(
            swarm_id=swarm_id,
            event_type="schedule_config_changed",
            actor_id=actor_id,
            summary=f"Schedule {schedule_id} config changed",
            details=changes,
            related_entity_type="swarm_schedule",
            related_entity_id=schedule_id,
        )

    def delivery_config_changed(
        self,
        swarm_id: str,
        delivery_id: str,
        changes: dict,
        actor_id: str = "user",
    ) -> str:
        """Record that a delivery configuration was changed."""
        return self.record(
            swarm_id=swarm_id,
            event_type="delivery_config_changed",
            actor_id=actor_id,
            summary=f"Delivery {delivery_id} config changed",
            details=changes,
            related_entity_type="swarm_delivery",
            related_entity_id=delivery_id,
        )

    def execution_preconditions_verified(
        self,
        swarm_id: str,
        run_id: str,
        checks: dict,
    ) -> str:
        """Record that execution preconditions were verified."""
        return self.record(
            swarm_id=swarm_id,
            event_type="execution_preconditions_verified",
            actor_id="system",
            summary=f"Preconditions verified for run {run_id}",
            details=checks,
            related_entity_type="swarm_run",
            related_entity_id=run_id,
        )

    # ──────────────────────────────────────────────
    # Pipeline events (action table generation)
    # ──────────────────────────────────────────────

    def archetype_classified(
        self,
        swarm_id: str,
        archetype: str,
        confidence: float,
        archetype_id: str | None = None,
    ) -> str:
        """Record that a task was classified to an archetype."""
        return self.record(
            swarm_id=swarm_id,
            event_type="archetype_classified",
            actor_id="pipeline",
            summary=(
                f"Classified as {archetype} "
                f"(confidence={confidence:.2f})"
            ),
            details={
                "archetype": archetype,
                "confidence": confidence,
            },
            related_entity_type="intent_archetype",
            related_entity_id=archetype_id,
        )

    def constraints_extracted(
        self,
        swarm_id: str,
        constraint_count: int,
        constraint_set_id: str | None = None,
    ) -> str:
        """Record that constraints were extracted from a task."""
        return self.record(
            swarm_id=swarm_id,
            event_type="constraints_extracted",
            actor_id="pipeline",
            summary=f"{constraint_count} constraints extracted",
            details={"constraint_count": constraint_count},
            related_entity_type="constraint_set",
            related_entity_id=constraint_set_id,
        )

    def action_skeleton_loaded(
        self,
        swarm_id: str,
        template_name: str,
        action_count: int,
    ) -> str:
        """Record that a template skeleton was loaded."""
        return self.record(
            swarm_id=swarm_id,
            event_type="action_skeleton_loaded",
            actor_id="pipeline",
            summary=(
                f"Template '{template_name}' loaded with "
                f"{action_count} base actions"
            ),
            details={
                "template_name": template_name,
                "action_count": action_count,
            },
        )

    def action_table_specialized(
        self,
        swarm_id: str,
        base_count: int,
        specialized_count: int,
    ) -> str:
        """Record that template actions were specialized."""
        return self.record(
            swarm_id=swarm_id,
            event_type="action_table_specialized",
            actor_id="pipeline",
            summary=(
                f"Specialized {base_count} base actions → "
                f"{specialized_count} swarm actions"
            ),
            details={
                "base_count": base_count,
                "specialized_count": specialized_count,
            },
        )

    def dependencies_assigned(
        self,
        swarm_id: str,
        dependency_count: int,
    ) -> str:
        """Record that dependencies were assigned to actions."""
        return self.record(
            swarm_id=swarm_id,
            event_type="dependencies_assigned",
            actor_id="pipeline",
            summary=f"{dependency_count} dependencies assigned",
            details={"dependency_count": dependency_count},
        )

    def tool_matching_completed(
        self,
        swarm_id: str,
        total: int,
        supported: int,
        unsupported: int,
    ) -> str:
        """Record that tool matching completed for all actions."""
        return self.record(
            swarm_id=swarm_id,
            event_type="tool_matching_completed",
            actor_id="pipeline",
            summary=(
                f"Tool matching: {supported}/{total} supported, "
                f"{unsupported} unsupported"
            ),
            details={
                "total": total,
                "supported": supported,
                "unsupported": unsupported,
            },
        )

    def action_table_reviewed(
        self,
        swarm_id: str,
        changes_made: int,
        actor_id: str = "user",
    ) -> str:
        """Record that a user reviewed and edited the action table."""
        return self.record(
            swarm_id=swarm_id,
            event_type="action_table_reviewed",
            actor_id=actor_id,
            summary=f"Action table reviewed ({changes_made} changes)",
            details={"changes_made": changes_made},
        )

    def action_table_accepted(
        self,
        swarm_id: str,
        accepted_by: str,
        acceptance_id: str | None = None,
    ) -> str:
        """Record that a user accepted the action table."""
        return self.record(
            swarm_id=swarm_id,
            event_type="action_table_accepted",
            actor_id=accepted_by,
            summary=f"Action table accepted by {accepted_by}",
            related_entity_type="action_table_acceptance",
            related_entity_id=acceptance_id,
        )

    def pipeline_completed(
        self,
        swarm_id: str,
        stage_count: int,
        success: bool,
    ) -> str:
        """Record that the full pipeline completed."""
        status = "successfully" if success else "with errors"
        return self.record(
            swarm_id=swarm_id,
            event_type="pipeline_completed",
            actor_id="pipeline",
            summary=(
                f"Pipeline completed {status} "
                f"({stage_count} stages)"
            ),
            details={
                "stage_count": stage_count,
                "success": success,
            },
        )
