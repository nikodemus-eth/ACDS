from __future__ import annotations

import json
import pathlib

import pytest

from process_swarm.scripts.compile_job import compile_job

_SCHEMA_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "schemas" / "process_swarm_job.schema.json"
)


@pytest.fixture()
def schema() -> dict:
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _valid_job() -> dict:
    return {
        "job_id": "test-compile-001",
        "job_type": "research",
        "objective": "Test compile",
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
        "execution_policy": {
            "mode": "sequential",
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


def test_valid_job_accepted(schema: dict) -> None:
    result = compile_job(schema, _valid_job())
    assert result["status"] == "accepted"
    assert result["attempt_count"] == 1
    assert result["validation_errors"] == []


def test_repairable_job_accepted(schema: dict) -> None:
    job = _valid_job()
    del job["execution_policy"]
    del job["failure_handling"]
    del job["lineage_tracking"]
    result = compile_job(schema, job)
    assert result["status"] == "accepted"
    assert result["attempt_count"] >= 2


def test_unrepairable_job_rejected(schema: dict) -> None:
    # Missing job_id and objective -- repair cannot invent these
    job = {
        "inputs": [],
        "agents": [],
        "artifacts": [],
        "tools": [],
        "constraints": [],
        "success_criteria": [],
    }
    result = compile_job(schema, job, max_repairs=2)
    assert result["status"] == "rejected"
    assert len(result["validation_errors"]) > 0


def test_max_repairs_respected(schema: dict) -> None:
    job = {"broken": True}
    result = compile_job(schema, job, max_repairs=1)
    assert result["attempt_count"] <= 2  # 1 initial + 1 repair


def test_final_job_returned(schema: dict) -> None:
    result = compile_job(schema, _valid_job())
    assert "final_job" in result
    assert result["final_job"]["job_id"] == "test-compile-001"
