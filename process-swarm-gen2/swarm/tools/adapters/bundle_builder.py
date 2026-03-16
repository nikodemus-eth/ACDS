from __future__ import annotations

import json
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class BundleBuilderAdapter(ToolAdapter):
    """Bundles the report and artifacts into a delivery package."""

    @property
    def tool_name(self) -> str:
        return "bundle_builder"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        report_path = self.find_prior_output(ctx, "report_path")
        output_dir = ctx.workspace_root / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        bundle_files: list[str] = []
        if report_path and Path(report_path).exists():
            bundle_files.append(report_path)

        manifest = {
            "run_id": ctx.run_id,
            "files": bundle_files,
            "file_count": len(bundle_files),
        }
        manifest_path = output_dir / "bundle_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        return ToolResult(
            success=True,
            output_data={
                "bundle_path": str(output_dir),
                "bundle_manifest": str(manifest_path),
                "bundle_files": bundle_files,
                "file_count": len(bundle_files),
            },
            artifacts=[str(manifest_path)],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
