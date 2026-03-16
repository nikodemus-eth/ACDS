"""Tests for the Swarm Registry repository CRUD layer."""

from __future__ import annotations

import sqlite3

import pytest

from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    """Provide a repository backed by a migrated in-memory database."""
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    r = SwarmRepository(db)
    yield r
    db.close()


# ──────────────────────────────────────────────
# Swarm CRUD
# ──────────────────────────────────────────────


class TestSwarmCRUD:
    def test_create_swarm(self, repo):
        sid = repo.create_swarm("Test Swarm", "A description", "user-1")
        assert sid.startswith("swarm-")

    def test_get_swarm(self, repo):
        sid = repo.create_swarm("Test", "Desc", "user-1")
        swarm = repo.get_swarm(sid)
        assert swarm is not None
        assert swarm["swarm_name"] == "Test"
        assert swarm["lifecycle_status"] == "drafting"
        assert swarm["created_by"] == "user-1"

    def test_get_nonexistent_swarm(self, repo):
        assert repo.get_swarm("nonexistent") is None

    def test_list_swarms(self, repo):
        repo.create_swarm("A", "d", "u")
        repo.create_swarm("B", "d", "u")
        swarms = repo.list_swarms()
        assert len(swarms) == 2

    def test_list_swarms_by_status(self, repo):
        sid = repo.create_swarm("A", "d", "u")
        repo.update_swarm(sid, lifecycle_status="enabled")
        repo.create_swarm("B", "d", "u")
        drafting = repo.list_swarms(status="drafting")
        enabled = repo.list_swarms(status="enabled")
        assert len(drafting) == 1
        assert len(enabled) == 1

    def test_update_swarm(self, repo):
        sid = repo.create_swarm("A", "d", "u")
        repo.update_swarm(sid, swarm_name="Updated")
        swarm = repo.get_swarm(sid)
        assert swarm["swarm_name"] == "Updated"


# ──────────────────────────────────────────────
# Intent lifecycle
# ──────────────────────────────────────────────


class TestIntentLifecycle:
    def test_create_intent_draft(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "Build a report", "user-1")
        assert did.startswith("draft-")

    def test_get_intent_draft(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "Build a report", "user-1")
        draft = repo.get_intent_draft(did)
        assert draft["raw_intent_text"] == "Build a report"
        assert draft["status"] == "draft"

    def test_get_latest_draft(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_intent_draft(sid, "First", "u")
        repo.create_intent_draft(sid, "Second", "u", revision_index=1)
        latest = repo.get_latest_draft(sid)
        assert latest["raw_intent_text"] == "Second"

    def test_fk_enforced_on_draft(self, repo):
        with pytest.raises(sqlite3.IntegrityError):
            repo.create_intent_draft("nonexistent", "text", "u")

    def test_create_restatement(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{"step": "1"}])
        assert rid.startswith("restatement-")

    def test_get_restatement(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(
            did, "Summary", [{"step": "1"}],
            expected_outputs=["report.pdf"],
            inferred_constraints={"scope": "local"},
        )
        r = repo.get_restatement(rid)
        assert r["human_readable_summary"] == "Summary"
        assert r["status"] == "proposed"

    def test_accept_intent(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{"step": "1"}])
        aid = repo.accept_intent(rid, "reviewer-1")
        assert aid.startswith("accept-")

        # Check cascading status updates
        r = repo.get_restatement(rid)
        assert r["status"] == "accepted"
        d = repo.get_intent_draft(did)
        assert d["status"] == "accepted_source"

    def test_get_acceptance(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{"step": "1"}])
        aid = repo.accept_intent(
            rid, "reviewer-1",
            accepted_actions=[{"action": "build"}],
            user_confirmation="yes",
        )
        acc = repo.get_acceptance(aid)
        assert acc["accepted_by"] == "reviewer-1"
        assert acc["action_count"] == 1


# ──────────────────────────────────────────────
# Behavior sequences
# ──────────────────────────────────────────────


class TestBehaviorSequence:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        seq_id = repo.create_behavior_sequence(
            sid, "bs-1",
            [{"op": "create", "path": "report.md"}],
            ["report.md"],
            [{"test": "exists"}],
        )
        assert seq_id.startswith("seq-")
        seq = repo.get_behavior_sequence(seq_id)
        assert seq["sequence_name"] == "bs-1"

    def test_get_by_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_behavior_sequence(
            sid, "bs-1", [{}], ["p"], [{}],
        )
        seq = repo.get_behavior_sequence_by_swarm(sid)
        assert seq is not None


# ──────────────────────────────────────────────
# Schedule
# ──────────────────────────────────────────────


