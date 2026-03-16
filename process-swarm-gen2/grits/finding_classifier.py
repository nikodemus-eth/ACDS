from __future__ import annotations

"""Map drift signals to classified findings with severity levels."""


_SEVERITY_MAP: dict[tuple[str, str], str] = {
    ("policy", "critical"): "critical",
    ("regression", "high"): "high",
    ("performance", "high"): "medium",
    ("stability", "high"): "medium",
    ("performance", "medium"): "medium",
    ("stability", "medium"): "low",
    ("policy", "medium"): "medium",
    ("regression", "medium"): "medium",
    ("policy", "high"): "critical",
    ("regression", "critical"): "critical",
}

_CONFIDENCE_MAP: dict[str, float] = {
    "regression": 0.95,
    "metric_drift": 0.80,
}

_ACTION_MAP: dict[str, str] = {
    "critical": "Immediate investigation required",
    "high": "Review and remediate before next scheduled run",
    "medium": "Schedule for review in next maintenance window",
    "low": "Monitor in subsequent runs",
}


def classify_findings(drift_signals: list[dict]) -> list[dict]:
    """Classify drift signals into actionable findings.

    Args:
        drift_signals: Output from drift_analyzer.analyze_drift().

    Returns:
        List of finding dicts with keys:
        finding_id, test_id, severity, confidence, category,
        recommended_action, details, source.
    """
    findings: list[dict] = []

    for idx, signal in enumerate(drift_signals, start=1):
        category = signal["category"]
        severity_hint = signal["severity_hint"]
        source = signal.get("source", "unknown")

        severity = _SEVERITY_MAP.get(
            (category, severity_hint), "medium"
        )
        confidence = _CONFIDENCE_MAP.get(source, 0.70)
        action = _ACTION_MAP.get(severity, "Monitor in subsequent runs")

        findings.append({
            "finding_id": f"GRITS-F-{idx:04d}",
            "test_id": signal["test_id"],
            "severity": severity,
            "confidence": confidence,
            "category": category,
            "recommended_action": action,
            "details": signal["details"],
            "source": source,
        })

    return findings
