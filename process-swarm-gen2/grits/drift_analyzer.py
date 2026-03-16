from __future__ import annotations

"""Categorize and score drift signals."""


# Drift categories with their default severity hints
_CATEGORY_SEVERITY: dict[str, str] = {
    "regression": "high",
    "policy": "critical",
    "performance": "medium",
    "stability": "medium",
}

# Map test_id prefixes to drift categories
_TEST_CATEGORY_MAP: dict[str, str] = {
    "smoke_": "stability",
    "regression_": "regression",
    "drift_": "performance",
    "redteam_": "policy",
}


def analyze_drift(comparison: dict) -> list[dict]:
    """Analyze comparison results and produce drift signals with categories.

    Args:
        comparison: Output from baseline.compare_results().

    Returns:
        List of drift signal dicts with keys:
        category, severity_hint, test_id, details, source.
    """
    signals: list[dict] = []

    # Regressions are always high severity
    for reg in comparison.get("regressions", []):
        test_id = reg["test_id"]
        category = _infer_category(test_id)
        signals.append({
            "category": category,
            "severity_hint": _CATEGORY_SEVERITY.get(category, "medium"),
            "test_id": test_id,
            "details": {
                "baseline_status": reg["baseline_status"],
                "current_status": reg["current_status"],
            },
            "source": "regression",
        })

    # Metric drift signals
    for drift in comparison.get("drift_signals", []):
        test_id = drift["test_id"]
        category = _infer_category(test_id)
        signals.append({
            "category": category,
            "severity_hint": _CATEGORY_SEVERITY.get(category, "medium"),
            "test_id": test_id,
            "details": {
                "metric": drift["metric"],
                "expected": drift["expected"],
                "actual": drift["actual"],
                "delta": drift["delta"],
                "tolerance": drift["tolerance"],
            },
            "source": "metric_drift",
        })

    return signals


def _infer_category(test_id: str) -> str:
    """Infer the drift category from the test_id prefix."""
    for prefix, category in _TEST_CATEGORY_MAP.items():
        if test_id.startswith(prefix):
            return category
    return "stability"
