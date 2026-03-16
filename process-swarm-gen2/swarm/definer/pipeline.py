"""Action Table Generation Pipeline — stages 2 through 7.

Orchestrates the conversion of a natural language task description
into an explicit, ordered, tool-mapped action table through discrete
stages, each producing a named artifact.

Stages:
  2. Archetype Classification  -> intent_archetype record
  3. Constraint Extraction      -> constraint_set record
  4. Template Expansion         -> action skeleton (in-memory)
  5. Action Specialization      -> swarm_actions rows
  6. Dependency Assignment      -> swarm_action_dependencies rows
  7. Tool Matching              -> readiness checks

Architectural rule:
  "Natural language tasks do not become runnable swarms directly.
   They first become archetype-classified, constraint-extracted,
   tool-mapped action tables."
"""

from __future__ import annotations

import json
import re
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

from swarm.definer.action_extraction import action_summary_from_tuples
from swarm.definer.archetype import (
    SwarmArchetypeClassification,
    classify_swarm_archetype,
    classify_swarm_archetype_override,
)
from swarm.definer.archetype_classifier import classify_action_table
from swarm.definer.capability import run_preflight, check_readiness
from swarm.definer.capability import resolve_action_type_to_capability_family
from swarm.definer.constraints import (
    ConstraintSet,
    constraint_set_from_dict,
    constraint_set_to_dict,
    extract_constraints,
    validate_constraints,
)
from swarm.definer.constraint_extractor import extract_constraint_set_for_action_table
from swarm.definer.templates import (
    TemplateAction,
    get_base_actions,
    get_default_dependencies,
    get_template,
)
from swarm.registry.repository import SwarmRepository


# ──────────────────────────────────────────────
# Data Structures
# ──────────────────────────────────────────────


@dataclass
class PipelineResult:
    """Output of a full pipeline run (stages 2-7)."""
    archetype_id: str
    constraint_set_id: str
    action_ids: list[str]
    dependency_count: int
    readiness_summary: dict
    pipeline_events: list[str]


_CANONICAL_ARCHETYPE_TO_TEMPLATE = {
    "scheduled_reporting_pipeline": "scheduled_structured_report",
    "data_pipeline": "data_transformation",
    "file_generation_and_distribution": "document_generation",
    "notification_pipeline": "delivery_workflow",
    "scheduled_monitoring_job": "monitoring_workflow",
}


class ClarificationNeeded(Exception):
    """Raised when archetype classification confidence is too low."""
    def __init__(
        self, archetype: str, confidence: float, reasoning: str,
    ):
        self.archetype = archetype
        self.confidence = confidence
        self.reasoning = reasoning
        super().__init__(
            f"Clarification needed: best guess is '{archetype}' "
            f"(confidence={confidence:.2f}). Reasoning: {reasoning}"
        )


class InvalidDependencies(Exception):
    """Raised when the dependency graph contains cycles."""
    def __init__(self, cycles: list[str]):
        self.cycles = cycles
        super().__init__(
            f"Dependency graph has cycles: {'; '.join(cycles)}"
        )


# ──────────────────────────────────────────────
# Event Helper
# ──────────────────────────────────────────────


def _emit_event(
    events: object | None,
    pipeline_events: list[str],
    **kwargs: object,
) -> None:
    """Record an event if the event recorder is available."""
    if events is None or not hasattr(events, "record"):
        return
    event_id = events.record(**kwargs)  # type: ignore[union-attr]
    if event_id:
        pipeline_events.append(event_id)


# ──────────────────────────────────────────────
# Pipeline Orchestrator
# ──────────────────────────────────────────────


