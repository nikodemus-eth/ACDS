"""Tests for constraint extraction and validation."""

from __future__ import annotations

import json
import pytest

from swarm.definer.constraints import (
    ConstraintSet,
    constraint_set_from_dict,
    constraint_set_to_dict,
    extract_constraints,
    validate_constraints,
)
from swarm.definer.constraint_extractor import extract_constraint_set_for_action_table
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


# ──────────────────────────────────────────────
# Constraint Extraction
# ──────────────────────────────────────────────


class TestConstraintExtraction:
    def test_extracts_sections(self):
        text = (
            "Generate a report with sections: Executive Summary, "
            "Market Analysis, Recommendations"
        )
        cs = extract_constraints(text, "structured_report")
        assert len(cs.sections) >= 2

    def test_extracts_word_count_range(self):
        text = "Write a 1000 to 2000 word report about AI trends"
        cs = extract_constraints(text, "structured_report")
        assert cs.min_word_count == 1000
        assert cs.max_word_count == 2000

    def test_extracts_required_sources_count(self):
        text = "Use 5 sources for the report"
        cs = extract_constraints(text, "structured_report")
        assert cs.required_sources == 5

    def test_extracts_delivery_channel(self):
        text = "Email the report to the team"
        cs = extract_constraints(text, "delivery_workflow")
        assert cs.delivery_channel == "email"

    def test_extracts_output_format(self):
        text = "Generate the report in markdown format"
        cs = extract_constraints(text, "structured_report")
        assert cs.output_format == "markdown"

    def test_extracts_schedule_hint(self):
        text = "Run this weekly"
        cs = extract_constraints(text, "scheduled_structured_report")
        assert cs.schedule_hint == "weekly"

    def test_empty_text_returns_default_constraints(self):
        cs = extract_constraints("", "structured_report")
        assert cs.sections == []
        assert cs.min_word_count is None

    def test_freshness_extraction(self):
        text = "Only use sources from the last 7 days"
        cs = extract_constraints(text, "structured_report")
        assert cs.freshness_window_days == 7

    def test_freshness_weeks_converted(self):
        text = "Use data from the past 2 weeks"
        cs = extract_constraints(text, "structured_report")
        assert cs.freshness_window_days == 14

    def test_default_sources_for_report_archetype(self):
        cs = extract_constraints("Generate a report", "structured_report")
        assert cs.required_sources == 3

    def test_default_output_format_for_report(self):
        cs = extract_constraints("Generate a report", "structured_report")
        assert cs.output_format == "html"

    def test_telegram_delivery_channel(self):
        text = "Send via telegram"
        cs = extract_constraints(text, "delivery_workflow")
        assert cs.delivery_channel == "telegram"


# ──────────────────────────────────────────────
# Constraint Validation
# ──────────────────────────────────────────────


class TestConstraintValidation:
    def test_valid_constraints_return_no_warnings(self):
        cs = ConstraintSet(
            sections=["Intro", "Body", "Conclusion"],
            min_word_count=1000,
            output_format="markdown",
        )
        warnings = validate_constraints(cs)
        assert isinstance(warnings, list)
        assert len(warnings) == 0

    def test_min_exceeds_max_warns(self):
        cs = ConstraintSet(min_word_count=2000, max_word_count=1000)
        warnings = validate_constraints(cs)
        assert any("min_word_count" in w for w in warnings)

    def test_negative_sources_warns(self):
        cs = ConstraintSet(required_sources=-1)
        warnings = validate_constraints(cs)
        assert any("required_sources" in w for w in warnings)

    def test_negative_freshness_warns(self):
        cs = ConstraintSet(freshness_window_days=-5)
        warnings = validate_constraints(cs)
        assert any("freshness" in w for w in warnings)


# ──────────────────────────────────────────────
# Serialization
# ──────────────────────────────────────────────


class TestConstraintSerialization:
    def test_round_trip(self):
        cs = ConstraintSet(
            sections=["A", "B"],
            min_word_count=500,
            max_word_count=1500,
            required_sources=3,
            delivery_channel="email",
            output_format="pdf",
        )
        d = constraint_set_to_dict(cs)
        cs2 = constraint_set_from_dict(d)
        assert cs2.sections == cs.sections
        assert cs2.min_word_count == cs.min_word_count
        assert cs2.max_word_count == cs.max_word_count
        assert cs2.required_sources == cs.required_sources
        assert cs2.delivery_channel == cs.delivery_channel

    def test_to_dict_is_json_serializable(self):
        cs = ConstraintSet(sections=["A"])
        d = constraint_set_to_dict(cs)
        result = json.dumps(d)
        assert result

    def test_from_dict_handles_empty(self):
        cs = constraint_set_from_dict({})
        assert cs.sections == []
        assert cs.min_word_count is None
        assert cs.max_word_count is None


# ──────────────────────────────────────────────
# Constraint Extractor (Repository Integration)
# ──────────────────────────────────────────────


class TestConstraintExtractor:
    @pytest.fixture
    def repo(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        db.migrate()
        return SwarmRepository(db)

    def test_extract_and_persist_constraint_set(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="test-swarm",
            description="test",
            created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a 1000 to 1500 word report with sections: Intro, Body",
            created_by="tester",
        )
        restatement_id = repo.create_restatement(
            draft_id=draft_id,
            summary="Generate report",
            structured_steps=[{"op": "create"}],
            extracted_actions=[{"step": 1, "verb": "generate", "object": "report"}],
            dependency_graph={},
            unresolved_issues=[],
        )
        acceptance_id = repo.accept_intent(
            restatement_id=restatement_id,
            accepted_by="tester",
            accepted_actions=[{"step": 1, "verb": "generate", "object": "report"}],
        )
        action_table_id = repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[{"step": 1, "verb": "generate", "object": "report"}],
            status="draft",
        )

        cs_id = extract_constraint_set_for_action_table(
            repo=repo,
            swarm_id=swarm_id,
            action_table_ref=action_table_id,
            intent_text="Generate a 1000 to 1500 word report with sections: Intro, Body",
            archetype_name="structured_report",
        )

        record = repo.get_constraint_set(cs_id)
        assert record is not None
        constraints = json.loads(record["constraints_json"])
        assert constraints["min_word_count"] == 1000
        assert len(constraints["sections"]) >= 1

    def test_raises_without_draft(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="test-swarm",
            description="test",
            created_by="tester",
        )
        with pytest.raises(ValueError, match="No intent draft"):
            extract_constraint_set_for_action_table(
                repo=repo,
                swarm_id=swarm_id,
                action_table_ref="fake-ref",
                intent_text="some text",
            )
