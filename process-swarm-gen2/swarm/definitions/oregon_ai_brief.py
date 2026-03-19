"""Oregon AI Governance Intelligence Brief — Swarm Definition.

A 20-step governed intelligence pipeline producing a daily 700-word brief
monitoring AI governance activity across Oregon state, county, and municipal
governments.

Two swarm variants are registered:

    Text-only (20 steps):
        Source collection (4 passes) -> validation -> normalization ->
        bundling -> section mapping (Ollama) -> synthesis briefs (Ollama) ->
        section synthesis x4 (Apple Intelligence) -> assembly -> validation ->
        decision -> delivery -> artifact registration

    Audio variant (23 steps):
        All text-only steps, then TTS pipeline (resolve -> extract ->
        normalize -> chunk -> render -> assemble -> validate -> register)
        plus JSON intelligence extraction (Ollama).

This module provides the behavior sequence steps and registration
functions to install both swarm variants into a SwarmRepository.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

# ── Inference Maps ──

INFERENCE_MAP = {
    "section_mapping": "ollama",
    "synthesis_briefs": "ollama",
    "section_synthesis": "apple_intelligence",
    "json_extraction": "ollama",
}

AUDIO_INFERENCE_MAP = {
    **INFERENCE_MAP,
    "tts_render": "apple_intelligence",
}

# ── Pipeline Steps (text-only, 20 steps) ──

OREGON_BRIEF_STEPS = [
    {"step_id": "initialize_run", "tool_name": "run_manager", "description": "Create run identity, establish 7-day reporting window, set up workspace directories.", "operation_type": "invoke_capability"},
    {"step_id": "load_policy", "tool_name": "policy_loader", "description": "Load the weekly AI operational intelligence policy: 10 section definitions, source requirements (min 6 sources), freshness window (7 days), word count policy (700-900).", "operation_type": "invoke_capability"},
    {"step_id": "collect_sources_1", "tool_name": "source_collector", "description": "Collect 10-20 candidate items from configured endpoints: Microsoft AI Blog, GitHub Changelog, Azure AI Updates, Google AI Blog, Anthropic Research, OpenAI Blog, Hugging Face Blog, arXiv AI, NIST AI, EU AI Act Updates.", "operation_type": "invoke_capability"},
    {"step_id": "collect_sources_2", "tool_name": "source_collector", "description": "Collect additional sources for municipal and governance sections.", "operation_type": "invoke_capability"},
    {"step_id": "collect_sources_3", "tool_name": "source_collector", "description": "Collect regulatory and operational sources.", "operation_type": "invoke_capability"},
    {"step_id": "collect_sources_4", "tool_name": "source_collector", "description": "Collect remaining policy sources.", "operation_type": "invoke_capability"},
    {"step_id": "validate_sources", "tool_name": "url_validator", "description": "Validate all candidate sources: check URL resolves, publication date present, source belongs to allowed categories.", "operation_type": "invoke_capability"},
    {"step_id": "normalize_sources", "tool_name": "source_normalizer", "description": "Convert retained sources to canonical format with fields: organization, title, publication, publication_date, url, category_id, symbolic_id.", "operation_type": "invoke_capability"},
    {"step_id": "bundle_sources", "tool_name": "bundle_builder", "description": "Assemble the final bounded evidence set. Record retained and discarded counts. Apply freshness filtering. Assign symbolic_id tokens.", "operation_type": "invoke_capability"},
    {"step_id": "map_sections", "tool_name": "section_mapper", "engine": "ollama", "parameters": {"model": "qwen3:8b"}, "description": "Assign validated sources to the 10 report sections based on category_id and neutrality rules.", "operation_type": "invoke_capability"},
    {"step_id": "build_synthesis_briefs", "tool_name": "synthesis_brief_builder", "engine": "ollama", "parameters": {"model": "qwen3:8b"}, "description": "Create per-section synthesis prompts with section title, synthesis instructions, style, word count constraints, assigned sources.", "operation_type": "invoke_capability"},
    {"step_id": "synthesize_section_1", "tool_name": "probabilistic_synthesis", "engine": "apple_intelligence", "parameters": {"model": "apple-fm-on-device"}, "description": "Generate report section via governed LLM synthesis using assigned sources and symbolic citation tokens.", "operation_type": "invoke_capability"},
    {"step_id": "synthesize_section_2", "tool_name": "probabilistic_synthesis", "engine": "apple_intelligence", "parameters": {"model": "apple-fm-on-device"}, "description": "Generate report section via governed LLM synthesis.", "operation_type": "invoke_capability"},
    {"step_id": "synthesize_section_3", "tool_name": "probabilistic_synthesis", "engine": "apple_intelligence", "parameters": {"model": "apple-fm-on-device"}, "description": "Generate report section via governed LLM synthesis.", "operation_type": "invoke_capability"},
    {"step_id": "synthesize_section_4", "tool_name": "probabilistic_synthesis", "engine": "apple_intelligence", "parameters": {"model": "apple-fm-on-device"}, "description": "Generate report section via governed LLM synthesis.", "operation_type": "invoke_capability"},
    {"step_id": "assemble_output", "tool_name": "report_formatter", "description": "Combine all section drafts into the final report. Apply section ordering, generate subject line, compile source list. Produce report.md and report.html.", "operation_type": "invoke_capability"},
    {"step_id": "validate_output", "tool_name": "citation_validator", "description": "Validate final output: all citations use valid symbolic tokens, total word count between 700-900, all sections present.", "operation_type": "invoke_capability"},
    {"step_id": "decide_delivery", "tool_name": "decision_engine", "description": "Evaluate all validation results. If any check failed, emit fallback message and stop. If all passed, mark report as deliverable.", "operation_type": "invoke_capability"},
    {"step_id": "deliver", "tool_name": "delivery_engine", "description": "Deliver the completed written report via configured email channel. Record delivery receipt.", "operation_type": "invoke_capability"},
    {"step_id": "record_artifacts", "tool_name": "bundle_builder", "description": "Register generated artifacts with full lineage tracking.", "operation_type": "invoke_capability"},
]

# ── Audio Extra Steps (appended after text-only steps) ──

AUDIO_EXTRA_STEPS = [
    {"step_id": "tts_resolve_artifact", "tool_name": "tts_artifact_resolver", "description": "Locate the written report produced in the assembly step. This is the source text for TTS narration.", "operation_type": "invoke_capability"},
    {"step_id": "tts_extract_text", "tool_name": "tts_text_extractor", "description": "Extract the full report body, stripping tables, URLs, citation tokens, and other non-narratable elements.", "operation_type": "invoke_capability"},
    {"step_id": "tts_normalize_text", "tool_name": "tts_text_normalizer", "description": "Normalize for TTS: expand abbreviations (AI -> A.I., LLM -> L.L.M.), normalize numbers and punctuation, add breath markers.", "operation_type": "invoke_capability"},
    {"step_id": "tts_chunk", "tool_name": "tts_chunker", "description": "Split normalized text into bounded chunks of max 1200 characters at paragraph then sentence boundaries.", "operation_type": "invoke_capability"},
    {"step_id": "tts_render", "tool_name": "tts_renderer", "engine": "apple_intelligence", "parameters": {"model": "apple-fm-on-device"}, "description": "Render each text chunk into audio using the local TTS engine with briefing_voice profile.", "operation_type": "invoke_capability"},
    {"step_id": "tts_assemble", "tool_name": "tts_assembler", "description": "Concatenate all rendered audio chunks into narration_final.aiff.", "operation_type": "invoke_capability"},
    {"step_id": "tts_validate", "tool_name": "tts_audio_validator", "description": "Validate final audio: file exists, non-zero size, positive duration, hash recorded.", "operation_type": "invoke_capability"},
    {"step_id": "tts_register", "tool_name": "tts_artifact_registrar", "description": "Emit TTS result artifact: source reference, audio path, duration, chunk count, validation status, hash.", "operation_type": "invoke_capability"},
    {"step_id": "extract_intelligence", "tool_name": "json_intelligence_extractor", "engine": "ollama", "parameters": {"model": "qwen3:8b"}, "description": "Extract topics, entities, citations, and trend signals from synthesized report into intelligence.json.", "operation_type": "invoke_capability"},
]

# ── Combined Audio Steps ──

OREGON_BRIEF_AUDIO_STEPS = OREGON_BRIEF_STEPS + AUDIO_EXTRA_STEPS

# ── Engine-Model Lookup ──

_ENGINE_MODELS = {
    "ollama": "qwen3:8b",
    "apple_intelligence": "apple-fm-on-device",
}

# ── Shared Action Registration ──


def _register_pipeline_actions(repo: Any, swarm_id: str, steps: list[dict]) -> None:
    """Create swarm_actions with inference engine/model assignments."""
    # Don't duplicate if actions already exist
    existing = repo.list_actions(swarm_id)
    if existing:
        return
    for i, step in enumerate(steps):
        engine = step.get("engine")
        model = step.get("parameters", {}).get("model") or _ENGINE_MODELS.get(engine)
        repo.create_action(
            swarm_id=swarm_id,
            step_order=i + 1,
            action_name=step.get("tool_name", step.get("step_id", f"step_{i}")),
            action_text=step.get("description", ""),
            action_type=step.get("tool_name"),
            operation_type=step.get("operation_type", "invoke_capability"),
            inference_engine=engine,
            inference_model=model,
            fallback_engine=step.get("fallback_engine"),
            action_status="approved",
        )


# ── Text-Only Registration ──


def register_oregon_ai_brief_swarm(repo: Any) -> dict:
    """Register the Oregon AI Governance Intelligence Brief (text-only).

    Creates the swarm, behavior sequence, and enables it.
    Returns the swarm record dict.
    """
    description = (
        "Daily 700-word intelligence brief monitoring AI governance activity "
        "across Oregon state, county, and municipal governments."
    )

    swarm_id = repo.create_swarm(
        swarm_name="Oregon AI Governance Intelligence Brief",
        description=description,
        created_by="system",
    )

    repo.update_swarm(swarm_id, lifecycle_status="enabled")

    bs_id = repo.create_behavior_sequence(
        swarm_id=swarm_id,
        name="oregon_ai_brief_pipeline",
        ordered_steps=OREGON_BRIEF_STEPS,
        target_paths=["workspace/", "output/"],
        acceptance_tests=[
            {"test": "report file exists in output/", "type": "file_exists"},
            {"test": "word count between 700-900", "type": "assertion"},
            {"test": "all citations use valid symbolic tokens", "type": "assertion"},
        ],
        execution_class="adapter_only",
    )

    _register_pipeline_actions(repo, swarm_id, OREGON_BRIEF_STEPS)

    return {
        "swarm_id": swarm_id,
        "name": "Oregon AI Governance Intelligence Brief",
        "behavior_sequence_id": bs_id,
        "step_count": len(OREGON_BRIEF_STEPS),
        "inference_map": INFERENCE_MAP,
    }


# ── Audio Variant Registration ──


def register_oregon_ai_brief_audio_swarm(repo: Any) -> dict:
    """Register the Oregon AI Governance Intelligence Brief + Audio variant.

    Includes all text-only steps plus TTS pipeline and JSON extraction.
    Creates the swarm, behavior sequence, and enables it.
    Returns the swarm record dict.
    """
    description = (
        "Daily 700-word intelligence brief monitoring AI governance activity "
        "across Oregon state, county, and municipal governments. "
        "Includes TTS audio narration pipeline and structured JSON intelligence extraction."
    )

    swarm_id = repo.create_swarm(
        swarm_name="Oregon AI Governance Intelligence Brief + Audio",
        description=description,
        created_by="system",
    )

    repo.update_swarm(swarm_id, lifecycle_status="enabled")

    bs_id = repo.create_behavior_sequence(
        swarm_id=swarm_id,
        name="oregon_ai_brief_audio_pipeline",
        ordered_steps=OREGON_BRIEF_AUDIO_STEPS,
        target_paths=["workspace/", "output/", "output/audio/"],
        acceptance_tests=[
            {"test": "report file exists in output/", "type": "file_exists"},
            {"test": "word count between 700-900", "type": "assertion"},
            {"test": "all citations use valid symbolic tokens", "type": "assertion"},
            {"test": "narration_final.aiff exists in output/audio/", "type": "file_exists"},
            {"test": "intelligence.json exists in output/", "type": "file_exists"},
        ],
        execution_class="adapter_only",
    )

    _register_pipeline_actions(repo, swarm_id, OREGON_BRIEF_AUDIO_STEPS)

    return {
        "swarm_id": swarm_id,
        "name": "Oregon AI Governance Intelligence Brief + Audio",
        "behavior_sequence_id": bs_id,
        "step_count": len(OREGON_BRIEF_AUDIO_STEPS),
        "inference_map": AUDIO_INFERENCE_MAP,
    }


# ── Idempotent Finders ──


def find_or_register(repo: Any) -> str:
    """Find existing Oregon AI Brief swarm or register a new one.

    Returns the swarm_id.
    """
    swarms = repo.list_swarms()
    for swarm in swarms:
        if isinstance(swarm, dict):
            name = swarm.get("swarm_name") or swarm.get("name", "")
            if name == "Oregon AI Governance Intelligence Brief":
                swarm_id = swarm["swarm_id"]
                _register_pipeline_actions(repo, swarm_id, OREGON_BRIEF_STEPS)
                return swarm_id

    result = register_oregon_ai_brief_swarm(repo)
    return result["swarm_id"]


def find_or_register_audio(repo: Any) -> str:
    """Find existing Oregon AI Brief + Audio swarm or register a new one.

    Returns the swarm_id.
    """
    swarms = repo.list_swarms()
    for swarm in swarms:
        if isinstance(swarm, dict):
            name = swarm.get("swarm_name") or swarm.get("name", "")
            if name == "Oregon AI Governance Intelligence Brief + Audio":
                swarm_id = swarm["swarm_id"]
                _register_pipeline_actions(repo, swarm_id, OREGON_BRIEF_AUDIO_STEPS)
                return swarm_id

    result = register_oregon_ai_brief_audio_swarm(repo)
    return result["swarm_id"]
