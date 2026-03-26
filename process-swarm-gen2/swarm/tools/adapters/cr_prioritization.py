"""Context Report Stage 4 — Prioritization via Apple Intelligence.

Engine: Apple Intelligence
Task Type: Rank signals by impact, novelty, relevance
Reasoning Requirement: Contextual understanding, domain alignment

Relevance domains: Corvusforge, Thingstead, SOAE

Input: clustered signals
Output: prioritized clusters with rankings
"""
from __future__ import annotations

import json
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.inference_engines import AppleIntelligenceClient


_PRIORITIZATION_SYSTEM = (
    "You are an intelligence prioritization engine for a technology "
    "advisory firm. Rank clustered signals by three dimensions: "
    "impact (1-5), novelty (1-5), and relevance (1-5). "
    "Relevance is measured against these domains: "
    "Corvusforge (software infrastructure), "
    "Thingstead (IoT and edge computing), "
    "SOAE (Service-Oriented Autonomous Engineering). "
    "Return ONLY valid JSON with no markdown formatting. "
    'The JSON must have key "prioritized" containing a list of objects, '
    "each with: "
    '"label" (cluster name), '
    '"category" (technical/governance/market), '
    '"impact" (1-5), '
    '"novelty" (1-5), '
    '"relevance" (1-5), '
    '"composite_score" (average of the three), '
    '"rationale" (1-2 sentence explanation), '
    '"signals" (the original signal list).'
)

_PRIORITIZATION_PROMPT = (
    "Prioritize the following clustered intelligence signals. "
    "Rank each cluster by impact, novelty, and relevance to "
    "Corvusforge, Thingstead, and SOAE.\n\n"
    "CLUSTERS:\n{clusters}\n\n"
    "Return ONLY the JSON with prioritized rankings."
)


class CRPrioritizationAdapter(ToolAdapter):
    """Ranks clustered signals using Apple Intelligence for deep reasoning."""

    @property
    def tool_name(self) -> str:
        return "cr_prioritization"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        clusters = self.find_prior_output(ctx, "clusters") or []

        if not clusters:
            return ToolResult(
                success=True,
                output_data={
                    "prioritized": [],
                    "engine": "apple_intelligence",
                },
                artifacts=[],
                error=None,
                metadata={"duration_ms": 0, "engine": "apple_intelligence"},
                warnings=["No clusters to prioritize"],
            )

        # Format clusters for prompt
        cluster_text = json.dumps(clusters, indent=2)
        prompt = _PRIORITIZATION_PROMPT.format(clusters=cluster_text)

        # Try ACDS dispatch first, fall back to direct Apple Intelligence
        full_prompt = f"{_PRIORITIZATION_SYSTEM}\n\n{prompt}"
        acds_output = None
        engine_used = "apple_intelligence"
        model_used = ctx.config.get("model", "apple-fm-on-device")

        if ctx.inference is not None:
            acds_output = ctx.inference.infer(
                full_prompt,
                task_type="reasoning",
                cognitive_grade="enhanced",
                process="context_report",
                step="cr_prioritization",
                run_id=ctx.run_id,
            )

        if acds_output is not None:
            engine_used = "acds"
            model_used = "acds-dispatched"
            result_output = acds_output
        else:
            apple = AppleIntelligenceClient(
                timeout_seconds=ctx.config.get("timeout_seconds", 120),
            )
            result = apple.generate(
                prompt,
                system=_PRIORITIZATION_SYSTEM,
                temperature=0.3,
                model=ctx.config.get("model", "apple-fm-on-device"),
            )

            if not result.success:
                # Per spec: Apple Intelligence failure → retry once
                result = apple.generate(
                    prompt,
                    system=_PRIORITIZATION_SYSTEM,
                    temperature=0.3,
                )
                if not result.success:
                    return ToolResult(
                        success=False,
                        output_data={},
                        artifacts=[],
                        error=(
                            f"Apple Intelligence prioritization failed after retry: "
                            f"{result.error}"
                        ),
                        metadata={
                            "duration_ms": result.latency_ms,
                            "engine": "apple_intelligence",
                            "retried": True,
                        },
                    )

            model_used = result.model
            result_output = result.output

        # Parse output
        try:
            parsed = json.loads(result_output.strip())
        except json.JSONDecodeError:
            parsed = _try_parse_json(result_output)
            if parsed is None:
                return ToolResult(
                    success=False,
                    output_data={},
                    artifacts=[],
                    error="Prioritization returned unparseable output",
                    metadata={
                        "duration_ms": int((time.monotonic() - t0) * 1000),
                        "engine": engine_used,
                        "raw_output_len": len(result_output),
                    },
                )

        prioritized = parsed.get("prioritized", [])

        # Sort by composite score descending
        for item in prioritized:
            if "composite_score" not in item:
                scores = [
                    item.get("impact", 3),
                    item.get("novelty", 3),
                    item.get("relevance", 3),
                ]
                item["composite_score"] = round(sum(scores) / len(scores), 2)

        prioritized.sort(key=lambda x: x.get("composite_score", 0), reverse=True)

        # Write artifact
        artifact_path = ctx.workspace_root / "prioritization_output.json"
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps({"prioritized": prioritized}, indent=2))

        latency = int((time.monotonic() - t0) * 1000)
        return ToolResult(
            success=True,
            output_data={
                "prioritized": prioritized,
                "priority_count": len(prioritized),
                "top_category": prioritized[0]["category"] if prioritized else None,
                "top_score": prioritized[0].get("composite_score") if prioritized else None,
                "engine": engine_used,
                "model": model_used,
            },
            artifacts=[str(artifact_path)],
            error=None,
            metadata={
                "duration_ms": latency,
                "engine": engine_used,
                "model": model_used,
                "priority_count": len(prioritized),
            },
        )


def _try_parse_json(text: str) -> dict | None:
    """Try to extract JSON from text that may have markdown wrapping."""
    for prefix in ("```json", "```"):
        if prefix in text:
            start = text.index(prefix) + len(prefix)
            end = text.find("```", start)
            if end > start:
                try:
                    return json.loads(text[start:end].strip())
                except json.JSONDecodeError:
                    pass
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass
    return None