def _run_planning_pipeline(
    swarm_id: str,
    intent_text: str,
    draft_id: str,
    repo: SwarmRepository,
    events: object | None = None,
    ollama_base: str = "http://localhost:11434",
    override_archetype: str | None = None,
) -> PipelineResult:
    """Run the full planning pipeline body (stages 2-7).

    All database writes are wrapped in repo.atomic() for
    all-or-nothing semantics.
    """
    pipeline_events: list[str] = []

    with repo.atomic():
        # Stage 2: Archetype Classification
        classification, archetype_id = _stage_classify(
            swarm_id, intent_text, draft_id, repo, events,
            pipeline_events, ollama_base, override_archetype,
        )

        archetype_name = classification.swarm_archetype

        # Stage 3: Constraint Extraction
        constraints, constraint_set_id = _stage_extract_constraints(
            swarm_id, intent_text, archetype_name, draft_id,
            repo, events, pipeline_events, ollama_base,
        )

        # Stage 4: Template Expansion
        base_actions = _stage_expand_template(
            archetype_name, swarm_id, events, pipeline_events,
        )

        # Stage 5: Action Specialization
        action_ids = _stage_specialize_actions(
            swarm_id, base_actions, constraints, archetype_name,
            intent_text, repo, events, pipeline_events, ollama_base,
        )

        # Stage 6: Dependency Assignment
        dependency_count = _stage_assign_dependencies(
            swarm_id, archetype_name, repo, events, pipeline_events,
        )

    # Stage 7: Tool Matching (outside atomic — has its own)
    readiness_summary = _stage_tool_matching(
        swarm_id, repo, events, pipeline_events,
    )

    return PipelineResult(
        archetype_id=archetype_id,
        constraint_set_id=constraint_set_id,
        action_ids=action_ids,
        dependency_count=dependency_count,
        readiness_summary=readiness_summary,
        pipeline_events=pipeline_events,
    )


def run_canonical_pipeline_for_swarm(
    swarm_id: str,
    repo: SwarmRepository,
    events: object | None = None,
    ollama_base: str = "http://localhost:11434",
    override_archetype: str | None = None,
) -> PipelineResult:
    """Run the planning pipeline preferring accepted action-table artifacts."""
    draft = repo.get_latest_draft(swarm_id)
    if not draft:
        raise ValueError("No intent draft found for this swarm")

    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    if not action_table:
        raise ValueError(
            "Canonical planning requires an accepted action table"
        )

    effective_intent_text = draft.get("raw_intent_text", "")
    raw_actions = action_table.get("actions_json")
    actions = json.loads(raw_actions) if isinstance(raw_actions, str) else (raw_actions or [])
    if actions:
        effective_intent_text = action_summary_from_tuples(actions)

    return _run_planning_pipeline(
        swarm_id=swarm_id,
        intent_text=effective_intent_text,
        draft_id=draft["draft_id"],
        repo=repo,
        events=events,
        ollama_base=ollama_base,
        override_archetype=override_archetype,
    )


def run_action_table_pipeline(
    swarm_id: str,
    intent_text: str,
    draft_id: str,
    repo: SwarmRepository,
    events: object | None = None,
    ollama_base: str = "http://localhost:11434",
    override_archetype: str | None = None,
) -> PipelineResult:
    """Backward-compatible entry point for pre-canonical callers."""
    return _run_planning_pipeline(
        swarm_id=swarm_id,
        intent_text=intent_text,
        draft_id=draft_id,
        repo=repo,
        events=events,
        ollama_base=ollama_base,
        override_archetype=override_archetype,
    )


# ──────────────────────────────────────────────
# Stage Implementations
# ──────────────────────────────────────────────


