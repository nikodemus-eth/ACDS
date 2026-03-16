"""Skill ABI gateway — definition-only, no execution authority.

Skills may create, inspect, and revise Process Swarm artifacts through
this gateway. They cannot execute tools, bypass governance, inject
unsigned execution plans, or modify the artifact ledger directly.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Union

from swarm.events.recorder import EventRecorder
from swarm.governance.lifecycle import LifecycleManager
from swarm.governance.warnings import (
    persist_warning_records,
)
from swarm.registry.repository import SwarmRepository

logger = logging.getLogger(__name__)

_SUPPORTED_ABI_VERSIONS = {"0.1"}


class SwarmSkillABI:
    """Controlled gateway through which skills interact with the swarm platform."""

    def __init__(
        self,
        repo: SwarmRepository,
        events: EventRecorder,
        workspace_root: Union[str, Path],
    ):
        self.repo = repo
        self.events = events
        self.workspace_root = Path(workspace_root)

    @staticmethod
    def negotiate_version(requested_version: str) -> bool:
        return requested_version in _SUPPORTED_ABI_VERSIONS

    def create_swarm_definition(
        self,
        name: str,
        description: str,
        step_outline: list[str],
        created_by: str,
        *,
        schedule_policy: dict | None = None,
        delivery_policy: dict | None = None,
    ) -> dict:
        if not name or not name.strip():
            raise ValueError("Swarm name must be non-empty")

        swarm_id = self.repo.create_swarm(name.strip(), description, created_by)

        # Create intent draft from step outline
        draft_text = "\n".join(f"- {step}" for step in step_outline)
        draft_id = self.repo.create_intent_draft(swarm_id, draft_text, created_by)

        result: dict = {
            "swarm_id": swarm_id,
            "draft_id": draft_id,
            "schedule_id": None,
            "delivery_id": None,
        }

        if schedule_policy:
            schedule_id = self.configure_schedule(swarm_id, schedule_policy)
            result["schedule_id"] = schedule_id

        if delivery_policy:
            delivery_id = self.configure_delivery(swarm_id, delivery_policy)
            result["delivery_id"] = delivery_id

        self.events.record(
            swarm_id, "swarm_created", created_by,
            f"Swarm '{name}' created via ABI",
        )
        return result

    def configure_schedule(
        self,
        swarm_id: str,
        schedule_config: dict,
        warning_ids: list[str] | None = None,
        override_reason_category: str | None = None,
        override_reason: str | None = None,
    ) -> str:
        trigger_type = schedule_config.get("trigger_type", "immediate")
        schedule_id = self.repo.create_schedule(
            swarm_id,
            trigger_type=trigger_type,
            run_at=schedule_config.get("run_at"),
            cron_expression=schedule_config.get("cron_expression"),
            timezone=schedule_config.get("timezone", "UTC"),
        )
        self.repo.update_swarm(swarm_id, schedule_id=schedule_id)
        return schedule_id

    def configure_delivery(self, swarm_id: str, delivery_config: dict) -> str:
        delivery_type = delivery_config.get("delivery_type", "email")
        destination = delivery_config.get("destination", "")
        delivery_id = self.repo.create_delivery(
            swarm_id, delivery_type, destination
        )
        self.repo.update_swarm(swarm_id, delivery_id=delivery_id)
        return delivery_id

    def preview_execution(self, swarm_id: str) -> dict:
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")

        # Gather preview data
        actions = self.repo.list_actions(swarm_id)
        schedule = None
        if swarm.get("schedule_id"):
            schedule = self.repo.get_schedule(swarm["schedule_id"])
        delivery = None
        if swarm.get("delivery_id"):
            delivery = self.repo.get_delivery(swarm["delivery_id"])

        return {
            "swarm_id": swarm_id,
            "swarm_name": swarm.get("swarm_name"),
            "lifecycle_status": swarm.get("lifecycle_status"),
            "action_count": len(actions),
            "schedule_preview": schedule,
            "delivery_preview": delivery,
        }

    def list_swarms(self, status: str | None = None) -> list[dict]:
        return self.repo.list_swarms(status=status)

    def get_swarm_definition(self, swarm_id: str) -> dict | None:
        return self.repo.get_swarm(swarm_id)

    def update_swarm_definition(
        self, swarm_id: str, actor_id: str, **fields
    ) -> None:
        if "lifecycle_status" in fields:
            raise ValueError(
                "Cannot update lifecycle_status through ABI — use governance"
            )

        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")

        if swarm["lifecycle_status"] not in ("drafting", "rejected"):
            raise ValueError(
                f"Cannot update swarm in '{swarm['lifecycle_status']}' state"
            )

        self.repo.update_swarm(swarm_id, **fields)
        self.events.record(
            swarm_id, "swarm_updated", actor_id,
            f"Updated fields: {', '.join(fields.keys())}",
        )

    def archive_swarm(self, swarm_id: str, actor_id: str) -> str:
        lifecycle = LifecycleManager(self.repo, self.events)
        event_id = lifecycle.transition(
            swarm_id, "revoked", actor_id=actor_id, actor_role="abi_user"
        )
        return event_id
