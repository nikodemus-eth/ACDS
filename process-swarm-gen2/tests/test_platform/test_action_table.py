"""Tests for ActionTable construction, validation, lifecycle, and serialization."""

from __future__ import annotations

import pytest

from swarm.definer.action_table import (
    ActionEntry,
    ActionTable,
    ValidationResult,
    action_table_from_dict,
    action_table_to_dict,
    build_action_table,
    mark_accepted,
    mark_compiled,
    mark_validated,
    validate_action_table,
)
from swarm.definer.action_extraction import (
    extract_action_tuples,
    action_summary_from_tuples,
)


# ──────────────────────────────────────────────
# Construction
# ──────────────────────────────────────────────


class TestBuildActionTable:
    def test_builds_from_raw_dicts(self):
        table = build_action_table("intent-123", [
            {"step": 1, "verb": "collect", "object": "data sources"},
            {"step": 2, "verb": "validate", "object": "sources", "dependencies": [1]},
            {"step": 3, "verb": "generate", "object": "report", "dependencies": [2]},
        ])
        assert table.intent_ref == "intent-123"
        assert len(table.actions) == 3
        assert table.lifecycle_state == "draft"
        assert table.created_at is not None

    def test_action_entry_fields(self):
        table = build_action_table("ref-1", [
            {
                "step": 1,
                "verb": "send",
                "object": "email",
                "destination": "user@example.com",
                "qualifiers": {"priority": "high"},
                "conditions": ["report ready"],
                "source_text": "send the email to the user",
            },
        ])
        action = table.actions[0]
        assert action.verb == "send"
        assert action.object == "email"
        assert action.destination == "user@example.com"
        assert action.qualifiers == {"priority": "high"}
        assert action.conditions == ["report ready"]

    def test_empty_actions_list(self):
        table = build_action_table("ref-empty", [])
        assert len(table.actions) == 0


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────