def _stage_classify(
    swarm_id: str,
    intent_text: str,
    draft_id: str,
    repo: SwarmRepository,
    events: object | None,
    pipeline_events: list[str],
    ollama_base: str,
    override_archetype: str | None,
) -> tuple[SwarmArchetypeClassification, str]:
    """Stage 2: Archetype Classification."""
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    canonical_match: dict | None = None
    if override_archetype:
        classification = classify_swarm_archetype_override(override_archetype)
    else:
        classification = None
        if action_table:
            raw_actions = action_table.get("actions_json")
            actions = (
                json.loads(raw_actions)
                if isinstance(raw_actions, str) else
                (raw_actions or [])
            )
            if actions:
                inferred_canonical = classify_action_table(actions)
                stored_canonical = (
                    repo.get_latest_archetype_classification_for_action_table(
                        action_table["action_table_id"]
                    )
                )
                if stored_canonical and stored_canonical.get("archetype_id"):
                    canonical_match = {
                        "archetype_id": stored_canonical.get("archetype_id"),
                        "confidence": stored_canonical.get("confidence", 0.0),
                        "classification_state": stored_canonical.get(
                            "classification_state", "candidate"
                        ),
                        "matched_capabilities": (
                            json.loads(stored_canonical["matched_capabilities_json"])
                            if stored_canonical.get("matched_capabilities_json")
                            else inferred_canonical.get("matched_capabilities", [])
                        ),
                        "dependency_structure": (
                            stored_canonical.get("dependency_structure")
                            or inferred_canonical.get("dependency_structure")
                            or "linear"
                        ),
                    }
                else:
                    canonical_match = inferred_canonical
                template_name = _CANONICAL_ARCHETYPE_TO_TEMPLATE.get(
                    canonical_match.get("archetype_id")
                )
                if template_name:
                    classification = classify_swarm_archetype_override(template_name)
                    classification.reasoning = (
                        "Derived from accepted action_table capability pattern: "
                        f"{canonical_match.get('matched_capabilities', [])}"
                    )
                    classification.confidence = canonical_match.get("confidence", 0.0)
                    classification.needs_clarification = (
                        canonical_match.get("classification_state") == "candidate"
                    )
        if classification is None:
            classification = classify_swarm_archetype(intent_text)

    if classification.needs_clarification:
        raise ClarificationNeeded(
            archetype=classification.swarm_archetype,
            confidence=classification.confidence,
            reasoning=classification.reasoning,
        )

    archetype_id = repo.create_intent_archetype(
        intent_id=draft_id,
        swarm_archetype=classification.swarm_archetype,
        complexity_class=classification.complexity,
        decomposition_required=(
            1 if classification.complexity != "simple" else 0
        ),
        confidence=classification.confidence,
        reasoning=classification.reasoning,
        source=classification.source,
    )

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="archetype_classified",
        actor_id="pipeline",
        summary=(
            f"Classified as {classification.swarm_archetype} "
            f"(confidence={classification.confidence:.2f})"
        ),
        details={
            "archetype": classification.swarm_archetype,
            "confidence": classification.confidence,
            "complexity": classification.complexity,
            "source": classification.source,
        },
        related_entity_type="intent_archetype",
        related_entity_id=archetype_id,
    )

    if action_table:
        repo.create_archetype_classification(
            action_table_ref=action_table["action_table_id"],
            archetype_id=classification.swarm_archetype,
            confidence=classification.confidence,
            classification_state=(
                "classified" if classification.confidence >= 0.85 else "candidate"
            ),
            matched_capabilities=(
                canonical_match.get("matched_capabilities")
                if canonical_match else None
            ),
            dependency_structure=(
                canonical_match.get("dependency_structure", "linear")
                if canonical_match else "linear"
            ),
            classification_notes={
                "reasoning": classification.reasoning,
                "source": classification.source,
                "compatibility_record": archetype_id,
            },
        )

    return classification, archetype_id


def _stage_extract_constraints(
    swarm_id: str,
    intent_text: str,
    archetype_name: str,
    draft_id: str,
    repo: SwarmRepository,
    events: object | None,
    pipeline_events: list[str],
    ollama_base: str,
) -> tuple[ConstraintSet, str]:
    """Stage 3: Constraint Extraction."""
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    canonical_classification = None
    if action_table:
        canonical_classification = (
            repo.get_latest_archetype_classification_for_action_table(
                action_table["action_table_id"]
            )
        )
    if action_table:
        constraint_set_id = extract_constraint_set_for_action_table(
            repo=repo,
            swarm_id=swarm_id,
            action_table_ref=action_table["action_table_id"],
            intent_text=intent_text,
            archetype_ref=(
                canonical_classification["archetype_classification_id"]
                if canonical_classification else None
            ),
            archetype_name=archetype_name,
            extraction_method="rule_based",
        )
        record = repo.get_constraint_set(constraint_set_id)
        constraints_payload = json.loads(record["constraints_json"] or "{}")
        constraints = constraint_set_from_dict(constraints_payload)
        warnings_raw = record.get("ambiguous_fields_json")
        if isinstance(warnings_raw, str):
            warnings = json.loads(warnings_raw or "[]")
        else:
            warnings = warnings_raw or []
    else:
        constraints = extract_constraints(intent_text, archetype_name)
        warnings = validate_constraints(constraints)
        extraction_notes = "; ".join(warnings) if warnings else None
        constraint_set_id = repo.create_constraint_set(
            intent_id=draft_id,
            action_table_ref=None,
            archetype_ref=None,
            constraints_json=json.dumps(constraint_set_to_dict(constraints)),
            extraction_notes=extraction_notes,
            missing_required=[],
            ambiguous_fields=warnings,
            clarification_questions=[],
            extraction_method="rule_based",
            resolution_state="partially_resolved" if warnings else "resolved",
        )

    cs_dict = constraint_set_to_dict(constraints)
    constraint_count = sum(
        1 for k, v in cs_dict.items()
        if v is not None and v != [] and v != {}
    )

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="constraints_extracted",
        actor_id="pipeline",
        summary=f"{constraint_count} constraints extracted",
        details={
            "constraint_count": constraint_count,
            "warnings": warnings,
        },
        related_entity_type="constraint_set",
        related_entity_id=constraint_set_id,
    )

    return constraints, constraint_set_id


