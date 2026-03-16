from __future__ import annotations

import json
import pathlib

import pytest

from process_swarm.scripts.classify_intent import classify_intent

_CLASSES_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "process_swarm" / "classes" / "job_classes.json"
)


@pytest.fixture()
def classes() -> list[dict]:
    with open(_CLASSES_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_briefing_class_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Create a weekly intelligence briefing")
    assert result["selected_class_id"] == "briefing_document"
    assert result["score"] > 0
    assert result["fallback_used"] is False


def test_document_plus_tts_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Generate a narrated audio document with tts")
    assert result["selected_class_id"] == "document_plus_tts"


def test_grits_integrity_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Run a grits integrity diagnostic")
    assert result["selected_class_id"] == "grits_integrity_report"


def test_research_brief_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Research the latest findings on quantum computing")
    assert result["selected_class_id"] == "research_brief"


def test_news_intake_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Curate the latest news headlines")
    assert result["selected_class_id"] == "news_intake"


def test_monitoring_diagnostic_selected(classes: list[dict]) -> None:
    result = classify_intent(classes, "Run a health check to monitor system status")
    assert result["selected_class_id"] == "monitoring_diagnostic"


def test_multi_word_phrase_scores_two(classes: list[dict]) -> None:
    result = classify_intent(classes, "Give me the weekly report")
    assert result["selected_class_id"] == "briefing_document"
    assert "weekly report" in result["matched_keywords"]
    # Multi-word phrase contributes +2
    assert result["score"] >= 2


def test_fallback_to_generic(classes: list[dict]) -> None:
    result = classify_intent(classes, "Do something completely unrelated xyz123")
    assert result["selected_class_id"] == "generic_job"
    assert result["score"] == 0
    assert result["fallback_used"] is True


def test_case_insensitive(classes: list[dict]) -> None:
    result = classify_intent(classes, "BRIEFING INTELLIGENCE SUMMARY")
    assert result["selected_class_id"] == "briefing_document"
    assert result["score"] >= 3
