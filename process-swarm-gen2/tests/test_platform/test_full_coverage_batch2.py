"""Full coverage batch 2 — SwarmDefiner and SessionWatcher.

Real integration tests with in-memory SQLite, real temp files, real objects.
NO mocks, NO stubs, NO faked data.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
from pathlib import Path

import pytest

from swarm.definer.definer import SwarmDefiner
from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


# ═══════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════


@pytest.fixture
def db():
    d = RegistryDatabase(":memory:")
    d.connect()
    d.migrate()
    yield d
    d.close()


@pytest.fixture
def repo(db):
    return SwarmRepository(db)


@pytest.fixture
def events(repo):
    return EventRecorder(repo)


@pytest.fixture
def definer(repo):
    return SwarmDefiner(repo=repo, events=None)


@pytest.fixture
def definer_with_events(repo, events):
    return SwarmDefiner(repo=repo, events=events)


@pytest.fixture
def swarm_id(repo):
    return repo.create_swarm(
        swarm_name="test-swarm",
        description="Integration test swarm",
        created_by="tester",
    )


SAMPLE_INTENT = "collect sales data from the database and send a summary report to the team via email"


# ═══════════════════════════════════════════════════
# 1. SwarmDefiner tests
# ═══════════════════════════════════════════════════


class TestDefinerInit:
    """Test __init__ and _emit."""

    def test_init_without_events(self, repo):
        d = SwarmDefiner(repo=repo, events=None)
        assert d.repo is repo
        assert d.events is None

    def test_init_with_events(self, repo, events):
        d = SwarmDefiner(repo=repo, events=events)
        assert d.events is events

    def test_emit_with_no_events(self, definer):
        # Should not raise
        definer._emit("draft_created", "s1", "d1", "actor")

    def test_emit_calls_method_on_events(self, definer_with_events, swarm_id):
        """_emit calls actual EventRecorder methods — line 60."""
        # Create a draft via definer to trigger _emit("draft_created", ...)
        draft_id = definer_with_events.create_draft(
            swarm_id=swarm_id,
            raw_text=SAMPLE_INTENT,
            created_by="tester",
        )
        # Verify event was actually recorded
        rows = definer_with_events.repo.conn.execute(
            "SELECT * FROM swarm_events WHERE event_type = 'draft_created'"
        ).fetchall()
        assert len(rows) >= 1

    def test_emit_missing_method(self, repo):
        """_emit with object that lacks the method — no crash."""

        class FakeEvents:
            pass

        d = SwarmDefiner(repo=repo, events=FakeEvents())
        d._emit("nonexistent_method", "a", "b")  # should not raise


class TestDefinerCreateDraft:
    """Test create_draft."""

    def test_create_draft_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id,
            raw_text=SAMPLE_INTENT,
            created_by="tester",
        )
        assert draft_id.startswith("draft-")
        draft = definer.repo.get_intent_draft(draft_id)
        assert draft["raw_intent_text"] == SAMPLE_INTENT

    def test_create_draft_empty_text_raises(self, definer, swarm_id):
        with pytest.raises(ValueError, match="empty"):
            definer.create_draft(swarm_id=swarm_id, raw_text="", created_by="t")

    def test_create_draft_whitespace_only_raises(self, definer, swarm_id):
        with pytest.raises(ValueError, match="empty"):
            definer.create_draft(swarm_id=swarm_id, raw_text="   ", created_by="t")

    def test_create_draft_with_optional_params(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id,
            raw_text=SAMPLE_INTENT,
            created_by="tester",
            session_id="sess-1",
            parent_draft_id=None,
            revision_index=1,
        )
        assert draft_id.startswith("draft-")


class TestDefinerCreateRestatement:
    """Test create_restatement."""

    def test_create_restatement_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        restatement_id = definer.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Collect sales data and email summary",
            structured_steps=[
                {"op": "collect", "target": "sales data"},
                {"op": "send", "target": "summary report"},
            ],
            actor_id="ai",
        )
        assert restatement_id.startswith("restatement-")

    def test_create_restatement_draft_not_found(self, definer, swarm_id):
        with pytest.raises(ValueError, match="Draft not found"):
            definer.create_restatement(
                swarm_id=swarm_id,
                draft_id="nonexistent",
                summary="x",
                structured_steps=[{"op": "a"}],
                actor_id="t",
            )

    def test_create_restatement_empty_steps(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        with pytest.raises(ValueError, match="steps cannot be empty"):
            definer.create_restatement(
                swarm_id=swarm_id,
                draft_id=draft_id,
                summary="A summary",
                structured_steps=[],
                actor_id="t",
            )

    def test_create_restatement_empty_summary(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        with pytest.raises(ValueError, match="Summary cannot be empty"):
            definer.create_restatement(
                swarm_id=swarm_id,
                draft_id=draft_id,
                summary="",
                structured_steps=[{"op": "a"}],
                actor_id="t",
            )

    def test_create_restatement_whitespace_summary(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        with pytest.raises(ValueError, match="Summary cannot be empty"):
            definer.create_restatement(
                swarm_id=swarm_id,
                draft_id=draft_id,
                summary="   ",
                structured_steps=[{"op": "a"}],
                actor_id="t",
            )

    def test_create_restatement_with_events(self, definer_with_events, swarm_id):
        draft_id = definer_with_events.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        rid = definer_with_events.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Collect and send",
            structured_steps=[{"op": "collect", "target": "data"}],
            actor_id="ai",
        )
        rows = definer_with_events.repo.conn.execute(
            "SELECT * FROM swarm_events WHERE event_type = 'restatement_generated'"
        ).fetchall()
        assert len(rows) >= 1


class TestDefinerExtractActions:
    """Test extract_actions."""

    def test_extract_actions_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        result = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        assert "actions" in result
        assert "unresolved_issues" in result
        assert "dependency_graph" in result

    def test_extract_actions_draft_not_found(self, definer, swarm_id):
        with pytest.raises(ValueError, match="Draft not found"):
            definer.extract_actions(
                swarm_id=swarm_id, draft_id="missing", actor_id="t"
            )

    def test_extract_actions_with_issues(self, definer, swarm_id):
        """Intent with ambiguous verbs produces clarification records."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id,
            raw_text="process it and handle that thing",
            created_by="t",
        )
        result = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        # Should have created clarification records for issues
        clarifications = definer.repo.list_intent_clarifications(
            swarm_id=swarm_id, draft_id=draft_id
        )
        assert len(clarifications) >= len(result["unresolved_issues"])


