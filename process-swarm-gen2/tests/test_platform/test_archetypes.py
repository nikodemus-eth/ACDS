"""Tests for archetype classification, templates, and archetype classifier."""

from __future__ import annotations

import pytest

from swarm.definer.archetype import (
    ArtifactType,
    Complexity,
    SwarmArchetype,
    SwarmArchetypeClassification,
    classify_swarm_archetype,
    classify_swarm_archetype_override,
)
from swarm.definer.archetype_classifier import (
    ARCHETYPES,
    classify_action_table,
    resolve_verb_to_capability_family,
)
from swarm.definer.templates import (
    ARCHETYPE_TEMPLATES,
    ArchetypeTemplate,
    TemplateAction,
    get_base_actions,
    get_default_dependencies,
    get_template,
    list_archetypes,
)


# ──────────────────────────────────────────────
# Archetype Enum & Classification
# ──────────────────────────────────────────────


class TestArchetypeEnums:
    def test_swarm_archetype_has_12_values(self):
        assert len(SwarmArchetype) == 12

    def test_artifact_type_has_values(self):
        assert len(ArtifactType) >= 6

    def test_complexity_has_three_levels(self):
        assert len(Complexity) == 3
        assert Complexity.SIMPLE.value == "simple"
        assert Complexity.MODERATE.value == "moderate"
        assert Complexity.COMPLEX.value == "complex"


class TestRuleBasedClassification:
    def test_structured_report_classification(self):
        result = classify_swarm_archetype(
            "Generate a detailed analysis report with findings"
        )
        assert isinstance(result, SwarmArchetypeClassification)
        assert result.swarm_archetype == "structured_report"

    def test_scheduled_report_classification(self):
        result = classify_swarm_archetype(
            "Every Monday, compile a weekly status report and email it to the team"
        )
        assert result.swarm_archetype == "scheduled_structured_report"

    def test_document_generation(self):
        result = classify_swarm_archetype(
            "Create a PDF document summarizing quarterly results"
        )
        assert result.swarm_archetype == "document_generation"

    def test_code_generation(self):
        result = classify_swarm_archetype(
            "Write a Python script that processes CSV files"
        )
        assert result.swarm_archetype == "code_generation"

    def test_data_transformation(self):
        result = classify_swarm_archetype(
            "Transform and normalize the JSON data into CSV format"
        )
        assert result.swarm_archetype == "data_transformation"

    def test_delivery_workflow(self):
        result = classify_swarm_archetype(
            "Deliver the notification and send the alert email"
        )
        assert result.swarm_archetype == "delivery_workflow"

    def test_monitoring_workflow(self):
        result = classify_swarm_archetype(
            "Monitor the API health and check status"
        )
        assert result.swarm_archetype == "monitoring_workflow"

    def test_override_classification(self):
        result = classify_swarm_archetype_override("code_generation")
        assert result.swarm_archetype == "code_generation"
        assert result.confidence == 1.0
        assert result.source == "user_override"

    def test_classification_has_reasoning(self):
        result = classify_swarm_archetype("Build a dashboard")
        assert result.reasoning
        assert len(result.reasoning) > 0

    def test_low_confidence_needs_clarification(self):
        result = classify_swarm_archetype("do something with data")
        assert result.confidence < 1.0


# ──────────────────────────────────────────────
# Templates
# ──────────────────────────────────────────────


class TestTemplates:
    def test_all_archetypes_have_templates(self):
        for archetype in SwarmArchetype:
            template = get_template(archetype.value)
            assert isinstance(template, ArchetypeTemplate)

    def test_list_archetypes_returns_all(self):
        archetypes = list_archetypes()
        assert len(archetypes) == 12

    def test_template_has_base_actions(self):
        template = get_template("structured_report")
        assert len(template.base_actions) > 0
        for action in template.base_actions:
            assert isinstance(action, TemplateAction)
            assert action.name
            assert action.action_type

    def test_scheduled_report_has_most_actions(self):
        template = get_template("scheduled_structured_report")
        assert len(template.base_actions) >= 12

    def test_get_base_actions_helper(self):
        actions = get_base_actions("document_generation")
        assert len(actions) > 0

    def test_get_default_dependencies_returns_list(self):
        deps = get_default_dependencies("structured_report")
        assert isinstance(deps, list)

    def test_template_actions_are_frozen(self):
        template = get_template("code_generation")
        action = template.base_actions[0]
        with pytest.raises(AttributeError):
            action.name = "modified"  # type: ignore[misc]

    def test_unknown_template_raises(self):
        with pytest.raises(KeyError):
            get_template("nonexistent_archetype")


# ──────────────────────────────────────────────
# Action Table Classifier
# ──────────────────────────────────────────────


class TestActionTableClassifier:
    def test_reporting_pipeline_classification(self):
        actions = [
            {"verb": "collect", "object": "data sources", "dependencies": []},
            {"verb": "validate", "object": "sources", "dependencies": [1]},
            {"verb": "synthesize", "object": "report", "dependencies": [2]},
            {"verb": "deliver", "object": "report to team", "dependencies": [3]},
        ]
        result = classify_action_table(actions)
        assert result["archetype_id"] == "scheduled_reporting_pipeline"
        assert result["confidence"] > 0.5

    def test_notification_pipeline_classification(self):
        actions = [
            {"verb": "send", "object": "notification", "dependencies": []},
            {"verb": "deliver", "object": "email", "dependencies": [1]},
        ]
        result = classify_action_table(actions)
        assert result["archetype_id"] == "notification_pipeline"

    def test_custom_archetype_for_unknown_actions(self):
        actions = [
            {"verb": "zork", "object": "blarg", "dependencies": []},
        ]
        result = classify_action_table(actions)
        assert result["classification_state"] == "custom"

    def test_schedule_hint_boosts_score(self):
        actions = [
            {"verb": "collect", "object": "data", "source_text": "Run daily at 9am", "dependencies": []},
            {"verb": "generate", "object": "report", "dependencies": [1]},
            {"verb": "send", "object": "report", "dependencies": [2]},
        ]
        result = classify_action_table(actions)
        assert result["confidence"] > 0.0

    def test_resolve_verb_to_capability_family(self):
        assert resolve_verb_to_capability_family("collect") == "data_query"
        assert resolve_verb_to_capability_family("send") == "notification_delivery"
        assert resolve_verb_to_capability_family("generate") == "report_generation"
        assert resolve_verb_to_capability_family("create") == "file_generation"
        assert resolve_verb_to_capability_family("unknown_verb") is None

    def test_result_has_matched_capabilities(self):
        actions = [
            {"verb": "collect", "object": "data", "dependencies": []},
            {"verb": "format", "object": "report", "dependencies": [1]},
        ]
        result = classify_action_table(actions)
        assert "matched_capabilities" in result
        assert isinstance(result["matched_capabilities"], list)

    def test_result_has_dependency_structure(self):
        actions = [
            {"verb": "collect", "object": "data", "dependencies": []},
        ]
        result = classify_action_table(actions)
        assert result["dependency_structure"] in ("linear", "branching")
