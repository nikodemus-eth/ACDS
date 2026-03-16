from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class RunManagerAdapter(ToolAdapter):
    """Creates workspace directories and writes a run manifest."""

    @property
    def tool_name(self) -> str:
        return "run_manager"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        root = ctx.workspace_root
        dirs = {
            "sources": root / "sources",
            "output": root / "output",
            "artifacts": root / "artifacts",
        }

        for d in dirs.values():
            d.mkdir(parents=True, exist_ok=True)

        manifest = {
            "run_id": ctx.run_id,
            "swarm_id": ctx.swarm_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "directories": {k: str(v) for k, v in dirs.items()},
            "config": ctx.config,
        }
        manifest_path = dirs["artifacts"] / "run_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "workspace": str(root),
                "manifest_path": str(manifest_path),
                "directories": {k: str(v) for k, v in dirs.items()},
            },
            artifacts=[str(manifest_path)],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
