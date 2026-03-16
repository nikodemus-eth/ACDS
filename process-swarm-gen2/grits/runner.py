from __future__ import annotations

"""GritsRunner: orchestrates complete integrity evaluation pipeline."""

from pathlib import Path

from grits.artifact_writer import write_evidence_bundle
from grits.baseline import compare_results, load_baseline
from grits.drift_analyzer import analyze_drift
from grits.executor import execute_diagnostics
from grits.finding_classifier import classify_findings
from grits.recommender import generate_recommendations
from grits.report_compiler import compile_report, render_markdown
from grits.run_request import build_run_request
from grits.suite_resolver import resolve_suites


class GritsRunner:
    """Orchestrate a complete GRITS integrity evaluation.

    Pipeline: request -> resolve -> execute -> compare -> analyze ->
              classify -> recommend -> report -> write
    """

    def __init__(self, openclaw_root: str | Path):
        self._root = Path(openclaw_root)
        self._baselines_dir = Path(__file__).parent / "baselines"
        self._output_base = self._root / "artifacts" / "grits"

    def run(
        self,
        target_id: str,
        suite_ids: list[str],
        baseline_ref: str = "local_baseline_v1",
        trigger_type: str = "manual",
    ) -> dict:
        """Execute the full GRITS pipeline.

        Args:
            target_id: Identifier for the evaluation target.
            suite_ids: List of diagnostic suite identifiers.
            baseline_ref: Baseline reference identifier.
            trigger_type: One of "manual" or "scheduled".

        Returns:
            The compiled maintenance report dict.
        """
        # 1. Build request
        request = build_run_request(
            target_id, suite_ids, baseline_ref, trigger_type, self._root,
        )

        # 2. Resolve suites to test descriptors
        descriptors = resolve_suites(suite_ids)

        # 3. Execute diagnostics
        context = {"openclaw_root": str(self._root)}
        results = execute_diagnostics(descriptors, context)

        # 4. Load baseline and compare
        baseline = load_baseline(baseline_ref, self._baselines_dir)
        comparison = compare_results(results, baseline)

        # 5. Analyze drift
        drift_signals = analyze_drift(comparison)

        # 6. Classify findings
        findings = classify_findings(drift_signals)

        # 7. Generate recommendations
        recommendations = generate_recommendations(findings)

        # 8. Compile report
        report = compile_report(
            request, results, comparison, findings, recommendations,
        )

        # 9. Render Markdown
        markdown = render_markdown(report)

        # 10. Write evidence bundle
        run_id = request["run_id"]
        output_dir = self._output_base / run_id

        artifacts = {
            "run_request": request,
            "diagnostics": results,
            "baseline_comparison": comparison,
            "findings": findings,
            "remediation": recommendations,
            "maintenance_report": report,
            "maintenance_report_md": markdown,
        }

        write_evidence_bundle(run_id, output_dir, artifacts)

        return report
