"""Action Table Artifact — construction, validation, and lifecycle management.

The Action Table is the canonical structured interpretation of user intent.
It bridges the gap between intent acceptance and behavior sequence compilation
by expressing intent in explicit operational terms (verb -> object) rather
than conversational language.

Pipeline position:
  intent acceptance -> ACTION TABLE -> archetype classification -> ...

Validation rules (from specification):
  - every row contains a verb and object
  - dependencies form a directed acyclic graph
  - objects referenced by later steps must exist
  - ambiguous verbs must be clarified
  - step numbers are sequential starting from 1

Lifecycle states:
  draft -> validated -> accepted -> compiled
"""

from __future__ import annotations

import json
from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

from runtime.schemas.loader import load_schema

try:
    import jsonschema
except ImportError:  # pragma: no cover
    jsonschema = None  # type: ignore[assignment]


# ──────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────


@dataclass
class ActionEntry:
    """A single operational action in the Action Table."""
    step: int
    verb: str
    object: str
    destination: Optional[str] = None
    qualifiers: dict = field(default_factory=dict)
    dependencies: list[int] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)
    source_text: Optional[str] = None


@dataclass
class ActionTable:
    """The complete Action Table artifact."""
    intent_ref: str
    actions: list[ActionEntry]
    lifecycle_state: str = "draft"
    created_at: Optional[str] = None
    validated_at: Optional[str] = None
    accepted_at: Optional[str] = None
    compiled_at: Optional[str] = None


# ──────────────────────────────────────────────
# Ambiguous Verbs
# ──────────────────────────────────────────────

_AMBIGUOUS_VERBS = frozenset({
    "process", "handle", "manage", "do", "perform",
    "deal with", "take care of", "work on", "address",
    "update",
})


# ──────────────────────────────────────────────
# Construction
# ──────────────────────────────────────────────


def build_action_table(
    intent_ref: str,
    actions: list[dict],
) -> ActionTable:
    """Build an ActionTable from a list of raw action dicts.

    Args:
        intent_ref: UUID of the accepted intent artifact.
        actions: List of action dicts with at minimum
                 {step, verb, object, dependencies}.

    Returns:
        ActionTable in 'draft' lifecycle state.
    """
    entries = []
    for raw in actions:
        entry = ActionEntry(
            step=raw["step"],
            verb=raw["verb"],
            object=raw["object"],
            destination=raw.get("destination"),
            qualifiers=raw.get("qualifiers", {}),
            dependencies=raw.get("dependencies", []),
            conditions=raw.get("conditions", []),
            source_text=raw.get("source_text"),
        )
        entries.append(entry)

    return ActionTable(
        intent_ref=intent_ref,
        actions=entries,
        lifecycle_state="draft",
        created_at=datetime.now(timezone.utc).isoformat(),
    )


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────


@dataclass
class ValidationResult:
    """Result of validating an ActionTable."""
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_action_table(table: ActionTable) -> ValidationResult:
    """Validate an ActionTable against the specification rules.

    Checks:
      1. Every action has a non-empty verb and object
      2. Step numbers are sequential starting from 1
      3. Dependencies reference valid existing steps
      4. Dependencies form a DAG (no cycles)
      5. Ambiguous verbs are flagged
      6. At least one action exists
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not table.actions:
        errors.append("Action table must contain at least one action")
        return ValidationResult(valid=False, errors=errors, warnings=warnings)

    for action in table.actions:
        if not action.verb or not action.verb.strip():
            errors.append(f"Step {action.step}: verb is empty")
        if not action.object or not action.object.strip():
            errors.append(f"Step {action.step}: object is empty")

    expected_steps = list(range(1, len(table.actions) + 1))
    actual_steps = [a.step for a in table.actions]
    if actual_steps != expected_steps:
        errors.append(
            f"Steps must be sequential from 1. "
            f"Expected {expected_steps}, got {actual_steps}"
        )

    step_set = {a.step for a in table.actions}

    for action in table.actions:
        for dep in action.dependencies:
            if dep not in step_set:
                errors.append(
                    f"Step {action.step}: dependency {dep} "
                    f"references non-existent step"
                )
            elif dep >= action.step:
                errors.append(
                    f"Step {action.step}: dependency {dep} "
                    f"must reference an earlier step"
                )

    cycle_errors = _detect_cycles(table.actions)
    errors.extend(cycle_errors)

    for action in table.actions:
        if action.verb.lower().strip() in _AMBIGUOUS_VERBS:
            warnings.append(
                f"Step {action.step}: verb '{action.verb}' is ambiguous "
                f"and should be clarified"
            )

    valid = len(errors) == 0
    return ValidationResult(valid=valid, errors=errors, warnings=warnings)


def _detect_cycles(actions: list[ActionEntry]) -> list[str]:
    """Detect cycles in the action dependency graph using Kahn's algorithm."""
    if not actions:
        return []

    steps = {a.step for a in actions}
    adj: dict[int, list[int]] = defaultdict(list)
    in_degree: dict[int, int] = {s: 0 for s in steps}

    for action in actions:
        for dep in action.dependencies:
            if dep in steps:
                adj[dep].append(action.step)
                in_degree[action.step] = in_degree.get(action.step, 0) + 1

    queue: deque[int] = deque()
    for s in steps:
        if in_degree.get(s, 0) == 0:
            queue.append(s)

    sorted_count = 0
    while queue:
        node = queue.popleft()
        sorted_count += 1
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if sorted_count < len(steps):
        cycle_steps = [s for s in steps if in_degree.get(s, 0) > 0]
        return [
            f"Circular dependency detected involving steps: "
            f"{sorted(cycle_steps)}"
        ]

    return []


