"""Capability Preflight — tool readiness checking for swarm actions.

Bridges the gap between swarm action definitions and the platform's
governed tool registry. Ensures every action is mapped to an available
tool before a swarm can proceed to execution.

Components:
  A. Tool Seeding — seed_default_tools()
  B. Action Generator — generate_actions_from_steps()
  C. Capability Preflight — run_preflight()
  D. Readiness Check — check_readiness()

Architectural rule:
  "A swarm is not executable unless every action is mapped to an
   available governed tool or explicitly marked as requiring new
   capability."
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Optional

from swarm.registry.repository import SwarmRepository


# ──────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────


@dataclass
class ActionPreflightResult:
    """Result of matching a single action to a tool."""
    action_id: str
    action_name: str
    tool_id: Optional[str]
    tool_name: Optional[str]
    match_status: str  # supported | supported_with_constraints | ambiguous | unsupported | requires_new_tool
    confidence: Optional[float]
    constraints: Optional[str]
    notes: Optional[str]


@dataclass
class PreflightReport:
    """Full preflight report for a swarm's actions."""
    swarm_id: str
    total_actions: int
    results: list[ActionPreflightResult]
    ready: bool


@dataclass
class ReadinessResult:
    """Summary readiness state for a swarm."""
    ready: bool
    total: int
    supported: int
    supported_with_constraints: int
    ambiguous: int
    unsupported: int
    requires_new_tool: int
    pending: int
    blocking_actions: list[dict]


# ──────────────────────────────────────────────
# A. Tool Seeding
# ──────────────────────────────────────────────

_DEFAULT_TOOLS = [
    {
        "tool_name": "filesystem_write",
        "description": "Create, modify, append, or delete files within the governed workspace",
        "tool_family": "filesystem",
        "allowed_scope_class": "output",
        "execution_class": "filesystem_write",
        "maturity_status": "active",
    },
    {
        "tool_name": "test_execution",
        "description": "Run acceptance test commands in a sandboxed environment",
        "tool_family": "testing",
        "allowed_scope_class": "output",
        "execution_class": "test_execution",
        "maturity_status": "active",
    },
    {
        "tool_name": "content_generation",
        "description": "Generate content via LLM for file creation and modification",
        "tool_family": "generation",
        "allowed_scope_class": "output",
        "execution_class": "content_generation",
        "maturity_status": "active",
    },
    {
        "tool_name": "run_manager",
        "description": "Initialize and manage run lifecycle state",
        "tool_family": "lifecycle",
        "allowed_scope_class": "output",
        "execution_class": "run_management",
        "maturity_status": "active",
    },
    {
        "tool_name": "policy_loader",
        "description": "Load and validate policy definitions",
        "tool_family": "configuration",
        "allowed_scope_class": "output",
        "execution_class": "policy_loading",
        "maturity_status": "active",
    },
    {
        "tool_name": "source_collector",
        "description": "Collect data from configured source endpoints",
        "tool_family": "collection",
        "allowed_scope_class": "output",
        "execution_class": "source_collection",
        "maturity_status": "active",
    },
    {
        "tool_name": "url_validator",
        "description": "Validate URL accessibility and freshness",
        "tool_family": "validation",
        "allowed_scope_class": "output",
        "execution_class": "source_validation",
        "maturity_status": "active",
    },
    {
        "tool_name": "freshness_filter",
        "description": "Filter sources by freshness window",
        "tool_family": "validation",
        "allowed_scope_class": "output",
        "execution_class": "freshness_filtering",
        "maturity_status": "active",
    },
    {
        "tool_name": "source_normalizer",
        "description": "Normalize source data to standard format",
        "tool_family": "normalization",
        "allowed_scope_class": "output",
        "execution_class": "source_normalization",
        "maturity_status": "active",
    },
    {
        "tool_name": "bundle_builder",
        "description": "Build validated source bundle",
        "tool_family": "aggregation",
        "allowed_scope_class": "output",
        "execution_class": "bundle_building",
        "maturity_status": "active",
    },
    {
        "tool_name": "rule_validator",
        "description": "Validate data against policy rules",
        "tool_family": "validation",
        "allowed_scope_class": "output",
        "execution_class": "rule_validation",
        "maturity_status": "active",
    },
    {
        "tool_name": "section_mapper",
        "description": "Map sources to report sections",
        "tool_family": "mapping",
        "allowed_scope_class": "output",
        "execution_class": "section_mapping",
        "maturity_status": "active",
    },
    {
        "tool_name": "synthesis_brief_builder",
        "description": "Build synthesis brief from mapped sources",
        "tool_family": "preparation",
        "allowed_scope_class": "output",
        "execution_class": "synthesis_preparation",
        "maturity_status": "active",
    },
    {
        "tool_name": "probabilistic_synthesis",
        "description": "Generate synthesized content from source briefs",
        "tool_family": "generation",
        "allowed_scope_class": "output",
        "execution_class": "probabilistic_synthesis",
        "maturity_status": "active",
    },
    {
        "tool_name": "report_formatter",
        "description": "Format synthesized content into report structure",
        "tool_family": "formatting",
        "allowed_scope_class": "output",
        "execution_class": "report_formatting",
        "maturity_status": "active",
    },
    {
        "tool_name": "citation_validator",
        "description": "Validate citations and source references",
        "tool_family": "validation",
        "allowed_scope_class": "output",
        "execution_class": "citation_validation",
        "maturity_status": "active",
    },
    {
        "tool_name": "decision_engine",
        "description": "Make governed decisions based on policy rules",
        "tool_family": "decision",
        "allowed_scope_class": "output",
        "execution_class": "decision_making",
        "maturity_status": "active",
    },
    {
        "tool_name": "delivery_engine",
        "description": "Deliver artifacts to configured destinations",
        "tool_family": "delivery",
        "allowed_scope_class": "output",
        "execution_class": "delivery",
        "maturity_status": "active",
    },
]


