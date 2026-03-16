from __future__ import annotations

import json
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class ReportFormatterAdapter(ToolAdapter):
    """Formats synthesized sections into a final report document."""

    @property
    def tool_name(self) -> str:
        return "report_formatter"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        sections = self.find_prior_output(ctx, "sections") or []
        fmt = ctx.config.get("format", "markdown")

        parts: list[str] = []
        if isinstance(sections, list):
            for section in sections:
                title = section.get("title", "Untitled")
                content = section.get("content", "")
                if fmt == "markdown":
                    parts.append(f"## {title}\n\n{content}")
                else:
                    parts.append(f"{title}\n{'=' * len(title)}\n{content}")
        elif isinstance(sections, dict):
            for heading, body in sections.items():
                if fmt == "markdown":
                    parts.append(f"## {heading}\n\n{body}")
                else:
                    parts.append(f"{heading}\n{'=' * len(heading)}\n{body}")

        report_text = "\n\n".join(parts)
        output_dir = ctx.workspace_root / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        ext = "md" if fmt == "markdown" else "txt"
        report_path = output_dir / f"report.{ext}"
        report_path.write_text(report_text)

        return ToolResult(
            success=True,
            output_data={
                "report_path": str(report_path),
                "content": report_text,
                "format": fmt,
                "char_count": len(report_text),
            },
            artifacts=[str(report_path)],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
