from __future__ import annotations

import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class SynthesisBriefBuilderAdapter(ToolAdapter):
    """Builds a synthesis brief for each report section from mapped sources."""

    @property
    def tool_name(self) -> str:
        return "synthesis_brief_builder"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        section_map = ctx.action.get("section_map") or self.find_prior_output(ctx, "section_map") or {}
        policy = ctx.action.get("policy") or self.find_prior_output(ctx, "policy") or {}
        briefs: dict[str, dict] = {}

        for section_name, sources in section_map.items():
            brief = {
                "section": section_name,
                "source_count": len(sources),
                "source_names": [s.get("name", "unknown") for s in sources],
                "snippets": [s.get("content", "")[:500] for s in sources],
                "instructions": policy.get("section_instructions", {}).get(section_name, "Synthesize the provided sources."),
            }
            briefs[section_name] = brief

        return ToolResult(
            success=True,
            output_data={"briefs": briefs, "brief_count": len(briefs)},
            artifacts=[],
            error=None,
            metadata={"duration_s": time.monotonic() - t0},
        )
