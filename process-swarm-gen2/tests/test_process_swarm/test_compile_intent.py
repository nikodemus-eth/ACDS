from __future__ import annotations

import json
import pathlib
import tempfile

import pytest

from process_swarm.scripts.compile_intent import compile_from_intent

_SCHEMA_PATH = str(
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "schemas" / "process_swarm_job.schema.json"
)


def test_full_pipeline_accepted() -> None:
    result = compile_from_intent(_SCHEMA_PATH, "Create a nightly intelligence briefing")
    assert result["status"] == "accepted"
    assert result["attempt_count"] >= 1


def test_generic_fallback() -> None:
    result = compile_from_intent(_SCHEMA_PATH, "Do something totally unique xyz987")
    assert result["status"] == "accepted"


def test_output_files_written() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = compile_from_intent(
            _SCHEMA_PATH,
            "Create a weekly briefing summary",
            output_dir=tmpdir,
        )
        assert result["candidate_job_path"] is not None
        assert pathlib.Path(result["candidate_job_path"]).exists()
        assert result["final_job_path"] is not None
        assert pathlib.Path(result["final_job_path"]).exists()


def test_execution_plan_generated() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = compile_from_intent(
            _SCHEMA_PATH,
            "Research the latest findings on AI safety",
            do_plan=True,
            output_dir=tmpdir,
        )
        assert result["status"] == "accepted"
        assert result["execution_plan_path"] is not None
        plan_path = pathlib.Path(result["execution_plan_path"])
        assert plan_path.exists()
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
        assert "steps" in plan
        assert len(plan["steps"]) >= 1


def test_no_plan_when_not_requested() -> None:
    result = compile_from_intent(
        _SCHEMA_PATH,
        "Run a grits integrity diagnostic",
        do_plan=False,
    )
    assert result["execution_plan_path"] is None
