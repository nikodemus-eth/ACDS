from __future__ import annotations

import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class RuleValidatorAdapter(ToolAdapter):
    """Validates the output against configurable constraint rules."""

    @property
    def tool_name(self) -> str:
        return "rule_validator"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        # Get report content from prior results or file
        text = self.find_prior_output(ctx, "content")
        if not text:
            report_path = self.find_prior_output(ctx, "report_path")
            if report_path and Path(report_path).exists():
                text = Path(report_path).read_text()

        rules = ctx.config.get("rules", {})
        issues: list[str] = []

        if not text:
            return ToolResult(
                success=True,
                output_data={
                    "all_passed": True,
                    "issues": [],
                    "char_count": 0,
                },
                artifacts=[],
                error=None,
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        min_chars = rules.get("min_chars", 0)
        if len(text) < min_chars:
            issues.append(f"Report too short: {len(text)} < {min_chars} chars")

        max_chars = rules.get("max_chars")
        if max_chars and len(text) > max_chars:
            issues.append(f"Report too long: {len(text)} > {max_chars} chars")

        required_sections = rules.get("required_sections", [])
        for section in required_sections:
            if section.lower() not in text.lower():
                issues.append(f"Missing required section: {section}")

        return ToolResult(
            success=True,
            output_data={
                "all_passed": len(issues) == 0,
                "issues": issues,
                "char_count": len(text),
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
