"""Nik's Context Report — Swarm Definition.

A 6-stage, multi-engine intelligence briefing pipeline with deterministic
inference routing:

    Stage 1: Ingestion     (no LLM)
    Stage 2: Extraction    (Ollama)
    Stage 3: Clustering    (Ollama)
    Stage 4: Prioritization (Apple Intelligence)
    Stage 5: Synthesis     (Apple Intelligence)
    Stage 6: Validation    (Ollama primary, Apple Intelligence fallback)

This module provides the behavior sequence steps and a registration
function to install the swarm into a SwarmRepository.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

# ── Inference Map (per spec Section IV) ──

INFERENCE_MAP = {
    "extraction": "ollama",
    "clustering": "ollama",
    "prioritization": "apple_intelligence",
    "synthesis": "apple_intelligence",
    "validation_primary": "ollama",
    "validation_fallback": "apple_intelligence",
}

# ── Pipeline Steps ──

CONTEXT_REPORT_STEPS = [
    # Stage 1: Ingestion (non-LLM setup)
    {
        "step_id": "s1_setup",
        "operation_type": "invoke_capability",
        "tool_name": "run_manager",
        "parameters": {},
        "description": "Create workspace directories and run manifest",
        "engine": None,
    },
    {
        "step_id": "s1_collect",
        "operation_type": "invoke_capability",
        "tool_name": "source_collector",
        "parameters": {},
        "description": "Collect raw source materials",
        "engine": None,
    },
    {
        "step_id": "s1_normalize",
        "operation_type": "invoke_capability",
        "tool_name": "source_normalizer",
        "parameters": {"max_chars": 50000},
        "description": "Normalize and clean source content",
        "engine": None,
    },
    {
        "step_id": "s1_freshness",
        "operation_type": "invoke_capability",
        "tool_name": "freshness_filter",
        "parameters": {"max_age_days": 7},
        "description": "Filter sources by freshness window",
        "engine": None,
    },

    # Stage 2: Extraction (Ollama)
    {
        "step_id": "s2_extraction",
        "operation_type": "invoke_capability",
        "tool_name": "cr_extraction",
        "parameters": {"model": "qwen3:8b"},
        "description": "Extract entities, events, topics, and signals via Ollama",
        "engine": "ollama",
    },

    # Stage 3: Clustering (Ollama)
    {
        "step_id": "s3_clustering",
        "operation_type": "invoke_capability",
        "tool_name": "cr_clustering",
        "parameters": {"model": "qwen3:8b"},
        "description": "Cluster and categorize signals via Ollama",
        "engine": "ollama",
    },

    # Stage 4: Prioritization (Apple Intelligence)
    {
        "step_id": "s4_prioritization",
        "operation_type": "invoke_capability",
        "tool_name": "cr_prioritization",
        "parameters": {},
        "description": "Rank signals by impact, novelty, relevance via Apple Intelligence",
        "engine": "apple_intelligence",
    },

    # Stage 5: Synthesis (Apple Intelligence)
    {
        "step_id": "s5_synthesis",
        "operation_type": "invoke_capability",
        "tool_name": "cr_synthesis",
        "parameters": {},
        "description": "Generate full report narrative via Apple Intelligence",
        "engine": "apple_intelligence",
    },

    # Stage 6: Validation (Ollama primary, Apple Intelligence fallback)
    {
        "step_id": "s6_validation",
        "operation_type": "invoke_capability",
        "tool_name": "cr_validation",
        "parameters": {"model": "qwen3:8b"},
        "description": "Validate report structure (Ollama) with tone refinement fallback (Apple Intelligence)",
        "engine": "ollama",
        "fallback_engine": "apple_intelligence",
    },

    # Stage 6b: Decision & Bundling
    {
        "step_id": "s6_decision",
        "operation_type": "invoke_capability",
        "tool_name": "decision_engine",
        "parameters": {},
        "description": "Go/no-go decision based on validation results",
        "engine": None,
    },
    {
        "step_id": "s6_bundle",
        "operation_type": "invoke_capability",
        "tool_name": "bundle_builder",
        "parameters": {},
        "description": "Bundle report artifacts for delivery",
        "engine": None,
    },
]


# ── Artifact Metadata Template (per spec Section VI) ──

def build_artifact_metadata(
    run_id: str,
    inference_trace: dict,
) -> dict:
    """Build the artifact metadata per spec Section VI."""
    return {
        "artifact_type": "context_report_text",
        "artifact_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "inference_trace": inference_trace,
    }


# ── Lineage Template (per spec Section VII) ──

def build_lineage(
    source_ids: list[str],
    stages: list[dict],
) -> dict:
    """Build the lineage record per spec Section VII."""
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

def register_context_report_swarm(repo: Any) -> dict:
    """Register Nik's Context Report as a swarm definition.

    Creates the swarm, behavior sequence, and enables it.
    Returns the swarm record dict.
    """
    description = (
        "Multi-engine intelligence briefing pipeline. "
        "6 stages: Ingestion \u2192 Extraction (Ollama) \u2192 "
        "Clustering (Ollama) \u2192 Prioritization (Apple Intelligence) \u2192 "
        "Synthesis (Apple Intelligence) \u2192 Validation (Ollama + AI fallback). "
        "Deterministic engine routing per stage."
    )

    # Create the swarm record (returns generated swarm_id)
    swarm_id = repo.create_swarm(
        swarm_name="Nik's Context Report",
        description=description,
        created_by="system",
    )

    # Enable immediately (skip drafting for system-defined swarms)
    repo.update_swarm(swarm_id, lifecycle_status="enabled")

    # Create behavior sequence with the pipeline steps
    bs_id = repo.create_behavior_sequence(
        swarm_id=swarm_id,
        name="context_report_pipeline",
        ordered_steps=CONTEXT_REPORT_STEPS,
        target_paths=["workspace/", "output/"],
        acceptance_tests=[
            {"test": "report file exists in output/", "type": "file_exists"},
            {"test": "validation passed or refined", "type": "assertion"},
        ],
        execution_class="adapter_only",
    )

    # Register all adapter tools referenced in the pipeline
    _register_pipeline_tools(repo)

    return {
        "swarm_id": swarm_id,
        "name": "Nik's Context Report",
        "behavior_sequence_id": bs_id,
        "step_count": len(CONTEXT_REPORT_STEPS),
        "inference_map": INFERENCE_MAP,
    }


_TOOL_DESCRIPTIONS = {
    "run_manager": ("Workspace & Manifest", "ingestion", "Creates workspace directories and writes run manifest"),
    "source_collector": ("Source Collection", "ingestion", "Collects raw source materials"),
    "source_normalizer": ("Source Normalizer", "ingestion", "Normalizes and cleans source content"),
    "freshness_filter": ("Freshness Filter", "ingestion", "Filters sources by freshness window"),
    "cr_extraction": ("Entity Extraction", "extraction", "Extracts entities, events, topics via Ollama"),
    "cr_clustering": ("Signal Clustering", "clustering", "Clusters and categorizes signals via Ollama"),
    "cr_prioritization": ("Signal Prioritization", "prioritization", "Ranks signals by impact/novelty via Apple Intelligence"),
    "cr_synthesis": ("Report Synthesis", "synthesis", "Generates report narrative via Apple Intelligence"),
    "cr_validation": ("Report Validation", "validation", "Validates structure (Ollama) with tone fallback (Apple Intelligence)"),
    "decision_engine": ("Go/No-Go Decision", "validation", "Produces go/no-go decision based on validation"),
    "bundle_builder": ("Artifact Bundler", "delivery", "Bundles report artifacts for delivery"),
}


def _register_pipeline_tools(repo: Any) -> None:
    """Register all pipeline tools in the tool registry (idempotent)."""
    for tool_name, (label, family, desc) in _TOOL_DESCRIPTIONS.items():
        existing = repo.get_tool_by_name(tool_name)
        if existing:
            continue
        engine = INFERENCE_MAP.get(tool_name.replace("cr_", ""), None)
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


def find_or_register(repo: Any) -> str:
    """Find existing Context Report swarm or register a new one.

    Returns the swarm_id.
    """
    # Check if already registered
    swarms = repo.list_swarms()
    for swarm in swarms:
        if isinstance(swarm, dict):
            name = swarm.get("swarm_name") or swarm.get("name", "")
            if name == "Nik's Context Report":
                return swarm["swarm_id"]

    # Register
    result = register_context_report_swarm(repo)
    return result["swarm_id"]
