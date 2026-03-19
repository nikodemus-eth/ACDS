from __future__ import annotations

"""Tests for GritsRunner integration pipeline.

All tests use real resolve_suites, real file I/O, real GritsRunner.
No mocks, no stubs, no patches.
"""

import json
from pathlib import Path

import pytest

from grits.runner import GritsRunner
from grits.suite_resolver import resolve_suites


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


def test_runner_pipeline_completes(grits_root):
    """GritsRunner pipeline completes end-to-end with real smoke diagnostics."""
    runner = GritsRunner(grits_root)
    report = runner.run("test-target", ["smoke"])

    assert report["overall_status"] in ("green", "yellow", "red")
    assert report["summary"]["total_tests"] == 6
    assert report["reporting_only"] is True


def test_runner_writes_artifacts(grits_root):
    """GritsRunner creates evidence bundle on disk."""
    runner = GritsRunner(grits_root)
    report = runner.run("test-target", ["smoke"])

    run_id = report["run_id"]
    output_dir = grits_root / "artifacts" / "grits" / run_id

    assert (output_dir / "manifest.json").exists()
    assert (output_dir / "maintenance_report.json").exists()
    assert (output_dir / "maintenance_report.md").exists()


def test_runner_multiple_suites(grits_root):
    """GritsRunner handles multiple suites."""
    runner = GritsRunner(grits_root)
    report = runner.run("test-target", ["smoke", "regression"])

    assert report["summary"]["total_tests"] >= 6 + 3
    assert report["reporting_only"] is True
