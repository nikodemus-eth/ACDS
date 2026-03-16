from __future__ import annotations

"""Load baselines and compare diagnostic results."""

import json
from pathlib import Path


def load_baseline(baseline_ref: str, baselines_dir: Path) -> dict:
    """Load a baseline definition from JSON.

    Args:
        baseline_ref: The baseline identifier (matches baseline_id in file).
        baselines_dir: Directory containing baseline JSON files.

    Returns:
        Parsed baseline dict.

    Raises:
        FileNotFoundError: If no matching baseline file is found.
    """
    for path in baselines_dir.glob("*.json"):
        with open(path) as f:
            data = json.load(f)
        if data.get("baseline_id") == baseline_ref:
            return data

    raise FileNotFoundError(
        f"No baseline with id '{baseline_ref}' found in {baselines_dir}"
    )


def compare_results(results: list[dict], baseline: dict) -> dict:
    """Compare diagnostic results against a baseline.

    Returns a dict with keys:
        regressions: tests that went from passed to failed/error
        improvements: tests that went from failed to passed
        drift_signals: tests whose metrics drifted beyond thresholds
        unchanged: tests with no status change
        new_tests: tests not present in baseline
    """
    expected = baseline.get("expected_results", {})
    thresholds = baseline.get("thresholds", {})

    regressions: list[dict] = []
    improvements: list[dict] = []
    drift_signals: list[dict] = []
    unchanged: list[dict] = []
    new_tests: list[dict] = []

    for result in results:
        test_id = result["test_id"]
        current_status = result["status"]
        current_metrics = result.get("metrics", {})

        if test_id not in expected:
            new_tests.append(result)
            continue

        baseline_entry = expected[test_id]
        baseline_status = baseline_entry.get("status", "passed")

        # Status comparison
        if baseline_status == "passed" and current_status in ("failed", "error"):
            regressions.append({
                "test_id": test_id,
                "baseline_status": baseline_status,
                "current_status": current_status,
                "result": result,
            })
        elif baseline_status in ("failed", "error") and current_status == "passed":
            improvements.append({
                "test_id": test_id,
                "baseline_status": baseline_status,
                "current_status": current_status,
                "result": result,
            })
        else:
            unchanged.append(result)

        # Metric drift detection
        _check_metric_drift(
            test_id, current_metrics, baseline_entry, thresholds, drift_signals,
        )

    return {
        "regressions": regressions,
        "improvements": improvements,
        "drift_signals": drift_signals,
        "unchanged": unchanged,
        "new_tests": new_tests,
    }


def _check_metric_drift(
    test_id: str,
    current_metrics: dict,
    baseline_entry: dict,
    thresholds: dict,
    drift_signals: list[dict],
) -> None:
    """Check for metric drift against thresholds."""
    baseline_metrics = baseline_entry.get("metrics", {})

    for metric_key, current_value in current_metrics.items():
        if metric_key not in baseline_metrics:
            continue

        baseline_value = baseline_metrics[metric_key]

        # Look up threshold for this metric
        threshold_entry = thresholds.get(metric_key, {})
        tolerance = threshold_entry.get("tolerance", 0)
        expected = threshold_entry.get("expected", baseline_value)

        if abs(current_value - expected) > tolerance:
            drift_signals.append({
                "test_id": test_id,
                "metric": metric_key,
                "expected": expected,
                "actual": current_value,
                "tolerance": tolerance,
                "delta": current_value - expected,
            })
