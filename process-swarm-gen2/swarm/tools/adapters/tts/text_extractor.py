"""TTS Text Extractor — strips non-narratable markup from report text."""

from __future__ import annotations

import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsTextExtractorAdapter(ToolAdapter):
    """Strips markdown tables, URLs, citations, code blocks, HTML tags,
    and image syntax from report text, leaving clean narratable prose.
    """

    @property
    def tool_name(self) -> str:
        return "tts_text_extractor"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        resolver_data = ctx.prior_results.get("tts_artifact_resolver")
        if not isinstance(resolver_data, dict) or "report_text" not in resolver_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_artifact_resolver.report_text in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        original = resolver_data["report_text"]
        original_length = len(original)
        text = original
        stripped_elements: list[str] = []

        # 1. Strip fenced code blocks (```...```)
        new_text = re.sub(r"```[\s\S]*?```", "", text)
        if new_text != text:
            stripped_elements.append("code_blocks")
        text = new_text

        # 2. Strip markdown tables (lines containing |---|)
        lines = text.split("\n")
        table_indices: set[int] = set()
        for i, line in enumerate(lines):
            if re.search(r"\|[-:]+\|", line):
                table_indices.add(i)
                # Also mark adjacent rows that look like table rows
                for j in range(i - 1, -1, -1):
                    if "|" in lines[j]:
                        table_indices.add(j)
                    else:
                        break
                for j in range(i + 1, len(lines)):
                    if "|" in lines[j]:
                        table_indices.add(j)
                    else:
                        break
        if table_indices:
            stripped_elements.append("markdown_tables")
            lines = [line for i, line in enumerate(lines) if i not in table_indices]
            text = "\n".join(lines)

        # 3. Strip markdown image syntax ![alt](url)
        new_text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
        if new_text != text:
            stripped_elements.append("markdown_images")
        text = new_text

        # 4. Strip HTML tags
        new_text = re.sub(r"<[^>]+>", "", text)
        if new_text != text:
            stripped_elements.append("html_tags")
        text = new_text

        # 5. Strip URLs (http/https)
        new_text = re.sub(r"https?://[^\s)\]>]+", "", text)
        if new_text != text:
            stripped_elements.append("urls")
        text = new_text

        # 6. Strip citation tokens like [SRC-xxx] or [REF-xxx]
        new_text = re.sub(r"\[(?:SRC|REF)-[^\]]*\]", "", text)
        if new_text != text:
            stripped_elements.append("citation_tokens")
        text = new_text

        # 7. Strip heading markers (# ## ### etc.) but keep the heading text
        new_text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
        if new_text != text:
            stripped_elements.append("heading_markers")
        text = new_text

        # 8. Collapse excessive whitespace but preserve paragraph breaks
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "narratable_text": text,
                "original_length": original_length,
                "stripped_length": len(text),
                "stripped_elements": stripped_elements,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
