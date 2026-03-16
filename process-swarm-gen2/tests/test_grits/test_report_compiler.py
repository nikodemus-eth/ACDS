from __future__ import annotations

"""Tests for the GRITS report compiler module."""

from grits.report_compiler import compile_report, render_markdown


def _make_request():
    return {
        "run_id": "grits-test-001",
        "target_id": "test-target",
        "suite_ids": ["smoke"],
        "baseline_ref": "local_baseline_v1",
    }


def test_compile_green_status():
    """No findings produces green status."""
    request = _make_request()
    results = [
        {"test_id": "t1", "status": "passed"},
        {"test_id": "t2", "status": "passed"},
    ]
    comparison = {"regressions": [], "improvements": [], "drift_signals": [], "new_tests": []}
    findings = []
    recommendations = []

    report = compile_report(request, results, comparison, findings, recommendations)

    assert report["overall_status"] == "green"
    assert report["summary"]["total_tests"] == 2
    assert report["summary"]["passed"] == 2


def test_compile_yellow_status_high_finding():
    """High-severity finding produces yellow status."""
    request = _make_request()
    results = [{"test_id": "t1", "status": "failed"}]
    comparison = {"regressions": [{"test_id": "t1"}], "improvements": [], "drift_signals": [], "new_tests": []}
    findings = [{"severity": "high", "finding_id": "F1", "test_id": "t1",
                 "category": "regression", "recommended_action": "fix"}]

    report = compile_report(request, results, comparison, findings, [])
    assert report["overall_status"] == "yellow"


def test_compile_yellow_status_regression():
    """Any regressions produce yellow status."""
    request = _make_request()
    results = [{"test_id": "t1", "status": "failed"}]
    comparison = {"regressions": [{"test_id": "t1"}], "improvements": [], "drift_signals": [], "new_tests": []}

    report = compile_report(request, results, comparison, [], [])
    assert report["overall_status"] == "yellow"


def test_compile_red_status_critical():
    """Critical finding produces red status."""
    request = _make_request()
    results = [{"test_id": "t1", "status": "failed"}]
    comparison = {"regressions": [], "improvements": [], "drift_signals": [], "new_tests": []}
    findings = [{"severity": "critical", "finding_id": "F1", "test_id": "t1",
                 "category": "policy", "recommended_action": "investigate"}]

    report = compile_report(request, results, comparison, findings, [])
    assert report["overall_status"] == "red"


def test_compile_red_status_many_regressions():
    """More than 2 regressions produces red status."""
    request = _make_request()
    results = [
        {"test_id": "t1", "status": "failed"},
        {"test_id": "t2", "status": "failed"},
        {"test_id": "t3", "status": "failed"},
    ]
    comparison = {
        "regressions": [{"test_id": "t1"}, {"test_id": "t2"}, {"test_id": "t3"}],
        "improvements": [], "drift_signals": [], "new_tests": [],
    }

    report = compile_report(request, results, comparison, [], [])
    assert report["overall_status"] == "red"


def test_render_markdown_contains_status():
    """Rendered markdown includes the overall status."""
    request = _make_request()
    results = [{"test_id": "t1", "status": "passed"}]
    comparison = {"regressions": [], "improvements": [], "drift_signals": [], "new_tests": []}

    report = compile_report(request, results, comparison, [], [])
    md = render_markdown(report)

    assert "GRITS Maintenance Report" in md
    assert "GREEN" in md
    assert report["run_id"] in md


def test_render_markdown_includes_findings():
    """Rendered markdown includes finding details."""
    request = _make_request()
    results = [{"test_id": "t1", "status": "failed"}]
    comparison = {"regressions": [], "improvements": [], "drift_signals": [], "new_tests": []}
    findings = [{"severity": "high", "finding_id": "GRITS-F-0001", "test_id": "t1",
                 "category": "regression", "recommended_action": "fix it"}]

    report = compile_report(request, results, comparison, findings, [])
    md = render_markdown(report)

    assert "GRITS-F-0001" in md
    assert "HIGH" in md
