# Memory and State Model

Process Swarm maintains state across four distinct subsystems: the SQLite
registry, the event recorder, the execution ledger, and GRITS baselines.
Each serves a different purpose and operates under different guarantees.

---

## 1. SQLite Registry -- the primary state store

**Module:** `swarm/registry/database.py` (`RegistryDatabase`)

The registry is a single SQLite database (`platform.db`) that holds all
platform-level state. It is organized into 30 tables across three
functional layers.

### Database configuration

- **WAL mode** (`PRAGMA journal_mode=WAL`) -- enables concurrent reads
  during writes and provides crash recovery.
- **Foreign keys enforced** (`PRAGMA foreign_keys=ON`) -- referential
  integrity is checked at the database level, not just application
  level.
- **Integrity checks** -- SwarmRunner runs `PRAGMA integrity_check` on
  startup and aborts if the database is corrupt.
- **Symlink rejection** -- the database path is checked for symlinks
  before connection, preventing symlink-based redirection attacks.

### Table inventory

**Tables 1-10: Core swarm lifecycle**

| # | Table | Purpose |
|---|---|---|
| 1 | `swarms` | Swarm definitions with lifecycle status, linked schedule/delivery/run IDs |
| 2 | `intent_drafts` | Raw intent text, revision tracking, session association |
| 3 | `intent_restatements` | AI-generated structured summaries with extracted actions and dependency graphs |
| 4 | `intent_acceptances` | Explicit human acceptance records binding a restatement to execution |
| 5 | `behavior_sequences` | Ordered step sequences, target paths, acceptance tests, evidence expectations |
| 6 | `swarm_schedules` | Trigger type, cron expression, timezone, next_run_at tracking |
| 7 | `swarm_deliveries` | Delivery type, destination, recipient profile, message template |
| 8 | `swarm_runs` | Run records with status, trigger source, artifact refs, error summaries |
| 9 | `delivery_receipts` | Per-delivery audit trail with provider message IDs and response summaries |
| 10 | `swarm_events` | Append-only event log (the primary audit table) |

**Tables 11-18: Capability-aware layer**

| # | Table | Purpose |
|---|---|---|
| 11 | `tool_registry` | Registered tools with maturity status, scope class, dry-run support |
| 12 | `swarm_actions` | Individual actions within a swarm with ordering, type, status, and confirmation requirements |
| 13 | `swarm_action_dependencies` | Directed dependency edges between actions (with self-reference prevention) |
| 14 | `action_tool_readiness` | Per-action tool matching results with confidence scores and constraint notes |
| 15 | `tool_scope_rules` | Allow/deny scope patterns per tool |
| 16 | `proposed_tools` | Tool proposals for actions that require new capabilities |
| 17 | `run_action_results` | Per-action execution results within a run |
| 18 | `artifact_refs` | Artifact references with digest, signer role, and owner tracking |

**Tables 19-30: Action tables, archetypes, and governance**

| # | Table | Purpose |
|---|---|---|
| 19 | `intent_archetypes` | Archetype classification of intents (12 recognized archetypes) with confidence and source |
| 20 | `constraint_sets` | Extracted constraints with resolution state and clarification tracking |
| 21 | `action_table_acceptances` | Explicit acceptance records for generated action tables |
| 22 | `governance_warning_records` | Full governance warning artifacts with severity, boundary, assurance posture, and decision fingerprints |
| 23 | `reduced_assurance_governance_events` | Records of governance actions taken under reduced assurance (same-actor multi-role) |
| 24 | `intent_clarifications` | Clarification questions and responses for ambiguous intents |
| 25 | `action_tables` | Generated action tables with status tracking (draft -> validated -> accepted -> compiled) |
| 26 | `archetype_classifications` | Detailed archetype classification artifacts with capability matching and dependency structure |
| 27 | `tool_match_sets` | Snapshot of tool matching results for an action table |
| 28 | `capability_families` | Capability family definitions with supported verbs and security classification |
| 29 | `tool_capability_family_bindings` | Many-to-many bindings between tools and capability families |
| 30 | `recipient_profiles` | Managed email recipient profiles with address validation, limits, and access controls |

### Referential consistency

Beyond foreign key constraints, `RegistryDatabase` provides
`verify_referential_consistency()` which runs explicit cross-table
orphan checks for:

- `swarm_runs` referencing nonexistent `swarms`
- `swarm_actions` referencing nonexistent `swarms`
- `intent_acceptances` referencing nonexistent `intent_restatements`
- `behavior_sequences` referencing nonexistent `swarms`
- `action_tool_readiness` referencing nonexistent `swarm_actions`

### Indexing

The registry maintains 40+ indexes covering status columns, foreign
keys, timestamp columns, and composite keys used by the scheduler and
event query paths.

---

## 2. Event Recorder -- the audit trail

**Module:** `swarm/events/recorder.py` (`EventRecorder`)

The EventRecorder writes structured events to the `swarm_events` table.
Events are append-only -- they are never updated or deleted.

### Event types (23+)

**Intent lifecycle:**
`draft_created`, `restatement_generated`, `intent_accepted`

**Swarm lifecycle:**
`swarm_created`, `swarm_enabled`, `swarm_paused`,
`swarm_submitted_for_review`, `swarm_approved`, `swarm_rejected`,
`swarm_returned_to_draft`, `swarm_activated`, `swarm_reactivated`,
`swarm_revoked`

