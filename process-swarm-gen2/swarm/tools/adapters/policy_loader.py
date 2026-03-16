from __future__ import annotations

import json
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class PolicyLoaderAdapter(ToolAdapter):
    """Loads a policy JSON file from the workspace policies directory."""

    @property
    def tool_name(self) -> str:
        return "policy_loader"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        policy_dir = ctx.workspace_root / "policies"

        if not policy_dir.is_dir():
            return ToolResult(
                success=True,
                output_data={"policy": {}},
                artifacts=[],
                error=None,
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        # Look for swarm_policy.json first, then any .json file
        policy_path = policy_dir / "swarm_policy.json"
        if not policy_path.exists():
            json_files = sorted(policy_dir.glob("*.json"))
            if not json_files:
                return ToolResult(
                    success=True,
                    output_data={"policy": {}},
                    artifacts=[],
                    error=None,
                    metadata={"duration_ms": (time.monotonic() - t0) * 1000},
                )
            policy_path = json_files[0]

        policy = json.loads(policy_path.read_text())

        return ToolResult(
            success=True,
            output_data={"policy": policy, "policy_path": str(policy_path)},
            artifacts=[str(policy_path)],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
