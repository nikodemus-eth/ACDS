"""Context Report Stage 5 — Synthesis via Apple Intelligence.

Engine: Apple Intelligence
Task Type: Generate full report text, narrative coherence
Reasoning Requirement: High — must maintain tone, structure, avoid hallucination

Input: prioritized clusters with rankings
Output: full report text organized by sections
"""
from __future__ import annotations

import json
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.inference_engines import AppleIntelligenceClient


_SYNTHESIS_SYSTEM = (
    "You are an intelligence synthesis engine producing a weekly briefing "
    "report. Generate clear, professional, factual prose. "
    "Structure the report with these sections:\n"
    "1. Executive Summary (3-5 key takeaways)\n"
    "2. Technical Intelligence (technical signals)\n"
    "3. Governance & Policy (governance signals)\n"
    "4. Market Intelligence (market signals)\n"
    "5. Recommendations (actionable next steps)\n\n"
    "Rules:\n"
    "- Ground all claims in the provided signals\n"
    "- Do not hallucinate information not present in signals\n"
    "- Use professional briefing tone\n"
    "- Cite signal sources by label where possible\n"
    "- Keep each section concise (100-300 words)\n"
    "- Return plain text with section headers prefixed by ##"
)

_SYNTHESIS_PROMPT = (
    "Synthesize the following prioritized intelligence into a weekly "
    "context briefing report.\n\n"
    "PRIORITIZED SIGNALS (ranked by composite score):\n{signals}\n\n"
    "Generate the full report text with all required sections."
)


class CRSynthesisAdapter(ToolAdapter):
    """Synthesizes prioritized signals into a narrative report using Apple Intelligence."""

    @property
    def tool_name(self) -> str:
        return "cr_synthesis"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        prioritized = self.find_prior_output(ctx, "prioritized") or []

        if not prioritized:
            return ToolResult(
                success=True,
                output_data={
                    "report_text": "[No signals available for synthesis]",
                    "sections": {},
                    "engine": "apple_intelligence",
                },
                artifacts=[],
                error=None,
                metadata={"duration_ms": 0, "engine": "apple_intelligence"},
                warnings=["No prioritized signals for synthesis"],
            )

        # Format prioritized signals
        signal_text = json.dumps(prioritized, indent=2)
        prompt = _SYNTHESIS_PROMPT.format(signals=signal_text)

        # Try ACDS dispatch first, fall back to direct Apple Intelligence
        full_prompt = f"{_SYNTHESIS_SYSTEM}\n\n{prompt}"
        acds_output = None
        engine_used = "apple_intelligence"
        model_used = ctx.config.get("model", "apple-fm-on-device")

        if ctx.inference is not None:
            acds_output = ctx.inference.infer(
                full_prompt,
                task_type="generation",
                cognitive_grade="frontier",
                process="context_report",
                step="cr_synthesis",
                run_id=ctx.run_id,
            )

        if acds_output is not None:
            engine_used = "acds"
            model_used = "acds-dispatched"
            report_text = acds_output.strip()
        else:
            apple = AppleIntelligenceClient(
                timeout_seconds=ctx.config.get("timeout_seconds", 180),
            )
            result = apple.generate(
                prompt,
                system=_SYNTHESIS_SYSTEM,
                temperature=0.4,
                model=ctx.config.get("model", "apple-fm-on-device"),
            )

            if not result.success:
                # Per spec: Apple Intelligence failure → retry once
                result = apple.generate(
                    prompt,
                    system=_SYNTHESIS_SYSTEM,
                    temperature=0.4,
                )
                if not result.success:
                    return ToolResult(
                        success=False,
                        output_data={},
                        artifacts=[],
                        error=(
                            f"Apple Intelligence synthesis failed after retry: "
                            f"{result.error}"
                        ),
                        metadata={
                            "duration_ms": result.latency_ms,
                            "engine": "apple_intelligence",
                            "retried": True,
                        },
                    )

            model_used = result.model
            report_text = result.output.strip()

        # Parse into sections
        sections = _parse_sections(report_text)

        # Write report artifact
        report_path = ctx.workspace_root / "output" / "context_report.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report_text)

        # Write structured sections
        sections_path = ctx.workspace_root / "synthesis_sections.json"
        sections_path.write_text(json.dumps(sections, indent=2))

        latency = int((time.monotonic() - t0) * 1000)
        return ToolResult(
            success=True,
            output_data={
                "report_text": report_text,
                "sections": sections,
                "section_count": len(sections),
                "char_count": len(report_text),
                "engine": engine_used,
                "model": model_used,
            },
            artifacts=[str(report_path), str(sections_path)],
            error=None,
            metadata={
                "duration_ms": latency,
                "engine": engine_used,
                "model": model_used,
                "char_count": len(report_text),
                "section_count": len(sections),
            },
        )


def _parse_sections(text: str) -> dict[str, str]:
    """Parse markdown-style ## sections from report text."""
    sections: dict[str, str] = {}
    current_name = ""
    current_lines: list[str] = []

    for line in text.split("\n"):
        if line.startswith("## "):
            if current_name:
                sections[current_name] = "\n".join(current_lines).strip()
            current_name = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_name:
        sections[current_name] = "\n".join(current_lines).strip()

    # If no sections parsed, put everything under "Report"
    if not sections:
        sections["Report"] = text.strip()

    return sections
