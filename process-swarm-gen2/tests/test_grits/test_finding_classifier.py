from __future__ import annotations

"""Tests for the GRITS finding classifier module."""

from grits.finding_classifier import classify_findings


def test_classify_critical_finding():
    """Policy/critical signal maps to critical severity."""
    signals = [
        {
            "category": "policy",
            "severity_hint": "critical",
            "test_id": "redteam_toolgate_default_deny",
            "details": {"baseline_status": "passed", "current_status": "failed"},
            "source": "regression",
        },
    ]
    findings = classify_findings(signals)

    assert len(findings) == 1
    assert findings[0]["severity"] == "critical"
    assert findings[0]["confidence"] == 0.95
    assert "Immediate" in findings[0]["recommended_action"]


def test_classify_high_finding():
    """Regression/high signal maps to high severity."""
    signals = [
        {
            "category": "regression",
            "severity_hint": "high",
            "test_id": "regression_adapter_execute",
            "details": {},
            "source": "regression",
        },
    ]
    findings = classify_findings(signals)

    assert findings[0]["severity"] == "high"


def test_classify_medium_finding():
    """Performance/medium signal maps to medium severity."""
    signals = [
        {
            "category": "performance",
            "severity_hint": "medium",
            "test_id": "drift_adapter_count",
            "details": {},
            "source": "metric_drift",
        },
    ]
    findings = classify_findings(signals)

    assert findings[0]["severity"] == "medium"
    assert findings[0]["confidence"] == 0.80


def test_classify_assigns_finding_ids():
    """Findings get sequential GRITS-F-NNNN IDs."""
    signals = [
        {"category": "policy", "severity_hint": "critical", "test_id": "t1",
         "details": {}, "source": "regression"},
        {"category": "regression", "severity_hint": "high", "test_id": "t2",
         "details": {}, "source": "regression"},
    ]
    findings = classify_findings(signals)

    assert findings[0]["finding_id"] == "GRITS-F-0001"
    assert findings[1]["finding_id"] == "GRITS-F-0002"


def test_classify_empty_input():
    """No signals produces no findings."""
    assert classify_findings([]) == []
