from __future__ import annotations

import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class FreshnessFilterAdapter(ToolAdapter):
    """Filters sources by freshness based on an age threshold in days."""

    @property
    def tool_name(self) -> str:
        return "freshness_filter"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        max_age_days = ctx.config.get("max_age_days", 365)
        sources = (
            self.find_prior_output(ctx, "normalized_sources")
            or self.find_prior_output(ctx, "sources")
            or []
        )
        now = datetime.now(timezone.utc)

        fresh: list[dict] = []
        stale: list[dict] = []

        for src in sources:
            ts = src.get("published") or src.get("published_date") or src.get("collected_at")
            if ts:
                try:
                    dt = _parse_date(ts)
                    if dt:
                        age = (now - dt).days
                        if age > max_age_days:
                            stale.append({**src, "age_days": age})
                            continue
                except (ValueError, AttributeError, TypeError):
                    pass
            fresh.append(src)

        return ToolResult(
            success=True,
            output_data={
                "fresh_sources": fresh,
                "stale_sources": stale,
                "fresh_count": len(fresh),
                "stale_count": len(stale),
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )


def _parse_date(ts: str) -> datetime | None:
    """Parse ISO 8601, RFC 822 (RSS), or Atom date strings."""
    # ISO 8601
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        pass
    # RFC 822 (RSS pubDate format)
    try:
        return parsedate_to_datetime(ts)
    except (ValueError, TypeError):
        pass
    return None