class TestSchedule:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        sched_id = repo.create_schedule(sid, "immediate")
        assert sched_id.startswith("sched-")
        sched = repo.get_schedule(sched_id)
        assert sched["trigger_type"] == "immediate"
        assert sched["enabled"] == 1

    def test_get_due_schedules(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.update_swarm(sid, lifecycle_status="enabled")
        repo.create_schedule(sid, "deferred_once", run_at="2026-01-01T00:00:00")
        due = repo.get_due_schedules("2026-06-01T00:00:00")
        assert len(due) == 1

    def test_disable_schedule(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        sched_id = repo.create_schedule(sid, "immediate")
        repo.disable_schedule(sched_id)
        sched = repo.get_schedule(sched_id)
        assert sched["enabled"] == 0

    def test_update_next_run(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        sched_id = repo.create_schedule(sid, "recurring", cron_expression="0 9 * * *")
        repo.update_schedule_next_run(sched_id, "2026-03-15T09:00:00")
        sched = repo.get_schedule(sched_id)
        assert sched["next_run_at"] == "2026-03-15T09:00:00"

    def test_list_schedules(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_schedule(sid, "immediate")
        assert len(repo.list_schedules()) == 1


# ──────────────────────────────────────────────
# Delivery
# ──────────────────────────────────────────────


class TestDelivery:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_delivery(sid, "email", "user@example.com")
        assert did.startswith("dlvr-")
        d = repo.get_delivery(did)
        assert d["delivery_type"] == "email"

    def test_get_by_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_delivery(sid, "email", "user@example.com")
        d = repo.get_delivery_by_swarm(sid)
        assert d is not None


# ──────────────────────────────────────────────
# Runs
# ──────────────────────────────────────────────


class TestRuns:
    def test_create_run(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        assert rid.startswith("run-")

    def test_run_updates_latest_on_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        swarm = repo.get_swarm(sid)
        assert swarm["latest_run_id"] == rid

    def test_get_run(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        run = repo.get_run(rid)
        assert run["run_status"] == "queued"

    def test_update_run(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        repo.update_run(rid, run_status="completed")
        run = repo.get_run(rid)
        assert run["run_status"] == "completed"

    def test_list_runs(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_run(sid, "manual")
        repo.create_run(sid, "scheduled")
        runs = repo.list_runs(sid)
        assert len(runs) == 2

    def test_list_all_runs(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_run(sid, "manual")
        runs = repo.list_all_runs()
        assert len(runs) == 1

    def test_list_all_runs_by_status(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        repo.update_run(rid, run_status="completed")
        repo.create_run(sid, "manual")
        completed = repo.list_all_runs(status="completed")
        queued = repo.list_all_runs(status="queued")
        assert len(completed) == 1
        assert len(queued) == 1


# ──────────────────────────────────────────────
# Events
# ──────────────────────────────────────────────


class TestEvents:
    def test_record_event(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        eid = repo.record_event(sid, "swarm_created", "user-1", "Created swarm")
        assert eid.startswith("evt-")

    def test_list_events(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.record_event(sid, "swarm_created", "u", "Created")
        repo.record_event(sid, "run_started", "u", "Started")
        events = repo.list_events(sid)
        assert len(events) == 2

    def test_list_events_by_type(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.record_event(sid, "swarm_created", "u", "Created")
        repo.record_event(sid, "run_started", "u", "Started")
        events = repo.list_events(sid, event_type="swarm_created")
        assert len(events) == 1

    def test_list_all_events(self, repo):
        s1 = repo.create_swarm("S1", "d", "u")
        s2 = repo.create_swarm("S2", "d", "u")
        repo.record_event(s1, "swarm_created", "u", "c1")
        repo.record_event(s2, "swarm_created", "u", "c2")
        events = repo.list_all_events()
        assert len(events) == 2


# ──────────────────────────────────────────────
# Delivery Receipts
# ──────────────────────────────────────────────


class TestDeliveryReceipts:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_delivery(sid, "email", "user@example.com")
        rid = repo.create_run(sid, "manual")
        rcpt_id = repo.create_delivery_receipt(rid, did, "email", "sent")
        assert rcpt_id.startswith("rcpt-")
        rcpt = repo.get_delivery_receipt(rcpt_id)
        assert rcpt["delivery_status"] == "sent"


# ──────────────────────────────────────────────
# Atomic transactions
# ──────────────────────────────────────────────


class TestAtomic:
    def test_atomic_commits_together(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        with repo.atomic():
            repo.create_run(sid, "manual")
            repo.record_event(sid, "run_queued", "u", "Queued")
        runs = repo.list_runs(sid)
        events = repo.list_events(sid)
        assert len(runs) == 1
        assert len(events) == 1

    def test_atomic_rolls_back_on_error(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        try:
            with repo.atomic():
                repo.create_run(sid, "manual")
                raise ValueError("oops")
        except ValueError:
            pass
        runs = repo.list_runs(sid)
        assert len(runs) == 0
