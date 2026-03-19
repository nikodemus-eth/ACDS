from __future__ import annotations

import hashlib
import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


_WHITESPACE_RE = re.compile(r"\s+")


class ProbabilisticSynthesisAdapter(ToolAdapter):
    """Synthesizes section content from briefs with deterministic grounding logic."""

    @property
    def tool_name(self) -> str:
        return "probabilistic_synthesis"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()
        briefs = ctx.action.get("briefs") or self.find_prior_output(ctx, "briefs") or {}
        sections: dict[str, dict] = {}

        for name, brief in briefs.items():
            snippets = brief.get("snippets", [])
            cleaned_snippets = self._clean_snippets(snippets)
            body = self._synthesize_section(name, brief, cleaned_snippets)
            digest = hashlib.sha256(body.encode()).hexdigest()[:12]
            sections[name] = {
                "heading": name.replace("_", " ").title(),
                "body": body,
                "source_count": brief.get("source_count", 0),
                "content_hash": digest,
                "source_names": brief.get("source_names", []),
                "instructions_applied": brief.get(
                    "instructions",
                    "Synthesize the provided sources.",
                ),
            }

        return ToolResult(
            success=True,
            output_data={"sections": sections, "section_count": len(sections)},
            artifacts=[],
            error=None,
            metadata={"duration_s": time.monotonic() - t0},
        )

    @staticmethod
    def _clean_snippets(snippets: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for snippet in snippets:
            normalized = _WHITESPACE_RE.sub(" ", str(snippet or "")).strip()
            if not normalized:
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned

    @staticmethod
    def _synthesize_section(
        section_name: str,
        brief: dict,
        snippets: list[str],
    ) -> str:
        if not snippets:
            return f"[No source content for section '{section_name}']"

        instructions = brief.get("instructions", "").strip()
        source_count = brief.get("source_count", len(snippets))
        lead = (
            f"{section_name.replace('_', ' ').title()} synthesizes {source_count} source"
            f"{'' if source_count == 1 else 's'}."
        )
        if instructions:
            lead = f"{lead} Focus: {instructions}"

        highlights = []
        for snippet in snippets[:3]:
            highlights.append(f"- {snippet}")

        supporting = ""
        if len(snippets) > 3:
            supporting = (
                "\n\nSupporting detail:\n"
                + "\n".join(f"- {snippet}" for snippet in snippets[3:5])
            )

        return f"{lead}\n\nKey points:\n" + "\n".join(highlights) + supporting
