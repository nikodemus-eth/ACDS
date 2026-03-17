"""Context Report generator — produces Nik's Context Document via ACDS.

Orchestrates: topic + sources → section mapping → per-section ACDS synthesis
→ formatted markdown report. Each section is synthesized via a separate
ACDS dispatch call routed through Apple Intelligence (privacy: local_only).
"""
from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
import json
from dataclasses import dataclass, field
from typing import Optional

from process_swarm.acds_client import (
    ACDSClient,
    ACDSClientError,
    CognitiveGrade,
    DecisionPosture,
    DispatchRunRequest,
    LoadTier,
    RoutingConstraints,
    RoutingRequest,
)

logger = logging.getLogger(__name__)

_DEFAULT_ACDS_URL = "http://localhost:3000"
_APPLE_BRIDGE_URL = "http://localhost:11435"


@dataclass
class SectionResult:
    name: str
    content: str
    latency_ms: int = 0
    provider: str = ""
    model: str = ""
    fallback_used: bool = False


@dataclass
class ReportResult:
    topic: str
    sections: dict[str, SectionResult] = field(default_factory=dict)
    report_markdown: str = ""
    provider: str = ""
    model: str = ""
    total_latency_ms: int = 0
    section_count: int = 0
    fallback_used: bool = False
    error: Optional[str] = None
    trace: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "topic": self.topic,
            "sections": {
                name: {
                    "content": sec.content,
                    "latency_ms": sec.latency_ms,
                    "provider": sec.provider,
                    "model": sec.model,
                    "fallback_used": sec.fallback_used,
                }
                for name, sec in self.sections.items()
            },
            "report_markdown": self.report_markdown,
            "provider": self.provider,
            "model": self.model,
            "total_latency_ms": self.total_latency_ms,
            "section_count": self.section_count,
            "fallback_used": self.fallback_used,
            "error": self.error,
            "trace": self.trace,
        }


