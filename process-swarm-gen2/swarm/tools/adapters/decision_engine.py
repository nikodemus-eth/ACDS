from __future__ import annotations

import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class DecisionEngineAdapter(ToolAdapter):
    """Makes a go/no-go delivery decision based on upstream quality signals."""

    @property
    def tool_name(self) -> str:
        return "decision_engine"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        # Check validation results from prior steps
        all_passed = self.find_prior_output(ctx, "all_passed")
        issues = self.find_prior_output(ctx, "issues") or []
        override = ctx.config.get("force_deliver", False)

        blockers: list[str] = []
        if all_passed is False:
            blockers.extend(issues)
        elif all_passed is None:
            # Fall back to checking violations/invalid_ids
            violations = self.find_prior_output(ctx, "violations") or []
            invalid_citations = self.find_prior_output(ctx, "invalid_ids") or []
            if violations:
                blockers.append(f"{len(violations)} rule violation(s)")
            if invalid_citations:
                blockers.append(f"{len(invalid_citations)} invalid citation(s)")

        go = (len(blockers) == 0) or override
        reason = "all checks passed" if not blockers else "; ".join(blockers)
        if override and blockers:
            reason = f"FORCED delivery despite: {reason}"

        return ToolResult(
            success=True,
            output_data={
                "decision": "go" if go else "no_go",
                "reason": reason,
                "blockers": blockers,
                "forced": override,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
