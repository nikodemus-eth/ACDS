from __future__ import annotations

from process_swarm.scripts.plan_job_execution import plan_execution


def _job_with_artifacts(mode: str, artifact_count: int) -> dict:
    agents = []
    artifacts = []
    for i in range(artifact_count):
        agent_id = f"agent_{i + 1}"
        agents.append({
            "agent_id": agent_id,
            "role": f"role_{i + 1}",
            "model": "claude",
            "responsibilities": [f"Task {i + 1}"],
        })
        artifacts.append({
            "artifact_id": f"artifact_{i + 1}",
            "artifact_type": "document",
            "description": f"Artifact {i + 1}",
            "format": "markdown",
            "producer_agent": agent_id,
        })

    return {
        "job_id": "plan-test-001",
        "job_type": "research",
        "objective": "Plan test",
        "inputs": [{"input_id": "topic", "description": "Topic", "type": "string", "required": True}],
        "constraints": [],
        "agents": agents,
        "tools": [],
        "artifacts": artifacts,
        "execution_policy": {
            "mode": mode,
            "retry_policy": {"max_retries": 1, "retry_on_failure": True},
        },
        "success_criteria": ["Done"],
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
    }


def test_sequential_chains_dependencies() -> None:
    job = _job_with_artifacts("sequential", 3)
    plan = plan_execution(job)
    steps = plan["steps"]
    assert len(steps) == 3
    assert steps[0]["depends_on"] == []
    assert steps[1]["depends_on"] == ["step_1"]
    assert steps[2]["depends_on"] == ["step_2"]


def test_parallel_no_dependencies() -> None:
    job = _job_with_artifacts("parallel", 3)
    plan = plan_execution(job)
    for step in plan["steps"]:
        assert step["depends_on"] == []


def test_each_artifact_gets_step() -> None:
    job = _job_with_artifacts("sequential", 4)
    plan = plan_execution(job)
    assert len(plan["steps"]) == 4
    artifact_ids = [s["artifact_id"] for s in plan["steps"]]
    assert artifact_ids == ["artifact_1", "artifact_2", "artifact_3", "artifact_4"]


def test_plan_has_correct_job_id() -> None:
    job = _job_with_artifacts("sequential", 1)
    plan = plan_execution(job)
    assert plan["job_id"] == "plan-test-001"


def test_plan_id_format() -> None:
    job = _job_with_artifacts("sequential", 1)
    plan = plan_execution(job)
    assert plan["plan_id"].startswith("plan_")
    assert len(plan["plan_id"]) == 17  # "plan_" + 12 hex chars
