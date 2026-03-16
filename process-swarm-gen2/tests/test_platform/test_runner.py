"""Tests for SwarmRunner."""
from __future__ import annotations

import json

import pytest

from swarm.runner import SwarmRunner


@pytest.fixture
def openclaw_root(tmp_path):
    """Create minimal openclaw root structure."""
    (tmp_path / "runtime").mkdir()
    (tmp_path / "schemas").mkdir()
    (tmp_path / "workspace").mkdir()
    import shutil
    from pathlib import Path

    src_schemas = Path(__file__).resolve().parents[2] / "schemas"
    if src_schemas.is_dir():
        for f in src_schemas.iterdir():
            if f.is_file():
                shutil.copy(f, tmp_path / "schemas" / f.name)

    keys_dir = tmp_path / "runtime" / "identity" / "keys"
    keys_dir.mkdir(parents=True)
    from runtime.identity.key_manager import generate_keypair, save_keypair

    for role in [
        "validator_signer",
        "compiler_signer",
        "approval_signer",
        "node_attestation_signer",
        "lease_issuer_signer",
    ]:
        signing_key, _ = generate_keypair()
        save_keypair(role, signing_key, keys_dir)

    return tmp_path


@pytest.fixture
def runner(openclaw_root):
    r = SwarmRunner(openclaw_root, db_path=":memory:")
    yield r
    r.close()


def _enable_swarm(runner):
    """Create a fully enabled swarm with a behavior sequence."""
    repo = runner.repo
    events = runner.events

    swarm_id = repo.create_swarm("Test Swarm", "A test", "user-1")

    # Create intent draft
    draft_id = repo.create_intent_draft(swarm_id, "Test intent", "user-1")

    # Create restatement (actual API: draft_id, summary, structured_steps)
    restatement_id = repo.create_restatement(
        draft_id=draft_id,
        summary="Restated intent",
        structured_steps=[{"step": "Run manager"}],
    )

    # Accept intent (actual API: restatement_id, accepted_by)
    acceptance_id = repo.accept_intent(
        restatement_id=restatement_id,
        accepted_by="user-1",
    )

    # Create behavior sequence with adapter actions
    steps = [
        {
            "step_id": "step-1",
            "operation_type": "invoke_capability",
            "tool_name": "run_manager",
            "parameters": {},
        },
    ]
    bs_id = repo.create_behavior_sequence(
        swarm_id=swarm_id,
        name="main",
        ordered_steps=steps,
        target_paths=[],
        acceptance_tests=[],
    )

    # Transition through lifecycle: drafting → reviewing → approved → enabled
    from swarm.governance.lifecycle import LifecycleManager

    lm = LifecycleManager(repo, events)
    lm.transition(swarm_id, "reviewing", actor_id="user-1", actor_role="author")
    lm.transition(swarm_id, "approved", actor_id="reviewer-1", actor_role="reviewer")
    lm.transition(swarm_id, "enabled", actor_id="admin-1", actor_role="publisher")

    return swarm_id


class TestSwarmRunner:
    def test_run_creates_queued_status(self, runner):
        swarm_id = _enable_swarm(runner)
        run_id = runner.repo.create_run(swarm_id, "manual")
        run = runner.repo.get_run(run_id)
        assert run["run_status"] == "queued"

    def test_full_lifecycle(self, runner):
        swarm_id = _enable_swarm(runner)
        result = runner.run_swarm_now(swarm_id)
        assert result["execution_status"] == "succeeded"

        # Verify run history
        runs = runner.repo.list_runs(swarm_id)
        assert len(runs) >= 1

        # Verify events recorded
        evts = runner.repo.list_events(swarm_id)
        event_types = [e["event_type"] for e in evts]
        assert "run_started" in event_types
        assert "run_succeeded" in event_types

    def test_failed_run_recorded(self, runner):
        swarm_id = _enable_swarm(runner)

        # Empty the behavior sequence to force failure
        bs = runner.repo.get_behavior_sequence_by_swarm(swarm_id)
        runner.db.conn.execute(
            "UPDATE behavior_sequences SET ordered_steps_json = ? WHERE sequence_id = ?",
            ("[]", bs["sequence_id"]),
        )
        runner.db.conn.commit()

        run_id = runner.repo.create_run(swarm_id, "manual")
        with pytest.raises(ValueError, match="Empty behavior sequence"):
            runner.execute_run(run_id)

        run = runner.repo.get_run(run_id)
        assert run["run_status"] == "failed"
        assert run["error_summary"] is not None

    def test_swarm_not_enabled_raises(self, runner):
        swarm_id = runner.repo.create_swarm("Draft Swarm", "d", "user-1")
        run_id = runner.repo.create_run(swarm_id, "manual")
        with pytest.raises(ValueError, match="not enabled"):
            runner.execute_run(run_id)

    def test_nonexistent_run_raises(self, runner):
        with pytest.raises(ValueError, match="not found"):
            runner.execute_run("nonexistent-run")