def _stage_expand_template(
    archetype_name: str,
    swarm_id: str,
    events: object | None,
    pipeline_events: list[str],
) -> list[TemplateAction]:
    """Stage 4: Template Expansion."""
    template = get_template(archetype_name)
    base_actions = template.base_actions

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="action_skeleton_loaded",
        actor_id="pipeline",
        summary=(
            f"Template '{archetype_name}' loaded with "
            f"{len(base_actions)} base actions"
        ),
        details={
            "template_name": archetype_name,
            "template_version": template.version,
            "action_count": len(base_actions),
        },
    )

    return base_actions


def _stage_specialize_actions(
    swarm_id: str,
    base_actions: list[TemplateAction],
    constraints: ConstraintSet,
    archetype_name: str,
    intent_text: str,
    repo: SwarmRepository,
    events: object | None,
    pipeline_events: list[str],
    ollama_base: str,
) -> list[str]:
    """Stage 5: Action Specialization.

    Converts template base actions into task-specific swarm_actions.
    """
    repo.delete_dependencies_for_swarm(swarm_id)
    repo.delete_actions_for_swarm(swarm_id)

    canonical_rows = _load_action_table_rows(swarm_id, repo)
    canonical_paths = _load_action_table_paths(swarm_id, repo)

    action_ids = []
    base_count = len(base_actions)

    for i, template_action in enumerate(base_actions):
        expanded = _maybe_expand_action(
            template_action, constraints, archetype_name,
            intent_text, ollama_base,
        )

        for j, (name, text, action_type) in enumerate(expanded):
            step_order = len(action_ids)
            canonical_row = (
                canonical_rows[step_order]
                if step_order < len(canonical_rows) else None
            )
            effective_text = text
            if canonical_row:
                canonical_text = (
                    canonical_row.get("source_text")
                    or f"{canonical_row.get('verb', 'do')} "
                    f"{canonical_row.get('object', '')}".strip()
                )
                if canonical_text:
                    effective_text = canonical_text
            target_path = _derive_target_path(
                step_order, action_type, intent_text, canonical_row,
                canonical_paths,
            )
            action_id = repo.create_action(
                swarm_id=swarm_id,
                step_order=step_order,
                action_name=name,
                action_text=effective_text,
                action_type=action_type,
                target_path=target_path,
                action_status="defined",
            )
            action_ids.append(action_id)

    specialized_count = len(action_ids)
    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="action_table_specialized",
        actor_id="pipeline",
        summary=(
            f"Specialized {base_count} base actions -> "
            f"{specialized_count} swarm actions"
        ),
        details={
            "base_count": base_count,
            "specialized_count": specialized_count,
        },
    )

    return action_ids


