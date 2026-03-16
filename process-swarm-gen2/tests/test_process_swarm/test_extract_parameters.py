from __future__ import annotations

import json
import pathlib

import pytest

from process_swarm.scripts.extract_job_parameters import extract_parameters

_PATTERNS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "extraction" / "parameter_patterns.json"
)


@pytest.fixture()
def patterns() -> dict:
    with open(_PATTERNS_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_extract_cadence_nightly(patterns: dict) -> None:
    result = extract_parameters(patterns, "Run a nightly briefing")
    assert result["cadence"] == "nightly"


def test_extract_cadence_weekly(patterns: dict) -> None:
    result = extract_parameters(patterns, "Send every week")
    assert result["cadence"] == "weekly"


def test_extract_time_horizon(patterns: dict) -> None:
    result = extract_parameters(patterns, "Cover the last 24 hours")
    assert result["time_horizon"] == "last_24_hours"


def test_extract_execution_mode(patterns: dict) -> None:
    result = extract_parameters(patterns, "Run tasks in parallel")
    assert result["execution_mode"] == "parallel"


def test_extract_artifact_formats(patterns: dict) -> None:
    result = extract_parameters(patterns, "Output as json and csv")
    assert "json" in result["artifact_formats"]
    assert "csv" in result["artifact_formats"]


def test_extract_artifact_types(patterns: dict) -> None:
    result = extract_parameters(patterns, "Create a report and analysis")
    assert "report" in result["artifact_types"]
    assert "analysis" in result["artifact_types"]


def test_extract_source_scope_multi_word(patterns: dict) -> None:
    result = extract_parameters(patterns, "Use curated sources for the job")
    assert "curated_sources" in result["source_scope"]


def test_extract_analysis_focus(patterns: dict) -> None:
    result = extract_parameters(patterns, "Check for drift and regression")
    assert "drift" in result["analysis_focus"]
    assert "regression" in result["analysis_focus"]


def test_no_false_matches(patterns: dict) -> None:
    result = extract_parameters(patterns, "The quick brown fox jumps over the lazy dog")
    assert result["cadence"] is None
    assert result["time_horizon"] is None
    assert result["execution_mode"] is None
    assert result["artifact_formats"] == []
    assert result["artifact_types"] == []
    assert result["source_scope"] == []
    assert result["analysis_focus"] == []
