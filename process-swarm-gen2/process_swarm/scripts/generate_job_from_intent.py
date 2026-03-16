from __future__ import annotations

import hashlib

from process_swarm.scripts.classify_intent import classify_intent
from process_swarm.scripts.extract_job_parameters import extract_parameters
from process_swarm.scripts.merge_job_configuration import merge_configuration


def generate_job(
    schema: dict,
    classes: list[dict],
    defaults: dict,
    patterns: dict,
    intent_text: str,
) -> dict:
    """Generate candidate job from intent.

    1. Classify intent -> select class
    2. Extract parameters
    3. Merge defaults
    4. Build candidate job from class scaffolding + effective config

    Job ID format: {class_id}-{sha256(intent)[:8]}

    Returns: {classification, parameters, effective_config, candidate_job}
    """
    # Step 1: Classify
    classification = classify_intent(classes, intent_text)
    selected_class_id = classification["selected_class_id"]

    # Find the class definition
    selected_class = None
    for cls in classes:
        if cls["class_id"] == selected_class_id:
            selected_class = cls
            break
    if selected_class is None:
        raise ValueError(f"Class not found: {selected_class_id}")

    # Step 2: Extract parameters
    parameters = extract_parameters(patterns, intent_text)

    # Step 3: Merge defaults
    class_defaults = defaults.get(selected_class_id, {})
    effective_config = merge_configuration(class_defaults, parameters)

    # Step 4: Build candidate job
    intent_hash = hashlib.sha256(intent_text.encode()).hexdigest()[:8]
    job_id = f"{selected_class_id}-{intent_hash}"

    execution_mode = effective_config.get("execution_mode", "sequential")
    if execution_mode is None:
        execution_mode = selected_class.get("default_execution_mode", "sequential")

    candidate_job = {
        "job_id": job_id,
        "job_type": selected_class["default_job_type"],
        "objective": intent_text,
        "inputs": [
            {
                "input_id": inp["input_id"],
                "description": inp["description"],
                "type": inp["type"],
                "required": inp["required"],
            }
            for inp in selected_class.get("suggested_inputs", [])
        ],
        "constraints": [
            {
                "constraint_id": c["constraint_id"],
                "description": c["description"],
                "severity": c["severity"],
            }
            for c in selected_class.get("suggested_constraints", [])
        ],
        "agents": [
            {
                "agent_id": a["agent_id"],
                "role": a["role"],
                "model": a["model"],
                "responsibilities": list(a["responsibilities"]),
            }
            for a in selected_class.get("suggested_agents", [])
        ],
        "tools": [
            {
                "tool_id": t["tool_id"],
                "description": t["description"],
                "required": t["required"],
            }
            for t in selected_class.get("suggested_tools", [])
        ],
        "artifacts": [
            {
                "artifact_id": art["artifact_id"],
                "artifact_type": art["artifact_type"],
                "description": art["description"],
                "format": art["format"],
                "producer_agent": art["producer_agent"],
            }
            for art in selected_class.get("suggested_artifacts", [])
        ],
        "execution_policy": {
            "mode": execution_mode,
            "retry_policy": {
                "max_retries": 1,
                "retry_on_failure": True,
            },
        },
        "success_criteria": list(selected_class.get("suggested_success_criteria", ["Task completed"])),
        "failure_handling": {
            "on_validation_failure": "reject",
            "on_execution_failure": "flag_for_review",
        },
        "lineage_tracking": {
            "enabled": True,
            "record_inputs": True,
            "record_outputs": True,
            "record_agent_lineage": True,
        },
        "assumptions": [],
    }

    return {
        "classification": classification,
        "parameters": parameters,
        "effective_config": effective_config,
        "candidate_job": candidate_job,
    }