def seed_default_tools(repo: SwarmRepository) -> list[str]:
    """Register the platform's built-in tools if they don't already exist.

    Idempotent — checks tool_name uniqueness before inserting.

    Returns:
        List of tool_ids (existing or newly created).
    """
    tool_ids = []
    for tool_def in _DEFAULT_TOOLS:
        existing = repo.get_tool_by_name(tool_def["tool_name"])
        if existing:
            tool_ids.append(existing["tool_id"])
        else:
            tool_id = repo.create_tool(**tool_def)
            tool_ids.append(tool_id)
    return tool_ids


# ──────────────────────────────────────────────
# B. Action Generator
# ──────────────────────────────────────────────

_OP_TO_ACTION_TYPE = {
    "create": "file_create",
    "modify": "file_modify",
    "append": "file_append",
    "delete": "file_delete",
    "run_test": "test_run",
}


def generate_actions_from_steps(
    swarm_id: str,
    steps: list[dict],
    repo: SwarmRepository,
) -> list[str]:
    """Convert restatement steps into swarm_actions rows.

    Clears existing actions for the swarm before regenerating.

    Returns:
        List of created action_ids.
    """
    with repo.atomic():
        repo.delete_dependencies_for_swarm(swarm_id)
        repo.delete_actions_for_swarm(swarm_id)

        action_ids = []
        for i, step in enumerate(steps):
            op = step.get("op", "create")
            action_type = _OP_TO_ACTION_TYPE.get(op, op)

            action_name = step.get("display_description", f"Step {i + 1}")
            action_text = step.get("description", action_name)
            target_path = step.get("path")

            action_id = repo.create_action(
                swarm_id=swarm_id,
                step_order=i,
                action_name=action_name,
                action_text=action_text,
                action_type=action_type,
                target_path=target_path,
                action_status="defined",
            )
            action_ids.append(action_id)

        # Record dependencies from step depends_on lists
        actions = repo.list_actions(swarm_id)
        action_id_by_order = {a["step_order"]: a["action_id"] for a in actions}

        for i, step in enumerate(steps):
            depends_on = step.get("depends_on", [])
            current_id = action_id_by_order.get(i)
            if current_id:
                for dep_index in depends_on:
                    dep_id = action_id_by_order.get(dep_index)
                    if dep_id:
                        repo.create_action_dependency(
                            swarm_id=swarm_id,
                            action_id=current_id,
                            depends_on_action_id=dep_id,
                        )

    return action_ids


