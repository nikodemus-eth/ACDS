from __future__ import annotations

"""Generate prioritized remediation recommendations from findings."""


_SEVERITY_PRIORITY: dict[str, int] = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
}

_REMEDIATION_TEMPLATES: dict[str, str] = {
    "regression": (
        "Test '{test_id}' regressed from {baseline_status} to {current_status}. "
        "Investigate recent changes affecting this test."
    ),
    "metric_drift": (
        "Metric '{metric}' for test '{test_id}' drifted to {actual} "
        "(expected {expected}, tolerance {tolerance}). "
        "Verify whether this change is intentional."
    ),
}


def generate_recommendations(findings: list[dict]) -> list[dict]:
    """Generate prioritized remediation recommendations.

    Args:
        findings: Output from finding_classifier.classify_findings().

    Returns:
        List of recommendation dicts sorted by severity (critical first),
        with keys: recommendation_id, finding_id, test_id, severity,
        priority, action, rationale.
    """
    recommendations: list[dict] = []

    for idx, finding in enumerate(findings, start=1):
        source = finding.get("source", "unknown")
        details = finding.get("details", {})

        rationale = _build_rationale(source, finding["test_id"], details)

        recommendations.append({
            "recommendation_id": f"GRITS-R-{idx:04d}",
            "finding_id": finding["finding_id"],
            "test_id": finding["test_id"],
            "severity": finding["severity"],
            "priority": _SEVERITY_PRIORITY.get(finding["severity"], 3),
            "action": finding["recommended_action"],
            "rationale": rationale,
        })

    # Sort by priority (critical=0 first)
    recommendations.sort(key=lambda r: r["priority"])
    return recommendations


def _build_rationale(source: str, test_id: str, details: dict) -> str:
    """Build a human-readable rationale string."""
    template = _REMEDIATION_TEMPLATES.get(source)
    if template is None:
        return f"Finding on test '{test_id}' requires investigation."

    try:
        return template.format(test_id=test_id, **details)
    except (KeyError, TypeError):
        return f"Finding on test '{test_id}' requires investigation."
