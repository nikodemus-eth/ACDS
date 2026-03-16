from __future__ import annotations

"""Tests for the GRITS drift analyzer module."""

from grits.drift_analyzer import analyze_drift


def test_analyze_regression_signal():
    """Regression produces a drift signal with correct category."""
    comparison = {
        "regressions": [
            {
                "test_id": "regression_schema_rejects_invalid",
                "baseline_status": "passed",
                "current_status": "failed",
                "result": {},
            },
        ],
        "drift_signals": [],
    }
    signals = analyze_drift(comparison)

    assert len(signals) == 1
    assert signals[0]["category"] == "regression"
    assert signals[0]["severity_hint"] == "high"
    assert signals[0]["source"] == "regression"


def test_analyze_policy_signal():
    """Red-team regression produces a policy/critical signal."""
    comparison = {
        "regressions": [
            {
                "test_id": "redteam_toolgate_default_deny",
                "baseline_status": "passed",
                "current_status": "failed",
                "result": {},
            },
        ],
        "drift_signals": [],
    }
    signals = analyze_drift(comparison)

    assert len(signals) == 1
    assert signals[0]["category"] == "policy"
    assert signals[0]["severity_hint"] == "critical"


def test_analyze_metric_drift_signal():
    """Metric drift signal is categorized correctly."""
    comparison = {
        "regressions": [],
        "drift_signals": [
            {
                "test_id": "drift_adapter_count",
                "metric": "count",
                "expected": 15,
                "actual": 20,
                "delta": 5,
                "tolerance": 2,
            },
        ],
    }
    signals = analyze_drift(comparison)

    assert len(signals) == 1
    assert signals[0]["category"] == "performance"
    assert signals[0]["source"] == "metric_drift"


def test_analyze_smoke_regression():
    """Smoke test regression is categorized as stability."""
    comparison = {
        "regressions": [
            {
                "test_id": "smoke_schemas_exist",
                "baseline_status": "passed",
                "current_status": "failed",
                "result": {},
            },
        ],
        "drift_signals": [],
    }
    signals = analyze_drift(comparison)

    assert signals[0]["category"] == "stability"
    assert signals[0]["severity_hint"] == "medium"


def test_analyze_empty_comparison():
    """Empty comparison produces no signals."""
    comparison = {"regressions": [], "drift_signals": []}
    signals = analyze_drift(comparison)
    assert signals == []