def _load_action_table_paths(
    swarm_id: str,
    repo: SwarmRepository,
) -> list[str]:
    """Load output targets from the swarm's latest canonical action table."""
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    if not action_table:
        return []

    actions = _load_action_table_rows(swarm_id, repo)
    paths: list[str] = []
    for action in actions:
        destination = (action.get("destination") or "").strip()
        qualifiers = action.get("qualifiers") or {}
        qualifier_path = (
            qualifiers.get("path")
            or qualifiers.get("output_path")
            or qualifiers.get("target_path")
            or ""
        )
        candidate = destination or qualifier_path
        if _looks_like_output_target(candidate):
            paths.append(candidate)
    return paths


def _load_action_table_rows(
    swarm_id: str,
    repo: SwarmRepository,
) -> list[dict]:
    """Load canonical action-table rows for a swarm."""
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    if not action_table:
        return []
    actions_json = action_table.get("actions_json")
    if isinstance(actions_json, str):
        return json.loads(actions_json)
    return actions_json or []


def _derive_target_path(
    step_order: int,
    action_type: str,
    intent_text: str,
    canonical_row: dict | None,
    canonical_paths: list[str],
) -> str | None:
    """Derive a target_path for an action."""
    if step_order < len(canonical_paths):
        return canonical_paths[step_order]

    if action_type in ("test_run", "validation"):
        return None

    canonical_hint = ""
    if canonical_row:
        canonical_hint = (
            canonical_row.get("source_text")
            or f"{canonical_row.get('verb', '')} {canonical_row.get('object', '')}".strip()
        )
    slug = _slugify(canonical_hint or intent_text)[:30]
    if not slug:
        slug = "output"
    return f"output/{slug}.md"


def _looks_like_output_target(candidate: str) -> bool:
    """Return true for destinations that look like file-system targets."""
    if not candidate:
        return False
    lowered = candidate.lower()
    if lowered in {"email", "slack", "telegram", "finance", "team"}:
        return False
    return (
        "/" in candidate
        or "." in candidate
        or candidate.startswith("output")
        or candidate.startswith("workspace")
    )


def _maybe_expand_action(
    template_action: TemplateAction,
    constraints: ConstraintSet,
    archetype_name: str,
    intent_text: str,
    ollama_base: str,
) -> list[tuple[str, str, str]]:
    """Possibly expand a single template action into multiple actions.

    Returns list of (action_name, action_text, action_type) tuples.
    """
    if (
        template_action.action_type == "source_collection"
        and constraints.sections
    ):
        result = []
        for section in constraints.sections:
            result.append((
                f"collect_sources_{_slugify(section)}",
                (
                    f"Collect sources for section: {section}. "
                    f"{template_action.description}"
                ),
                template_action.action_type,
            ))
        return result

    if (
        template_action.action_type == "section_mapping"
        and constraints.sections
    ):
        result = []
        for section in constraints.sections:
            result.append((
                f"map_section_{_slugify(section)}",
                (
                    f"Map sources to section: {section}. "
                    f"{template_action.description}"
                ),
                template_action.action_type,
            ))
        return result

    if (
        template_action.action_type == "probabilistic_synthesis"
        and constraints.sections
    ):
        result = []
        for section in constraints.sections:
            result.append((
                f"synthesize_{_slugify(section)}",
                (
                    f"Synthesize content for section: {section}. "
                    f"{template_action.description}"
                ),
                template_action.action_type,
            ))
        return result

    action_text = template_action.description
    if template_action.specialization_hint:
        action_text = (
            f"{template_action.description} "
            f"[Hint: {template_action.specialization_hint}]"
        )

    return [(
        template_action.name,
        action_text,
        template_action.action_type,
    )]