**Run lifecycle:**
`run_queued`, `run_started`, `run_succeeded`, `run_failed`,
`preconditions_verified`, `execution_preconditions_verified`

**Delivery:**
`delivery_sent`, `delivery_failed`

**Governance:**
`governance_warning_recorded`, `reduced_assurance_governance_recorded`

**Capability and tools:**
`actions_generated`, `preflight_completed`, `action_updated`,
`tool_registered`

**Configuration changes:**
`schedule_config_changed`, `delivery_config_changed`

**Pipeline stages:**
`archetype_classified`, `constraints_extracted`,
`action_skeleton_loaded`, `action_table_specialized`,
`dependencies_assigned`, `tool_matching_completed`,
`action_table_reviewed`, `action_table_accepted`,
`pipeline_completed`

**Adaptive orchestrator:**
`adaptive_cycle_completed`

### Event structure

Every event contains:

| Field | Description |
|---|---|
| `event_id` | Unique identifier (UUID) |
| `swarm_id` | The swarm this event relates to |
| `event_type` | One of the defined event types |
| `event_time` | ISO 8601 timestamp |
| `actor_id` | Who/what caused the event |
| `summary` | Human-readable summary |
| `details_json` | Structured metadata (JSON) |
| `related_entity_type` | Type of related entity (e.g., "swarm_run", "intent_draft") |
| `related_entity_id` | ID of the related entity |

---

## 3. Execution Ledger -- append-only execution history

**Location:** `ledger/execution_ledger.log`

The execution ledger is a line-delimited JSON log file that records
runtime execution events. It is read by ProofUI's `ProofUIState` class
and displayed in the dashboard.

Unlike the `swarm_events` table (which tracks platform-level lifecycle
events), the ledger captures runtime-level execution details: what the
M4 pipeline actually did, what artifacts it produced, and what the
outcome was.

The ledger is append-only. Each line is a self-contained JSON object.
Lines that fail to parse as JSON are preserved as `{"raw": "<line>"}` to
prevent data loss.

---

## 4. GRITS Baselines -- drift reference points

**Location:** `grits/baselines/`

GRITS baselines are the known-good reference snapshots against which the
system's current state is compared. They are stored as files in the
`grits/baselines/` directory and loaded by reference ID (e.g.,
`"local_baseline_v1"`).

### Baseline lifecycle

1. A baseline is established by running diagnostics against a known-good
   system state and saving the results.
2. Subsequent GRITS runs load the baseline and compare current
   diagnostic results against it.
3. Differences produce drift signals, which are classified into findings
   with severity levels.
4. Findings drive recommendations and maintenance reports.

### Evidence persistence

Each GRITS run writes a complete evidence bundle to
`artifacts/grits/<run_id>/` containing seven artifact types:
`run_request`, `diagnostics`, `baseline_comparison`, `findings`,
`remediation`, `maintenance_report`, and `maintenance_report_md`.

---

## How state flows between layers

The system has three primary layers, and state flows between them
through well-defined interfaces:

### Registry <-> Bridge (Skill ABI, SwarmRunner)

The `SwarmRepository` is the data access layer that mediates all
registry interactions. Both the Skill ABI and SwarmRunner hold a
reference to the repository and use it for reads and writes. Atomic
operations use `repo.atomic()` context managers to ensure consistency.

```
Skill ABI  --[create/update]--> SwarmRepository --[SQL]--> SQLite
SwarmRunner --[read/verify]---> SwarmRepository --[SQL]--> SQLite
```

### Bridge <-> Runtime

SwarmRunner bridges to the runtime through two paths:

- **Adapter path:** Actions are executed directly via tool adapters
  (`AdapterRegistry`), with results written back to the registry.
- **Pipeline path:** A proposal JSON is written to a temp file and
  passed to `PipelineRunner`, which handles the full M4 runtime
  pipeline (signing, validation, lease, gate, execution).

```
SwarmRunner --[proposal JSON]--> PipelineRunner
                                     |
                              ExecutionGate.check()
                                     |
                              Runtime Executor
                                     |
                              Execution Ledger
```

### Runtime <-> Audit

Execution results flow back through two channels:

- **Registry updates:** SwarmRunner atomically updates `swarm_runs` with
  status, artifact refs, and error summaries after execution.
- **Event recording:** Every significant state change emits an event via
  `EventRecorder`, creating an immutable audit trail in `swarm_events`.
- **Ledger entries:** The runtime pipeline writes to the execution
  ledger for runtime-level detail.

### GRITS (independent loop)

GRITS operates independently of the execution pipeline. It reads
baselines from disk, runs diagnostics against the live system, and
writes evidence bundles to `artifacts/grits/`. It does not write to the
registry or modify any execution state. Its output is purely
informational -- maintenance reports and recommendations that inform
human operators.

---

## Summary of state stores

| Store | Format | Mutability | Purpose |
|---|---|---|---|
| SQLite registry | SQLite (WAL mode) | Read/write (governed) | Platform state, definitions, runs, events |
| Event table | SQLite rows | Append-only | Audit trail for all platform operations |
| Execution ledger | Line-delimited JSON | Append-only | Runtime execution history |
| GRITS baselines | JSON files on disk | Reference-only | Known-good state for drift detection |
| GRITS evidence | JSON files on disk | Write-once per run | Diagnostic evidence bundles |
| Artifact directory | JSON files on disk | Write-once per execution | Plans, validations, leases, proposals |
