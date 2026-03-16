from __future__ import annotations

"""Tests for the GRITS baseline module."""

import json

import pytest

from grits.baseline import compare_results, load_baseline


@pytest.fixture
def baselines_dir(tmp_path):
    """Create a temp baselines directory with a test baseline."""
    bd = tmp_path / "baselines"
    bd.mkdir()

    baseline = {
        "baseline_id": "test_baseline_v1",
        "expected_results": {
            "test_a": {"status": "passed", "metrics": {"count": 10}},
            "test_b": {"status": "passed"},
            "test_c": {"status": "failed"},
        },
        "thresholds": {
            "count": {"expected": 10, "tolerance": 2},
        },
    }
    (bd / "test_baseline.json").write_text(json.dumps(baseline))
    return bd


def test_load_baseline_found(baselines_dir):
    """load_baseline returns data when baseline_id matches."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    assert baseline["baseline_id"] == "test_baseline_v1"


def test_load_baseline_not_found(baselines_dir):
    """load_baseline raises FileNotFoundError for unknown baseline."""
    with pytest.raises(FileNotFoundError):
        load_baseline("nonexistent", baselines_dir)


def test_compare_detects_regression(baselines_dir):
    """compare_results detects regression (passed -> failed)."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_a", "status": "failed", "metrics": {}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["regressions"]) == 1
    assert comparison["regressions"][0]["test_id"] == "test_a"


def test_compare_detects_improvement(baselines_dir):
    """compare_results detects improvement (failed -> passed)."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_c", "status": "passed", "metrics": {}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["improvements"]) == 1
    assert comparison["improvements"][0]["test_id"] == "test_c"


def test_compare_detects_unchanged(baselines_dir):
    """compare_results reports unchanged tests."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_b", "status": "passed", "metrics": {}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["unchanged"]) == 1


def test_compare_detects_new_tests(baselines_dir):
    """compare_results reports tests not in baseline."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_new", "status": "passed", "metrics": {}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["new_tests"]) == 1


def test_compare_detects_metric_drift(baselines_dir):
    """compare_results detects metric drift beyond tolerance."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_a", "status": "passed", "metrics": {"count": 20}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["drift_signals"]) == 1
    assert comparison["drift_signals"][0]["metric"] == "count"
    assert comparison["drift_signals"][0]["delta"] == 10


def test_compare_no_drift_within_tolerance(baselines_dir):
    """compare_results does not flag drift within tolerance."""
    baseline = load_baseline("test_baseline_v1", baselines_dir)
    results = [
        {"test_id": "test_a", "status": "passed", "metrics": {"count": 11}},
    ]
    comparison = compare_results(results, baseline)
    assert len(comparison["drift_signals"]) == 0