def _stage_assign_dependencies(
    swarm_id: str,
    archetype_name: str,
    repo: SwarmRepository,
    events: object | None,
    pipeline_events: list[str],
) -> int:
    """Stage 6: Dependency Assignment."""
    actions = repo.list_actions(swarm_id)
    if not actions:
        return 0

    action_ids_by_step = {
        action["step_order"]: action["action_id"]
        for action in actions
    }
    canonical_rows = _load_action_table_rows(swarm_id, repo)

    deps_for_validation: list[tuple[str, str]] = []
    dep_count = 0
    if canonical_rows and any(row.get("dependencies") for row in canonical_rows):
        for row in canonical_rows:
            action_id = action_ids_by_step.get(row.get("step", 0) - 1)
            if not action_id:
                continue
            for depends_on_step in row.get("dependencies", []):
                depends_on_action_id = action_ids_by_step.get(depends_on_step - 1)
                if not depends_on_action_id:
                    continue
                repo.create_action_dependency(
                    swarm_id=swarm_id,
                    action_id=action_id,
                    depends_on_action_id=depends_on_action_id,
                )
                deps_for_validation.append((action_id, depends_on_action_id))
                dep_count += 1
    else:
        action_ids_ordered = [a["action_id"] for a in actions]
        for i in range(1, len(action_ids_ordered)):
            repo.create_action_dependency(
                swarm_id=swarm_id,
                action_id=action_ids_ordered[i],
                depends_on_action_id=action_ids_ordered[i - 1],
            )
            deps_for_validation.append(
                (action_ids_ordered[i], action_ids_ordered[i - 1])
            )
            dep_count += 1

    errors = validate_dependencies(actions, deps_for_validation)
    if errors:
        raise InvalidDependencies(errors)

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="dependencies_assigned",
        actor_id="pipeline",
        summary=f"{dep_count} dependencies assigned",
        details={"dependency_count": dep_count},
    )

    return dep_count


def _stage_tool_matching(
    swarm_id: str,
    repo: SwarmRepository,
    events: object | None,
    pipeline_events: list[str],
) -> dict:
    """Stage 7: Tool Matching."""
    report = run_preflight(swarm_id, repo)
    readiness = check_readiness(swarm_id, repo)
    action_table = repo.get_latest_action_table_for_swarm(swarm_id)
    tool_match_set = None
    if action_table:
        tool_match_set = repo.get_latest_tool_match_set_for_action_table(
            action_table["action_table_id"]
        )

    summary = {
        "ready": readiness.ready,
        "total": readiness.total,
        "supported": readiness.supported,
        "supported_with_constraints": readiness.supported_with_constraints,
        "unsupported": readiness.unsupported,
        "requires_new_tool": readiness.requires_new_tool,
        "pending": readiness.pending,
        "source": "tool_match_set" if tool_match_set else "action_status",
        "tool_match_set_id": (tool_match_set or {}).get("tool_match_set_id"),
    }

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="tool_matching_completed",
        actor_id="pipeline",
        summary=(
            f"Tool matching: {readiness.supported}/{readiness.total} "
            f"supported, ready={readiness.ready}"
        ),
        details=summary,
    )

    _emit_event(
        events, pipeline_events,
        swarm_id=swarm_id,
        event_type="pipeline_completed",
        actor_id="pipeline",
        summary="Action table generation pipeline completed",
        details={
            "stage_count": 6,
            "success": True,
        },
    )

    return summary


# ──────────────────────────────────────────────
# Dependency Validation (Cycle Detection)
# ──────────────────────────────────────────────


def validate_dependencies(
    actions: list[dict],
    dependencies: list[tuple[str, str]],
) -> list[str]:
    """Detect cycles in the action dependency graph using Kahn's algorithm.

    Returns list of error descriptions. Empty list means no cycles.
    """
    if not actions or not dependencies:
        return []

    action_ids = {a["action_id"] for a in actions}
    adj: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {aid: 0 for aid in action_ids}

    for action_id, depends_on in dependencies:
        if action_id not in action_ids or depends_on not in action_ids:
            continue
        adj[depends_on].append(action_id)
        in_degree[action_id] = in_degree.get(action_id, 0) + 1

    queue: deque[str] = deque()
    for aid in action_ids:
        if in_degree.get(aid, 0) == 0:
            queue.append(aid)

    sorted_count = 0
    while queue:
        node = queue.popleft()
        sorted_count += 1
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if sorted_count < len(action_ids):
        cycle_nodes = [
            aid for aid in action_ids
            if in_degree.get(aid, 0) > 0
        ]
        name_map = {a["action_id"]: a["action_name"] for a in actions}
        cycle_names = [name_map.get(n, n) for n in cycle_nodes]
        return [
            f"Cycle detected involving actions: {', '.join(cycle_names)}"
        ]

    return []


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _slugify(text: str) -> str:
    """Convert text to a safe slug for action names."""
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug[:40]
