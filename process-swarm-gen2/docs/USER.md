# Process Swarm User Guide

This guide covers how to create, configure, and manage swarms from a
user's perspective.

---

## Creating a swarm

Swarms are created through the Skill ABI (`swarm/abi/api.py`). The
`create_swarm_definition()` method is the primary entry point:

```python
from swarm.abi.api import SwarmSkillABI

abi = SwarmSkillABI(repo, events, workspace_root="/path/to/workspace")

result = abi.create_swarm_definition(
    name="Weekly Status Report",
    description="Generate a weekly status report from project data",
    step_outline=[
        "Gather project metrics from the database",
        "Compile metrics into a structured report",
        "Format the report as PDF",
    ],
    created_by="alice",
    schedule_policy={
        "trigger_type": "recurring",
        "cron_expression": "0 9 * * 1",   # every Monday at 09:00
        "timezone": "America/New_York",
    },
    delivery_policy={
        "delivery_type": "email",
        "destination": "team@example.com",
    },
)
```

The result contains `swarm_id`, `draft_id`, `schedule_id`, and
`delivery_id`. Schedule and delivery are optional -- pass `None` or
omit them to configure later.

---

## The lifecycle: from drafting to enabled

Every swarm begins in `drafting` state and must pass through a governed
review pipeline before it can execute:

```
drafting --> reviewing --> approved --> enabled
```

Each transition requires a specific role:

1. **Author** submits the draft for review (`drafting -> reviewing`).
2. **Reviewer** approves or rejects the swarm (`reviewing -> approved`
   or `reviewing -> rejected`).
3. **Publisher** enables the approved swarm for execution
   (`approved -> enabled`).

Additional transitions:

- `enabled -> paused` (publisher) -- temporarily suspend execution.
- `paused -> enabled` (publisher) -- resume execution.
- Any non-terminal state -> `revoked` (publisher) -- permanently
  deactivate.
- `rejected -> drafting` (author) -- return to editing.

Governance warnings may be raised during transitions. Warnings with
`block` severity halt the transition entirely. Warnings with `warn`
severity require explicit acknowledgment -- the user must reference
the warning IDs and provide an override reason before the transition
proceeds.

### Updating a swarm

Use `update_swarm_definition()` to modify a swarm's fields. This only
works in `drafting` or `rejected` state. Attempting to update an
in-review or enabled swarm is rejected. The `lifecycle_status` field
cannot be set through the ABI -- use the governance lifecycle methods.

### Archiving a swarm

Call `archive_swarm(swarm_id, actor_id)` to revoke a swarm permanently.
This transitions the swarm to the terminal `revoked` state.

---

## How scheduling works

**Module:** `swarm/scheduler/evaluator.py`

The `ScheduleEvaluator` supports three trigger types:

| Trigger type | Behavior |
|---|---|
| `immediate` | Run now; schedule is disabled after firing |
| `deferred_once` | Run once at a specified `run_at` time; disabled after firing |
| `recurring` | Run on a cron schedule; `next_run_at` is recomputed after each firing |

### Cron format

Recurring schedules use standard 5-field cron notation:

```
minute  hour  day_of_month  month  day_of_week
```

All standard features are supported: wildcards (`*`), ranges (`1-5`),
lists (`1,3,5`), and step values (`*/15`).

### Evaluation cycle

When `evaluate_due_schedules()` runs (typically called by SwarmRunner's
`process_scheduled_runs()`):

1. Query the registry for schedules where `next_run_at` has passed and
   `enabled = 1`.
2. For each due schedule, verify the parent swarm is `enabled`.
3. Create a `swarm_run` record with `trigger_source='schedule'`.
4. Record a `run_queued` event.
5. Update the schedule: disable it (for one-shot triggers) or compute
   the next run time (for recurring triggers).

All operations within a single schedule evaluation are atomic.

### Configuring a schedule

Via the ABI:

```python
schedule_id = abi.configure_schedule(swarm_id, {
    "trigger_type": "recurring",
    "cron_expression": "30 8 * * 1-5",  # weekdays at 08:30
    "timezone": "UTC",
})
```

Or for a one-time deferred run:

```python
schedule_id = abi.configure_schedule(swarm_id, {
    "trigger_type": "deferred_once",
    "run_at": "2026-04-01T10:00:00+00:00",
})
```

---

## How delivery works

**Module:** `swarm/delivery/engine.py`

The `DeliveryEngine` dispatches execution results to configured channels
after a swarm run completes. It is strictly downstream from the runtime
and must not modify runtime artifacts.

### Supported channels

| Channel | Adapter |
|---|---|
| Email | `EmailAdapter` (SMTP) |
| Telegram | `TelegramAdapter` |

### Delivery flow

1. Look up the run and its parent swarm.
2. Resolve the delivery configuration (from `swarm_deliveries` table).
3. Run the **secondary truth policy check** -- if block-level warnings
   are produced, delivery is suppressed and the warning is persisted.
