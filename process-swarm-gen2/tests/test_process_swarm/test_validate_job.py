from __future__ import annotations

import copy
import json
import pathlib

import pytest

from process_swarm.scripts.validate_job import validate_job

_SCHEMA_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "schemas" / "process_swarm_job.schema.json"
)


@pytest.fixture()
def schema() -> dict:
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _minimal_valid_job() -> dict:
    return {
        "job_id": "test-job-001",
        "job_type": "research",
        "objective": "Test objective",
        "inputs": [
            {"input_id": "topic", "description": "Topic", "type": "string", "required": True}
        ],
        "constraints": [],
        "agents": [
            {"agent_id": "agent_1", "role": "researcher", "model": "claude", "responsibilities": ["Do research"]}
        ],
        "tools": [],
        "artifacts": [
            {
                "artifact_id": "report",
                "artifact_type": "report",
                "description": "Research report",
                "format": "markdown",
                "producer_agent": "agent_1",
            }
        ],
        "execution_policy": {
            "mode": "sequential",
            "retry_policy": {"max_retries": 1, "retry_on_failure": True},
        },
        "success_criteria": ["Report produced"],
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


def test_valid_job_passes(schema: dict) -> None:
    job = _minimal_valid_job()
    valid, errors = validate_job(schema, job)
    assert valid is True
    assert errors == []


def test_missing_required_field(schema: dict) -> None:
    job = _minimal_valid_job()
    del job["objective"]
    valid, errors = validate_job(schema, job)
    assert valid is False
    assert any("objective" in e for e in errors)


def test_invalid_artifact_type(schema: dict) -> None:
    job = _minimal_valid_job()
    job["artifacts"][0]["artifact_type"] = "invalid_type"
    valid, errors = validate_job(schema, job)
    assert valid is False
    assert any("artifact_type" in e for e in errors)


def test_invalid_producer_agent(schema: dict) -> None:
    job = _minimal_valid_job()
    job["artifacts"][0]["producer_agent"] = "nonexistent_agent"
    valid, errors = validate_job(schema, job)
    assert valid is False
    assert any("producer_agent" in e for e in errors)


def test_empty_inputs_fails(schema: dict) -> None:
    job = _minimal_valid_job()
    job["inputs"] = []
    valid, errors = validate_job(schema, job)
    assert valid is False


def test_empty_success_criteria_fails(schema: dict) -> None:
    job = _minimal_valid_job()
    job["success_criteria"] = []
    valid, errors = validate_job(schema, job)
    assert valid is False
