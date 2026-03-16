from __future__ import annotations

import time
from collections import defaultdict

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class SectionMapperAdapter(ToolAdapter):
    """Maps normalized sources to report sections by category tag."""

    @property
    def tool_name(self) -> str:
        return "section_mapper"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        sources = self.find_prior_output(ctx, "sources") or []
        section_order = ctx.config.get(
            "sections", ["summary", "analysis", "recommendations"]
        )

        mapping: dict[str, list[dict]] = defaultdict(list)
        unmapped: list[dict] = []

        for src in sources:
            category = src.get("category_id") or src.get("category")
            if category and category in section_order:
                mapping[category].append(src)
            else:
                unmapped.append(src)

        # Distribute unmapped sources across sections
        for i, src in enumerate(unmapped):
            section = section_order[i % len(section_order)]
            mapping[section].append(src)

        sections = {s: mapping[s] for s in section_order}

        return ToolResult(
            success=True,
            output_data={
                "sections": sections,
                "section_count": len(section_order),
                "unmapped_count": len(unmapped),
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