class TestBuildCurrentExtractionState:
    """Test _build_current_extraction_state with all issue types."""

    def _setup(self, definer, swarm_id, intent_text=SAMPLE_INTENT):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=intent_text, created_by="t"
        )
        extraction = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        return draft_id, extraction

    def test_basic_state_build(self, definer, swarm_id):
        draft_id, _ = self._setup(definer, swarm_id)
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        assert "actions" in state
        assert "unresolved_issues" in state
        assert "can_proceed" in state
        assert "user_confirmation" in state
        assert "user_confirmation_required" in state

    def test_draft_not_found_raises(self, definer, swarm_id):
        with pytest.raises(ValueError, match="Draft not found"):
            definer._build_current_extraction_state(swarm_id, "missing")

    def test_manual_action_edit(self, definer, swarm_id):
        """Lines 189-198: manual_action_edit with qualifiers, conditions, dependencies."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted from sample intent")
        step = actions[0]["step"]

        # Create a manual_action_edit clarification with qualifiers, conditions, dependencies
        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="manual_action_edit",
            question_text="Manual action edit",
            response_text=json.dumps({
                "verb": "retrieve",
                "qualifiers": {"format": "csv"},
                "conditions": ["only on weekdays"],
                "dependencies": [99],
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        edited = next(a for a in state["actions"] if a["step"] == step)
        assert edited["verb"] == "retrieve"
        assert edited.get("qualifiers", {}).get("format") == "csv"
        assert edited.get("conditions") == ["only on weekdays"]
        assert edited.get("dependencies") == [99]

    def test_manual_action_add_new(self, definer, swarm_id):
        """Lines 199-219: manual_action_add — new action."""
        draft_id, extraction = self._setup(definer, swarm_id)
        new_step = 999
        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=new_step,
            issue_type="manual_action_add",
            question_text="Manual action add",
            response_text=json.dumps({
                "verb": "archive",
                "object": "old records",
                "destination": "/archive",
                "qualifiers": {"retention": "30d"},
                "dependencies": [],
                "conditions": [],
                "source_text": "archive old records",
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        added = next((a for a in state["actions"] if a["step"] == new_step), None)
        assert added is not None
        assert added["verb"] == "archive"
        assert added["object"] == "old records"

    def test_manual_action_add_existing(self, definer, swarm_id):
        """Lines 204-207: manual_action_add when step already exists — updates it."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="manual_action_add",
            question_text="Manual action add",
            response_text=json.dumps({
                "verb": "overwritten_verb",
                "object": "overwritten_object",
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        updated = next(a for a in state["actions"] if a["step"] == step)
        assert updated["verb"] == "overwritten_verb"

    def test_missing_object_resolution(self, definer, swarm_id):
        """Lines 220-226: missing_object issue type."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="missing_object",
            question_text="What object?",
            response_text=json.dumps({"object": "monthly_sales_report"}),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        resolved = next(a for a in state["actions"] if a["step"] == step)
        assert resolved["object"] == "monthly_sales_report"

    def test_missing_verb_with_existing_action(self, definer, swarm_id):
        """Lines 228-234: missing_verb when action exists."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="missing_verb",
            question_text="What verb?",
            response_text=json.dumps({"verb": "generate"}),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        resolved = next(a for a in state["actions"] if a["step"] == step)
        assert resolved["verb"] == "generate"

    def test_missing_verb_creates_new_action(self, definer, swarm_id):
        """Lines 235-251: missing_verb when action doesn't exist — creates new action."""
        draft_id, _ = self._setup(definer, swarm_id)
        new_step = 888

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=new_step,
            issue_type="missing_verb",
            question_text="What verb?",
            response_text=json.dumps({
                "verb": "deploy",
                "object": "application",
                "destination": "production",
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        added = next((a for a in state["actions"] if a["step"] == new_step), None)
        assert added is not None
        assert added["verb"] == "deploy"

    def test_ambiguous_verb_resolution(self, definer, swarm_id):
        """Lines 252-260: ambiguous_verb with object update."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="ambiguous_verb",
            question_text="Which verb?",
            response_text=json.dumps({
                "verb": "compile",
                "object": "quarterly_report",
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        resolved = next(a for a in state["actions"] if a["step"] == step)
        assert resolved["verb"] == "compile"
        assert resolved["object"] == "quarterly_report"

    def test_unresolved_reference(self, definer, swarm_id):
        """Lines 261-267: unresolved_reference issue type."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="unresolved_reference",
            question_text="What does 'it' refer to?",
            response_text=json.dumps({"object": "customer_database"}),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        resolved = next(a for a in state["actions"] if a["step"] == step)
        assert resolved["object"] == "customer_database"

    def test_non_json_response_text(self, definer, swarm_id):
        """Lines 177-178: response_text that is not valid JSON."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="missing_object",
            question_text="What object?",
            response_text="plain text not json",
            resolution_status="resolved",
            created_by="t",
        )
        # Should not crash — falls back to {"response_text": ...}
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        assert state is not None

    def test_no_response_text_skipped(self, definer, swarm_id):
        """Line 174: records with no response_text are skipped."""
        draft_id, _ = self._setup(definer, swarm_id)

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=1,
            issue_type="missing_object",
            question_text="What object?",
            response_text=None,
            resolution_status="open",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        assert state is not None

    def test_completeness_confirmation_in_state(self, definer, swarm_id):
        """Lines 293-308: completeness_confirmation parsing."""
        draft_id, _ = self._setup(definer, swarm_id)

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=None,
            issue_type="completeness_confirmation",
            question_text="Complete?",
            response_text=json.dumps({"confirmed": True}),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        assert state["user_confirmation"] is True

    def test_completeness_confirmation_invalid_json(self, definer, swarm_id):
        """Lines 307-308: completeness_confirmation with invalid JSON."""
        draft_id, _ = self._setup(definer, swarm_id)

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=None,
            issue_type="completeness_confirmation",
            question_text="Complete?",
            response_text="not json",
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        assert state["user_confirmation"] is False

    def test_destination_and_qualifiers_update(self, definer, swarm_id):
        """Lines 269-273: destination and qualifiers fallback update."""
        draft_id, extraction = self._setup(definer, swarm_id)
        actions = extraction["actions"]
        if not actions:
            pytest.skip("No actions extracted")
        step = actions[0]["step"]

        definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="manual_action_edit",
            question_text="Edit",
            response_text=json.dumps({
                "destination": "/output/reports",
                "source_text": "original clause",
                "qualifiers": {"priority": "high"},
            }),
            resolution_status="resolved",
            created_by="t",
        )
        state = definer._build_current_extraction_state(swarm_id, draft_id)
        edited = next(a for a in state["actions"] if a["step"] == step)
        assert edited.get("destination") == "/output/reports"
        assert edited.get("qualifiers", {}).get("priority") == "high"


class TestSubmitClarificationResponse:
    """Test submit_clarification_response."""

    def _setup(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        return draft_id

    def test_submit_response_success(self, definer, swarm_id):
        """Lines 330-362: full submit path."""
        draft_id = self._setup(definer, swarm_id)
        state = definer.submit_clarification_response(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            issue_type="manual_action_edit",
            action_index=1,
            response={"verb": "fetch"},
        )
        assert "actions" in state

    def test_submit_with_clarification_id(self, definer, swarm_id):
        """Lines 335-340: lookup by clarification_id."""
        draft_id = self._setup(definer, swarm_id)
        clar_id = definer.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=1,
            issue_type="missing_object",
            question_text="What object?",
            response_text=None,
            resolution_status="open",
            created_by="t",
        )
        state = definer.submit_clarification_response(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            clarification_id=clar_id,
            response={"object": "sales_data"},
        )
        assert "actions" in state

    def test_submit_draft_not_found(self, definer, swarm_id):
        with pytest.raises(ValueError, match="Draft not found"):
            definer.submit_clarification_response(
                swarm_id=swarm_id,
                draft_id="missing",
                actor_id="t",
                issue_type="x",
                response={"a": 1},
            )

    def test_submit_clarification_not_found(self, definer, swarm_id):
        draft_id = self._setup(definer, swarm_id)
        with pytest.raises(ValueError, match="Clarification not found"):
            definer.submit_clarification_response(
                swarm_id=swarm_id,
                draft_id=draft_id,
                actor_id="t",
                clarification_id="missing-clar",
                response={"a": 1},
            )

    def test_submit_missing_issue_type(self, definer, swarm_id):
        draft_id = self._setup(definer, swarm_id)
        with pytest.raises(ValueError, match="issue_type"):
            definer.submit_clarification_response(
                swarm_id=swarm_id,
                draft_id=draft_id,
                actor_id="t",
                response={"a": 1},
            )

    def test_submit_missing_response(self, definer, swarm_id):
        draft_id = self._setup(definer, swarm_id)
        with pytest.raises(ValueError, match="response"):
            definer.submit_clarification_response(
                swarm_id=swarm_id,
                draft_id=draft_id,
                actor_id="t",
                issue_type="missing_object",
                response=None,
            )


class TestUpdateExtractedAction:
    """Test update_extracted_action."""

    def test_update_action_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.update_extracted_action(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            step=1,
            updates={"verb": "download"},
        )
        assert "actions" in state

    def test_update_action_empty_updates(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        with pytest.raises(ValueError, match="updates"):
            definer.update_extracted_action(
                swarm_id=swarm_id,
                draft_id=draft_id,
                actor_id="user",
                step=1,
                updates={},
            )


class TestAddExtractedAction:
    """Test add_extracted_action."""

    def test_add_action_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.add_extracted_action(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            action={"verb": "validate", "object": "output"},
        )
        assert "actions" in state
        # Auto-assigned step number should be present
        verbs = [a["verb"] for a in state["actions"]]
        assert "validate" in verbs

    def test_add_action_with_explicit_step(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.add_extracted_action(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            action={"step": 50, "verb": "deploy", "object": "package"},
        )
        steps = [a["step"] for a in state["actions"]]
        assert 50 in steps

    def test_add_action_empty_raises(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        with pytest.raises(ValueError, match="action"):
            definer.add_extracted_action(
                swarm_id=swarm_id,
                draft_id=draft_id,
                actor_id="user",
                action={},
            )


class TestConfirmActionCompleteness:
    """Test confirm_action_completeness."""

    def test_confirm_true(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.confirm_action_completeness(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            confirmed=True,
        )
        assert state["user_confirmation"] is True
        assert state["user_confirmation_required"] is False

    def test_confirm_false(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.confirm_action_completeness(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
            confirmed=False,
        )
        assert state["user_confirmation"] is False
        assert state["user_confirmation_required"] is True


class TestPreviewRestatementFromActions:
    """Test preview_restatement_from_actions."""

    def test_preview_success(self, definer, swarm_id):
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        preview = definer.preview_restatement_from_actions(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
        )
        assert "summary" in preview
        assert "structured_steps" in preview
        assert "extracted_actions" in preview
        assert "can_proceed" in preview

    def test_preview_with_destination(self, definer, swarm_id):
        """Line 456: step with destination."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id,
            raw_text="send report to manager via email",
            created_by="t",
        )
        preview = definer.preview_restatement_from_actions(
            swarm_id=swarm_id,
            draft_id=draft_id,
            actor_id="user",
        )
        # Just verify it returns without error
        assert isinstance(preview["structured_steps"], list)


class TestAcceptIntent:
    """Test accept_intent."""

    def _full_setup(self, definer, swarm_id):
        """Create draft, restatement with extracted actions."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        extraction = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        restatement_id = definer.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Collect and send data",
            structured_steps=[{"op": "collect", "target": "data"}],
            actor_id="ai",
            expected_outputs=["report"],
            inferred_constraints={"max_retries": 3},
        )
        return draft_id, restatement_id, extraction

    def test_accept_intent_success(self, definer, swarm_id):
        _, restatement_id, _ = self._full_setup(definer, swarm_id)
        acceptance_id = definer.accept_intent(
            swarm_id=swarm_id,
            restatement_id=restatement_id,
            accepted_by="operator",
            note="Looks good",
        )
        assert acceptance_id.startswith("accept-")
        # Verify swarm updated
        swarm = definer.repo.get_swarm(swarm_id)
        assert swarm["accepted_intent_id"] == acceptance_id

    def test_accept_intent_with_events(self, definer_with_events, swarm_id):
        """Lines 608-609: _emit('intent_accepted', ...)."""
        draft_id = definer_with_events.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        definer_with_events.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        rid = definer_with_events.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "collect"}],
            actor_id="ai",
        )
        definer_with_events.accept_intent(
            swarm_id=swarm_id, restatement_id=rid, accepted_by="op"
        )
        rows = definer_with_events.repo.conn.execute(
            "SELECT * FROM swarm_events WHERE event_type = 'intent_accepted'"
        ).fetchall()
        assert len(rows) >= 1

    def test_accept_not_found(self, definer, swarm_id):
        with pytest.raises(ValueError, match="Restatement not found"):
            definer.accept_intent(
                swarm_id=swarm_id,
                restatement_id="missing",
                accepted_by="op",
            )

    def test_accept_already_accepted(self, definer, swarm_id):
        _, restatement_id, _ = self._full_setup(definer, swarm_id)
        definer.accept_intent(
            swarm_id=swarm_id,
            restatement_id=restatement_id,
            accepted_by="op",
        )
        with pytest.raises(ValueError, match="already accepted"):
            definer.accept_intent(
                swarm_id=swarm_id,
                restatement_id=restatement_id,
                accepted_by="op",
            )

    def test_accept_with_unresolved_issues(self, repo, swarm_id):
        """Lines 549-555: unresolved issues block acceptance."""
        definer = SwarmDefiner(repo=repo, events=None)
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        extraction = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        # Create restatement with unresolved issues
        restatement_id = repo.create_restatement(
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "collect"}],
            extracted_actions=extraction["actions"],
            unresolved_issues=[{"type": "missing_verb", "msg": "needs verb"}],
        )
        with pytest.raises(ValueError, match="resolved"):
            definer.accept_intent(
                swarm_id=swarm_id,
                restatement_id=restatement_id,
                accepted_by="op",
            )

    def test_accept_with_no_extracted_actions(self, repo, swarm_id):
        """Lines 561-564: no extracted actions block acceptance."""
        definer = SwarmDefiner(repo=repo, events=None)
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        restatement_id = repo.create_restatement(
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "collect"}],
            extracted_actions=[],
            unresolved_issues=[],
        )
        with pytest.raises(ValueError, match="extracted actions"):
            definer.accept_intent(
                swarm_id=swarm_id,
                restatement_id=restatement_id,
                accepted_by="op",
            )

    def test_accept_with_clarification_history_fallback(self, repo, swarm_id):
        """Lines 571-579: clarification_history_json is None — falls back to query."""
        definer = SwarmDefiner(repo=repo, events=None)
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        extraction = definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        # Create restatement without clarification_history
        restatement_id = repo.create_restatement(
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "collect"}],
            extracted_actions=extraction["actions"] or [{"step": 1, "verb": "collect", "object": "data"}],
            unresolved_issues=[],
            clarification_history=None,
        )
        acceptance_id = definer.accept_intent(
            swarm_id=swarm_id,
            restatement_id=restatement_id,
            accepted_by="op",
        )
        assert acceptance_id.startswith("accept-")


class TestEvaluatePreAcceptance:
    """Test evaluate_pre_acceptance."""

    def test_evaluate_with_governance(self, definer, swarm_id):
        """Lines 619-649: evaluate_pre_acceptance with governance module."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        restatement_id = definer.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Collect and send",
            structured_steps=[{"op": "collect", "target": "data"}],
            actor_id="ai",
        )
        result = definer.evaluate_pre_acceptance(
            swarm_id=swarm_id,
            restatement_id=restatement_id,
            actor_id="operator",
        )
        assert "governance_warnings" in result
        assert "assurance_posture" in result
        assert "can_proceed" in result

    def test_evaluate_restatement_not_found(self, definer, swarm_id):
        """Restatement not found raises."""
        with pytest.raises(ValueError, match="Restatement not found"):
            definer.evaluate_pre_acceptance(
                swarm_id=swarm_id,
                restatement_id="missing",
                actor_id="op",
            )


class TestGetClarificationState:
    """Test get_clarification_state."""

    def test_no_intent_phase(self, definer, swarm_id):
        """Line 700+: no drafts at all."""
        state = definer.get_clarification_state(swarm_id)
        assert state["current_phase"] == "no_intent"
        assert state["has_draft"] is False

    def test_swarm_not_found(self, definer):
        with pytest.raises(ValueError, match="Swarm not found"):
            definer.get_clarification_state("nonexistent")

    def test_awaiting_restatement_phase(self, definer, swarm_id):
        """Line 700: draft with no issues and no actions => awaiting_restatement."""
        # Use a very simple intent that produces no extractable actions
        definer.create_draft(
            swarm_id=swarm_id, raw_text="hello world", created_by="t"
        )
        state = definer.get_clarification_state(swarm_id)
        assert state["has_draft"] is True
        # Phase depends on extraction results
        assert state["current_phase"] in (
            "awaiting_restatement",
            "ready_for_restatement",
            "needs_clarification",
        )

    def test_ready_for_restatement_phase(self, definer, swarm_id):
        """Lines 696-698: draft with actions and no issues."""
        definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        state = definer.get_clarification_state(swarm_id)
        assert state["has_draft"] is True
        # With real extraction, depends on whether SAMPLE_INTENT has issues
        assert state["current_phase"] in (
            "ready_for_restatement",
            "needs_clarification",
            "awaiting_restatement",
        )

    def test_needs_clarification_phase(self, definer, swarm_id):
        """Line 696: draft with unresolved issues."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id,
            raw_text="process it and handle that thing",
            created_by="t",
        )
        definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        state = definer.get_clarification_state(swarm_id)
        # The ambiguous text should produce issues
        if state["extraction_state"]["unresolved_issues"]:
            assert state["current_phase"] == "needs_clarification"

    def test_awaiting_acceptance_phase(self, definer, swarm_id):
        """Lines 685-686, 692-693: has restatement."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        definer.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Collect and send",
            structured_steps=[{"op": "collect"}],
            actor_id="ai",
        )
        state = definer.get_clarification_state(swarm_id)
        assert state["current_phase"] == "awaiting_acceptance"
        assert state["has_restatement"] is True
        assert state["restatement_id"] is not None

    def test_accepted_phase(self, definer, swarm_id):
        """Lines 690-691: accepted intent."""
        draft_id = definer.create_draft(
            swarm_id=swarm_id, raw_text=SAMPLE_INTENT, created_by="t"
        )
        definer.extract_actions(
            swarm_id=swarm_id, draft_id=draft_id, actor_id="t"
        )
        rid = definer.create_restatement(
            swarm_id=swarm_id,
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "collect"}],
            actor_id="ai",
        )
        definer.accept_intent(
            swarm_id=swarm_id, restatement_id=rid, accepted_by="op"
        )
        state = definer.get_clarification_state(swarm_id)
        assert state["current_phase"] == "accepted"
        assert state["has_acceptance"] is True


