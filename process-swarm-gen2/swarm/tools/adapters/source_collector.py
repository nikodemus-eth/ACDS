from __future__ import annotations

import json
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class SourceCollectorAdapter(ToolAdapter):
    """Collects sources from mock fixtures or configured URLs."""

    @property
    def tool_name(self) -> str:
        return "source_collector"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        sources_dir = ctx.workspace_root / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)

        collected: list[dict] = []

        # Check for mock fixtures in workspace
        fixtures_dir = ctx.workspace_root / "fixtures"
        mock_sources_path = fixtures_dir / "mock_sources.json"
        if mock_sources_path.exists():
            data = json.loads(mock_sources_path.read_text())
            for src in data.get("sources", []):
                collected.append(src)
                # Write each source to the sources dir
                name = src.get("title", "unknown").replace(" ", "_").lower()
                dest = sources_dir / f"{name}.json"
                dest.write_text(json.dumps(src, indent=2))

        # Also collect from action config if specified
        urls = ctx.action.get("urls", [])
        for url in urls:
            collected.append({"url": url, "title": url, "origin": "url"})

        manifest = {
            "run_id": ctx.run_id,
            "source_count": len(collected),
            "sources": collected,
        }
        manifest_path = sources_dir / "source_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        return ToolResult(
            success=True,
            output_data={
                "source_count": len(collected),
                "sources": collected,
                "manifest_path": str(manifest_path),
            },
            artifacts=[str(manifest_path)],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
