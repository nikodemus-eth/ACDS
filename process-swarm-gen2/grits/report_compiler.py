from __future__ import annotations

"""Produce JSON and Markdown integrity reports."""

from datetime import datetime, timezone


def compile_report(
    request: dict,
    results: list[dict],
    comparison: dict,
    findings: list[dict],
    recommendations: list[dict],
) -> dict:
    """Compile a structured GRITS maintenance report.

    Overall status rules:
        "red"    - any critical finding OR more than 2 regressions
        "yellow" - any high finding OR any regressions
        "green"  - no critical or high findings and no regressions

    Returns:
        Structured report dict.
    """
    severity_counts = _count_severities(findings)
    regression_count = len(comparison.get("regressions", []))

    overall = _determine_status(severity_counts, regression_count)

    return {
        "schema_version": "1.0",
        "run_id": request.get("run_id", "unknown"),
        "target_id": request.get("target_id", "unknown"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overall_status": overall,
        "summary": {
            "total_tests": len(results),
            "passed": sum(1 for r in results if r["status"] == "passed"),
            "failed": sum(1 for r in results if r["status"] == "failed"),
            "errors": sum(1 for r in results if r["status"] == "error"),
            "regressions": regression_count,
            "improvements": len(comparison.get("improvements", [])),
            "drift_signals": len(comparison.get("drift_signals", [])),
            "new_tests": len(comparison.get("new_tests", [])),
        },
        "severity_counts": severity_counts,
        "findings": findings,
        "recommendations": recommendations,
        "suite_ids": request.get("suite_ids", []),
        "baseline_ref": request.get("baseline_ref", "unknown"),
        "reporting_only": True,
    }


def _count_severities(findings: list[dict]) -> dict:
    """Count findings by severity level."""
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for f in findings:
        sev = f.get("severity", "low")
        counts[sev] = counts.get(sev, 0) + 1
    return counts


def _determine_status(severity_counts: dict, regression_count: int) -> str:
    """Determine overall status from severity counts and regressions."""
    if severity_counts.get("critical", 0) > 0 or regression_count > 2:
        return "red"
    if severity_counts.get("high", 0) > 0 or regression_count > 0:
        return "yellow"
    return "green"


def render_markdown(report: dict) -> str:
    """Render a report dict as human-readable Markdown.

    Args:
        report: Output from compile_report().

    Returns:
        Markdown string.
    """
    lines: list[str] = []
    status = report["overall_status"]
    status_icon = {"green": "[PASS]", "yellow": "[WARN]", "red": "[FAIL]"}

    lines.append(f"# GRITS Maintenance Report {status_icon.get(status, '[??]')}")
    lines.append("")
    lines.append(f"**Run ID:** {report['run_id']}")
    lines.append(f"**Target:** {report['target_id']}")
    lines.append(f"**Generated:** {report['generated_at']}")
    lines.append(f"**Status:** {status.upper()}")
    lines.append(f"**Reporting Only:** {report['reporting_only']}")
    lines.append("")

    # Summary
    summary = report["summary"]
    lines.append("## Summary")
    lines.append("")
    lines.append(f"| Metric | Count |")
    lines.append(f"|--------|-------|")
    for key, val in summary.items():
        lines.append(f"| {key} | {val} |")
    lines.append("")

    # Severity counts
    sev = report["severity_counts"]
    lines.append("## Severity Breakdown")
    lines.append("")
    for level in ("critical", "high", "medium", "low"):
        lines.append(f"- **{level.upper()}:** {sev.get(level, 0)}")
    lines.append("")

    # Findings
    findings = report.get("findings", [])
    if findings:
        lines.append("## Findings")
        lines.append("")
        for f in findings:
            lines.append(
                f"- [{f['severity'].upper()}] {f['finding_id']}: "
                f"test `{f['test_id']}` ({f['category']}) - "
                f"{f['recommended_action']}"
            )
        lines.append("")

    # Recommendations
    recs = report.get("recommendations", [])
    if recs:
        lines.append("## Recommendations")
        lines.append("")
        for r in recs:
            lines.append(
                f"{r['priority'] + 1}. [{r['severity'].upper()}] "
                f"{r['recommendation_id']}: {r['rationale']}"
            )
        lines.append("")

    return "\n".join(lines)
