"""Swarm archetype classification.

Classifies user intent into one of 12 swarm archetypes using
rule-based keyword matching, with optional LLM-based classification
via ACDS (Adaptive Cognitive Dispatch System).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from process_swarm.inference import InferenceProvider

logger = logging.getLogger(__name__)


class ArtifactType(str, Enum):
    DOCUMENT_GENERATION = "document_generation"
    SINGLE_FILE_WEB_APP = "single_file_web_app"
    MULTI_FILE_WEB_APP = "multi_file_web_app"
    CODE_GENERATION = "code_generation"
    DATA_TRANSFORMATION = "data_transformation"
    CONFIGURATION = "configuration"


class Complexity(str, Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class SwarmArchetype(str, Enum):
    STRUCTURED_REPORT = "structured_report"
    SCHEDULED_STRUCTURED_REPORT = "scheduled_structured_report"
    DOCUMENT_GENERATION = "document_generation"
    SINGLE_FILE_WEB_APP = "single_file_web_app"
    MULTI_FILE_WEB_APP = "multi_file_web_app"
    CODE_GENERATION = "code_generation"
    DATA_TRANSFORMATION = "data_transformation"
    CONFIGURATION = "configuration"
    SOFTWARE_BUILD = "software_build"
    COMMUNICATION_ARTIFACT = "communication_artifact"
    MONITORING_WORKFLOW = "monitoring_workflow"
    DELIVERY_WORKFLOW = "delivery_workflow"


@dataclass
class SwarmArchetypeClassification:
    swarm_archetype: str
    complexity: str = "moderate"
    decomposition_required: bool = True
    confidence: float = 0.0
    reasoning: str = ""
    source: str = "rules"
    needs_clarification: bool = False


# Keyword sets for rule-based classification
_REPORT_WORDS = {"report", "analysis", "summary", "briefing", "digest", "overview", "findings"}
_SCHEDULE_WORDS = {"weekly", "daily", "monthly", "recurring", "scheduled", "every", "cron"}
_WEB_APP_WORDS = {"web app", "webpage", "website", "dashboard", "html", "frontend", "ui"}
_CODE_WORDS = {"script", "function", "module", "library", "cli", "tool", "utility", "program"}
_DATA_WORDS = {"transform", "convert", "etl", "pipeline", "migrate", "parse", "normalize"}
_CONFIG_WORDS = {"config", "configure", "setup", "install", "deploy", "provision", "settings"}
_BUILD_WORDS = {"build", "compile", "package", "release", "artifact", "bundle", "binary"}
_EMAIL_WORDS = {"email", "send", "notify", "deliver", "message", "alert", "notification"}
_MONITOR_WORDS = {"monitor", "watch", "check", "health", "status", "observe", "surveillance"}
_DOC_WORDS = {"document", "documentation", "readme", "guide", "manual", "specification"}


def classify_swarm_archetype(
    request_text: str,
    inference: Optional[InferenceProvider] = None,
) -> SwarmArchetypeClassification:
    """Classify intent text into a swarm archetype.

    If an inference provider is available, attempts LLM-based classification
    first and falls back to rule-based matching on failure.
    """
    if inference is not None:
        result = _llm_classify_swarm(request_text, inference)
        if result is not None:
            return result
    return _rule_based_classify_swarm(request_text)


_ARCHETYPE_DESCRIPTIONS = {
    "structured_report": "One-off report with sections, sources, and structured output",
    "scheduled_structured_report": "Recurring/scheduled report (daily, weekly, monthly)",
    "document_generation": "Documentation, READMEs, guides, manuals, specifications",
    "single_file_web_app": "Single-file web page, dashboard, or HTML application",
    "multi_file_web_app": "Multi-file web application with multiple components",
    "code_generation": "Scripts, functions, modules, CLI tools, libraries",
    "data_transformation": "ETL, data conversion, parsing, normalization pipelines",
    "configuration": "System configuration, setup, deployment, provisioning",
    "software_build": "Build, compile, package, release, bundle creation",
    "communication_artifact": "Email, notification, alert, message composition",
    "monitoring_workflow": "System monitoring, health checks, status observation",
    "delivery_workflow": "Content delivery, distribution, multi-channel dispatch",
}

_CLASSIFICATION_PROMPT = """Classify the following task description into exactly one swarm archetype.

Available archetypes:
{archetype_list}

Task description:
{intent_text}

