from __future__ import annotations

import time
from urllib.parse import urlparse

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "[::1]"}
_ALLOWED_SCHEMES = {"http", "https"}


class UrlValidatorAdapter(ToolAdapter):
    """Validates URLs for allowed schemes and blocks SSRF targets."""

    @property
    def tool_name(self) -> str:
        return "url_validator"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        sources = self.find_prior_output(ctx, "sources") or []
        valid: list[dict] = []
        invalid: list[dict] = []

        for src in sources:
            url = src.get("url", "")
            parsed = urlparse(url)
            if parsed.scheme not in _ALLOWED_SCHEMES:
                invalid.append({**src, "reason": f"disallowed scheme: {parsed.scheme}"})
            elif parsed.hostname and parsed.hostname in _BLOCKED_HOSTS:
                invalid.append({**src, "reason": f"blocked host: {parsed.hostname}"})
            else:
                valid.append(src)

        return ToolResult(
            success=True,
            output_data={
                "valid_sources": valid,
                "invalid_sources": invalid,
                "valid_count": len(valid),
                "invalid_count": len(invalid),
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": (time.monotonic() - t0) * 1000},
        )
