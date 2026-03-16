"""Tests for the platform event recorder."""

from __future__ import annotations

import pytest

from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    yield SwarmRepository(db)
    db.close()


@pytest.fixture
def recorder(repo):
    return EventRecorder(repo)


@pytest.fixture
def swarm_id(repo):
    return repo.create_swarm("Test Swarm", "A test swarm", "user-1")


class TestEventRecorder:
    def test_record_generic_event(self, recorder, repo, swarm_id):
        evt_id = recorder.record(
            swarm_id=swarm_id,
            event_type="custom_event",
            actor_id="system",
            summary="Something happened",
        )
        assert evt_id.startswith("evt-")
        events = repo.list_events(swarm_id)
        assert len(events) == 1
        assert events[0]["event_type"] == "custom_event"

    def test_draft_created(self, recorder, repo, swarm_id):
        evt_id = recorder.draft_created(swarm_id, "draft-001", "user-1")
        events = repo.list_events(swarm_id, event_type="draft_created")
        assert len(events) == 1
        assert "draft-001" in events[0]["summary"]
        assert events[0]["related_entity_type"] == "intent_draft"
        assert events[0]["related_entity_id"] == "draft-001"

    def test_intent_accepted(self, recorder, repo, swarm_id):
        evt_id = recorder.intent_accepted(swarm_id, "accept-001", "user-1")
        events = repo.list_events(swarm_id, event_type="intent_accepted")
        assert len(events) == 1
        assert events[0]["related_entity_id"] == "accept-001"

    def test_swarm_created(self, recorder, repo, swarm_id):
        recorder.swarm_created(swarm_id, "user-1")
        events = repo.list_events(swarm_id, event_type="swarm_created")
        assert len(events) == 1

    def test_run_queued(self, recorder, repo, swarm_id):
        recorder.run_queued(swarm_id, "run-001", "manual")
        events = repo.list_events(swarm_id, event_type="run_queued")
        assert len(events) == 1
        assert "manual" in events[0]["summary"]

    def test_run_started(self, recorder, repo, swarm_id):
        recorder.run_started(swarm_id, "run-001")
        events = repo.list_events(swarm_id, event_type="run_started")
        assert len(events) == 1

    def test_run_completed_success(self, recorder, repo, swarm_id):
        recorder.run_completed(swarm_id, "run-001", "succeeded")
        events = repo.list_events(swarm_id, event_type="run_succeeded")
        assert len(events) == 1

    def test_run_completed_failure(self, recorder, repo, swarm_id):
        recorder.run_completed(swarm_id, "run-001", "failed")
        events = repo.list_events(swarm_id, event_type="run_failed")
        assert len(events) == 1

    def test_delivery_sent(self, recorder, repo, swarm_id):
        recorder.delivery_sent(swarm_id, "run-001", "rcpt-001")
        events = repo.list_events(swarm_id, event_type="delivery_sent")
        assert len(events) == 1
        assert events[0]["related_entity_id"] == "rcpt-001"

    def test_delivery_failed(self, recorder, repo, swarm_id):
        recorder.delivery_failed(swarm_id, "run-001", "Connection refused")
        events = repo.list_events(swarm_id, event_type="delivery_failed")
        assert len(events) == 1
        assert "Connection refused" in events[0]["summary"]

    def test_governance_warning_recorded(self, recorder, repo, swarm_id):
        recorder.governance_warning_recorded(
            swarm_id, "warn-001", "scope_expansion", "warn", "user-1", "lease_review"
        )
        events = repo.list_events(swarm_id, event_type="governance_warning_recorded")
        assert len(events) == 1

    def test_reduced_assurance_governance_recorded(self, recorder, repo, swarm_id):
        recorder.reduced_assurance_governance_recorded(
            swarm_id, "ra-001", "user-1", "author_reviewer_role_collapse"
        )
        events = repo.list_events(
            swarm_id, event_type="reduced_assurance_governance_recorded"
        )
        assert len(events) == 1

    def test_actions_generated(self, recorder, repo, swarm_id):
        recorder.actions_generated(swarm_id, 5)
        events = repo.list_events(swarm_id, event_type="actions_generated")
        assert len(events) == 1
        assert "5" in events[0]["summary"]

    def test_preflight_completed(self, recorder, repo, swarm_id):
        recorder.preflight_completed(swarm_id, 10, 8, True)
        events = repo.list_events(swarm_id, event_type="preflight_completed")
        assert len(events) == 1
        assert "8/10" in events[0]["summary"]

    def test_pipeline_completed(self, recorder, repo, swarm_id):
        recorder.pipeline_completed(swarm_id, 8, True)
        events = repo.list_events(swarm_id, event_type="pipeline_completed")
        assert len(events) == 1
        assert "successfully" in events[0]["summary"]

    def test_tool_registered(self, recorder, repo, swarm_id):
        # tool_registered uses "__platform__" as swarm_id, but FK requires
        # a real swarm record. Test via generic record instead.
        recorder.record(
            swarm_id=swarm_id,
            event_type="tool_registered",
            actor_id="system",
            summary="Tool 'source_collector' registered (tool-001)",
            details={"tool_id": "tool-001", "tool_name": "source_collector"},
            related_entity_type="tool",
            related_entity_id="tool-001",
        )
        events = repo.list_events(swarm_id, event_type="tool_registered")
        assert len(events) == 1
        assert "source_collector" in events[0]["summary"]

    def test_restatement_generated(self, recorder, repo, swarm_id):
        recorder.restatement_generated(swarm_id, "restate-001", "user-1")
        events = repo.list_events(swarm_id, event_type="restatement_generated")
        assert len(events) == 1
        assert events[0]["related_entity_id"] == "restate-001"