# ──────────────────────────────────────────────
# C. Capability Preflight
# ──────────────────────────────────────────────

_ACTION_TYPE_TO_TOOL = {
    "file_create": "filesystem_write",
    "file_modify": "filesystem_write",
    "file_append": "filesystem_write",
    "file_delete": "filesystem_write",
    "test_run": "test_execution",
    "run_management": "run_manager",
    "policy_loading": "policy_loader",
    "source_collection": "source_collector",
    "source_validation": "url_validator",
    "freshness_filtering": "freshness_filter",
    "source_normalization": "source_normalizer",
    "bundle_building": "bundle_builder",
    "rule_validation": "rule_validator",
    "section_mapping": "section_mapper",
    "synthesis_preparation": "synthesis_brief_builder",
    "probabilistic_synthesis": "probabilistic_synthesis",
    "report_formatting": "report_formatter",
    "citation_validation": "citation_validator",
    "decision_making": "decision_engine",
    "delivery": "delivery_engine",
    "artifact_registration": "filesystem_write",
}

_ACTION_TYPE_TO_CAPABILITY_FAMILY = {
    "file_create": "file_generation",
    "file_modify": "file_generation",
    "file_append": "file_generation",
    "file_delete": "file_generation",
    "test_run": "data_processing",
    "run_management": "data_processing",
    "policy_loading": "data_processing",
    "source_collection": "data_query",
    "source_validation": "data_processing",
    "freshness_filtering": "data_processing",
    "source_normalization": "data_processing",
    "bundle_building": "data_processing",
    "rule_validation": "data_processing",
    "section_mapping": "data_processing",
    "synthesis_preparation": "report_generation",
    "probabilistic_synthesis": "report_generation",
    "report_formatting": "report_generation",
    "citation_validation": "data_processing",
    "decision_making": "data_processing",
    "delivery": "notification_delivery",
    "artifact_registration": "file_generation",
}


def resolve_action_type_to_capability_family(action_type: str) -> str | None:
    """Resolve a specialized action type to its capability family."""
    normalized = (action_type or "").strip().lower()
    if normalized in _ACTION_TYPE_TO_CAPABILITY_FAMILY:
        return _ACTION_TYPE_TO_CAPABILITY_FAMILY[normalized]
    if normalized.startswith("file_"):
        return "file_generation"
    return None


def run_preflight(
    swarm_id: str,
    repo: SwarmRepository,
    checked_by: str = "preflight_engine",
) -> PreflightReport:
    """Run capability preflight on all actions for a swarm.

    For each action:
      1. Determine the required tool from the action_type
      2. Look up the tool in tool_registry
      3. Check scope compatibility
      4. Create a readiness check record
      5. Update the action's status

    Returns:
        PreflightReport with per-action results.
    """
    actions = repo.list_actions(swarm_id)
    results = []

    with repo.atomic():
        for action in actions:
            result = _check_single_action(action, repo, checked_by)
            results.append(result)

    ready = all(
        r.match_status in ("supported", "supported_with_constraints")
        for r in results
    )

    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    if action_table:
        actions_by_id = {action["action_id"]: action for action in actions}
        repo.create_tool_match_set(
            action_table_ref=action_table["action_table_id"],
            matches=[
                {
                    "action_ref": result.action_id,
                    "step": actions_by_id.get(result.action_id, {}).get("step_order"),
                    "required_family": resolve_action_type_to_capability_family(
                        actions_by_id.get(result.action_id, {}).get("action_type", "")
                    ),
                    "matched_tool": result.tool_name,
                    "status": result.match_status,
                    "constraints": result.constraints,
                    "policy_notes": result.notes,
                    "rationale": result.constraints or result.notes,
                }
                for result in results
            ],
            tool_inventory_version="seeded-defaults",
        )

    return PreflightReport(
        swarm_id=swarm_id,
        total_actions=len(actions),
        results=results,
        ready=ready,
    )


