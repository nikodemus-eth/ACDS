"""Schedule evaluator for Process Swarm.

Evaluates due schedules from the registry and creates
run records for execution by the SwarmRunner.

Supports three trigger types:
  - immediate: Run now (no scheduling needed)
  - deferred_once: Run once at a specified time
  - recurring: Run on a cron schedule
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from swarm.events.recorder import EventRecorder
from swarm.registry.repository import SwarmRepository


class ScheduleEvaluator:
    """Evaluates due schedules and creates run records.

    Queries the registry for schedules where next_run_at has passed,
    creates run records, and updates the next run time for
    recurring schedules.
    """

    def __init__(
        self,
        repository: SwarmRepository,
        event_recorder: EventRecorder,
    ):
        self.repo = repository
        self.events = event_recorder

    def evaluate_due_schedules(
        self,
        current_time: Optional[str] = None,
    ) -> list[str]:
        """Find due schedules, create run records, return run IDs.

        For each due schedule:
        1. Verify the parent swarm is in 'enabled' status
        2. Create a swarm_run with trigger_source='schedule'
        3. Record a run_queued event
        4. Update schedule next_run_at (recurring) or disable (deferred_once)
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc).isoformat()

        due_schedules = self.repo.get_due_schedules(current_time)
        run_ids = []

        for schedule in due_schedules:
            swarm_id = schedule["swarm_id"]
            schedule_id = schedule["schedule_id"]
            trigger_type = schedule["trigger_type"]

            with self.repo.atomic():
                run_id = self.repo.create_run(
                    swarm_id=swarm_id,
                    trigger_source="schedule",
                    created_by_trigger=schedule_id,
                )

                self.events.run_queued(
                    swarm_id=swarm_id,
                    run_id=run_id,
                    trigger_source="schedule",
                )

                if trigger_type == "deferred_once":
                    self.repo.disable_schedule(schedule_id)
                    self.repo.update_schedule_next_run(schedule_id, None)
                elif trigger_type == "recurring":
                    next_run = self.compute_next_run(schedule)
                    self.repo.update_schedule_next_run(schedule_id, next_run)
                else:
                    self.repo.disable_schedule(schedule_id)
                    self.repo.update_schedule_next_run(schedule_id, None)

            run_ids.append(run_id)

        return run_ids

    def compute_next_run(self, schedule: dict) -> Optional[str]:
        """Compute the next run time for a recurring schedule."""
        cron = schedule.get("cron_expression")
        if not cron:
            return None

        current_next = schedule.get("next_run_at")
        if current_next:
            try:
                base_time = datetime.fromisoformat(current_next)
            except (ValueError, TypeError):
                base_time = datetime.now(timezone.utc)
        else:
            base_time = datetime.now(timezone.utc)

        return _next_cron_time(cron, base_time)


def _next_cron_time(cron_expression: str, after: datetime) -> Optional[str]:
    """Compute the next occurrence of a cron expression after a given time.

    Supports standard 5-field cron format:
        minute hour day_of_month month day_of_week
    """
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        return None

    minute_spec, hour_spec, dom_spec, month_spec, dow_spec = parts

    minutes = _parse_cron_field(minute_spec, 0, 59)
    hours = _parse_cron_field(hour_spec, 0, 23)
    doms = _parse_cron_field(dom_spec, 1, 31)
    months = _parse_cron_field(month_spec, 1, 12)
    dows = _parse_cron_field(dow_spec, 0, 6)

    if not all([minutes, hours, doms, months, dows]):
        return None

    candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    max_time = after + timedelta(days=366)

    while candidate <= max_time:
        if candidate.month not in months:
            candidate = _advance_to_next_month(candidate, months)
            continue

        if candidate.day not in doms:
            candidate = candidate.replace(hour=0, minute=0) + timedelta(days=1)
            continue

        # Python: Monday=0 .. Sunday=6
        python_dow = candidate.weekday()
        if python_dow not in dows:
            candidate = candidate.replace(hour=0, minute=0) + timedelta(days=1)
            continue

        if candidate.hour not in hours:
            candidate = candidate.replace(minute=0) + timedelta(hours=1)
            continue

        if candidate.minute not in minutes:
            candidate += timedelta(minutes=1)
            continue

        return candidate.isoformat()

    return None


def _parse_cron_field(spec: str, min_val: int, max_val: int) -> set[int]:
    """Parse a single cron field into a set of valid integers.

    Supports: *, specific values, ranges, lists, step values.
    """
    result: set[int] = set()

    for part in spec.split(","):
        part = part.strip()

        if "/" in part:
            range_part, step_str = part.split("/", 1)
            try:
                step = int(step_str)
            except ValueError:
                continue

            if range_part == "*":
                start, end = min_val, max_val
            elif "-" in range_part:
                s, e = range_part.split("-", 1)
                start, end = int(s), int(e)
            else:
                start = int(range_part)
                end = max_val

            for v in range(start, end + 1, step):
                if min_val <= v <= max_val:
                    result.add(v)

        elif part == "*":
            result = set(range(min_val, max_val + 1))
            return result

        elif "-" in part:
            s, e = part.split("-", 1)
            for v in range(int(s), int(e) + 1):
                if min_val <= v <= max_val:
                    result.add(v)

        else:
            try:
                v = int(part)
                if min_val <= v <= max_val:
                    result.add(v)
            except ValueError:
                continue

    return result


def _advance_to_next_month(dt: datetime, valid_months: set[int]) -> datetime:
    """Advance a datetime to the start of the next valid month."""
    candidate = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    for _ in range(13):
        if candidate.month == 12:
            candidate = candidate.replace(year=candidate.year + 1, month=1)
        else:
            candidate = candidate.replace(month=candidate.month + 1)

        if candidate.month in valid_months:
            return candidate

    return dt + timedelta(days=366)
