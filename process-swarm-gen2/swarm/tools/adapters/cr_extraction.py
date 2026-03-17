"""Context Report Stage 2 — Extraction via Ollama.

Engine: Ollama
Task Type: Entity extraction, event detection, signal parsing
Reasoning: High volume, pattern recognition over reasoning

Input: normalized sources from prior steps
Output: entities, events, topics, raw_signals
"""
from __future__ import annotations

import json
import re
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.inference_engines import OllamaClient


_EXTRACTION_SYSTEM = (
    "You are an intelligence extraction engine. "
    "Return ONLY valid JSON with no markdown, no explanation, no thinking. "
    "Use EXACTLY this schema:\n"
    "{\n"
    '  "entities": [{"name": "...", "type": "person|org|product|tech"}],\n'
    '  "events": [{"description": "...", "date": "..."}],\n'
    '  "topics": ["topic1", "topic2"],\n'
    '  "raw_signals": ["signal statement 1", "signal statement 2"]\n'
    "}\n"
    "Do NOT add extra keys. Do NOT use nested objects beyond the schema above."
)

_EXTRACTION_PROMPT = (
    "Extract intelligence from the following sources. "
    "Populate entities (named things), events (what happened), "
    "topics (themes), and raw_signals (notable claims/facts).\n\n"
    "SOURCES:\n{sources}\n\n"
    "Respond with ONLY the JSON object using the exact schema from your instructions. "
    "/no_think"
)


class CRExtractionAdapter(ToolAdapter):
    """Extracts entities, events, topics from normalized sources using Ollama."""

    @property
    def tool_name(self) -> str:
        return "cr_extraction"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        # Get normalized sources from upstream
        sources = (
            ctx.config.get("sources")
            or self.find_prior_output(ctx, "fresh_sources")
            or self.find_prior_output(ctx, "normalized_sources")
            or self.find_prior_output(ctx, "sources")
            or []
        )

        if not sources:
            return ToolResult(
                success=True,
                output_data={
                    "entities": [], "events": [], "topics": [],
                    "raw_signals": [], "engine": "ollama",
                },
                artifacts=[],
                error=None,
                metadata={"duration_ms": 0, "engine": "ollama"},
                warnings=["No sources provided for extraction"],
            )

        # Build source text block — cap each source and total to fit context window
        max_per_source = ctx.config.get("max_chars_per_source", 2000)
        max_total = ctx.config.get("max_total_chars", 12000)
        source_texts = []
        total = 0
        for src in sources:
            content = src.get("content", "") if isinstance(src, dict) else str(src)
            title = src.get("title", "") if isinstance(src, dict) else ""
            chunk = content[:max_per_source]
            entry = f"[{title}]: {chunk}" if title else chunk
            if total + len(entry) > max_total:
                break
            source_texts.append(entry)
            total += len(entry)

        combined = "\n---\n".join(source_texts)
        prompt = _EXTRACTION_PROMPT.format(sources=combined)

        # Call Ollama
        ollama = OllamaClient(
            default_model=ctx.config.get("model", "qwen3:8b"),
            timeout_seconds=ctx.config.get("timeout_seconds", 300),
        )
        result = ollama.generate(prompt, system=_EXTRACTION_SYSTEM, temperature=0.1)

        if not result.success:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error=f"Ollama extraction failed: {result.error}",
                metadata={"duration_ms": result.latency_ms, "engine": "ollama"},
            )

        # Parse JSON output — strip qwen3 thinking tags if present
        output_text = _strip_think_tags(result.output)
        try:
            extracted = json.loads(output_text.strip())
        except json.JSONDecodeError:
            # Try to salvage — look for JSON block in output
            extracted = _try_parse_json(output_text)
            if extracted is None:
                extracted = {
                    "entities": [],
                    "events": [],
                    "topics": [],
                    "raw_signals": [result.output[:500]],
                }

        # Normalize structure — salvage data from non-standard keys
        for key in ("entities", "events", "topics", "raw_signals"):
            if key not in extracted:
                extracted[key] = []

        # If standard keys are empty but model used custom keys, salvage
        if not any(extracted[k] for k in ("entities", "events", "topics", "raw_signals")):
            extracted = _salvage_nonstandard(extracted)

        # Write extraction artifact
        artifact_path = ctx.workspace_root / "extraction_output.json"
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps(extracted, indent=2))

        latency = int((time.monotonic() - t0) * 1000)
        return ToolResult(
            success=True,
            output_data={
                "entities": extracted["entities"],
                "events": extracted["events"],
                "topics": extracted["topics"],
                "raw_signals": extracted["raw_signals"],
                "engine": "ollama",
                "model": result.model,
            },
            artifacts=[str(artifact_path)],
            error=None,
            metadata={
                "duration_ms": latency,
                "engine": "ollama",
                "model": result.model,
                "entity_count": len(extracted["entities"]),
                "event_count": len(extracted["events"]),
                "topic_count": len(extracted["topics"]),
                "signal_count": len(extracted["raw_signals"]),
            },
        )


def _strip_think_tags(text: str) -> str:
    """Remove qwen3 <think>...</think> blocks from output."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _try_parse_json(text: str) -> dict | None:
    """Try to extract JSON from text that may have markdown wrapping."""
    # Try stripping markdown code fences
    for prefix in ("```json", "```"):
        if prefix in text:
            start = text.index(prefix) + len(prefix)
            end = text.find("```", start)
            if end > start:
                try:
                    return json.loads(text[start:end].strip())
                except json.JSONDecodeError:
                    pass
    # Try finding first { ... }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass
    return None


def _salvage_nonstandard(data: dict) -> dict:
    """Extract signals from non-standard model output into expected schema."""
    entities: list[dict] = []
    signals: list[str] = []
    topics: list[str] = []

    standard_keys = {"entities", "events", "topics", "raw_signals"}
    for key, value in data.items():
        if key in standard_keys:
            continue
        # Each non-standard key is likely a topic
        topics.append(key.replace("_", " ").title())
        if isinstance(value, dict):
            # Extract named entities from string fields
            for fk, fv in value.items():
                if isinstance(fv, str) and len(fv) > 10:
                    signals.append(fv)
                elif isinstance(fv, list):
                    for item in fv:
                        if isinstance(item, str):
                            signals.append(item)
                        elif isinstance(item, dict):
                            name = item.get("name", "")
                            if name:
                                entities.append({"name": name, "type": "entity"})
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    signals.append(item)

    return {
        "entities": entities or data.get("entities", []),
        "events": data.get("events", []),
        "topics": topics or data.get("topics", []),
        "raw_signals": signals or data.get("raw_signals", []),
    }
