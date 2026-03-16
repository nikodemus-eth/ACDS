from __future__ import annotations

"""Tests for GritsRunner integration pipeline."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from grits.runner import GritsRunner


@pytest.fixture
def grits_root(tmp_path):
    """Create a minimal root for GRITS runner tests."""
    root = tmp_path / "openclaw"
    root.mkdir()
    (root / "schemas").mkdir()
    (root / "runtime" / "identity" / "keys").mkdir(parents=True)
    (root / "artifacts" / "grits").mkdir(parents=True)

    # Create a couple of schema files
    for name in ["grits_run_request", "behavior_proposal"]:
        schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}
        (root / "schemas" / f"{name}.schema.json").write_text(json.dumps(schema))

    # Create key files
    keys_dir = root / "runtime" / "identity" / "keys"
    (keys_dir / "validator_signer.pub").write_text("ab" * 32)
    (keys_dir / "validator_signer.key").write_text("cd" * 32)

    return root


def _mock_test_pass(context):
    return "passed", {"count": 5}, {"detail": "ok"}


def _mock_test_fail(context):
    return "failed", {}, {"reason": "something broke"}


def test_runner_pipeline_completes(grits_root):
    """GritsRunner pipeline completes end-to-end with mocked diagnostics."""
    runner = GritsRunner(grits_root)

    # Mock the suite resolver to return simple test descriptors
    mock_descriptors = [
        {"test_id": "smoke_schemas_exist", "suite_id": "smoke",
         "callable": _mock_test_pass, "category": "health"},
        {"test_id": "smoke_schemas_valid_json", "suite_id": "smoke",
         "callable": _mock_test_pass, "category": "health"},
    ]

    with patch("grits.runner.resolve_suites", return_value=mock_descriptors):
        report = runner.run("test-target", ["smoke"])

    assert report["overall_status"] == "green"
    assert report["summary"]["total_tests"] == 2
    assert report["summary"]["passed"] == 2
    assert report["reporting_only"] is True


def test_runner_detects_regression(grits_root):
    """GritsRunner reports yellow when a test regresses."""
    runner = GritsRunner(grits_root)

    mock_descriptors = [
        {"test_id": "smoke_schemas_exist", "suite_id": "smoke",
         "callable": _mock_test_fail, "category": "health"},
    ]

    with patch("grits.runner.resolve_suites", return_value=mock_descriptors):
        report = runner.run("test-target", ["smoke"])

    # smoke_schemas_exist was expected to pass in baseline, now fails => regression
    assert report["overall_status"] in ("yellow", "red")
    assert report["summary"]["regressions"] >= 1


def test_runner_writes_artifacts(grits_root):
    """GritsRunner creates evidence bundle on disk."""
    runner = GritsRunner(grits_root)

    mock_descriptors = [
        {"test_id": "smoke_schemas_exist", "suite_id": "smoke",
         "callable": _mock_test_pass, "category": "health"},
    ]

    with patch("grits.runner.resolve_suites", return_value=mock_descriptors):
        report = runner.run("test-target", ["smoke"])

    run_id = report["run_id"]
    output_dir = grits_root / "artifacts" / "grits" / run_id

    assert (output_dir / "manifest.json").exists()
    assert (output_dir / "maintenance_report.json").exists()
    assert (output_dir / "maintenance_report.md").exists()
