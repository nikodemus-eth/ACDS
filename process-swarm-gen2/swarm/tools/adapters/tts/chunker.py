"""TTS Chunker — splits normalized text into size-bounded chunks."""

from __future__ import annotations

import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsChunkerAdapter(ToolAdapter):
    """Splits normalized text into chunks safe for the macOS say command.

    Split strategy: first by paragraph (double-newline), then by sentence
    boundary (. ? !) if a paragraph exceeds max_chunk_chars.
    """

    @property
    def tool_name(self) -> str:
        return "tts_chunker"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        normalizer_data = ctx.prior_results.get("tts_text_normalizer")
        if not isinstance(normalizer_data, dict) or "normalized_text" not in normalizer_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_text_normalizer.normalized_text in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        text = normalizer_data["normalized_text"]
        max_chars = ctx.config.get("max_chunk_chars", 1200)

        # Split by paragraphs first
        paragraphs = re.split(r"\n\n+", text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        raw_chunks: list[str] = []
        for para in paragraphs:
            if len(para) <= max_chars:
                raw_chunks.append(para)
            else:
                # Split by sentence boundaries
                sentences = re.split(r"(?<=[.?!])\s+", para)
                current = ""
                for sentence in sentences:
                    candidate = (current + " " + sentence).strip() if current else sentence
                    if len(candidate) <= max_chars:
                        current = candidate
                    else:
                        if current:
                            raw_chunks.append(current)
                        # If a single sentence exceeds max_chars, include it as-is
                        current = sentence
                if current:
                    raw_chunks.append(current)

        chunks = []
        total_chars = 0
        for i, chunk_text in enumerate(raw_chunks):
            char_count = len(chunk_text)
            total_chars += char_count
            chunks.append({
                "index": i,
                "text": chunk_text,
                "char_count": char_count,
            })

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "chunks": chunks,
                "chunk_count": len(chunks),
                "total_chars": total_chars,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