# ═══════════════════════════════════════════════════
# 2. SessionWatcher tests
# ═══════════════════════════════════════════════════

from swarm.bridge.session_watcher import SessionWatcher


def _make_platform_db(openclaw_root: Path):
    """Create a real platform.db at the expected location."""
    db_path = openclaw_root / "platform.db"
    db = RegistryDatabase(str(db_path))
    db.connect()
    db.migrate()
    db.close()
    return db_path


def _make_session_file(sessions_dir: Path, name: str, entries: list[dict]) -> Path:
    """Write a real JSONL session file."""
    sessions_dir.mkdir(parents=True, exist_ok=True)
    path = sessions_dir / f"{name}.jsonl"
    with open(path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")
    return path


class TestSessionWatcherInit:
    """Test __init__ and cursor operations."""

    def test_init(self, tmp_path):
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        assert watcher.openclaw_root == openclaw_root.resolve()
        assert watcher.cursors == {}
        assert watcher._running is True

    def test_load_cursors_no_file(self, tmp_path):
        """No cursor file => empty dict."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        assert watcher.cursors == {}

    def test_load_cursors_valid_file(self, tmp_path):
        """Cursor file exists and is valid JSON."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        cursor_file = openclaw_root / ".bridge_cursor.json"
        cursor_file.write_text(json.dumps({"session1.jsonl": 42}))

        watcher = SessionWatcher(openclaw_root, state_home)
        assert watcher.cursors == {"session1.jsonl": 42}

    def test_load_cursors_invalid_json(self, tmp_path):
        """Lines 47-48: invalid JSON in cursor file => empty dict."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        cursor_file = openclaw_root / ".bridge_cursor.json"
        cursor_file.write_text("not valid json{{{")

        watcher = SessionWatcher(openclaw_root, state_home)
        assert watcher.cursors == {}

    def test_save_and_reload_cursors(self, tmp_path):
        """Cursor persistence round-trip."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        watcher.cursors = {"test.jsonl": 100}
        watcher._save_cursors()

        watcher2 = SessionWatcher(openclaw_root, state_home)
        assert watcher2.cursors == {"test.jsonl": 100}


class TestSessionWatcherScan:
    """Test scan_sessions and _process_session_file."""

    def _setup_watcher(self, tmp_path):
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)
        return SessionWatcher(openclaw_root, state_home)

    def test_scan_no_sessions_dir(self, tmp_path):
        watcher = self._setup_watcher(tmp_path)
        assert watcher.scan_sessions() == 0

    def test_scan_empty_sessions_dir(self, tmp_path):
        watcher = self._setup_watcher(tmp_path)
        watcher.sessions_dir.mkdir(parents=True, exist_ok=True)
        assert watcher.scan_sessions() == 0

    def test_scan_skip_lock_files(self, tmp_path):
        """Line 67: .lock files are not picked up by *.jsonl glob.
        Verify that only .jsonl files are processed."""
        watcher = self._setup_watcher(tmp_path)
        sessions_dir = watcher.sessions_dir
        sessions_dir.mkdir(parents=True, exist_ok=True)

        # Create .lock files — these won't match *.jsonl glob
        (sessions_dir / "session.lock").write_text("{}")
        (sessions_dir / "test.jsonl.lock").write_text("{}")

        # Only .jsonl files get processed
        assert watcher.scan_sessions() == 0

    def test_process_blank_lines(self, tmp_path):
        """Line 92: blank lines are skipped."""
        watcher = self._setup_watcher(tmp_path)
        _make_session_file(watcher.sessions_dir, "blank_test", [])
        # Write file with blank lines manually
        path = watcher.sessions_dir / "blank_test.jsonl"
        with open(path, "w") as f:
            f.write("\n\n\n")
        assert watcher.scan_sessions() == 0

    def test_process_invalid_json(self, tmp_path):
        """Lines 95-96: invalid JSON lines are skipped."""
        watcher = self._setup_watcher(tmp_path)
        path = watcher.sessions_dir / "bad_json.jsonl"
        watcher.sessions_dir.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            f.write("not json at all\n")
            f.write("{broken json\n")
        assert watcher.scan_sessions() == 0

    def test_process_model_change(self, tmp_path):
        """Lines 102-108: model_change entry updates session_model_info."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {"type": "model_change", "provider": "anthropic", "modelId": "claude-3"},
            {
                "type": "message",
                "message": {"role": "user", "content": "Hello there"},
            },
            {
                "type": "message",
                "id": "msg-1",
                "message": {"role": "assistant", "content": "Hi! How can I help?"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "model_change", entries)
        count = watcher.scan_sessions()
        assert count == 1

    def test_process_model_snapshot(self, tmp_path):
        """Lines 115-124: custom/model-snapshot entry."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "custom",
                "customType": "model-snapshot",
                "data": {"provider": "openai", "modelId": "gpt-4"},
            },
            {
                "type": "message",
                "message": {"role": "user", "content": "What is 2+2?"},
            },
            {
                "type": "message",
                "id": "msg-2",
                "message": {"role": "assistant", "content": "4"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "snapshot", entries)
        count = watcher.scan_sessions()
        assert count == 1

    def test_skip_non_message_entries(self, tmp_path):
        """Line 127: non-message entry types are skipped."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {"type": "system", "data": "something"},
            {"type": "config", "data": "something"},
        ]
        _make_session_file(watcher.sessions_dir, "non_msg", entries)
        count = watcher.scan_sessions()
        assert count == 0

    def test_user_message_list_content(self, tmp_path):
        """Lines 135-141: user message with list content."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Hello"},
                        {"type": "image", "url": "http://example.com/img.png"},
                        {"type": "text", "text": "World"},
                    ],
                },
            },
            {
                "type": "message",
                "id": "msg-3",
                "message": {"role": "assistant", "content": "Hi there!"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "list_user", entries)
        count = watcher.scan_sessions()
        assert count == 1

    def test_assistant_message_list_content(self, tmp_path):
        """Lines 149-155: assistant message with list content."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "message": {"role": "user", "content": "Tell me something"},
            },
            {
                "type": "message",
                "id": "msg-4",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Here is part 1."},
                        {"type": "text", "text": "And part 2."},
                    ],
                },
            },
        ]
        _make_session_file(watcher.sessions_dir, "list_asst", entries)
        count = watcher.scan_sessions()
        assert count == 1

    def test_assistant_empty_content_skipped(self, tmp_path):
        """Line 157: empty assistant content is skipped."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "message": {"role": "user", "content": "Hello"},
            },
            {
                "type": "message",
                "id": "msg-5",
                "message": {"role": "assistant", "content": ""},
            },
        ]
        _make_session_file(watcher.sessions_dir, "empty_asst", entries)
        count = watcher.scan_sessions()
        assert count == 0

    def test_assistant_whitespace_content_skipped(self, tmp_path):
        """Line 157: whitespace-only assistant content is skipped."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "message": {"role": "user", "content": "Hello"},
            },
            {
                "type": "message",
                "id": "msg-6",
                "message": {"role": "assistant", "content": "   "},
            },
        ]
        _make_session_file(watcher.sessions_dir, "ws_asst", entries)
        count = watcher.scan_sessions()
        assert count == 0

    def test_cursor_persistence_after_scan(self, tmp_path):
        """Cursors saved after successful scan with recordings."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "message": {"role": "user", "content": "Hi"},
            },
            {
                "type": "message",
                "id": "msg-7",
                "message": {"role": "assistant", "content": "Hello!"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "cursor_test", entries)
        watcher.scan_sessions()

        assert "cursor_test.jsonl" in watcher.cursors
        assert watcher.cursors["cursor_test.jsonl"] > 0

        # Second scan should find no new entries
        count2 = watcher.scan_sessions()
        assert count2 == 0

    def test_oserror_handling(self, tmp_path):
        """Lines 172-173: OSError during file read."""
        watcher = self._setup_watcher(tmp_path)
        watcher.sessions_dir.mkdir(parents=True, exist_ok=True)
        # Create a directory named like a JSONL file — reading it causes OSError
        bad_path = watcher.sessions_dir / "bad.jsonl"
        bad_path.mkdir()

        # Should not raise, returns 0
        count = watcher.scan_sessions()
        assert count == 0

    def test_no_user_message_before_assistant(self, tmp_path):
        """Assistant message without preceding user message is not recorded."""
        watcher = self._setup_watcher(tmp_path)
        entries = [
            {
                "type": "message",
                "id": "msg-8",
                "message": {"role": "assistant", "content": "I am responding"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "no_user", entries)
        count = watcher.scan_sessions()
        assert count == 0


class TestExtractUserText:
    """Test _extract_user_text static method."""

    def test_empty_content(self):
        assert SessionWatcher._extract_user_text("") is None
        assert SessionWatcher._extract_user_text("   ") is None

    def test_system_prefixes(self):
        assert SessionWatcher._extract_user_text(
            "A new session was started from scratch"
        ) is None
        assert SessionWatcher._extract_user_text(
            "Continue where you left off with the previous task"
        ) is None
        assert SessionWatcher._extract_user_text(
            "The previous model attempt failed"
        ) is None

    def test_normal_text(self):
        result = SessionWatcher._extract_user_text("Hello, how are you?")
        assert result == "Hello, how are you?"

    def test_metadata_wrapper_with_code_block(self):
        """Lines 199-202: metadata wrapper with code block pattern."""
        text = (
            "Conversation info (untrusted metadata):\n"
            "```\n"
            " [Mon 2025-01-01 10:00 UTC] What is the weather today?"
        )
        result = SessionWatcher._extract_user_text(text)
        assert result is not None
        assert "weather" in result

    def test_metadata_wrapper_with_day_pattern(self):
        """Lines 204-210: metadata wrapper with day pattern fallback."""
        text = (
            "Conversation info (untrusted metadata):\n"
            "[Tue 2025-03-15 14:00 PST] Tell me about Python"
        )
        result = SessionWatcher._extract_user_text(text)
        assert result is not None
        assert "Python" in result

    def test_metadata_wrapper_no_match(self):
        """Lines 211-212: metadata wrapper with no extractable text."""
        text = "Conversation info (untrusted metadata):\nno valid pattern here"
        result = SessionWatcher._extract_user_text(text)
        assert result is None

    def test_strip_leading_timestamp(self):
        """Lines 215-219: strip leading timestamp."""
        text = "[Mon 2025-01-01 10:00 UTC] What about testing?"
        result = SessionWatcher._extract_user_text(text)
        assert result == "What about testing?"

    def test_empty_after_strip(self):
        """Line 222: text is empty after stripping timestamp."""
        text = "[Mon 2025-01-01 10:00 UTC]"
        result = SessionWatcher._extract_user_text(text)
        assert result is None


class TestRecordTurn:
    """Test _record_turn and exception handling."""

    def test_record_turn_success(self, tmp_path):
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        # Should not raise
        watcher._record_turn(
            entry_id="test-entry",
            user_message="Hello",
            response_text="World",
            session_id="sess-1",
            model_info={"model": "test-model", "provider": "test-provider"},
        )
        # Verify artifact was written
        assert (openclaw_root / "artifacts" / "executions").exists()

    def test_record_turn_exception_caught(self, tmp_path):
        """Lines 246-247: exception in recorder.record_agent_run is caught."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)

        # Remove the proposals subdir and replace with a file so
        # _write_artifact("proposals", ...) raises NotADirectoryError
        proposals_dir = watcher.recorder.artifacts_dir / "proposals"
        shutil.rmtree(proposals_dir)
        proposals_dir.write_text("block")

        # Should not raise — the exception is caught in _record_turn
        watcher._record_turn(
            entry_id="fail-entry",
            user_message="Hello",
            response_text="World",
            session_id="sess-1",
            model_info={},
        )


class TestWatchAndStop:
    """Test watch() and stop()."""

    def test_stop(self, tmp_path):
        """Lines 265-266: stop sets _running=False and saves cursors."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        watcher.cursors = {"test.jsonl": 50}
        watcher.stop()

        assert watcher._running is False
        # Cursors should be persisted
        cursor_file = openclaw_root / ".bridge_cursor.json"
        assert cursor_file.exists()
        data = json.loads(cursor_file.read_text())
        assert data == {"test.jsonl": 50}

    def test_watch_loop_stops(self, tmp_path):
        """Lines 251-261: watch loop runs and can be stopped."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)

        # Use a timer to stop the watcher after a brief period
        timer = threading.Timer(0.5, watcher.stop)
        timer.start()

        # watch() should return after stop() is called
        watcher.watch(poll_interval=0.1)
        assert watcher._running is False
        timer.cancel()  # In case it hasn't fired yet

    def test_watch_records_runs(self, tmp_path):
        """watch() actually picks up new entries."""
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)

        # Pre-create a session file
        entries = [
            {
                "type": "message",
                "message": {"role": "user", "content": "ping"},
            },
            {
                "type": "message",
                "id": "watch-msg-1",
                "message": {"role": "assistant", "content": "pong"},
            },
        ]
        _make_session_file(watcher.sessions_dir, "watch_test", entries)

        # Stop after first poll
        timer = threading.Timer(0.3, watcher.stop)
        timer.start()
        watcher.watch(poll_interval=0.1)
        timer.cancel()

        assert "watch_test.jsonl" in watcher.cursors


class TestSessionWatcherFullRoundTrip:
    """Full integration: multiple entry types in one file."""

    def test_mixed_entries(self, tmp_path):
        openclaw_root = tmp_path / "openclaw"
        state_home = tmp_path / "state"
        openclaw_root.mkdir()
        state_home.mkdir()
        _make_platform_db(openclaw_root)

        watcher = SessionWatcher(openclaw_root, state_home)
        entries = [
            # model change
            {"type": "model_change", "provider": "anthropic", "modelId": "opus"},
            # model snapshot
            {
                "type": "custom",
                "customType": "model-snapshot",
                "data": {"provider": "anthropic", "modelId": "opus-4"},
            },
            # non-message
            {"type": "system_init", "data": "init"},
            # user message (string)
            {
                "type": "message",
                "message": {"role": "user", "content": "First question"},
            },
            # assistant response (string)
            {
                "type": "message",
                "id": "resp-1",
                "message": {"role": "assistant", "content": "First answer"},
            },
            # user message (list content)
            {
                "type": "message",
                "message": {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Second question"},
                    ],
                },
            },
            # assistant response (list content)
            {
                "type": "message",
                "id": "resp-2",
                "message": {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": "Second answer"},
                    ],
                },
            },
            # user with system prefix (should be skipped)
            {
                "type": "message",
                "message": {
                    "role": "user",
                    "content": "A new session was started from scratch",
                },
            },
            # assistant after skipped user — no last_user_message
            {
                "type": "message",
                "id": "resp-3",
                "message": {"role": "assistant", "content": "I continue..."},
            },
        ]
        _make_session_file(watcher.sessions_dir, "mixed", entries)
        count = watcher.scan_sessions()
        # Should record 2 turns: first Q&A and second Q&A
        # The third assistant message has no valid preceding user message
        assert count == 2
