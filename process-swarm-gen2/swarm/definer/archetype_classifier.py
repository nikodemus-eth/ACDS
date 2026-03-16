"""Archetype classification over accepted action tables.

Classifies an accepted action table into a known archetype based on
the capability families required by its actions. Uses verb-to-capability
resolution to match against known archetype patterns.
"""

from __future__ import annotations

from swarm.definer.capability import resolve_action_type_to_capability_family


# Known archetype patterns and their capability requirements.
ARCHETYPES = {
    "data_pipeline": {
        "required_capabilities": {"data_query", "data_write"},
        "dependency_structure": "linear",
        "compatible_scheduling": False,
    },
    "scheduled_reporting_pipeline": {
        "required_capabilities": {
            "data_query",
            "report_generation",
            "notification_delivery",
        },
        "dependency_structure": "linear",
        "compatible_scheduling": True,
    },
    "file_generation_and_distribution": {
        "required_capabilities": {"file_generation", "notification_delivery"},
        "dependency_structure": "linear",
        "compatible_scheduling": True,
    },
    "notification_pipeline": {
        "required_capabilities": {"notification_delivery"},
        "dependency_structure": "linear",
        "compatible_scheduling": True,
    },
    "scheduled_monitoring_job": {
        "required_capabilities": {"data_query", "notification_delivery"},
        "dependency_structure": "linear",
        "compatible_scheduling": True,
    },
}

# Verb-to-capability-family mapping for action table classification.
_VERB_TO_CAPABILITY_FAMILY = {
    "collect": "data_query",
    "fetch": "data_query",
    "query": "data_query",
    "gather": "data_query",
    "validate": "data_processing",
    "filter": "data_processing",
    "normalize": "data_processing",
    "transform": "data_processing",
    "build": "data_processing",
    "compile": "data_processing",
    "format": "report_generation",
    "generate": "report_generation",
    "synthesize": "report_generation",
    "create": "file_generation",
    "write": "file_generation",
    "send": "notification_delivery",
    "deliver": "notification_delivery",
    "email": "notification_delivery",
    "notify": "notification_delivery",
    "monitor": "data_query",
    "run": "data_processing",
    "test": "data_processing",
    "delete": "file_generation",
    "configure": "data_processing",
    "deploy": "file_generation",
    "package": "file_generation",
}


def resolve_verb_to_capability_family(verb: str) -> str | None:
    """Resolve a verb to its capability family."""
    normalized = (verb or "").strip().lower()
    return _VERB_TO_CAPABILITY_FAMILY.get(normalized)


def classify_action_table(actions: list[dict]) -> dict:
    """Classify an accepted action table into a known or custom archetype.

    Scores each known archetype by capability coverage of the action
    table's verbs, with bonuses for matching dependency structure and
    schedule hints.
    """
    capabilities = []
    for action in actions:
        verb = action.get("verb", "")
        family = resolve_verb_to_capability_family(verb)
        if family:
            capabilities.append(family)

    capability_set = set(capabilities)
    dependency_edges = sum(len(action.get("dependencies", [])) for action in actions)
    dependency_structure = (
        "linear"
        if dependency_edges <= max(len(actions) - 1, 0)
        else "branching"
    )
    has_schedule_hint = any(
        "schedule" in (action.get("qualifiers") or {})
        or "monthly" in (action.get("source_text") or "").lower()
        or "weekly" in (action.get("source_text") or "").lower()
        or "daily" in (action.get("source_text") or "").lower()
        for action in actions
    )

    best_match = None
    best_score = 0.0
    for archetype_id, definition in ARCHETYPES.items():
        required = definition["required_capabilities"]
        matched = len(required & capability_set)
        if not required:
            continue
        coverage = matched / len(required)
        if definition["compatible_scheduling"] and has_schedule_hint:
            coverage += 0.1
        if definition["dependency_structure"] == dependency_structure:
            coverage += 0.1
        coverage = min(coverage, 1.0)
        if coverage > best_score:
            best_score = coverage
            best_match = archetype_id

    if not best_match or best_score < 0.5:
        return {
            "archetype_id": None,
            "confidence": round(best_score, 2),
            "classification_state": "custom",
            "matched_capabilities": sorted(capability_set),
            "dependency_structure": dependency_structure,
        }

    state = "classified" if best_score >= 0.85 else "candidate"
    return {
        "archetype_id": best_match,
        "confidence": round(best_score, 2),
        "classification_state": state,
        "matched_capabilities": sorted(capability_set),
        "dependency_structure": dependency_structure,
    }
