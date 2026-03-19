"""TTS Text Normalizer — expands abbreviations and inserts silence markers."""

from __future__ import annotations

import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsTextNormalizerAdapter(ToolAdapter):
    """Normalizes text for macOS TTS: expands abbreviations to dotted form
    and inserts silence markers between paragraphs.
    """

    ABBREVIATION_MAP: dict[str, str] = {
        "AI": "A.I.",
        "LLM": "L.L.M.",
        "ML": "M.L.",
        "NLP": "N.L.P.",
        "API": "A.P.I.",
        "GPU": "G.P.U.",
        "CPU": "C.P.U.",
        "TTS": "T.T.S.",
        "URL": "U.R.L.",
        "SDK": "S.D.K.",
        "NIST": "N.I.S.T.",
        "EU": "E.U.",
    }

    @property
    def tool_name(self) -> str:
        return "tts_text_normalizer"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        extractor_data = ctx.prior_results.get("tts_text_extractor")
        if not isinstance(extractor_data, dict) or "narratable_text" not in extractor_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_text_extractor.narratable_text in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        text = extractor_data["narratable_text"]
        expansions_applied = 0

        # Expand abbreviations using word-boundary matching
        for abbr, expanded in self.ABBREVIATION_MAP.items():
            pattern = re.compile(r"\b" + re.escape(abbr) + r"\b")
            text, count = pattern.subn(expanded, text)
            expansions_applied += count

        # Insert silence markers between paragraphs (double newlines)
        text = re.sub(r"\n\n+", "\n\n[[slnc 500]]\n\n", text)

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "normalized_text": text,
                "expansions_applied": expansions_applied,
            },
            artifacts=[],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
