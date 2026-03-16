from __future__ import annotations

import uuid


def plan_execution(job: dict) -> dict:
    """Convert compiled job into deterministic step graph.

    plan_id format: plan_{uuid[:12]}
    Steps: one per artifact-producing agent
    Dependencies: sequential mode chains them, parallel mode has no deps

    Returns: {plan_id, job_id, execution_mode, steps, artifact_dependencies,
              failure_policy}
    """
    # Use a deterministic seed from job_id for reproducible plan_ids
    plan_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, job.get("job_id", "unknown"))
    plan_id = f"plan_{str(plan_uuid).replace('-', '')[:12]}"

    execution_mode = job.get("execution_policy", {}).get("mode", "sequential")
    artifacts = job.get("artifacts", [])

    steps: list[dict] = []
    artifact_dependencies: dict[str, list[str]] = {}
    prev_step_id: str | None = None

    for i, art in enumerate(artifacts):
        step_id = f"step_{i + 1}"
        agent_id = art.get("producer_agent", "unknown")
        artifact_id = art.get("artifact_id", f"artifact_{i + 1}")

        depends_on: list[str] = []
        if execution_mode == "sequential" and prev_step_id is not None:
            depends_on = [prev_step_id]

        steps.append({
            "step_id": step_id,
            "agent_id": agent_id,
            "artifact_id": artifact_id,
            "depends_on": depends_on,
        })

        # Track artifact dependencies
        if execution_mode == "sequential" and i > 0:
            prev_artifact_id = artifacts[i - 1].get("artifact_id", f"artifact_{i}")
            artifact_dependencies[artifact_id] = [prev_artifact_id]
        else:
            artifact_dependencies[artifact_id] = []

        prev_step_id = step_id

    failure_policy = {
        "on_validation_failure": job.get("failure_handling", {}).get(
            "on_validation_failure", "reject"
        ),
        "on_execution_failure": job.get("failure_handling", {}).get(
            "on_execution_failure", "flag_for_review"
        ),
    }

    return {
        "plan_id": plan_id,
        "job_id": job.get("job_id", "unknown"),
        "execution_mode": execution_mode,
        "steps": steps,
        "artifact_dependencies": artifact_dependencies,
        "failure_policy": failure_policy,
    }
