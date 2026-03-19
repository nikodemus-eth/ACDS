"""TTS Artifact Resolver — locates the report text for narration."""

from __future__ import annotations

import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsArtifactResolverAdapter(ToolAdapter):
    """Resolves the upstream report artifact to feed into the TTS pipeline.

    Searches prior_results for known report keys, then falls back to
    scanning workspace/output/ for markdown files.
    """

    _REPORT_KEYS = ("report_formatter", "assemble_output")

    @property
    def tool_name(self) -> str:
        return "tts_artifact_resolver"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        report_path: str | None = None
        report_text: str | None = None

        # Strategy 1: scan prior_results for known upstream keys
        for key in self._REPORT_KEYS:
            step_data = ctx.prior_results.get(key)
            if not isinstance(step_data, dict):
                continue

            # Try to get the text directly
            for text_key in ("report_text", "formatted_report", "output_text", "text"):
                if text_key in step_data:
                    report_text = step_data[text_key]
                    break

            # Try to get the path
            for path_key in ("report_path", "output_path", "path"):
                if path_key in step_data:
                    candidate = Path(step_data[path_key])
                    if candidate.exists():
                        report_path = str(candidate)
                        if report_text is None:
                            report_text = candidate.read_text(encoding="utf-8")
                    break

            if report_text is not None:
                break

        # Strategy 2: fall back to scanning workspace/output/ for .md files
        if report_text is None:
            output_dir = ctx.workspace_root / "output"
            if output_dir.is_dir():
                md_files = sorted(output_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
                if md_files:
                    chosen = md_files[0]
                    report_path = str(chosen)
                    report_text = chosen.read_text(encoding="utf-8")

        if report_text is None:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="No report artifact found in prior_results or workspace/output/",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "report_path": report_path or "",
                "report_text": report_text,
            },
            artifacts=[report_path] if report_path else [],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
