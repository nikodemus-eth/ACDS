"""Tests for the schedule evaluator."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository
from swarm.scheduler.evaluator import (
    ScheduleEvaluator,
    _next_cron_time,
    _parse_cron_field,
)


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
def evaluator(repo, events):
    return ScheduleEvaluator(repo, events)


@pytest.fixture
def enabled_swarm(repo):
    """Create a swarm in 'enabled' status."""
    swarm_id = repo.create_swarm("Test Swarm", "A test", "user-1")
    repo.update_swarm(swarm_id, lifecycle_status="enabled")
    return swarm_id


# ──────────────────────────────────────────────
# Schedule evaluation tests
# ──────────────────────────────────────────────


class TestScheduleEvaluator:
    def test_immediate_schedule_creates_run(self, evaluator, repo, enabled_swarm):
        repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="immediate",
            next_run_at="2026-03-09T08:00:00+00:00",
        )
        run_ids = evaluator.evaluate_due_schedules("2026-03-09T09:00:00+00:00")
        assert len(run_ids) == 1
        run = repo.get_run(run_ids[0])
        assert run["trigger_source"] == "schedule"
        assert run["run_status"] == "queued"

    def test_deferred_once_disabled_after_fire(self, evaluator, repo, enabled_swarm):
        sched_id = repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="deferred_once",
            run_at="2026-03-09T10:00:00+00:00",
            next_run_at="2026-03-09T10:00:00+00:00",
        )
        evaluator.evaluate_due_schedules("2026-03-09T11:00:00+00:00")
        sched = repo.get_schedule(sched_id)
        assert sched["enabled"] == 0
        assert sched["next_run_at"] is None

    def test_recurring_computes_next_run(self, evaluator, repo, enabled_swarm):
        sched_id = repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="recurring",
            cron_expression="0 9 * * *",
            next_run_at="2026-03-09T09:00:00+00:00",
        )
        evaluator.evaluate_due_schedules("2026-03-09T09:30:00+00:00")
        sched = repo.get_schedule(sched_id)
        assert sched["next_run_at"] is not None
        assert "2026-03-10" in sched["next_run_at"]

    def test_not_due_yet(self, evaluator, repo, enabled_swarm):
        repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="deferred_once",
            next_run_at="2026-03-10T10:00:00+00:00",
        )
        run_ids = evaluator.evaluate_due_schedules("2026-03-09T09:00:00+00:00")
        assert len(run_ids) == 0

    def test_disabled_swarm_skipped(self, evaluator, repo):
        swarm_id = repo.create_swarm("Disabled", "desc", "user")
        repo.create_schedule(
            swarm_id=swarm_id,
            trigger_type="immediate",
            next_run_at="2020-01-01T00:00:00+00:00",
        )
        run_ids = evaluator.evaluate_due_schedules("2026-03-09T09:00:00+00:00")
        assert len(run_ids) == 0

    def test_multiple_due_schedules(self, evaluator, repo, enabled_swarm):
        repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="deferred_once",
            next_run_at="2026-03-09T08:00:00+00:00",
        )
        repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="deferred_once",
            next_run_at="2026-03-09T08:30:00+00:00",
        )
        run_ids = evaluator.evaluate_due_schedules("2026-03-09T09:00:00+00:00")
        assert len(run_ids) == 2

    def test_events_recorded(self, evaluator, repo, events, enabled_swarm):
        repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="immediate",
            next_run_at="2026-03-09T08:00:00+00:00",
        )
        evaluator.evaluate_due_schedules("2026-03-09T09:00:00+00:00")
        evts = repo.list_events(enabled_swarm, event_type="run_queued")
        assert len(evts) == 1


# ──────────────────────────────────────────────
# Cron parsing tests
# ──────────────────────────────────────────────


class TestCronParsing:
    def test_parse_star(self):
        result = _parse_cron_field("*", 0, 59)
        assert result == set(range(0, 60))

    def test_parse_specific_value(self):
        result = _parse_cron_field("5", 0, 59)
        assert result == {5}

    def test_parse_range(self):
        result = _parse_cron_field("1-5", 0, 59)
        assert result == {1, 2, 3, 4, 5}

    def test_parse_list(self):
        result = _parse_cron_field("1,3,5", 0, 59)
        assert result == {1, 3, 5}

    def test_parse_step(self):
        result = _parse_cron_field("*/15", 0, 59)
        assert result == {0, 15, 30, 45}

    def test_parse_range_step(self):
        result = _parse_cron_field("0-10/2", 0, 59)
        assert result == {0, 2, 4, 6, 8, 10}

    def test_next_cron_daily(self):
        base = datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc)
        result = _next_cron_time("0 9 * * *", base)
        assert result is not None
        dt = datetime.fromisoformat(result)
        assert dt.hour == 9
        assert dt.minute == 0
        assert dt.day == 10

    def test_next_cron_weekday(self):
        # 2026-03-09 is a Monday (weekday 0)
        base = datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc)
        result = _next_cron_time("0 9 * * 0-4", base)  # Mon-Fri
        assert result is not None
        dt = datetime.fromisoformat(result)
        assert dt.day == 10

    def test_next_cron_invalid_format(self):
        base = datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc)
        result = _next_cron_time("invalid", base)
        assert result is None

    def test_compute_next_run(self, evaluator, enabled_swarm, repo):
        sched_id = repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="recurring",
            cron_expression="0 9 * * *",
            next_run_at="2026-03-09T09:00:00+00:00",
        )
        schedule = repo.get_schedule(sched_id)
        next_run = evaluator.compute_next_run(schedule)
        assert next_run is not None
        assert "09:00" in next_run

    def test_compute_next_run_no_cron(self, evaluator, enabled_swarm, repo):
        sched_id = repo.create_schedule(
            swarm_id=enabled_swarm,
            trigger_type="deferred_once",
        )
        schedule = repo.get_schedule(sched_id)
        assert evaluator.compute_next_run(schedule) is None

    def test_parse_out_of_range_ignored(self):
        result = _parse_cron_field("99", 0, 59)
        assert result == set()

    def test_monthly_schedule(self):
        base = datetime(2026, 3, 9, 0, 0, tzinfo=timezone.utc)
        result = _next_cron_time("0 0 1 * *", base)
        assert result is not None
        dt = datetime.fromisoformat(result)
        assert dt.day == 1
        assert dt.month == 4
