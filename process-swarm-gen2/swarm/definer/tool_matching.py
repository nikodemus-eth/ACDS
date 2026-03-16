"""Canonical tool-match-set helpers."""

from __future__ import annotations

from swarm.definer.capability import preflight_report_to_dict, run_preflight
from swarm.registry.repository import SwarmRepository


def create_tool_match_set_for_swarm(
    repo: SwarmRepository,
    swarm_id: str,
    action_table_ref: str | None = None,
) -> dict:
    """Run preflight and return the persisted canonical tool-match-set record."""
    report = run_preflight(swarm_id, repo)
    effective_action_table_ref = action_table_ref
    if not effective_action_table_ref:
        action_table = repo.get_latest_action_table_for_swarm(swarm_id)
        if action_table:
            effective_action_table_ref = action_table["action_table_id"]
    record = None
    if effective_action_table_ref:
        record = repo.get_latest_tool_match_set_for_action_table(
            effective_action_table_ref
        )
    return {
        "preflight_report": preflight_report_to_dict(report),
        "tool_match_set": record,
    }
