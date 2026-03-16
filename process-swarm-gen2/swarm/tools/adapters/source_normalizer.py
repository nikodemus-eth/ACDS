from __future__ import annotations

import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_DEFAULT_MAX_CHARS = 50_000


class SourceNormalizerAdapter(ToolAdapter):
    """Normalizes source content by stripping HTML tags and truncating."""

    @property
    def tool_name(self) -> str:
        return "source_normalizer"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        max_chars = ctx.config.get("max_chars", _DEFAULT_MAX_CHARS)
        sources = self.find_prior_output(ctx, "sources") or []
        normalized: list[dict] = []
        warnings: list[str] = []

        for src in sources:
            content = src.get("content", "")
            clean = _HTML_TAG_RE.sub("", content).strip()
            truncated = False
            if len(clean) > max_chars:
                clean = clean[:max_chars]
                truncated = True
                warnings.append(
                    f"Truncated source {src.get('title', '?')} to {max_chars} chars"
                )
            normalized.append(
                {**src, "content": clean, "truncated": truncated, "char_count": len(clean)}
            )

        return ToolResult(
            success=True,
            output_data={
                "normalized_sources": normalized,
                "normalized_count": len(normalized),
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            warnings=warnings,
        )