def _check_single_action(
    action: dict,
    repo: SwarmRepository,
    checked_by: str,
) -> ActionPreflightResult:
    """Check a single action against the tool registry."""
    action_type = action.get("action_type", "")

    required_tool_name = _ACTION_TYPE_TO_TOOL.get(action_type)

    if not required_tool_name:
        repo.create_readiness_check(
            action_id=action["action_id"],
            match_status="requires_new_tool",
            confidence_score=0.0,
            constraint_notes=f"No tool registered for action_type: {action_type}",
            checked_by=checked_by,
        )
        repo.update_action(
            action["action_id"],
            action_status="requires_new_tool",
        )
        return ActionPreflightResult(
            action_id=action["action_id"],
            action_name=action["action_name"],
            tool_id=None,
            tool_name=None,
            match_status="requires_new_tool",
            confidence=0.0,
            constraints=f"No tool for action_type: {action_type}",
            notes=None,
        )

    tool = repo.get_tool_by_name(required_tool_name)
    if not tool:
        repo.create_readiness_check(
            action_id=action["action_id"],
            match_status="unsupported",
            confidence_score=0.0,
            constraint_notes=f"Required tool '{required_tool_name}' not in registry",
            checked_by=checked_by,
        )
        repo.update_action(
            action["action_id"],
            action_status="unsupported",
        )
        return ActionPreflightResult(
            action_id=action["action_id"],
            action_name=action["action_name"],
            tool_id=None,
            tool_name=required_tool_name,
            match_status="unsupported",
            confidence=0.0,
            constraints=f"Tool '{required_tool_name}' not registered",
            notes=None,
        )

    if tool["maturity_status"] == "planned":
        repo.create_readiness_check(
            action_id=action["action_id"],
            match_status="requires_new_tool",
            tool_id=tool["tool_id"],
            confidence_score=0.0,
            constraint_notes=(
                f"Tool '{tool['tool_name']}' is planned but not yet implemented"
            ),
            checked_by=checked_by,
        )
        repo.update_action(
            action["action_id"],
            action_status="requires_new_tool",
        )
        return ActionPreflightResult(
            action_id=action["action_id"],
            action_name=action["action_name"],
            tool_id=tool["tool_id"],
            tool_name=tool["tool_name"],
            match_status="requires_new_tool",
            confidence=0.0,
            constraints=f"Tool '{tool['tool_name']}' is planned, not yet implemented",
            notes=None,
        )

    if tool["maturity_status"] != "active":
        repo.create_readiness_check(
            action_id=action["action_id"],
            match_status="supported_with_constraints",
            tool_id=tool["tool_id"],
            confidence_score=0.6,
            constraint_notes=f"Tool is {tool['maturity_status']}, not active",
            checked_by=checked_by,
        )
        repo.update_action(
            action["action_id"],
            action_status="supported_with_constraints",
        )
        return ActionPreflightResult(
            action_id=action["action_id"],
            action_name=action["action_name"],
            tool_id=tool["tool_id"],
            tool_name=tool["tool_name"],
            match_status="supported_with_constraints",
            confidence=0.6,
            constraints=f"Tool status: {tool['maturity_status']}",
            notes=None,
        )

    match_status = "supported"
    confidence = 1.0
    constraint_notes = None

    allowed_scope = tool.get("allowed_scope_class", "")
    target_path = action.get("target_path", "")
    if allowed_scope and target_path:
        if not target_path.startswith(f"{allowed_scope}/"):
            match_status = "supported_with_constraints"
            confidence = 0.7
            constraint_notes = (
                f"Target path '{target_path}' outside tool's "
                f"allowed scope '{allowed_scope}/'"
            )

    repo.create_readiness_check(
        action_id=action["action_id"],
        match_status=match_status,
        tool_id=tool["tool_id"],
        confidence_score=confidence,
        constraint_notes=constraint_notes,
        checked_by=checked_by,
    )
    repo.update_action(
        action["action_id"],
        action_status=match_status,
    )

    return ActionPreflightResult(
        action_id=action["action_id"],
        action_name=action["action_name"],
        tool_id=tool["tool_id"],
        tool_name=tool["tool_name"],
        match_status=match_status,
        confidence=confidence,
        constraints=constraint_notes,
        notes=None,
    )


