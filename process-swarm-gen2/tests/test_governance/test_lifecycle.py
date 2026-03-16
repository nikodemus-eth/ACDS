"""Tests for the swarm lifecycle state machine."""

from __future__ import annotations

import pytest

from swarm.events.recorder import EventRecorder
from swarm.governance.lifecycle import (
    ALLOWED_TRANSITIONS,
    LIFECYCLE_STATES,
    TRANSITION_ROLES,
    LifecycleManager,
)
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def db():
    database = RegistryDatabase(":memory:")
    database.connect()
    database.migrate()
    yield database
    database.close()


@pytest.fixture
def repo(db):
    return SwarmRepository(db)


@pytest.fixture
def events(repo):
    return EventRecorder(repo)


@pytest.fixture
def lifecycle(repo, events):
    return LifecycleManager(repo, events)


@pytest.fixture
def swarm_id(repo):
    return repo.create_swarm("Test Swarm", "A test swarm", "author-1")


class TestLifecycleStates:
    def test_seven_lifecycle_states(self):
        assert len(LIFECYCLE_STATES) == 7

    def test_all_states_in_transitions(self):
        for state in LIFECYCLE_STATES:
            assert state in ALLOWED_TRANSITIONS

    def test_revoked_is_terminal(self):
        assert ALLOWED_TRANSITIONS["revoked"] == set()

    def test_drafting_can_submit_or_revoke(self):
        assert ALLOWED_TRANSITIONS["drafting"] == {"reviewing", "revoked"}

    def test_reviewing_has_three_options(self):
        assert ALLOWED_TRANSITIONS["reviewing"] == {"approved", "rejected", "drafting"}

    def test_transition_roles_defined(self):
        assert len(TRANSITION_ROLES) >= 10


class TestLifecycleTransitions:
    def test_submit_for_review(self, lifecycle, repo, swarm_id):
        event_id = lifecycle.submit_for_review(swarm_id, "author-1")
        assert event_id.startswith("evt-")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "reviewing"

    def test_approve(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        event_id = lifecycle.approve(swarm_id, "reviewer-1")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "approved"

    def test_reject(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.reject(swarm_id, "reviewer-1", reason="Not ready")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "rejected"

    def test_publish(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        event_id = lifecycle.publish(swarm_id, "publisher-1")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "enabled"

    def test_pause(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        lifecycle.publish(swarm_id, "publisher-1")
        lifecycle.pause(swarm_id, "publisher-1", reason="Maintenance")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "paused"

    def test_resume_from_paused(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        lifecycle.publish(swarm_id, "publisher-1")
        lifecycle.pause(swarm_id, "publisher-1")
        lifecycle.transition(swarm_id, "enabled", "publisher-1", "publisher")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "enabled"

    def test_revoke_from_enabled(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        lifecycle.publish(swarm_id, "publisher-1")
        lifecycle.revoke(swarm_id, "publisher-1", reason="Security issue")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "revoked"

    def test_return_to_draft(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.reject(swarm_id, "reviewer-1")
        lifecycle.return_to_draft(swarm_id, "author-1")
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "drafting"


class TestLifecycleValidation:
    def test_invalid_state_rejected(self, lifecycle, swarm_id):
        with pytest.raises(ValueError, match="Invalid lifecycle state"):
            lifecycle.transition(swarm_id, "nonexistent", "user-1", "author")

    def test_invalid_transition_rejected(self, lifecycle, swarm_id):
        with pytest.raises(ValueError, match="not allowed"):
            lifecycle.transition(swarm_id, "enabled", "user-1", "publisher")

    def test_wrong_role_rejected(self, lifecycle, swarm_id):
        with pytest.raises(ValueError, match="requires role"):
            lifecycle.transition(swarm_id, "reviewing", "user-1", "publisher")

    def test_nonexistent_swarm_rejected(self, lifecycle):
        with pytest.raises(ValueError, match="Swarm not found"):
            lifecycle.transition("fake-id", "reviewing", "user-1", "author")

    def test_revoked_is_terminal(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        lifecycle.publish(swarm_id, "publisher-1")
        lifecycle.revoke(swarm_id, "publisher-1")
        with pytest.raises(ValueError, match="not allowed"):
            lifecycle.transition(swarm_id, "enabled", "publisher-1", "publisher")

    def test_get_allowed_transitions(self, lifecycle, swarm_id):
        allowed = lifecycle.get_allowed_transitions(swarm_id)
        assert "reviewing" in allowed
        assert "revoked" in allowed

    def test_get_allowed_transitions_nonexistent(self, lifecycle):
        with pytest.raises(ValueError, match="Swarm not found"):
            lifecycle.get_allowed_transitions("fake-id")


class TestGovernanceEvents:
    def test_transition_records_event(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        events = repo.list_events(swarm_id)
        assert len(events) >= 1
        assert any(
            e["event_type"] == "swarm_submitted_for_review" for e in events
        )

    def test_approve_records_event(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        lifecycle.approve(swarm_id, "reviewer-1")
        events = repo.list_events(swarm_id, event_type="swarm_approved")
        assert len(events) == 1

    def test_transition_event_includes_details(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        events = repo.list_events(swarm_id)
        event = events[0]
        assert swarm_id in event["summary"]


class TestReducedAssuranceGovernance:
    def test_same_actor_multiple_roles_warns(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "user-1")
        with pytest.raises(ValueError, match="governance warning acknowledgment"):
            lifecycle.approve(swarm_id, "user-1")

    def test_different_actors_no_warning(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "author-1")
        event_id = lifecycle.approve(swarm_id, "reviewer-1")
        assert event_id.startswith("evt-")

    def test_acknowledge_warning_allows_transition(self, lifecycle, repo, swarm_id):
        lifecycle.submit_for_review(swarm_id, "user-1")
        try:
            lifecycle.approve(swarm_id, "user-1")
        except ValueError:
            pass
        warnings = repo.list_governance_warning_records(swarm_id)
        warning_ids = [w["warning_id"] for w in warnings]
        event_id = lifecycle.approve(
            swarm_id,
            "user-1",
            warning_ids=warning_ids,
            override_reason_category="single_operator",
            override_reason="Only one person available",
        )
        swarm = repo.get_swarm(swarm_id)
        assert swarm["lifecycle_status"] == "approved"