# ──────────────────────────────────────────────
# Lifecycle Transitions
# ──────────────────────────────────────────────


def mark_validated(table: ActionTable) -> ActionTable:
    """Transition an ActionTable from draft to validated.

    Raises:
        ValueError: If the table is not in 'draft' state or validation fails.
    """
    if table.lifecycle_state != "draft":
        raise ValueError(
            f"Cannot validate: table is in '{table.lifecycle_state}' state, "
            f"expected 'draft'"
        )

    result = validate_action_table(table)
    if not result.valid:
        raise ValueError(
            f"Validation failed with {len(result.errors)} error(s): "
            + "; ".join(result.errors)
        )

    table.lifecycle_state = "validated"
    table.validated_at = datetime.now(timezone.utc).isoformat()
    return table


def mark_accepted(table: ActionTable) -> ActionTable:
    """Transition an ActionTable from validated to accepted.

    Raises:
        ValueError: If the table is not in 'validated' state.
    """
    if table.lifecycle_state != "validated":
        raise ValueError(
            f"Cannot accept: table is in '{table.lifecycle_state}' state, "
            f"expected 'validated'"
        )

    table.lifecycle_state = "accepted"
    table.accepted_at = datetime.now(timezone.utc).isoformat()
    return table


def mark_compiled(table: ActionTable) -> ActionTable:
    """Transition an ActionTable from accepted to compiled.

    Raises:
        ValueError: If the table is not in 'accepted' state.
    """
    if table.lifecycle_state != "accepted":
        raise ValueError(
            f"Cannot compile: table is in '{table.lifecycle_state}' state, "
            f"expected 'accepted'"
        )

    table.lifecycle_state = "compiled"
    table.compiled_at = datetime.now(timezone.utc).isoformat()
    return table


# ──────────────────────────────────────────────
# Serialization
# ──────────────────────────────────────────────


def action_table_to_dict(table: ActionTable) -> dict:
    """Convert an ActionTable to a JSON-serializable dict."""
    result = {
        "artifact_type": "action_table",
        "intent_ref": table.intent_ref,
        "actions": [asdict(a) for a in table.actions],
        "lifecycle_state": table.lifecycle_state,
        "created_at": table.created_at,
    }
    if table.validated_at:
        result["validated_at"] = table.validated_at
    if table.accepted_at:
        result["accepted_at"] = table.accepted_at
    if table.compiled_at:
        result["compiled_at"] = table.compiled_at
    return result


def action_table_from_dict(data: dict) -> ActionTable:
    """Reconstruct an ActionTable from a dict."""
    actions = [
        ActionEntry(
            step=a["step"],
            verb=a["verb"],
            object=a["object"],
            destination=a.get("destination"),
            qualifiers=a.get("qualifiers", {}),
            dependencies=a.get("dependencies", []),
            conditions=a.get("conditions", []),
            source_text=a.get("source_text"),
        )
        for a in data.get("actions", [])
    ]
    return ActionTable(
        intent_ref=data["intent_ref"],
        actions=actions,
        lifecycle_state=data.get("lifecycle_state", "draft"),
        created_at=data.get("created_at"),
        validated_at=data.get("validated_at"),
        accepted_at=data.get("accepted_at"),
        compiled_at=data.get("compiled_at"),
    )


def validate_against_schema(table: ActionTable) -> list[str]:
    """Validate an ActionTable dict against the JSON Schema.

    Returns list of validation error messages. Empty means valid.
    """
    if jsonschema is None:
        return ["jsonschema not available"]

    table_dict = action_table_to_dict(table)
    try:
        schema = load_schema("action_table")
    except FileNotFoundError:
        return ["action_table.schema.json not found"]

    validator = jsonschema.Draft202012Validator(schema)
    return [
        f"{e.json_path}: {e.message}"
        for e in sorted(validator.iter_errors(table_dict), key=str)
    ]
