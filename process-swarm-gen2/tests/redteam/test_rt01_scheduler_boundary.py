"""RT-01: Scheduler boundary tests.

Verify the scheduler only emits triggers, never executable intent.
"""
from __future__ import annotations

import inspect
from datetime import datetime, timezone, timedelta

import pytest

from swarm.scheduler.evaluator import ScheduleEvaluator
from swarm.events.recorder import EventRecorder
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def evaluator(repo, events):
    return ScheduleEvaluator(repo, events)


def _past_time():
    """Return an ISO datetime string in the past."""
    return (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()


class TestSchedulerBoundary:
    """RT-01: The scheduler must only emit triggers, never executable intent."""

    def test_no_runtime_imports_in_evaluator(self):
        """ScheduleEvaluator module must not import runtime modules."""
        source = inspect.getsource(ScheduleEvaluator)
        forbidden = ["runtime.pipeline", "runtime.gate", "runtime.executor", "runtime.engine"]
        for module in forbidden:
            assert module not in source, (
                f"ScheduleEvaluator source contains forbidden runtime import: {module}"
            )

    def test_evaluator_only_imports_platform_modules(self):
        """Evaluator should only import platform (swarm.*) modules, not runtime modules."""
        module = inspect.getmodule(ScheduleEvaluator)
        source = inspect.getsource(module)
        # Must not import from runtime
        assert "from runtime" not in source, (
            "Evaluator module imports from runtime package"
        )
        assert "import runtime" not in source, (
            "Evaluator module imports runtime package"
        )

    def test_evaluator_has_no_execute_or_run_methods(self):
        """ScheduleEvaluator must not have execute/run methods."""
        forbidden_methods = ["execute", "run", "invoke", "start_run", "execute_run"]
        for method_name in forbidden_methods:
            assert not hasattr(ScheduleEvaluator, method_name), (
                f"ScheduleEvaluator has forbidden method: {method_name}"
            )

    def test_evaluate_due_schedules_returns_run_ids(self, evaluator, repo, events, enabled_swarm):
        """evaluate_due_schedules must return a list of run_id strings."""
        schedule_id = repo.create_schedule(enabled_swarm, trigger_type="immediate")
        repo.update_swarm(enabled_swarm, schedule_id=schedule_id)
        repo.update_schedule_next_run(schedule_id, _past_time())

        result = evaluator.evaluate_due_schedules()

        assert isinstance(result, list)
        assert len(result) > 0
        for run_id in result:
            assert isinstance(run_id, str)

    def test_scheduled_runs_stay_queued(self, evaluator, repo, events, enabled_swarm):
        """Scheduled runs must remain in 'queued' status after evaluation."""
        schedule_id = repo.create_schedule(enabled_swarm, trigger_type="immediate")
        repo.update_swarm(enabled_swarm, schedule_id=schedule_id)
        repo.update_schedule_next_run(schedule_id, _past_time())

        run_ids = evaluator.evaluate_due_schedules()

        for run_id in run_ids:
            run = repo.get_run(run_id)
            assert run["run_status"] == "queued", (
                f"Run {run_id} has status '{run['run_status']}', expected 'queued'"
            )

    def test_scheduled_runs_have_trigger_source_schedule(self, evaluator, repo, events, enabled_swarm):
        """Scheduled runs must have trigger_source='schedule'."""
        schedule_id = repo.create_schedule(enabled_swarm, trigger_type="immediate")
        repo.update_swarm(enabled_swarm, schedule_id=schedule_id)
        repo.update_schedule_next_run(schedule_id, _past_time())

        run_ids = evaluator.evaluate_due_schedules()

        for run_id in run_ids:
            run = repo.get_run(run_id)
            assert run["trigger_source"] == "schedule", (
                f"Run {run_id} has trigger_source '{run['trigger_source']}', expected 'schedule'"
            )

    def test_scheduler_emits_run_queued_event(self, evaluator, repo, events, enabled_swarm):
        """Scheduler must emit a run_queued event."""
        schedule_id = repo.create_schedule(enabled_swarm, trigger_type="immediate")
        repo.update_swarm(enabled_swarm, schedule_id=schedule_id)
        repo.update_schedule_next_run(schedule_id, _past_time())

        run_ids = evaluator.evaluate_due_schedules()

        assert len(run_ids) > 0
        all_events = repo.list_events(swarm_id=enabled_swarm)
        event_types = [e["event_type"] for e in all_events]
        assert "run_queued" in event_types, (
            f"Expected 'run_queued' event but found: {event_types}"
        )

    def test_scheduler_does_not_emit_execution_events(self, evaluator, repo, events, enabled_swarm):
        """Scheduler must not emit execution events (run_started, run_succeeded, run_failed)."""
        schedule_id = repo.create_schedule(enabled_swarm, trigger_type="immediate")
        repo.update_swarm(enabled_swarm, schedule_id=schedule_id)
        repo.update_schedule_next_run(schedule_id, _past_time())

        evaluator.evaluate_due_schedules()

        all_events = repo.list_events(swarm_id=enabled_swarm)
        event_types = [e["event_type"] for e in all_events]
        forbidden_events = ["run_started", "run_succeeded", "run_failed"]
        for forbidden in forbidden_events:
            assert forbidden not in event_types, (
                f"Scheduler emitted forbidden execution event: {forbidden}"
            )
