"""GRITS Audit — Swarm Definition.

A 9-step, multi-engine integrity surveillance pipeline with deterministic
inference routing:

    Step 1: Build Request       (no LLM)
    Step 2: Resolve Suites      (no LLM)
    Step 3: Execute Diagnostics (no LLM)
    Step 4: Baseline Compare    (no LLM)
    Step 5: Analyze Drift       (no LLM)
    Step 6: Classify Findings   (Ollama)
    Step 7: Generate Recs       (Apple Intelligence)
    Step 8: Compile Report      (no LLM)
    Step 9: Write Evidence      (no LLM)

This module provides the behavior sequence steps and a registration
function to install the swarm into a SwarmRepository.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

# ── Inference Map ──

INFERENCE_MAP = {
    "classify_findings": "ollama",
    "generate_recommendations": "apple_intelligence",
}

# ── Pipeline Steps ──

GRITS_AUDIT_STEPS = [
    # Step 1: Build Request (non-LLM)
    {
        "step_id": "build_request",
        "operation_type": "invoke_capability",
        "tool_name": "run_manager",
        "parameters": {},
        "description": "Build and validate the GRITS run request: target_id, suite_ids, baseline_ref, trigger_type.",
        "engine": None,
    },

    # Step 2: Resolve Suites (non-LLM)
    {
        "step_id": "resolve_suites",
        "operation_type": "invoke_capability",
        "tool_name": "policy_loader",
        "parameters": {},
        "description": "Resolve suite_ids to concrete test descriptors. Suites: smoke (4 tests), regression (4), drift (4), redteam (3).",
        "engine": None,
    },

    # Step 3: Execute Diagnostics (non-LLM)
    {
        "step_id": "execute_diagnostics",
        "operation_type": "invoke_capability",
        "tool_name": "rule_validator",
        "parameters": {},
        "description": "Execute all resolved diagnostic tests against the target system. Each test produces a structured result with status, metrics, and evidence references.",
        "engine": None,
    },

    # Step 4: Baseline Compare (non-LLM)
    {
        "step_id": "baseline_compare",
        "operation_type": "invoke_capability",
        "tool_name": "rule_validator",
        "parameters": {},
        "description": "Load the baseline snapshot and compare current diagnostic results against known-good state. Identify regressions, improvements, drift signals, and new tests.",
        "engine": None,
    },

    # Step 5: Analyze Drift (non-LLM)
    {
        "step_id": "analyze_drift",
        "operation_type": "invoke_capability",
        "tool_name": "rule_validator",
        "parameters": {},
        "description": "Analyze baseline comparison for configuration and state drift. Produce drift signal descriptors with affected components.",
        "engine": None,
    },

    # Step 6: Classify Findings (Ollama)
    {
        "step_id": "classify_findings",
        "operation_type": "invoke_capability",
        "tool_name": "decision_engine",
        "parameters": {"model": "qwen3:8b"},
        "description": "Classify all drift signals into findings with severity (critical, high, medium, low), category (regression, stability, performance, policy), and confidence scores.",
        "engine": "ollama",
    },

    # Step 7: Generate Recommendations (Apple Intelligence)
    {
        "step_id": "generate_recommendations",
        "operation_type": "invoke_capability",
        "tool_name": "decision_engine",
        "parameters": {},
        "description": "Generate prioritized maintenance recommendations based on classified findings. Each recommendation references specific evidence and affected components.",
        "engine": "apple_intelligence",
    },

    # Step 8: Compile Report (non-LLM)
    {
        "step_id": "compile_report",
        "operation_type": "invoke_capability",
        "tool_name": "report_formatter",
        "parameters": {},
        "description": "Compile the machine-readable maintenance report (JSON) and human-readable summary (Markdown). Determine overall status: green (pass), yellow (warnings), red (critical findings).",
        "engine": None,
    },

    # Step 9: Write Evidence (non-LLM)
    {
        "step_id": "write_evidence",
        "operation_type": "invoke_capability",
        "tool_name": "delivery_engine",
        "parameters": {},
        "description": "Write all evidence artifacts to grits_runs/{run_id}/: manifest.json, diagnostics.json, baseline_comparison.json, findings.json, remediation.json, maintenance_report.json, maintenance_report.md. Record SHA-256 hashes.",
        "engine": None,
    },
]


# ── Artifact Metadata Template ──

def build_artifact_metadata(
    run_id: str,
    inference_trace: dict,
) -> dict:
    """Build the artifact metadata for a GRITS audit run."""
    return {
        "artifact_type": "grits_audit_bundle",
        "artifact_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "inference_trace": inference_trace,
    }


# ── Lineage Template ──

def build_lineage(
    source_ids: list[str],
    stages: list[dict],
) -> dict:
    """Build the lineage record for a GRITS audit run."""
    import hashlib
    content = json.dumps({"sources": source_ids, "stages": stages}, sort_keys=True)
    return {
        "lineage": {
            "sources": source_ids,
            "stages": stages,
            "determinism_hash": hashlib.sha256(content.encode()).hexdigest(),
        }
    }


# ── Registration ──

def register_grits_audit_swarm(repo: Any) -> dict:
    """Register GRITS Audit as a swarm definition.

    Creates the swarm, behavior sequence, and enables it.
    Returns the swarm record dict.
    """
    description = (
        "GRITS (Governed Runtime Integrity Testing System) — "
        "reporting-only integrity surveillance. "
        "Executes diagnostic suites (smoke, regression, drift, redteam) "
        "against the local platform, compares against baseline, "
        "classifies findings, and produces evidence bundles. "
        "Never modifies the target system."
    )

    # Create the swarm record (returns generated swarm_id)
    swarm_id = repo.create_swarm(
        swarm_name="GRITS Audit",
        description=description,
        created_by="system",
    )

    # Enable immediately (skip drafting for system-defined swarms)
    repo.update_swarm(swarm_id, lifecycle_status="enabled")

    # Create behavior sequence with the pipeline steps
    bs_id = repo.create_behavior_sequence(
        swarm_id=swarm_id,
        name="grits_audit_pipeline",
        ordered_steps=GRITS_AUDIT_STEPS,
        target_paths=["grits_runs/", "evidence/"],
        acceptance_tests=[
            {"test": "maintenance_report.json exists in grits_runs/{run_id}/", "type": "file_exists"},
            {"test": "all evidence artifacts have SHA-256 hashes", "type": "assertion"},
        ],
        execution_class="adapter_only",
    )

    # Register all adapter tools referenced in the pipeline
    _register_pipeline_tools(repo)

    # Create swarm_actions with inference assignments (clickable in UI)
    _register_pipeline_actions(repo, swarm_id)

    return {
        "swarm_id": swarm_id,
        "name": "GRITS Audit",
        "behavior_sequence_id": bs_id,
        "step_count": len(GRITS_AUDIT_STEPS),
        "inference_map": INFERENCE_MAP,
    }


_TOOL_DESCRIPTIONS = {
    "run_manager": ("Run Manager", "request", "Builds and validates the GRITS run request"),
    "policy_loader": ("Policy Loader", "resolution", "Resolves suite_ids to concrete test descriptors"),
    "rule_validator": ("Rule Validator", "diagnostics", "Executes diagnostics, baseline comparison, and drift analysis"),
    "decision_engine": ("Decision Engine", "classification", "Classifies findings and generates recommendations"),
    "report_formatter": ("Report Formatter", "reporting", "Compiles machine-readable and human-readable reports"),
    "delivery_engine": ("Delivery Engine", "evidence", "Writes evidence artifacts and records SHA-256 hashes"),
}


def _register_pipeline_tools(repo: Any) -> None:
    """Register all pipeline tools in the tool registry (idempotent)."""
    for tool_name, (label, family, desc) in _TOOL_DESCRIPTIONS.items():
        existing = repo.get_tool_by_name(tool_name)
        if existing:
            continue
        engine = INFERENCE_MAP.get(tool_name, None)
        exec_class = "adapter_only"
        if engine:
            exec_class = f"adapter:{engine}"
        repo.create_tool(
            tool_name=tool_name,
            description=desc,
            tool_family=family,
            execution_class=exec_class,
            maturity_status="active",
            supports_dry_run=False,
        )


_ENGINE_MODELS = {
    "ollama": "qwen3:8b",
    "apple_intelligence": "apple-fm-on-device",
}


def _register_pipeline_actions(repo: Any, swarm_id: str) -> None:
    """Create swarm_actions with inference engine/model assignments."""
    # Don't duplicate if actions already exist
    existing = repo.list_actions(swarm_id)
    if existing:
        return
    for i, step in enumerate(GRITS_AUDIT_STEPS):
        engine = step.get("engine")
        model = step.get("parameters", {}).get("model") or _ENGINE_MODELS.get(engine)
        repo.create_action(
            swarm_id=swarm_id,
            step_order=i + 1,
            action_name=step.get("tool_name", step.get("step_id", f"step_{i}")),
            action_text=step.get("description", ""),
            action_type=step.get("tool_name"),
            operation_type=step.get("operation_type", "invoke_capability"),
            inference_engine=engine,
            inference_model=model,
            fallback_engine=step.get("fallback_engine"),
            action_status="approved",
        )


def find_or_register(repo: Any) -> str:
    """Find existing GRITS Audit swarm or register a new one.

    Returns the swarm_id.
    """
    # Check if already registered
    swarms = repo.list_swarms()
    for swarm in swarms:
        if isinstance(swarm, dict):
            name = swarm.get("swarm_name") or swarm.get("name", "")
            if name == "GRITS Audit":
                swarm_id = swarm["swarm_id"]
                # Ensure actions exist (idempotent)
                _register_pipeline_actions(repo, swarm_id)
                return swarm_id

    # Register
    result = register_grits_audit_swarm(repo)
    return result["swarm_id"]
