# GRITS Operations Runbook

This runbook covers day-to-day operation of the GRITS (Generalized Runtime Integrity Testing System) worker, including startup, configuration, log interpretation, and incident response.

---

## STARTING_THE_WORKER

Launch the GRITS worker process:

```bash
pnpm --filter @acds/grits-worker run start
```

The worker registers its job schedules on startup and begins executing integrity checks according to the configured cadences.

For ad hoc operator use, prefer the explicit CLI entrypoints:

```bash
pnpm --filter @acds/grits-worker run grits:fast
pnpm --filter @acds/grits-worker run grits:pg:release
```

Fixture commands are for local/demo validation. The `grits:pg:*` commands are the real release posture.

---

## ENVIRONMENT_VARIABLES

| Variable | Default | Description |
|---|---|---|
| `GRITS_FAST_INTERVAL_MS` | `3600000` (1 hour) | Interval in milliseconds between fast-cadence runs. |
| `GRITS_DAILY_INTERVAL_MS` | `86400000` (24 hours) | Interval in milliseconds between daily-cadence runs. |
| `GRITS_RELEASE_MODE` | `undefined` | Set to `"true"` to enable the release cadence. When unset or any other value, release checks are disabled. |

All variables are read at worker startup. Changing a value requires restarting the worker.

---

## JOB_SCHEDULE

| Cadence | Frequency | Trigger |
|---|---|---|
| **fast** | Every hour (configurable via `GRITS_FAST_INTERVAL_MS`) | Automatic, on a recurring timer. |
| **daily** | Every 24 hours (configurable via `GRITS_DAILY_INTERVAL_MS`) | Automatic, on a recurring timer. |
| **release** | On-demand | Runs only when `GRITS_RELEASE_MODE` is set to `"true"`. Typically triggered as part of a release pipeline or manually before a deployment. |

The fast cadence covers lightweight, high-frequency invariants. The daily cadence runs the full invariant suite including heavier checks. The release cadence executes the complete suite with stricter thresholds and is intended as a release gate.

---

## INTERPRETING_LOG_OUTPUT

GRITS log lines are prefixed with tags that identify the source component:

| Prefix | Source | Description |
|---|---|---|
| `[grits-worker]` | Worker process | Lifecycle events: startup, shutdown, schedule registration. |
| `[grits-engine]` | Core engine | Invariant loading, evaluation orchestration, snapshot assembly. |
| `[grits-fast]` | Fast cadence job | Logs specific to fast-cadence runs. |
| `[grits-daily]` | Daily cadence job | Logs specific to daily-cadence runs. |
| `[grits-release]` | Release cadence job | Logs specific to release-cadence runs. |

### Typical Startup Sequence

```
[grits-worker] Starting GRITS worker...
[grits-worker] Registered fast cadence (interval: 3600000ms)
[grits-worker] Registered daily cadence (interval: 86400000ms)
[grits-worker] Ready.
```

---

## READING_SNAPSHOTS

Each cadence run produces an `IntegritySnapshot`. Focus on these fields:

### OVERALL_STATUS

- **green** -- All invariants passed or were skipped. No action required.
- **yellow** -- Warnings detected. Review the `results` array for invariants with `status: 'warn'`. These indicate emerging issues that do not yet violate hard thresholds.
- **red** -- Failures detected. At least one invariant has `status: 'fail'`. Immediate investigation is required.

### DEFECT_COUNTS

The `defectCount` object provides a quick severity breakdown:

```
{ critical: 0, high: 1, medium: 3, low: 0, info: 2 }
```

Use this to prioritize triage without reading every individual defect. See the RESPONDING_TO_DEFECTS section below for escalation guidance per severity level.

---

## READING_DRIFT_REPORTS

Drift reports compare two consecutive snapshots and surface changes in integrity posture.

### NET_DIRECTION

- **improved** -- The system's integrity posture got better. Fewer defects or invariant statuses moved toward `pass`.
- **degraded** -- The system's integrity posture got worse. New defects appeared or invariant statuses moved toward `fail`.
- **unchanged** -- No change between snapshots.

### PER_INVARIANT_DRIFT

Each entry in the `drifts` array shows:

- `previousStatus` and `currentStatus` for a single invariant.
- `direction` indicating whether that specific invariant improved, degraded, or was unchanged.
- `newDefects` listing defects that appeared since the last snapshot.
- `resolvedDefects` listing defects that are no longer present.

When `netDirection` is `degraded`, examine individual `drifts` entries to identify which invariants regressed and review their `newDefects` for root-cause evidence.

---

## RESPONDING_TO_DEFECTS

Defect severity determines the expected response time and escalation path:

| Severity | Response Time | Action |
|---|---|---|
| **critical** | Immediate | Drop current work and investigate. A critical defect indicates a live integrity violation that may affect production correctness, data consistency, or system safety. Page the on-call engineer. |
| **high** | Same day | Investigate and resolve within the current working day. High-severity defects represent significant integrity risks that will escalate if left unaddressed. |
| **medium** | Next sprint | Schedule investigation and resolution in the next sprint planning cycle. Medium defects are real issues but do not pose an immediate threat. |
| **low** | Backlog | Add to the backlog for resolution when capacity allows. Low-severity defects are minor issues with limited impact. |
| **info** | Backlog | Informational findings that may not require any action. Review periodically and resolve opportunistically. |

### ESCALATION_GUIDELINES

1. If a snapshot returns `overallStatus: 'red'` with any `critical` defects, treat it as a production incident.
2. If a drift report shows `netDirection: 'degraded'` with new `critical` or `high` defects, investigate whether a recent deployment caused the regression.
3. If `overallStatus` has been `yellow` for three or more consecutive daily snapshots, escalate the underlying warnings to `high` priority to prevent drift toward `red`.

---

## GRACEFUL_SHUTDOWN

The GRITS worker handles the following signals for graceful shutdown:

- **SIGINT** (Ctrl+C) -- Initiates graceful shutdown. The worker finishes any in-progress invariant check, writes the partial snapshot, and exits.
- **SIGTERM** -- Same behavior as SIGINT. Used by process managers and container orchestrators.

During shutdown, expect log output like:

```
[grits-worker] Received SIGTERM, shutting down gracefully...
[grits-worker] Waiting for in-progress checks to complete...
[grits-worker] Shutdown complete.
```

If the worker does not exit within a reasonable timeout (default: 30 seconds), the process manager may force-kill it. In-progress checks that were interrupted will not produce a snapshot; the next scheduled run will re-evaluate those invariants.
