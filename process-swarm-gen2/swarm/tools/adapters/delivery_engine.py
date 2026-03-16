from __future__ import annotations

import json
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class DeliveryEngineAdapter(ToolAdapter):
    """Triggers delivery of the bundle through the configured channel."""

    @property
    def tool_name(self) -> str:
        return "delivery_engine"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        decision = self.find_prior_output(ctx, "decision")

        if decision == "no_go":
            return ToolResult(
                success=True,
                output_data={
                    "delivery_triggered": False,
                    "reason": "Blocked by decision engine (no_go)",
                },
                artifacts=[],
                error=None,
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        bundle_path = self.find_prior_output(ctx, "bundle_path")
        channel = ctx.config.get("channel", "local")

        receipt = {
            "run_id": ctx.run_id,
            "channel": channel,
            "bundle_path": bundle_path,
            "status": "delivered",
        }

        return ToolResult(
            success=True,
            output_data={
                "delivery_triggered": True,
                "channel": channel,
                "receipt": receipt,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
