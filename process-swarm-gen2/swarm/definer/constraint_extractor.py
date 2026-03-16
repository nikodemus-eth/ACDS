"""Canonical constraint-set extraction over accepted planning artifacts."""

from __future__ import annotations

import json

from swarm.definer.constraints import (
    constraint_set_to_dict,
    extract_constraints,
    validate_constraints,
)
from swarm.registry.repository import SwarmRepository


def extract_constraint_set_for_action_table(
    repo: SwarmRepository,
    swarm_id: str,
    action_table_ref: str,
    intent_text: str,
    archetype_ref: str | None = None,
    archetype_name: str | None = None,
    extraction_method: str = "rule_based",
) -> str:
    """Extract and persist a canonical constraint_set for an action table."""
    effective_archetype = archetype_name or "custom"
    constraints = extract_constraints(intent_text, effective_archetype)
    warnings = validate_constraints(constraints)
    resolution_state = "partially_resolved" if warnings else "resolved"
    draft = repo.get_latest_draft(swarm_id)
    if not draft:
        raise ValueError("No intent draft found for swarm")

    return repo.create_constraint_set(
        intent_id=draft["draft_id"],
        action_table_ref=action_table_ref,
        archetype_ref=archetype_ref,
        constraints_json=json.dumps(constraint_set_to_dict(constraints)),
        extraction_notes="; ".join(warnings) if warnings else None,
        missing_required=[],
        ambiguous_fields=warnings,
        clarification_questions=[],
        extraction_method=extraction_method,
        resolution_state=resolution_state,
    )