def check_health(acds_url: str = _DEFAULT_ACDS_URL) -> dict:
    """Check ACDS and Apple Intelligence bridge health."""
    acds_healthy = False
    apple_healthy = False

    try:
        client = ACDSClient(base_url=acds_url, timeout_seconds=5)
        acds_healthy = client.health()
    except Exception:
        pass

    try:
        req = urllib.request.Request(
            f"{_APPLE_BRIDGE_URL}/health",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            apple_healthy = resp.status == 200
    except Exception:
        pass

    return {
        "acds_healthy": acds_healthy,
        "apple_bridge_healthy": apple_healthy,
        "acds_url": acds_url,
        "apple_bridge_url": _APPLE_BRIDGE_URL,
    }


def _parse_sources(raw_sources: str) -> list[dict]:
    """Parse raw source text into structured source items."""
    if not raw_sources.strip():
        return []

    sources = []
    for i, line in enumerate(raw_sources.strip().split("\n")):
        line = line.strip()
        if not line:
            continue
        sources.append({
            "id": f"source-{i + 1}",
            "content": line,
            "name": f"Source {i + 1}",
        })
    return sources


def _build_section_prompt(
    topic: str,
    section_name: str,
    sources: list[dict],
    all_sections: list[str],
) -> str:
    """Build the synthesis prompt for a single section."""
    source_block = ""
    for src in sources:
        source_block += f"\n- {src['content']}"

    return (
        f"You are producing the '{section_name}' section of a weekly intelligence "
        f"briefing on the topic: {topic}\n\n"
        f"The full report has these sections: {', '.join(all_sections)}\n\n"
        f"Source materials:{source_block}\n\n"
        f"Write the '{section_name}' section. Be concise, factual, and grounded "
        f"in the source materials. Use professional briefing style. "
        f"Do not include the section heading — just the content."
    )


def generate_report(
    topic: str,
    raw_sources: str,
    sections: list[str],
    cognitive_grade: str = "standard",
    acds_url: str = _DEFAULT_ACDS_URL,
) -> ReportResult:
    """Generate a full context report by dispatching each section through ACDS."""
    t0 = time.monotonic()
    result = ReportResult(topic=topic)
    trace: list[dict] = []

    if not sections:
        sections = ["Summary", "Analysis", "Recommendations"]

    sources = _parse_sources(raw_sources)
    trace.append({"step": "Parse sources", "status": "completed",
                   "detail": f"{len(sources)} sources parsed"})

    # Map sources to sections (round-robin)
    section_sources: dict[str, list[dict]] = {s: [] for s in sections}
    for i, src in enumerate(sources):
        target = sections[i % len(sections)]
        section_sources[target].append(src)

    # If no sources provided, give all sections the topic as context
    if not sources:
        for s in sections:
            section_sources[s] = [{"id": "topic", "content": topic, "name": "Topic"}]

    trace.append({"step": "Map sources to sections", "status": "completed",
                   "detail": ", ".join(f"{k}: {len(v)}" for k, v in section_sources.items())})

    client = ACDSClient(base_url=acds_url, timeout_seconds=60)

    # Synthesize each section via ACDS dispatch
    any_fallback = False
    last_provider = ""
    last_model = ""

    for section_name in sections:
        prompt = _build_section_prompt(
            topic, section_name, section_sources[section_name], sections,
        )

        trace.append({"step": f"Dispatch: {section_name}", "status": "running",
                       "detail": "Calling ACDS..."})

        sec_t0 = time.monotonic()
        try:
            routing = RoutingRequest(
                application="process_swarm",
                process="context_report",
                step=f"synthesize_{section_name.lower().replace(' ', '_')}",
                taskType="summarization",
                loadTier=LoadTier.SINGLE_SHOT.value,
                decisionPosture=DecisionPosture.OPERATIONAL.value,
                cognitiveGrade=cognitive_grade,
                input=prompt,
                constraints=RoutingConstraints(
                    privacy="local_only",
                    maxLatencyMs=60000,
                    costSensitivity="medium",
                    structuredOutputRequired=False,
                    traceabilityRequired=True,
                ),
            )
            request = DispatchRunRequest(
                routingRequest=routing,
                inputPayload=prompt,
                inputFormat="text",
            )
            response = client.dispatch(request)
            sec_latency = int((time.monotonic() - sec_t0) * 1000)

            content = response.normalizedOutput or "[No output returned]"
            provider = response.selectedProviderId or "unknown"
            model = response.selectedModelProfileId or "unknown"
            fallback = response.fallbackUsed

            last_provider = provider
            last_model = model
            if fallback:
                any_fallback = True

            result.sections[section_name] = SectionResult(
                name=section_name,
                content=content,
                latency_ms=sec_latency,
                provider=provider,
                model=model,
                fallback_used=fallback,
            )
            trace[-1]["status"] = "completed"
            trace[-1]["detail"] = f"{provider}/{model} in {sec_latency}ms"

        except ACDSClientError as e:
            sec_latency = int((time.monotonic() - sec_t0) * 1000)
            logger.warning("ACDS dispatch failed for section %s: %s", section_name, e)
            result.sections[section_name] = SectionResult(
                name=section_name,
                content=f"[ACDS dispatch failed: {e}]",
                latency_ms=sec_latency,
            )
            trace[-1]["status"] = "error"
            trace[-1]["detail"] = str(e)

    # Format the report
    parts = []
    parts.append(f"# {topic}\n")
    for section_name in sections:
        sec = result.sections.get(section_name)
        content = sec.content if sec else "[Not generated]"
        parts.append(f"## {section_name}\n\n{content}")

    result.report_markdown = "\n\n".join(parts)
    result.provider = last_provider
    result.model = last_model
    result.total_latency_ms = int((time.monotonic() - t0) * 1000)
    result.section_count = len(sections)
    result.fallback_used = any_fallback
    result.trace = trace

    trace.append({"step": "Format report", "status": "completed",
                   "detail": f"{len(result.report_markdown)} chars"})

    return result
