from __future__ import annotations

import re
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult

_CITE_RE = re.compile(r"\[(\d+)\]")


class CitationValidatorAdapter(ToolAdapter):
    """Validates that citations in the report reference real sources."""

    @property
    def tool_name(self) -> str:
        return "citation_validator"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        # Get report content from prior results or file
        report_content = self.find_prior_output(ctx, "content")
        if not report_content:
            report_path = self.find_prior_output(ctx, "report_path")
            if report_path and Path(report_path).exists():
                report_content = Path(report_path).read_text()

        sources = self.find_prior_output(ctx, "sources") or []
        warnings: list[str] = []

        if not report_content:
            return ToolResult(
                success=True,
                output_data={"cited_ids": [], "invalid_ids": [], "source_count": 0},
                artifacts=[],
                error=None,
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        cited_ids = {int(m) for m in _CITE_RE.findall(report_content)}
        max_valid = len(sources)
        invalid = {c for c in cited_ids if c < 1 or c > max_valid}

        for cid in sorted(invalid):
            warnings.append(
                f"Citation [{cid}] does not match a known source (max {max_valid})"
            )

        return ToolResult(
            success=True,
            output_data={
                "cited_ids": sorted(cited_ids),
                "invalid_ids": sorted(invalid),
                "source_count": max_valid,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            warnings=warnings,
        )