class TestValidation:
    def test_valid_table(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "collect", "object": "data"},
            {"step": 2, "verb": "send", "object": "report", "dependencies": [1]},
        ])
        result = validate_action_table(table)
        assert result.valid is True
        assert result.errors == []

    def test_empty_table_invalid(self):
        table = build_action_table("ref-1", [])
        result = validate_action_table(table)
        assert result.valid is False
        assert any("at least one" in e for e in result.errors)

    def test_missing_verb(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[ActionEntry(step=1, verb="", object="data")],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("verb is empty" in e for e in result.errors)

    def test_missing_object(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[ActionEntry(step=1, verb="collect", object="")],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("object is empty" in e for e in result.errors)

    def test_non_sequential_steps(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[
                ActionEntry(step=1, verb="collect", object="data"),
                ActionEntry(step=3, verb="send", object="report"),
            ],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("sequential" in e for e in result.errors)

    def test_dependency_on_nonexistent_step(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[
                ActionEntry(step=1, verb="collect", object="data", dependencies=[5]),
            ],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("non-existent" in e for e in result.errors)

    def test_forward_dependency_rejected(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[
                ActionEntry(step=1, verb="collect", object="data", dependencies=[2]),
                ActionEntry(step=2, verb="send", object="report"),
            ],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("earlier step" in e for e in result.errors)

    def test_circular_dependency_detected(self):
        table = ActionTable(
            intent_ref="ref-1",
            actions=[
                ActionEntry(step=1, verb="collect", object="a", dependencies=[2]),
                ActionEntry(step=2, verb="send", object="b", dependencies=[1]),
            ],
        )
        result = validate_action_table(table)
        assert result.valid is False
        assert any("Circular" in e or "earlier step" in e for e in result.errors)

    def test_ambiguous_verb_warning(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "process", "object": "data"},
        ])
        result = validate_action_table(table)
        assert result.valid is True
        assert any("ambiguous" in w for w in result.warnings)


# ──────────────────────────────────────────────
# Lifecycle Transitions
# ──────────────────────────────────────────────


class TestLifecycle:
    def _valid_table(self):
        return build_action_table("ref-1", [
            {"step": 1, "verb": "collect", "object": "data"},
            {"step": 2, "verb": "send", "object": "report", "dependencies": [1]},
        ])

    def test_draft_to_validated(self):
        table = self._valid_table()
        result = mark_validated(table)
        assert result.lifecycle_state == "validated"
        assert result.validated_at is not None

    def test_validated_to_accepted(self):
        table = self._valid_table()
        mark_validated(table)
        result = mark_accepted(table)
        assert result.lifecycle_state == "accepted"
        assert result.accepted_at is not None

    def test_accepted_to_compiled(self):
        table = self._valid_table()
        mark_validated(table)
        mark_accepted(table)
        result = mark_compiled(table)
        assert result.lifecycle_state == "compiled"
        assert result.compiled_at is not None

    def test_cannot_validate_non_draft(self):
        table = self._valid_table()
        mark_validated(table)
        with pytest.raises(ValueError, match="expected 'draft'"):
            mark_validated(table)

    def test_cannot_accept_non_validated(self):
        table = self._valid_table()
        with pytest.raises(ValueError, match="expected 'validated'"):
            mark_accepted(table)

    def test_cannot_compile_non_accepted(self):
        table = self._valid_table()
        with pytest.raises(ValueError, match="expected 'accepted'"):
            mark_compiled(table)

    def test_validate_rejects_invalid_table(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "", "object": "data"},
        ])
        with pytest.raises(ValueError, match="Validation failed"):
            mark_validated(table)


# ──────────────────────────────────────────────
# Serialization
# ──────────────────────────────────────────────


class TestSerialization:
    def test_round_trip(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "collect", "object": "data"},
            {"step": 2, "verb": "send", "object": "report", "dependencies": [1]},
        ])
        d = action_table_to_dict(table)
        restored = action_table_from_dict(d)
        assert restored.intent_ref == "ref-1"
        assert len(restored.actions) == 2
        assert restored.actions[0].verb == "collect"
        assert restored.actions[1].dependencies == [1]

    def test_dict_has_artifact_type(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "collect", "object": "data"},
        ])
        d = action_table_to_dict(table)
        assert d["artifact_type"] == "action_table"

    def test_lifecycle_timestamps_included_when_set(self):
        table = build_action_table("ref-1", [
            {"step": 1, "verb": "collect", "object": "data"},
        ])
        mark_validated(table)
        d = action_table_to_dict(table)
        assert "validated_at" in d
        assert "accepted_at" not in d

    def test_from_dict_defaults(self):
        table = action_table_from_dict({
            "intent_ref": "ref-1",
            "actions": [{"step": 1, "verb": "run", "object": "test"}],
        })
        assert table.lifecycle_state == "draft"
        assert table.created_at is None


# ──────────────────────────────────────────────
# Action Extraction
# ──────────────────────────────────────────────


class TestActionExtraction:
    def test_basic_extraction(self):
        result = extract_action_tuples("collect data, then send report")
        assert result["can_proceed"] is True
        assert len(result["actions"]) >= 2

    def test_ambiguous_verb_flagged(self):
        result = extract_action_tuples("process the data then send it")
        issues = result["unresolved_issues"]
        assert any(i["issue_type"] == "ambiguous_verb" for i in issues)

    def test_missing_verb_flagged(self):
        result = extract_action_tuples("the report, then send it")
        issues = result["unresolved_issues"]
        # Should flag either missing_verb or unresolved_reference
        assert len(issues) > 0

    def test_unresolved_reference_flagged(self):
        result = extract_action_tuples("collect sources, then validate them")
        issues = result["unresolved_issues"]
        ref_issues = [i for i in issues if i["issue_type"] == "unresolved_reference"]
        assert len(ref_issues) > 0

    def test_dependency_graph(self):
        result = extract_action_tuples("collect data, then validate it")
        assert "dependency_graph" in result

    def test_action_summary(self):
        actions = [
            {"step": 1, "verb": "collect", "object": "data"},
            {"step": 2, "verb": "send", "object": "report"},
        ]
        summary = action_summary_from_tuples(actions)
        assert "collect" in summary
        assert "send" in summary
