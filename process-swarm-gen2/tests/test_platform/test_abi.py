"""Tests for SwarmSkillABI."""
from __future__ import annotations

import pytest

from swarm.abi.api import SwarmSkillABI
from swarm.events.recorder import EventRecorder
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
def abi(repo, events, tmp_path):
    return SwarmSkillABI(repo, events, str(tmp_path))


class TestSwarmSkillABI:
    def test_negotiate_version_supported(self):
        assert SwarmSkillABI.negotiate_version("0.1") is True

    def test_negotiate_version_unsupported(self):
        assert SwarmSkillABI.negotiate_version("99.0") is False

    def test_create_swarm_definition(self, abi, repo):
        result = abi.create_swarm_definition(
            name="Test Swarm",
            description="A test swarm",
            step_outline=["Collect sources", "Generate report"],
            created_by="user-1",
        )
        assert "swarm_id" in result
        assert "draft_id" in result
        swarm = repo.get_swarm(result["swarm_id"])
        assert swarm["swarm_name"] == "Test Swarm"
        assert swarm["lifecycle_status"] == "drafting"

    def test_create_swarm_empty_name_raises(self, abi):
        with pytest.raises(ValueError, match="non-empty"):
            abi.create_swarm_definition(
                name="", description="d", step_outline=[], created_by="user"
            )

    def test_create_with_schedule_and_delivery(self, abi, repo):
        result = abi.create_swarm_definition(
            name="Full Swarm",
            description="With schedule and delivery",
            step_outline=["Step 1"],
            created_by="user-1",
            schedule_policy={"trigger_type": "immediate"},
            delivery_policy={"delivery_type": "email", "destination": "a@b.com"},
        )
        assert result["schedule_id"] is not None
        assert result["delivery_id"] is not None
        swarm = repo.get_swarm(result["swarm_id"])
        assert swarm["schedule_id"] == result["schedule_id"]
        assert swarm["delivery_id"] == result["delivery_id"]

    def test_configure_schedule(self, abi, repo):
        result = abi.create_swarm_definition(
            name="S", description="d", step_outline=["x"], created_by="u"
        )
        schedule_id = abi.configure_schedule(
            result["swarm_id"], {"trigger_type": "deferred_once"}
        )
        assert schedule_id is not None

    def test_configure_delivery(self, abi, repo):
        result = abi.create_swarm_definition(
            name="S", description="d", step_outline=["x"], created_by="u"
        )
        delivery_id = abi.configure_delivery(
            result["swarm_id"],
            {"delivery_type": "telegram", "destination": "chat-123"},
        )
        assert delivery_id is not None

    def test_preview_execution(self, abi, repo):
        result = abi.create_swarm_definition(
            name="Preview Test",
            description="For preview",
            step_outline=["Step A"],
            created_by="user-1",
        )
        preview = abi.preview_execution(result["swarm_id"])
        assert preview["swarm_name"] == "Preview Test"
        assert preview["lifecycle_status"] == "drafting"

    def test_preview_nonexistent_swarm(self, abi):
        with pytest.raises(ValueError, match="not found"):
            abi.preview_execution("nonexistent")

    def test_list_swarms(self, abi, repo):
        abi.create_swarm_definition(
            name="S1", description="d", step_outline=["x"], created_by="u"
        )
        abi.create_swarm_definition(
            name="S2", description="d", step_outline=["y"], created_by="u"
        )
        swarms = abi.list_swarms()
        assert len(swarms) >= 2

    def test_get_swarm_definition(self, abi, repo):
        result = abi.create_swarm_definition(
            name="Get Test", description="d", step_outline=["x"], created_by="u"
        )
        swarm = abi.get_swarm_definition(result["swarm_id"])
        assert swarm is not None
        assert swarm["swarm_name"] == "Get Test"

    def test_update_swarm_definition(self, abi, repo):
        result = abi.create_swarm_definition(
            name="Old Name", description="d", step_outline=["x"], created_by="u"
        )
        abi.update_swarm_definition(
            result["swarm_id"], "user-1", swarm_name="New Name"
        )
        swarm = repo.get_swarm(result["swarm_id"])
        assert swarm["swarm_name"] == "New Name"

    def test_update_lifecycle_status_blocked(self, abi, repo):
        result = abi.create_swarm_definition(
            name="S", description="d", step_outline=["x"], created_by="u"
        )
        with pytest.raises(ValueError, match="lifecycle_status"):
            abi.update_swarm_definition(
                result["swarm_id"], "user-1", lifecycle_status="enabled"
            )

    def test_update_non_drafting_blocked(self, abi, repo, events):
        result = abi.create_swarm_definition(
            name="S", description="d", step_outline=["x"], created_by="u"
        )
        # Transition to reviewing
        from swarm.governance.lifecycle import LifecycleManager

        lm = LifecycleManager(repo, events)
        lm.transition(
            result["swarm_id"], "reviewing",
            actor_id="user-1", actor_role="author",
        )
        with pytest.raises(ValueError, match="reviewing"):
            abi.update_swarm_definition(
                result["swarm_id"], "user-1", description="new desc"
            )