Respond with ONLY a JSON object (no markdown, no explanation):
{{
  "swarm_archetype": "<archetype_id>",
  "complexity": "simple" | "moderate" | "complex",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation>"
}}"""


def _llm_classify_swarm(
    request_text: str,
    inference: InferenceProvider,
) -> Optional[SwarmArchetypeClassification]:
    """Attempt LLM-based archetype classification via ACDS."""
    from process_swarm.acds_client import CognitiveGrade, TaskType

    archetype_list = "\n".join(
        f"  - {k}: {v}" for k, v in _ARCHETYPE_DESCRIPTIONS.items()
    )
    prompt = _CLASSIFICATION_PROMPT.format(
        archetype_list=archetype_list,
        intent_text=request_text,
    )

    raw = inference.infer(
        prompt,
        task_type=TaskType.CLASSIFICATION.value,
        cognitive_grade=CognitiveGrade.STANDARD.value,
        process="definer",
        step="archetype_classification",
    )
    if raw is None:
        return None

    try:
        # Strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```\w*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to parse LLM classification response: %s", e)
        return None

    archetype = data.get("swarm_archetype", "")
    valid = {a.value for a in SwarmArchetype}
    if archetype not in valid:
        logger.warning("LLM returned unknown archetype: %s", archetype)
        return None

    complexity = data.get("complexity", "moderate")
    confidence = float(data.get("confidence", 0.85))

    return SwarmArchetypeClassification(
        swarm_archetype=archetype,
        complexity=complexity,
        decomposition_required=complexity != "simple",
        confidence=confidence,
        reasoning=data.get("reasoning", "LLM classification via ACDS"),
        source="acds",
        needs_clarification=confidence < 0.5,
    )


def _rule_based_classify_swarm(request_text: str) -> SwarmArchetypeClassification:
    lower = request_text.lower()

    def _score(words: set[str]) -> int:
        return sum(1 for w in words if w in lower)

    scores = {
        SwarmArchetype.STRUCTURED_REPORT: _score(_REPORT_WORDS),
        SwarmArchetype.SCHEDULED_STRUCTURED_REPORT: (
            _score(_REPORT_WORDS) + _score(_SCHEDULE_WORDS)
        ),
        SwarmArchetype.DOCUMENT_GENERATION: _score(_DOC_WORDS),
        SwarmArchetype.SINGLE_FILE_WEB_APP: _score(_WEB_APP_WORDS),
        SwarmArchetype.MULTI_FILE_WEB_APP: (
            _score(_WEB_APP_WORDS) + (1 if "multi" in lower or "multiple" in lower else 0)
        ),
        SwarmArchetype.CODE_GENERATION: _score(_CODE_WORDS),
        SwarmArchetype.DATA_TRANSFORMATION: _score(_DATA_WORDS),
        SwarmArchetype.CONFIGURATION: _score(_CONFIG_WORDS),
        SwarmArchetype.SOFTWARE_BUILD: _score(_BUILD_WORDS),
        SwarmArchetype.COMMUNICATION_ARTIFACT: _score(_EMAIL_WORDS),
        SwarmArchetype.MONITORING_WORKFLOW: _score(_MONITOR_WORDS),
        SwarmArchetype.DELIVERY_WORKFLOW: (
            _score(_EMAIL_WORDS) + (1 if "deliver" in lower else 0)
        ),
    }

    # Prefer scheduled_structured_report if schedule words present with report words
    if scores[SwarmArchetype.SCHEDULED_STRUCTURED_REPORT] > scores[SwarmArchetype.STRUCTURED_REPORT]:
        if _score(_SCHEDULE_WORDS) >= 1 and _score(_REPORT_WORDS) >= 1:
            scores[SwarmArchetype.STRUCTURED_REPORT] = 0

    best = max(scores, key=lambda k: scores[k])
    best_score = scores[best]

    if best_score == 0:
        return SwarmArchetypeClassification(
            swarm_archetype=SwarmArchetype.STRUCTURED_REPORT.value,
            complexity="moderate",
            confidence=0.1,
            reasoning="No keywords matched; defaulting to structured_report",
            source="rules",
            needs_clarification=True,
        )

    # Determine complexity
    word_count = len(request_text.split())
    complexity = "simple" if word_count < 20 else "complex" if word_count > 100 else "moderate"

    confidence = min(0.9, best_score * 0.3)

    return SwarmArchetypeClassification(
        swarm_archetype=best.value,
        complexity=complexity,
        decomposition_required=complexity != "simple",
        confidence=confidence,
        reasoning=f"Matched {best_score} keyword(s) for {best.value}",
        source="rules",
    )


def classify_swarm_archetype_override(archetype_name: str) -> SwarmArchetypeClassification:
    """Create a classification from a user-specified archetype override."""
    valid = {a.value for a in SwarmArchetype}
    if archetype_name not in valid:
        raise ValueError(f"Unknown archetype: {archetype_name}. Valid: {sorted(valid)}")
    return SwarmArchetypeClassification(
        swarm_archetype=archetype_name,
        complexity="moderate",
        decomposition_required=True,
        confidence=1.0,
        reasoning="User override",
        source="user_override",
    )
