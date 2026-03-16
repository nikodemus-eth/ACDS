from __future__ import annotations

import hashlib
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class ProbabilisticSynthesisAdapter(ToolAdapter):
    """Synthesizes section content from briefs using deterministic placeholder logic."""

    @property
    def tool_name(self) -> str:
        return "probabilistic_synthesis"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        briefs = ctx.action.get("briefs") or self.find_prior_output(ctx, "briefs") or {}
        sections: dict[str, dict] = {}

        for name, brief in briefs.items():
            snippets = brief.get("snippets", [])
            combined = "\n\n".join(snippets) if snippets else ""
            digest = hashlib.sha256(combined.encode()).hexdigest()[:12]
            sections[name] = {
                "heading": name.replace("_", " ").title(),
                "body": combined if combined else f"[No source content for section '{name}']",
                "source_count": brief.get("source_count", 0),
                "content_hash": digest,
            }

        return ToolResult(
            success=True,
            output_data={"sections": sections, "section_count": len(sections)},
            artifacts=[],
            error=None,
            metadata={"duration_s": time.monotonic() - t0},
        )
