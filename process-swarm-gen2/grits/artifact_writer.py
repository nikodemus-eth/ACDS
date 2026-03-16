from __future__ import annotations

"""Persist evidence bundles to disk with integrity hashes."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def write_evidence_bundle(
    run_id: str, output_dir: Path, artifacts: dict,
) -> dict:
    """Write all GRITS artifacts to disk and produce a manifest.

    Args:
        run_id: The GRITS run identifier.
        output_dir: Directory to write artifacts into (created if needed).
        artifacts: Dict with keys matching artifact names and dict/str values:
            - run_request: dict
            - diagnostics: list[dict]
            - baseline_comparison: dict
            - findings: list[dict]
            - remediation: list[dict]
            - maintenance_report: dict
            - maintenance_report_md: str

    Returns:
        Manifest dict with file names and SHA-256 hashes.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    files: dict[str, str] = {}

    # Write JSON artifacts
    _json_artifacts = [
        ("run_request.json", "run_request"),
        ("diagnostics.json", "diagnostics"),
        ("baseline_comparison.json", "baseline_comparison"),
        ("findings.json", "findings"),
        ("remediation.json", "remediation"),
        ("maintenance_report.json", "maintenance_report"),
    ]

    for filename, key in _json_artifacts:
        data = artifacts.get(key)
        if data is not None:
            path = output_dir / filename
            content = json.dumps(data, indent=2, default=str)
            path.write_text(content, encoding="utf-8")
            files[filename] = _sha256(content)

    # Write Markdown report
    md_content = artifacts.get("maintenance_report_md", "")
    if md_content:
        path = output_dir / "maintenance_report.md"
        path.write_text(md_content, encoding="utf-8")
        files["maintenance_report.md"] = _sha256(md_content)

    # Write manifest
    manifest = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "files": files,
    }
    manifest_content = json.dumps(manifest, indent=2)
    (output_dir / "manifest.json").write_text(manifest_content, encoding="utf-8")

    return manifest


def _sha256(content: str) -> str:
    """Compute SHA-256 hex digest of a string."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
