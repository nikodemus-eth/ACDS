from __future__ import annotations

import pytest

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
def swarm_with_actions(repo):
    """Create a drafting swarm with 2 actions but NO acceptance."""
    swarm_id = repo.create_swarm("Gate Test Swarm", "Test swarm", "user-1")
    repo.create_action(
        swarm_id=swarm_id,
        step_order=0,
        action_name="collect_sources",
        action_text="Gather source materials",
        action_type="collect",
    )
    repo.create_action(
        swarm_id=swarm_id,
        step_order=1,
        action_name="synthesize_content",
        action_text="Synthesize report content",
        action_type="generate",
    )
    return swarm_id


# ──────────────────────────────────────────────
# RT06-A: Acceptance Gate Enforcement
# ──────────────────────────────────────────────


class TestAcceptanceGateEnforcement:
    def test_acceptance_table_exists(self, db):
        row = db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='action_table_acceptances'"
        ).fetchone()
        assert row is not None

    def test_no_acceptance_before_creation(self, repo, swarm_with_actions):
        acceptance = repo.get_action_table_acceptance_by_swarm(swarm_with_actions)
        assert acceptance is None

    def test_explicit_acceptance_creates_record(self, repo, swarm_with_actions):
        acceptance_id = repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=2,
        )
        assert acceptance_id is not None
        record = repo.get_action_table_acceptance(acceptance_id)
        assert record is not None
        assert record["swarm_id"] == swarm_with_actions
        assert record["accepted_by"] == "operator-1"

    def test_acceptance_retrievable_by_swarm(self, repo, swarm_with_actions):
        repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=2,
        )
        acceptance = repo.get_action_table_acceptance_by_swarm(swarm_with_actions)
        assert acceptance is not None
        assert acceptance["swarm_id"] == swarm_with_actions

    def test_acceptance_required_before_finalization(self, repo, swarm_with_actions):
        actions = repo.list_actions(swarm_with_actions)
        assert len(actions) == 2
        acceptance = repo.get_action_table_acceptance_by_swarm(swarm_with_actions)
        assert acceptance is None

    def test_acceptance_count_matches_actions(self, repo, swarm_with_actions):
        actions = repo.list_actions(swarm_with_actions)
        repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=len(actions),
        )
        acceptance = repo.get_action_table_acceptance_by_swarm(swarm_with_actions)
        assert acceptance["action_count"] == len(actions)


# ──────────────────────────────────────────────
# RT06-B: Acceptance Integrity
# ──────────────────────────────────────────────


class TestAcceptanceIntegrity:
    def test_acceptance_has_timestamp(self, repo, swarm_with_actions):
        acceptance_id = repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=2,
        )
        record = repo.get_action_table_acceptance(acceptance_id)
        assert record["accepted_at"] is not None
        assert record["accepted_at"] != ""

    def test_acceptance_records_readiness(self, repo, swarm_with_actions):
        acceptance_id = repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=2,
            tool_readiness_summary="2/2 supported",
        )
        record = repo.get_action_table_acceptance(acceptance_id)
        assert record["tool_readiness_summary"] == "2/2 supported"

    def test_multiple_acceptances_latest_wins(self, repo, swarm_with_actions):
        first_id = repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-1",
            action_count=2,
        )
        second_id = repo.create_action_table_acceptance(
            swarm_id=swarm_with_actions,
            accepted_by="operator-2",
            action_count=2,
        )
        latest = repo.get_action_table_acceptance_by_swarm(swarm_with_actions)
        assert latest["acceptance_id"] == second_id
        assert latest["accepted_by"] == "operator-2"
