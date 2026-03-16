from __future__ import annotations

"""Tests for the GRITS artifact writer module."""

import hashlib
import json

import pytest

from grits.artifact_writer import write_evidence_bundle


@pytest.fixture
def output_dir(tmp_path):
    return tmp_path / "grits_output"


def test_write_creates_manifest(output_dir):
    """write_evidence_bundle creates manifest.json."""
    artifacts = {
        "run_request": {"run_id": "test-001"},
        "diagnostics": [{"test_id": "t1", "status": "passed"}],
        "baseline_comparison": {"regressions": []},
        "findings": [],
        "remediation": [],
        "maintenance_report": {"overall_status": "green"},
        "maintenance_report_md": "# Report\n",
    }

    manifest = write_evidence_bundle("test-001", output_dir, artifacts)

    assert (output_dir / "manifest.json").exists()
    assert manifest["run_id"] == "test-001"
    assert "created_at" in manifest


def test_write_creates_all_files(output_dir):
    """write_evidence_bundle creates all expected files."""
    artifacts = {
        "run_request": {"run_id": "test-001"},
        "diagnostics": [],
        "baseline_comparison": {},
        "findings": [],
        "remediation": [],
        "maintenance_report": {},
        "maintenance_report_md": "# Report\n",
    }

    write_evidence_bundle("test-001", output_dir, artifacts)

    expected_files = [
        "manifest.json",
        "run_request.json",
        "diagnostics.json",
        "baseline_comparison.json",
        "findings.json",
        "remediation.json",
        "maintenance_report.json",
        "maintenance_report.md",
    ]
    for fname in expected_files:
        assert (output_dir / fname).exists(), f"Missing: {fname}"


def test_write_sha256_hashes_correct(output_dir):
    """SHA-256 hashes in manifest match actual file contents."""
    artifacts = {
        "run_request": {"run_id": "test-001"},
        "diagnostics": [{"test_id": "t1"}],
        "baseline_comparison": {"regressions": []},
        "findings": [],
        "remediation": [],
        "maintenance_report": {"status": "green"},
        "maintenance_report_md": "# Hello\n",
    }

    manifest = write_evidence_bundle("test-001", output_dir, artifacts)

    for filename, expected_hash in manifest["files"].items():
        content = (output_dir / filename).read_text(encoding="utf-8")
        actual_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        assert actual_hash == expected_hash, f"Hash mismatch for {filename}"


def test_write_handles_missing_optional(output_dir):
    """write_evidence_bundle handles missing optional artifacts gracefully."""
    artifacts = {
        "run_request": {"run_id": "test-001"},
    }

    manifest = write_evidence_bundle("test-001", output_dir, artifacts)

    assert "run_request.json" in manifest["files"]
    assert "maintenance_report.md" not in manifest["files"]


def test_write_creates_output_dir(tmp_path):
    """write_evidence_bundle creates the output directory if needed."""
    deep_dir = tmp_path / "a" / "b" / "c"
    artifacts = {"run_request": {"run_id": "test-001"}}

    manifest = write_evidence_bundle("test-001", deep_dir, artifacts)

    assert deep_dir.exists()
    assert (deep_dir / "manifest.json").exists()
