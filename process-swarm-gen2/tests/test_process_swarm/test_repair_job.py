from __future__ import annotations

import json
import pathlib

import pytest

from process_swarm.scripts.repair_job import repair_job
from process_swarm.scripts.validate_job import validate_job

_SCHEMA_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "schemas" / "process_swarm_job.schema.json"
)


@pytest.fixture()
def schema() -> dict:
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _base_job_missing_policies() -> dict:
    """A job with required content but missing execution_policy, failure_handling, lineage_tracking."""
    return {
        "job_id": "test-repair-001",
        "job_type": "research",
        "objective": "Test repair",
        "inputs": [
            {"input_id": "topic", "description": "Topic", "type": "string", "required": True}
        ],
        "constraints": [],
        "agents": [
            {"agent_id": "agent_1", "role": "researcher", "model": "claude", "responsibilities": ["Research"]}
        ],
        "tools": [],
        "artifacts": [
            {
                "artifact_id": "report",
                "artifact_type": "report",
                "description": "Report",
                "format": "markdown",
                "producer_agent": "agent_1",
            }
        ],
        "success_criteria": ["Done"],
    }


def test_adds_missing_execution_policy(schema: dict) -> None:
    job = _base_job_missing_policies()
    repaired = repair_job(schema, job, ["missing execution_policy"])
    assert "execution_policy" in repaired
    assert repaired["execution_policy"]["mode"] == "sequential"
    assert "retry_policy" in repaired["execution_policy"]


def test_adds_missing_failure_handling(schema: dict) -> None:
    job = _base_job_missing_policies()
    repaired = repair_job(schema, job, ["missing failure_handling"])
    assert "failure_handling" in repaired
    assert repaired["failure_handling"]["on_validation_failure"] == "reject"
    assert repaired["failure_handling"]["on_execution_failure"] == "flag_for_review"


def test_adds_missing_lineage_tracking(schema: dict) -> None:
    job = _base_job_missing_policies()
    repaired = repair_job(schema, job, ["missing lineage_tracking"])
    assert "lineage_tracking" in repaired
    assert repaired["lineage_tracking"]["enabled"] is True


def test_fixes_invalid_artifact_type(schema: dict) -> None:
    job = _base_job_missing_policies()
    job["execution_policy"] = {"mode": "sequential", "retry_policy": {"max_retries": 1, "retry_on_failure": True}}
    job["failure_handling"] = {"on_validation_failure": "reject", "on_execution_failure": "flag_for_review"}
    job["lineage_tracking"] = {"enabled": True, "record_inputs": True, "record_outputs": True, "record_agent_lineage": True}
    job["artifacts"][0]["artifact_type"] = "bogus"
    repaired = repair_job(schema, job, ["invalid artifact_type"])
    assert repaired["artifacts"][0]["artifact_type"] == "document"


def test_fixes_invalid_producer_agent(schema: dict) -> None:
    job = _base_job_missing_policies()
    job["execution_policy"] = {"mode": "sequential", "retry_policy": {"max_retries": 1, "retry_on_failure": True}}
    job["failure_handling"] = {"on_validation_failure": "reject", "on_execution_failure": "flag_for_review"}
    job["lineage_tracking"] = {"enabled": True, "record_inputs": True, "record_outputs": True, "record_agent_lineage": True}
    job["artifacts"][0]["producer_agent"] = "nonexistent_agent"
    repaired = repair_job(schema, job, ["invalid producer_agent"])
    assert repaired["artifacts"][0]["producer_agent"] == "agent_1"


def test_fixes_invalid_execution_mode(schema: dict) -> None:
    job = _base_job_missing_policies()
    job["execution_policy"] = {"mode": "bogus_mode", "retry_policy": {"max_retries": 1, "retry_on_failure": True}}
    repaired = repair_job(schema, job, ["invalid mode"])
    assert repaired["execution_policy"]["mode"] == "sequential"


def test_repaired_job_validates(schema: dict) -> None:
    job = _base_job_missing_policies()
    repaired = repair_job(schema, job, ["missing fields"])
    valid, errors = validate_job(schema, repaired)
    assert valid is True, f"Repair did not produce valid job: {errors}"


def test_does_not_mutate_original(schema: dict) -> None:
    job = _base_job_missing_policies()
    original_keys = set(job.keys())
    repair_job(schema, job, ["missing fields"])
    assert set(job.keys()) == original_keys