# ──────────────────────────────────────────────
# D. Readiness Check
# ──────────────────────────────────────────────


def check_readiness(
    swarm_id: str,
    repo: SwarmRepository,
) -> ReadinessResult:
    """Check overall readiness of a swarm's actions.

    Returns a summary of how many actions are supported vs blocked,
    and whether the swarm is ready to proceed.
    """
    actions = repo.list_actions(swarm_id)
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    if action_table:
        tool_match_set = repo.get_latest_tool_match_set_for_action_table(
            action_table["action_table_id"]
        )
        if tool_match_set:
            raw_matches = tool_match_set.get("matches_json")
            matches = (
                json.loads(raw_matches)
                if isinstance(raw_matches, str) else
                (raw_matches or [])
            )
            actions_by_ref = {action["action_id"]: action for action in actions}
            counts = {
                "supported": 0,
                "supported_with_constraints": 0,
                "ambiguous": 0,
                "unsupported": 0,
                "requires_new_tool": 0,
                "pending": 0,
            }
            blocking = []
            for match in matches:
                status = match.get("status", "pending")
                if status not in counts:
                    status = "pending"
                counts[status] += 1
                if status in ("unsupported", "requires_new_tool", "ambiguous", "pending"):
                    action = actions_by_ref.get(match.get("action_ref"), {})
                    blocking.append({
                        "action_id": match.get("action_ref"),
                        "action_name": action.get("action_name", f"step-{match.get('step')}"),
                        "status": status,
                        "reason": (
                            match.get("policy_notes")
                            or match.get("constraints")
                            or f"Tool match status: {status}"
                        ),
                    })

            ready = (
                counts["unsupported"] == 0
                and counts["requires_new_tool"] == 0
                and counts["pending"] == 0
                and counts["ambiguous"] == 0
            )
            return ReadinessResult(
                ready=ready,
                total=len(matches),
                supported=counts["supported"],
                supported_with_constraints=counts["supported_with_constraints"],
                ambiguous=counts["ambiguous"],
                unsupported=counts["unsupported"],
                requires_new_tool=counts["requires_new_tool"],
                pending=counts["pending"],
                blocking_actions=blocking,
            )

    counts = {
        "supported": 0,
        "supported_with_constraints": 0,
        "ambiguous": 0,
        "unsupported": 0,
        "requires_new_tool": 0,
        "pending": 0,
    }
    blocking = []

    for action in actions:
        status = action["action_status"]
        if status in ("draft", "defined"):
            counts["pending"] += 1
            blocking.append({
                "action_id": action["action_id"],
                "action_name": action["action_name"],
                "status": status,
                "reason": "Not yet checked against tool registry",
            })
        elif status in counts:
            counts[status] += 1
            if status in ("unsupported", "requires_new_tool", "ambiguous"):
                blocking.append({
                    "action_id": action["action_id"],
                    "action_name": action["action_name"],
                    "status": status,
                    "reason": f"Action status: {status}",
                })
        else:
            counts["supported"] += 1

    ready = (
        counts["unsupported"] == 0
        and counts["requires_new_tool"] == 0
        and counts["pending"] == 0
        and counts["ambiguous"] == 0
    )

    return ReadinessResult(
        ready=ready,
        total=len(actions),
        supported=counts["supported"],
        supported_with_constraints=counts["supported_with_constraints"],
        ambiguous=counts["ambiguous"],
        unsupported=counts["unsupported"],
        requires_new_tool=counts["requires_new_tool"],
        pending=counts["pending"],
        blocking_actions=blocking,
    )


# ──────────────────────────────────────────────
# Serialization helpers
# ──────────────────────────────────────────────


def preflight_report_to_dict(report: PreflightReport) -> dict:
    """Serialize a PreflightReport for JSON API responses."""
    return {
        "swarm_id": report.swarm_id,
        "total_actions": report.total_actions,
        "ready": report.ready,
        "results": [asdict(r) for r in report.results],
    }


def readiness_result_to_dict(result: ReadinessResult) -> dict:
    """Serialize a ReadinessResult for JSON API responses."""
    return asdict(result)
