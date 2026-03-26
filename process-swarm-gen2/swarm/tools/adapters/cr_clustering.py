"""Context Report Stage 3 — Clustering via Ollama.

Engine: Ollama
Task Type: Group related signals, deduplicate, assign categories
Reasoning: Mechanical grouping — no deep synthesis required

Categories: technical, governance, market

Input: extraction output (entities, events, topics, raw_signals)
Output: clusters with category assignments
"""
from __future__ import annotations

import json
import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.inference_engines import OllamaClient


def _strip_think_tags(text: str) -> str:
    """Remove qwen3 <think>...</think> blocks from output."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


_CATEGORIES = ("technical", "governance", "market")

_CLUSTERING_SYSTEM = (
    "You are a signal clustering engine. Given extracted entities, events, "
    "topics, and raw signals, group them into clusters by relatedness. "
    "Deduplicate similar items. You MUST create clusters across ALL THREE "
    "categories: technical, governance, AND market. Even if signals seem "
    "primarily technical, identify governance implications (regulation, "
    "policy, compliance, ethics) and market implications (competition, "
    "pricing, adoption, investment) as separate clusters.\n"
    "Create 3-7 clusters total, with at least one per category.\n"
    "Return ONLY valid JSON with no markdown formatting. "
    'The JSON must have key "clusters" containing a list of objects, '
    "each with: "
    '"category" (one of: technical, governance, market), '
    '"label" (short cluster name), '
    '"signals" (list of signal strings in this cluster), '
    '"entity_refs" (list of entity names referenced).'
)

_CLUSTERING_PROMPT = (
    "Cluster and categorize the following extracted intelligence:\n\n"
    "ENTITIES:\n{entities}\n\n"
    "EVENTS:\n{events}\n\n"
    "TOPICS:\n{topics}\n\n"
    "RAW SIGNALS:\n{signals}\n\n"
    "Group related items, deduplicate, and assign categories "
    "(technical, governance, market). Return ONLY the JSON. /no_think"
)


class CRClusteringAdapter(ToolAdapter):
    """Groups and categorizes extracted signals using Ollama."""

    @property
    def tool_name(self) -> str:
        return "cr_clustering"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        # Get extraction output from upstream
        entities = self.find_prior_output(ctx, "entities") or []
        events = self.find_prior_output(ctx, "events") or []
        topics = self.find_prior_output(ctx, "topics") or []
        raw_signals = self.find_prior_output(ctx, "raw_signals") or []

        # Format for prompt
        def fmt_list(items):
            if not items:
                return "[none]"
            parts = []
            for item in items:
                if isinstance(item, dict):
                    parts.append(json.dumps(item))
                else:
                    parts.append(str(item))
            return "\n".join(f"- {p}" for p in parts)

        prompt = _CLUSTERING_PROMPT.format(
            entities=fmt_list(entities),
            events=fmt_list(events),
            topics=fmt_list(topics),
            signals=fmt_list(raw_signals),
        )

        # Try ACDS dispatch first, fall back to direct Ollama
        full_prompt = f"{_CLUSTERING_SYSTEM}\n\n{prompt}"
        acds_output = None
        engine_used = "ollama"
        model_used = ctx.config.get("model", "qwen3:8b")

        if ctx.inference is not None:
            acds_output = ctx.inference.infer(
                full_prompt,
                task_type="classification",
                cognitive_grade="standard",
                process="context_report",
                step="cr_clustering",
                run_id=ctx.run_id,
            )

        if acds_output is not None:
            engine_used = "acds"
            model_used = "acds-dispatched"
            output_text = _strip_think_tags(acds_output)
        else:
            ollama = OllamaClient(
                default_model=ctx.config.get("model", "qwen3:8b"),
                timeout_seconds=ctx.config.get("timeout_seconds", 300),
            )
            result = ollama.generate(prompt, system=_CLUSTERING_SYSTEM, temperature=0.1)

            if not result.success:
                return ToolResult(
                    success=False,
                    output_data={},
                    artifacts=[],
                    error=f"Ollama clustering failed: {result.error}",
                    metadata={"duration_ms": result.latency_ms, "engine": "ollama"},
                )

            model_used = result.model
            output_text = _strip_think_tags(result.output)
        try:
            parsed = json.loads(output_text.strip())
        except json.JSONDecodeError:
            parsed = _try_parse_json(output_text)
            if parsed is None:
                # Fallback: create single cluster from all signals
                parsed = {"clusters": [{
                    "category": "technical",
                    "label": "Uncategorized",
                    "signals": [str(s) for s in raw_signals[:20]],
                    "entity_refs": [],
                }]}

        clusters = parsed.get("clusters", [])

        # Validate categories
        for cluster in clusters:
            if cluster.get("category") not in _CATEGORIES:
                cluster["category"] = "technical"

        # Write artifact
        artifact_path = ctx.workspace_root / "clustering_output.json"
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps({"clusters": clusters}, indent=2))

        latency = int((time.monotonic() - t0) * 1000)
        return ToolResult(
            success=True,
            output_data={
                "clusters": clusters,
                "cluster_count": len(clusters),
                "category_counts": {
                    cat: sum(1 for c in clusters if c.get("category") == cat)
                    for cat in _CATEGORIES
                },
                "engine": engine_used,
                "model": model_used,
            },
            artifacts=[str(artifact_path)],
            error=None,
            metadata={
                "duration_ms": latency,
                "engine": engine_used,
                "model": model_used,
                "cluster_count": len(clusters),
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
