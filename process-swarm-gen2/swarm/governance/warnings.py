"""Governance warning policy engine for Process Swarm.

Evaluates first-wave governance warnings without mutating authority-bearing
artifacts. Callers persist the returned records separately.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any


_DANGEROUS_TEST_PATTERNS = re.compile(
    r"[;|&`]"
    r"|\$\(|\$\{"
    r"|\\n|\\r"
    r"|<\(|>\(|>>"
    r"|eval\s"
    r"|curl\s|wget\s"
    r"|nc\s|ncat\s"
    r"|python\s|perl\s"
    r"|rm\s+-rf"
)

_ROOT_LIKE_SCOPES = frozenset({"", ".", "/", "*", "workspace", "workspace/"})
_FILE_OPS = frozenset({"create", "modify", "append", "delete"})
_FORBIDDEN_AUTHORITY_FIELDS = frozenset(
    {
        "execution_plan",
        "signed_plan",
        "runtime_call",
        "toolgate_call",
        "execute_now",
        "plan_payload",
        "run_payload",
        "steps",
    }
)
_FORBIDDEN_EXECUTION_CLASSES = frozenset(
    {
        "runtime_execution",
        "execution_gate",
        "toolgate",
        "plan_signing",
        "ledger_write",
        "scheduler_execution",
    }
)


def evaluate_semantic_ambiguity(
    *,
    steps: list[dict] | None,
    acceptance_tests: list[dict] | None,
    constraints: dict | None,
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    swarm_id: str | None = None,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Evaluate deterministic ambiguity conditions."""
    steps = steps or []
    acceptance_tests = acceptance_tests or []
    constraints = constraints or {}
    warnings: list[dict] = []
    base_refs = affected_artifact_refs or ([swarm_id] if swarm_id else ["unlinked"])

    if not steps:
        warnings.append(
            _make_warning(
                warning_family="semantic_ambiguity",
                severity="block",
                trigger_stage=trigger_stage,
                message="No structured behavior steps are available for review.",
                boundary_at_risk="operational_semantics",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="The system would need to invent the actual ordered behavior to continue.",
                safer_alternative="Provide explicit ordered steps before approval or acceptance.",
                proceeding_means="Proceeding would authorize behavior that has not been structurally defined.",
                affected_artifact_refs=base_refs,
                affected_swarm_ref=swarm_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )
        return warnings

    for index, step in enumerate(steps):
        op = step.get("op") or step.get("operation") or step.get("operation_type")
        if not op:
            warnings.append(
                _make_warning(
                    warning_family="semantic_ambiguity",
                    severity="block",
                    trigger_stage=trigger_stage,
                    message=f"Step {index} is missing an explicit operation type.",
                    boundary_at_risk="operational_semantics",
                    assurance_posture_before="standard",
                    assurance_posture_after="blocked",
                    impact_summary="The bridge or acceptance layer would have to infer what this step actually does.",
                    safer_alternative="Add an explicit operation for the step.",
                    proceeding_means="Proceeding would authorize inferred behavior instead of reviewed behavior.",
                    affected_artifact_refs=base_refs,
                    affected_swarm_ref=swarm_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                )
            )
            continue

        if op in _FILE_OPS and not (step.get("path") or step.get("target_path")):
            warnings.append(
                _make_warning(
                    warning_family="semantic_ambiguity",
                    severity="block",
                    trigger_stage=trigger_stage,
                    message=f"Step {index} does not declare a concrete target path.",
                    boundary_at_risk="scope_declaration",
                    assurance_posture_before="standard",
                    assurance_posture_after="blocked",
                    impact_summary="The system would have to invent the execution target to continue.",
                    safer_alternative="Declare the exact path this step can touch.",
                    proceeding_means="Proceeding would authorize undeclared file scope.",
                    affected_artifact_refs=base_refs,
                    affected_swarm_ref=swarm_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                )
            )

        if op == "delete" and not constraints.get("destructive_scope_confirmed", False):
            warnings.append(
                _make_warning(
                    warning_family="semantic_ambiguity",
                    severity="warn",
                    trigger_stage=trigger_stage,
                    message=f"Step {index} includes a destructive delete without explicit destructive-scope confirmation.",
                    boundary_at_risk="destructive_scope",
                    assurance_posture_before="standard",
                    assurance_posture_after="reduced",
                    impact_summary="A destructive operation is present, but the reviewed artifacts do not explicitly confirm that broader risk was intended.",
                    safer_alternative="Add a destructive-scope confirmation field before proceeding.",
                    proceeding_means="Proceeding accepts destructive behavior under reduced assurance.",
                    affected_artifact_refs=base_refs,
                    affected_swarm_ref=swarm_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    override_required=True,
                )
            )

        depends_on = step.get("depends_on")
        if depends_on is None:
            continue
        seen_indexes = set(range(len(steps)))
        if isinstance(depends_on, int):
            valid_dependency = depends_on in seen_indexes and depends_on < index
        else:
            valid_dependency = False
        if not valid_dependency:
            warnings.append(
                _make_warning(
                    warning_family="semantic_ambiguity",
                    severity="block",
                    trigger_stage=trigger_stage,
                    message=f"Step {index} depends on an undefined earlier step.",
                    boundary_at_risk="step_ordering",
                    assurance_posture_before="standard",
                    assurance_posture_after="blocked",
                    impact_summary="The sequence ordering cannot be reconstructed deterministically from the reviewed structure.",
                    safer_alternative="Replace the dependency with a valid earlier step reference.",
                    proceeding_means="Proceeding would authorize hidden sequencing assumptions.",
                    affected_artifact_refs=base_refs,
                    affected_swarm_ref=swarm_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                )
            )

    if acceptance_tests:
        for test in acceptance_tests:
            command = test.get("command", "")
            test_id = test.get("test_id", "unnamed")
            if not command:
                warnings.append(
                    _make_warning(
                        warning_family="semantic_ambiguity",
                        severity="block",
                        trigger_stage=trigger_stage,
                        message=f"Acceptance test {test_id} has no executable command.",
                        boundary_at_risk="acceptance_evidence",
                        assurance_posture_before="standard",
                        assurance_posture_after="blocked",
                        impact_summary="An empty acceptance test provides no deterministic success check.",
                        safer_alternative="Populate the test with a deterministic command and expected exit code.",
                        proceeding_means="Proceeding would treat a missing test as if it were valid evidence.",
                        affected_artifact_refs=base_refs,
                        affected_swarm_ref=swarm_id,
                        actor_id=actor_id,
                        actor_role=actor_role,
                    )
                )
            elif _DANGEROUS_TEST_PATTERNS.search(command):
                warnings.append(
                    _make_warning(
                        warning_family="semantic_ambiguity",
                        severity="block",
                        trigger_stage=trigger_stage,
                        message=f"Acceptance test {test_id} contains non-deterministic or dangerous shell patterns.",
                        boundary_at_risk="acceptance_evidence",
                        assurance_posture_before="standard",
                        assurance_posture_after="blocked",
                        impact_summary="Unsafe acceptance tests weaken replayability and can hide undeclared side effects.",
                        safer_alternative="Replace the test with a deterministic bounded command.",
                        proceeding_means="Proceeding would authorize ambiguous verification behavior.",
                        affected_artifact_refs=base_refs,
                        affected_swarm_ref=swarm_id,
                        actor_id=actor_id,
                        actor_role=actor_role,
                    )
                )

    return warnings


def evaluate_scope_expansion(
    *,
    exact_paths: list[str],
    allowed_paths: list[str],
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    swarm_id: str | None = None,
    run_id: str | None = None,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Evaluate scope widening and policy-ceiling conditions."""
    refs = affected_artifact_refs or [r for r in (swarm_id, run_id) if r] or ["unlinked"]
    warnings: list[dict] = []
    normalized_exact = sorted({p for p in exact_paths if p})
    normalized_allowed = sorted({p for p in allowed_paths if p is not None})

    if not normalized_allowed:
        return [
            _make_warning(
                warning_family="scope_expansion",
                severity="block",
                trigger_stage=trigger_stage,
                message="No allowed path scope was declared for the requested action.",
                boundary_at_risk="capability_scope",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="The system would have to authorize scope without a declared boundary.",
                safer_alternative="Declare explicit allowed paths before proceeding.",
                proceeding_means="Proceeding would authorize unbounded filesystem scope.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        ]

    if any(path in _ROOT_LIKE_SCOPES for path in normalized_allowed):
        warnings.append(
            _make_warning(
                warning_family="scope_expansion",
                severity="block",
                trigger_stage=trigger_stage,
                message="The requested scope includes a root-like allowed path.",
                boundary_at_risk="capability_scope",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="Root-like scopes exceed the first-wave policy ceiling for governed review paths.",
                safer_alternative="Constrain the scope to the exact output or target prefixes under review.",
                proceeding_means="Proceeding would broaden authority beyond the allowed policy ceiling.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )

    if not normalized_exact:
        warnings.append(
            _make_warning(
                warning_family="scope_expansion",
                severity="block",
                trigger_stage=trigger_stage,
                message="The exact modified paths cannot be derived from the reviewed object.",
                boundary_at_risk="capability_scope",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="The scope request cannot be compared to concrete targets, so review cannot confirm minimum authority.",
                safer_alternative="Provide explicit file targets before requesting scope approval.",
                proceeding_means="Proceeding would authorize scope without a bounded target set.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )
        return warnings

    broader_paths = []
    minimal_prefix = _common_directory_prefix(normalized_exact)
    for allowed in normalized_allowed:
        if not any(path == allowed or path.startswith(allowed) for path in normalized_exact):
            broader_paths.append(allowed)
            continue
        if allowed == minimal_prefix:
            continue
        exact_prefix_match = any(allowed == path for path in normalized_exact)
        if not exact_prefix_match:
            broader_paths.append(allowed)

    if broader_paths:
        warnings.append(
            _make_warning(
                warning_family="scope_expansion",
                severity="warn",
                trigger_stage=trigger_stage,
                message="The requested scope is broader than the exact reviewed targets.",
                boundary_at_risk="capability_scope",
                assurance_posture_before="standard",
                assurance_posture_after="reduced",
                impact_summary=f"Allowed paths {broader_paths} cover more surface area than the exact modified paths {normalized_exact}.",
                safer_alternative="Constrain allowed paths to the exact modified files or the narrowest required prefixes.",
                proceeding_means="Proceeding accepts a broader-than-minimal capability lease or review scope.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
                override_required=True,
            )
        )

    return warnings


def evaluate_reduced_assurance_governance(
    *,
    prior_roles: set[str],
    current_role: str,
    trigger_stage: str,
    actor_id: str,
    swarm_id: str,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Evaluate role-collapse based reduced assurance."""
    refs = affected_artifact_refs or [swarm_id]
    previous = set(prior_roles)
    if not previous or previous == {current_role}:
        return []

    reduction_type = "single_operator_path"
    if previous == {"author"} and current_role == "reviewer":
        reduction_type = "author_reviewer_role_collapse"
    elif previous == {"reviewer"} and current_role == "publisher":
        reduction_type = "reviewer_publisher_role_collapse"

    # Complete governance collapse: actor holds 3+ distinct lifecycle roles
    all_roles = previous | {current_role}
    governance_roles = all_roles & {"author", "reviewer", "publisher"}
    severity = "block" if len(governance_roles) >= 3 else "warn"

    return [
        _make_warning(
            warning_family="reduced_assurance_governance",
            severity=severity,
            trigger_stage=trigger_stage,
            message="The same actor is performing multiple governance roles for this swarm lifecycle.",
            boundary_at_risk="assurance_separation",
            assurance_posture_before="standard",
            assurance_posture_after="reduced",
            impact_summary=f"Actor {actor_id} already holds roles {sorted(previous)} and is now acting as {current_role}.",
            safer_alternative="Use a distinct operator for the next governance step.",
            proceeding_means="Proceeding accepts reduced-assurance governance for this lifecycle decision.",
            affected_artifact_refs=refs,
            affected_swarm_ref=swarm_id,
            actor_id=actor_id,
            actor_role=current_role,
            override_required=True,
            notes=reduction_type,
        )
    ]


def evaluate_secondary_truth(
    *,
    run: dict,
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    preview_only: bool = False,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Evaluate finality claims against authoritative runtime evidence."""
    run_id = run.get("run_id")
    swarm_id = run.get("swarm_id")
    refs = affected_artifact_refs or [r for r in (run_id, swarm_id) if r] or ["unlinked"]
    status = run.get("run_status", "unknown")
    runtime_execution_id = run.get("runtime_execution_id")
    artifact_refs = _ensure_list(run.get("artifact_refs_json") or run.get("artifact_refs"))
    if preview_only:
        return [
            _make_warning(
                warning_family="secondary_truth",
                severity="warn",
                trigger_stage=trigger_stage,
                message="This delivery or preview surface is draft-only and is not backed by runtime execution evidence yet.",
                boundary_at_risk="truth_source_integrity",
                assurance_posture_before="standard",
                assurance_posture_after="reduced",
                impact_summary="A preview can describe intent, but it cannot claim that the governed runtime has completed the work.",
                safer_alternative="Present the preview as non-final until a runtime execution record exists.",
                proceeding_means="Proceeding accepts a draft display that is explicitly non-authoritative.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        ]

    if status in {"succeeded", "failed", "completed"} and (not runtime_execution_id or not artifact_refs):
        return [
            _make_warning(
                warning_family="secondary_truth",
                severity="block",
                trigger_stage=trigger_stage,
                message="The delivery path would claim a final run outcome without authoritative runtime evidence.",
                boundary_at_risk="truth_source_integrity",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="Registry-local status alone is not sufficient to support an externally visible completion or failure claim.",
                safer_alternative="Resolve the runtime execution record and linked evidence before delivering a final status.",
                proceeding_means="Proceeding would let convenience state outrank authoritative runtime artifacts.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        ]

    return []


def evaluate_authority_boundary(
    *,
    subject: dict,
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    swarm_id: str | None = None,
    run_id: str | None = None,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Detect attempts to introduce effective execution authority outside runtime."""
    refs = affected_artifact_refs or [r for r in (swarm_id, run_id) if r] or ["unlinked"]
    warnings: list[dict] = []

    authority_keys = sorted(_FORBIDDEN_AUTHORITY_FIELDS.intersection(subject.keys()))
    if authority_keys:
        warnings.append(
            _make_warning(
                warning_family="authority_boundary",
                severity="block",
                trigger_stage=trigger_stage,
                message="A non-runtime surface is carrying execution-shaped payload fields.",
                boundary_at_risk="authority_boundary",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary=f"Fields {authority_keys} would let a non-runtime surface transport executable intent instead of a governed trigger or proposal.",
                safer_alternative="Emit references or trigger artifacts only, never executable payloads.",
                proceeding_means="Proceeding would expand effective execution control outside the governed runtime.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )

    if subject.get("allow_network") or subject.get("allow_package_install") or subject.get("allow_external_apis"):
        warnings.append(
            _make_warning(
                warning_family="authority_boundary",
                severity="block",
                trigger_stage=trigger_stage,
                message="The requested bridge or scheduler input asks for side effects outside the governed runtime default-deny boundary.",
                boundary_at_risk="authority_boundary",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary="This surface would be carrying authority for network, package installation, or external API effects that are not granted here.",
                safer_alternative="Keep non-runtime surfaces declarative and let the runtime derive capability needs from validated artifacts.",
                proceeding_means="Proceeding would blur the execution authority boundary.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                affected_run_ref=run_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )

    return warnings


def evaluate_replay_determinism(
    *,
    subject: dict,
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    swarm_id: str | None = None,
    run_id: str | None = None,
    affected_artifact_refs: list[str] | None = None,
    high_assurance: bool = False,
) -> list[dict]:
    """Detect legal but weaker replay/audit conditions."""
    refs = affected_artifact_refs or [r for r in (swarm_id, run_id) if r] or ["unlinked"]
    warnings: list[dict] = []

    if trigger_stage == "scheduler_configuration":
        if subject.get("trigger_type") == "recurring" and not subject.get("timezone"):
            warnings.append(
                _make_warning(
                    warning_family="replay_determinism",
                    severity="warn",
                    trigger_stage=trigger_stage,
                    message="Recurring schedule has no explicit timezone.",
                    boundary_at_risk="replayability",
                    assurance_posture_before="standard",
                    assurance_posture_after="reduced",
                    impact_summary="The same cron expression can resolve differently across environments when timezone is implicit.",
                    safer_alternative="Set an explicit timezone for recurring schedules.",
                    proceeding_means="Proceeding accepts weaker replay and audit reconstruction for scheduled runs.",
                    affected_artifact_refs=refs,
                    affected_swarm_ref=swarm_id,
                    affected_run_ref=run_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    override_required=True,
                )
            )

    if trigger_stage == "bridge_compilation":
        if not subject.get("version"):
            severity = "block" if high_assurance else "warn"
            warnings.append(
                _make_warning(
                    warning_family="replay_determinism",
                    severity=severity,
                    trigger_stage=trigger_stage,
                    message="Bridge input does not declare a source artifact version.",
                    boundary_at_risk="replayability",
                    assurance_posture_before="standard",
                    assurance_posture_after="blocked" if severity == "block" else "reduced",
                    impact_summary="The translated artifact cannot be deterministically tied back to a stable source contract version.",
                    safer_alternative="Declare the source artifact version explicitly before compilation.",
                    proceeding_means="Proceeding accepts weaker replay and audit reconstruction for this translated proposal.",
                    affected_artifact_refs=refs,
                    affected_swarm_ref=swarm_id,
                    affected_run_ref=run_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    override_required=severity == "warn",
                )
            )
        if subject.get("environment_sensitive"):
            warnings.append(
                _make_warning(
                    warning_family="replay_determinism",
                    severity="warn",
                    trigger_stage=trigger_stage,
                    message="Bridge translation declared environment-sensitive behavior.",
                    boundary_at_risk="replayability",
                    assurance_posture_before="standard",
                    assurance_posture_after="reduced",
                    impact_summary="Translation may vary based on environment inputs that are not part of the reviewed artifact contract.",
                    safer_alternative="Eliminate environment-sensitive translation inputs or record them explicitly as evidence.",
                    proceeding_means="Proceeding accepts weaker deterministic reconstruction of bridge behavior.",
                    affected_artifact_refs=refs,
                    affected_swarm_ref=swarm_id,
                    affected_run_ref=run_id,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    override_required=True,
                )
            )

    return warnings


def evaluate_extension_risk(
    *,
    subject: dict,
    trigger_stage: str,
    actor_id: str,
    actor_role: str | None = None,
    swarm_id: str | None = None,
    affected_artifact_refs: list[str] | None = None,
) -> list[dict]:
    """Evaluate extension-review risk for tools, adapters, and new constructs."""
    refs = affected_artifact_refs or ([swarm_id] if swarm_id else ["unlinked"])
    warnings: list[dict] = []

    execution_class = subject.get("execution_class") or ""
    if execution_class in _FORBIDDEN_EXECUTION_CLASSES:
        warnings.append(
            _make_warning(
                warning_family="extension_risk",
                severity="block",
                trigger_stage=trigger_stage,
                message="The reviewed extension introduces an execution class that would amplify authority outside the approved runtime model.",
                boundary_at_risk="authority_boundary",
                assurance_posture_before="standard",
                assurance_posture_after="blocked",
                impact_summary=f"Execution class '{execution_class}' overlaps with protected runtime authority surfaces.",
                safer_alternative="Redesign the extension so it remains declarative or runtime-internal.",
                proceeding_means="Proceeding would create a new authority surface outside the runtime.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                actor_id=actor_id,
                actor_role=actor_role,
            )
        )

    maturity_status = subject.get("maturity_status")
    supports_dry_run = subject.get("supports_dry_run")
    if maturity_status in {"experimental", "planned"} or supports_dry_run is False:
        warnings.append(
            _make_warning(
                warning_family="extension_risk",
                severity="warn",
                trigger_stage=trigger_stage,
                message="The reviewed extension increases architecture risk and needs explicit acknowledgment before use.",
                boundary_at_risk="extension_governance",
                assurance_posture_before="standard",
                assurance_posture_after="reduced",
                impact_summary=(
                    f"maturity_status={maturity_status!r}, supports_dry_run={supports_dry_run!r} "
                    "reduces confidence that the extension can be safely reviewed and replayed."
                ),
                safer_alternative="Use an active governed extension with dry-run support, or document a mitigation plan before continuing.",
                proceeding_means="Proceeding accepts higher extension risk under reduced assurance.",
                affected_artifact_refs=refs,
                affected_swarm_ref=swarm_id,
                actor_id=actor_id,
                actor_role=actor_role,
                override_required=True,
            )
        )

    return warnings


def summarize_warnings(warnings: list[dict]) -> dict:
    """Summarize warning counts and resulting assurance posture."""
    counts = {"notice": 0, "warn": 0, "block": 0}
    for warning in warnings:
        counts[warning["severity"]] += 1
    posture = "standard"
    if counts["block"]:
        posture = "blocked"
    elif counts["warn"]:
        posture = "reduced"
    return {
        "counts": counts,
        "assurance_posture": posture,
        "can_proceed": counts["block"] == 0,
    }


def build_reduced_assurance_event(
    *,
    warning: dict,
    governance_action_type: str,
    affected_artifact_refs: list[str],
    actor_id: str,
    actor_role: str | None,
    reason_summary: str,
    warning_record_ref: str,
    acknowledged_by: str | None = None,
    acknowledged_at: str | None = None,
    normal_expected_governance: str | None = None,
    actual_governance_path: str | None = None,
    compensating_controls: list[str] | None = None,
    policy_refs: list[str] | None = None,
    swarm_id: str | None = None,
    run_id: str | None = None,
) -> dict:
    """Build a reduced-assurance governance event from a warning."""
    now = _now()
    reduction_type = warning.get("notes") or "single_operator_path"
    return {
        "artifact_type": "reduced_assurance_governance_event",
        "schema_version": "v1.0",
        "event_id": f"ra-{hashlib.sha256((warning_record_ref + now).encode()).hexdigest()[:12]}",
        "swarm_id": swarm_id,
        "run_id": run_id,
        "governance_action_type": governance_action_type,
        "reduction_type": reduction_type,
        "assurance_posture_before": "standard",
        "assurance_posture_after": "reduced",
        "reason_summary": reason_summary,
        "normal_expected_governance": normal_expected_governance,
        "actual_governance_path": actual_governance_path,
        "compensating_controls": compensating_controls or [],
        "affected_artifact_refs": affected_artifact_refs,
        "policy_refs": policy_refs or [],
        "warning_record_ref": warning_record_ref,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "acknowledged_by": acknowledged_by,
        "acknowledged_at": acknowledged_at,
        "created_at": now,
    }


def persist_warning_records(
    repo: Any,
    events: Any,
    warnings: list[dict],
    *,
    operator_decision: str | None = None,
    override_reason_category: str | None = None,
    override_reason: str | None = None,
    acknowledged: bool = False,
) -> list[dict]:
    """Persist warning records and mirror them into swarm events."""
    persisted = []
    acknowledged_at = _now() if acknowledged else None
    for warning in warnings:
        payload = dict(warning)
        if operator_decision:
            payload["operator_decision"] = operator_decision
        if acknowledged:
            payload["acknowledged_at"] = acknowledged_at
        if override_reason_category:
            payload["override_reason_category"] = override_reason_category
        if override_reason:
            payload["override_reason"] = override_reason
        warning_id = repo.create_governance_warning_record(payload)
        payload["warning_id"] = warning_id
        swarm_id = payload.get("swarm_id") or payload.get("affected_swarm_ref")
        if swarm_id:
            events.governance_warning_recorded(
                swarm_id,
                warning_id,
                payload["warning_family"],
                payload["severity"],
                payload["actor_id"],
                payload["trigger_stage"],
            )
        persisted.append(payload)
    return persisted


def _make_warning(
    *,
    warning_family: str,
    severity: str,
    trigger_stage: str,
    message: str,
    boundary_at_risk: str,
    assurance_posture_before: str,
    assurance_posture_after: str,
    impact_summary: str,
    safer_alternative: str,
    proceeding_means: str,
    affected_artifact_refs: list[str],
    actor_id: str,
    actor_role: str | None = None,
    affected_swarm_ref: str | None = None,
    affected_run_ref: str | None = None,
    override_required: bool = False,
    notes: str | None = None,
) -> dict:
    payload = {
        "artifact_type": "governance_warning_record",
        "schema_version": "v1.0",
        "warning_family": warning_family,
        "severity": severity,
        "trigger_stage": trigger_stage,
        "message": message,
        "boundary_at_risk": boundary_at_risk,
        "assurance_posture_before": assurance_posture_before,
        "assurance_posture_after": assurance_posture_after,
        "impact_summary": impact_summary,
        "safer_alternative": safer_alternative,
        "proceeding_means": proceeding_means,
        "affected_artifact_refs": affected_artifact_refs,
        "affected_swarm_ref": affected_swarm_ref,
        "affected_run_ref": affected_run_ref,
        "operator_decision": "deferred" if severity == "warn" else "blocked_by_system" if severity == "block" else "other",
        "override_required": override_required,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "created_at": _now(),
        "notes": notes,
    }
    payload["decision_fingerprint"] = _decision_fingerprint(payload)
    payload["warning_id"] = (
        f"warn-{payload['decision_fingerprint'][:8]}-"
        f"{hashlib.sha256(_now().encode()).hexdigest()[:6]}"
    )
    return payload


def _decision_fingerprint(payload: dict[str, Any]) -> str:
    relevant = {
        "warning_family": payload["warning_family"],
        "severity": payload["severity"],
        "trigger_stage": payload["trigger_stage"],
        "message": payload["message"],
        "boundary_at_risk": payload["boundary_at_risk"],
        "assurance_posture_before": payload.get("assurance_posture_before"),
        "assurance_posture_after": payload.get("assurance_posture_after"),
        "affected_artifact_refs": sorted(payload.get("affected_artifact_refs", [])),
        "affected_swarm_ref": payload.get("affected_swarm_ref"),
        "affected_run_ref": payload.get("affected_run_ref"),
    }
    return hashlib.sha256(json.dumps(relevant, sort_keys=True).encode()).hexdigest()


def _ensure_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            loaded = json.loads(value)
            if isinstance(loaded, list):
                return loaded
        except json.JSONDecodeError:
            return [value]
    return [str(value)]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _common_directory_prefix(paths: list[str]) -> str:
    if not paths:
        return ""
    if len(paths) == 1:
        single = paths[0].rstrip("/")
        if "/" not in single:
            return single
        return single.rsplit("/", 1)[0] + "/"
    split_paths = [path.strip("/").split("/") for path in paths]
    prefix_parts: list[str] = []
    for parts in zip(*split_paths):
        if len(set(parts)) != 1:
            break
        prefix_parts.append(parts[0])
    if not prefix_parts:
        return paths[0]
    prefix = "/".join(prefix_parts)
    if prefix != paths[0]:
        prefix += "/"
    return prefix