4. Resolve recipient profiles (for email), validating addresses and
   enforcing recipient limits.
5. Build the delivery message from a template or default format.
6. Dispatch via the appropriate adapter.
7. Record a `delivery_receipt` and update the run's `delivery_status`.

### Configuring delivery

Via the ABI:

```python
delivery_id = abi.configure_delivery(swarm_id, {
    "delivery_type": "email",
    "destination": "ops@example.com",
})
```

### Message format

The default message includes swarm name, run ID, status, error summary
(if failed), and artifact references. Custom templates can be specified
via the `message_template` field in the delivery configuration, using
`{swarm_name}`, `{run_id}`, `{status}`, and `{artifact_list}` as
placeholders.

### Delivery receipts

Every delivery attempt (success or failure) creates a receipt in the
`delivery_receipts` table with the provider's message ID and response
summary. This enables audit and troubleshooting.

---

## Using ProofUI

**Module:** `proof_ui/server.py`

ProofUI is a self-contained, read-only admin console and dashboard
served as a single-page web application over HTTP.

### Starting the server

```python
from proof_ui.server import start_server
start_server(root="/path/to/openclaw", port=18790)
```

Or access it at `http://localhost:18790/console` after startup.

### Dashboard views

| View | What it shows |
|---|---|
| **Dashboard** | Execution counts, pass rate, active leases, plans, proposals, recent runs |
| **Swarms** | All swarm definitions with name, ID, lifecycle status, creation time |
| **Swarm Detail** | Full swarm metadata, governance warnings, event history |
| **Runs** | All run records with status and trigger time |
| **Events** | Full event log with type, swarm, summary, and timestamp |
| **Tools** | Registered tools with family, maturity status, and dry-run support |
| **Settings** | Node identity, role, environment, and status |

### API endpoints

ProofUI exposes a JSON API for programmatic access:

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Dashboard statistics |
| GET | `/api/swarms` | List all swarms (optional `?status=` filter) |
| GET | `/api/swarm/<id>` | Swarm detail with warnings and events |
| GET | `/api/swarm/<id>/runs` | Runs for a specific swarm |
| GET | `/api/swarm/<id>/events` | Events for a specific swarm |
| GET | `/api/runs` | List all runs (`?status=`, `?limit=`) |
| GET | `/api/run/<id>` | Run detail |
| GET | `/api/events` | List all events (`?event_type=`, `?limit=`) |
| GET | `/api/tools` | List registered tools |
| GET | `/api/schedules` | List all schedules |
| GET | `/api/ledger` | Execution ledger entries |
| POST | `/api/swarm/create` | Create a new swarm |
| POST | `/api/swarm/transition` | Trigger a lifecycle transition |
| POST | `/api/swarm/run` | Create a new run |
| POST | `/api/swarm/schedule` | Configure a schedule |
| POST | `/api/swarm/delivery` | Configure delivery |

### Data sources

ProofUI reads from two sources:

- **SQLite registry** (`platform.db`) -- for swarm definitions, runs,
  events, tools, schedules, and delivery configurations.
- **Disk artifacts** (`artifacts/` directory) -- for execution records,
  plans, validation results, leases, and the execution ledger.

---

## Job authoring with process_swarm

**Module:** `process_swarm/scripts/compile_intent.py`

The `compile_from_intent()` function provides a complete pipeline for
turning natural-language intent into validated, executable job
definitions.

### Pipeline

```
intent text --> classify --> extract --> merge --> generate --> compile --> plan
```

### Usage

```python
from process_swarm.scripts.compile_intent import compile_from_intent

result = compile_from_intent(
    schema_path="/path/to/job_schema.json",
    intent_text="Generate a weekly financial summary with charts",
    max_repairs=2,
    do_plan=True,
    output_dir="/path/to/output",
)
```

### Parameters

| Parameter | Description |
|---|---|
| `schema_path` | Path to the JSON schema that defines valid job structures |
| `intent_text` | Natural-language description of what the job should do |
| `max_repairs` | Maximum number of validation-repair cycles (default 2) |
| `do_plan` | Whether to generate an execution plan after compilation |
| `output_dir` | Directory for intermediate artifacts (candidate job, final job, plan) |

### Result

The function returns a dictionary with:

- `status` -- `"accepted"` if the job compiled successfully.
- `candidate_job_path` -- path to the initial generated job.
- `final_job_path` -- path to the validated and repaired job.
- `execution_plan_path` -- path to the execution plan (if `do_plan=True`).
- `attempt_count` -- number of compile-repair cycles used.
- `validation_errors` -- any remaining validation errors.
- `assumptions` -- assumptions the system made during generation.

### Reference data

The pipeline loads four reference files automatically:

- `classes/job_classes.json` -- known job class definitions.
- `classes/job_class_defaults.json` -- default parameter values per class.
- `extraction/parameter_patterns.json` -- patterns for extracting
  parameters from natural language.
- The job schema provided via `schema_path`.
