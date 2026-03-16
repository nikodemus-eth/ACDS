# Agents in Process Swarm

Process Swarm is built on an agent/actor model where each agent has a
clearly bounded role, constrained authority, and no ability to bypass the
governance trust chain. This document describes the four primary agents
and the rules that govern their interactions.

---

## 1. Skill ABI -- the agent-facing gateway

**Module:** `swarm/abi/api.py` (`SwarmSkillABI`)

The Skill ABI is the only surface through which external skills (Claude
skills, automation scripts, UI actions) interact with the swarm platform.
It is a **definition-only** gateway: skills may create, inspect, and revise
Process Swarm artifacts, but they cannot execute tools, bypass governance,
inject unsigned execution plans, or modify the artifact ledger directly.

### What the ABI permits

| Operation | Method |
|---|---|
| Create a swarm definition | `create_swarm_definition()` |
| Configure scheduling | `configure_schedule()` |
| Configure delivery | `configure_delivery()` |
| Preview an execution plan | `preview_execution()` |
| List / get swarm definitions | `list_swarms()`, `get_swarm_definition()` |
| Update a draft or rejected swarm | `update_swarm_definition()` |
| Archive (revoke) a swarm | `archive_swarm()` |

### What the ABI blocks

- **Lifecycle status changes** -- attempting to set `lifecycle_status`
  through `update_swarm_definition()` raises an error. Governance
  transitions must go through `LifecycleManager`.
- **Updates to non-draft swarms** -- a swarm can only be edited while in
  `drafting` or `rejected` state. Once it enters the review/approval
  pipeline, the ABI refuses modifications.
- **Direct execution** -- the ABI has no `run()` method. Execution is the
  domain of `SwarmRunner`.

### Version negotiation

The ABI supports explicit version negotiation via
`negotiate_version(requested_version)`. Only versions in
`_SUPPORTED_ABI_VERSIONS` (currently `{"0.1"}`) are accepted. This
prevents future incompatible skills from silently producing corrupt
artifacts.

---

## 2. SwarmRunner -- the orchestration agent

**Module:** `swarm/runner.py` (`SwarmRunner`)

SwarmRunner is the top-level orchestrator that bridges the platform layer
(registry, compiler, scheduler) to the runtime kernel. Its docstring
captures the key philosophy:

> The database is a coordination store, not a trust anchor. All critical
> state is recomputed from scratch before execution.

### Lifecycle managed by SwarmRunner

```
Registry --> Compiler --> Runtime Pipeline --> Delivery --> Audit
```

### Initialization (fail-closed)

On startup SwarmRunner:

1. Connects to the SQLite registry database.
2. Runs schema migrations.
3. Performs a `PRAGMA integrity_check` -- if it fails, the runner
   **aborts immediately** rather than operating on a corrupt store.
4. Initializes core components: `SwarmRepository`, `EventRecorder`,
   `BehaviorSequenceCompiler`, `DeliveryEngine`, `ScheduleEvaluator`,
   and `AdapterRegistry`.

### Execution preconditions

Before any run executes, `_verify_execution_preconditions()` confirms:

- The swarm exists and its `lifecycle_status` is `enabled`.
- A behavior sequence exists and is non-empty.
- The run record is in `queued` status.

If any check fails, execution is refused. There is no fallback.

### Execution paths

SwarmRunner classifies each run into one of three paths based on the
operation types present in the behavior sequence steps:

| Path | Condition | Mechanism |
|---|---|---|
| Pure adapter | Only `invoke_capability` steps | `_execute_via_adapters()` |
| Mixed | Both adapter and filesystem steps | Adapters first, then M4 pipeline |
| M4 pipeline | No adapter steps | `_execute_via_pipeline()` via `PipelineRunner` |

All execution results, artifacts, and errors are recorded atomically.
Delivery is attempted after every completed run, and delivery failures
are logged but do not fail the run itself.

### Scheduled execution

`process_scheduled_runs()` delegates to the `ScheduleEvaluator` to find
due schedules, then executes each resulting run in sequence.

---

## 3. Adaptive Orchestrator -- the improvement agent

**Module:** `swarm/adaptive/orchestrator.py` (`AdaptiveOrchestrator`)

The Adaptive Orchestrator wraps SwarmRunner with an improvement-driven
feedback loop. It manages multiple execution branches, scores their
outputs, and makes scheduling decisions to converge on quality targets.

### Core loop

```
for each cycle (up to max_cycles):
    for each active branch:
        1. Execute branch actions via SwarmRunner adapters
        2. Score the result with BranchEvaluator
        3. Record the score in ImprovementLedger
        4. Ask AdaptiveScheduler for a decision
    Apply decisions (continue, terminate, reroute)
    Check convergence
```

### Scheduling decisions

The `AdaptiveScheduler` produces one of three decisions per branch:

| Decision | Effect |
|---|---|
| `CONTINUE` | Branch remains active for the next cycle |
| `TERMINATE_BRANCH` | Branch is deactivated |
| `REROUTE_TO_SPEECH_SCRIPT_PREP` | Branch is deactivated; a speech-script-prep branch is injected |

### Convergence

The loop terminates when all active branches have scores at or above
`completion_target` (default 0.75), or when `max_cycles` is reached.
Stagnation detection (configurable threshold and consecutive-cycle count)
triggers early termination of underperforming branches.

### Audit

Every cycle completion is recorded as an `adaptive_cycle_completed`
event via the SwarmRunner's `EventRecorder`. A final validation artifact
is persisted to `workspace_root/output/adaptive_validation.json`.

---

## 4. GRITS -- the surveillance agent

**Module:** `grits/runner.py` (`GritsRunner`)

GRITS (Governance, Risk, Integrity, Trust, Surveillance) is the
platform's integrity evaluation agent. It operates independently of the
swarm execution pipeline and exists to answer one question: **has the
system drifted from its known-good state?**

### Pipeline

```
request --> resolve --> execute --> compare --> analyze -->
classify --> recommend --> report --> write
```

Each stage is a pure function with explicit inputs and outputs:

1. **Build request** -- construct a run request from target, suite IDs,
   baseline reference, and trigger type.
2. **Resolve suites** -- map suite IDs to concrete diagnostic test
   descriptors.
3. **Execute diagnostics** -- run the diagnostic tests against the
   current system state.
4. **Load baseline and compare** -- load the reference baseline from
   `grits/baselines/` and compute a structured comparison.
5. **Analyze drift** -- extract drift signals from the comparison.
6. **Classify findings** -- assign severity and category to each
   finding.
7. **Generate recommendations** -- produce actionable remediation
   guidance.
8. **Compile report** -- assemble all findings into a maintenance
   report.
9. **Render and write** -- render Markdown and write the full evidence
   bundle to `artifacts/grits/<run_id>/`.

### Evidence bundle

GRITS persists seven artifact types per run: `run_request`,
`diagnostics`, `baseline_comparison`, `findings`, `remediation`,
`maintenance_report`, and `maintenance_report_md`. These are written
atomically via `write_evidence_bundle()`.

---

## Agent interaction with the trust chain

No agent can bypass the execution gate. The trust chain enforced by
`runtime/gate/execution_gate.py` requires:

1. A **signed execution plan** with valid cryptographic signature.
2. A **signed validation result** confirming the plan passed validation.
3. **Referential integrity** -- the plan's `proposal_id` and
   `validation_id` must match the validation result.
4. A **valid, unexpired lease** bound to the plan.
5. **Capability coverage** -- the lease must grant every capability the
   plan requires.
6. **Scope alignment** -- the plan's filesystem paths must fall within
   the lease's allowed scope.
7. A **signed lease** with valid cryptographic signature.
8. **Validation status** must be `"passed"`.

If any of these 10 checks fails, the `GateDecision` returns
`allowed=False` with a list of failure reasons. There is no override
mechanism. The gate is fail-closed by design.

### The ABI-to-gate boundary

The Skill ABI can define *what* should happen. Only the SwarmRunner,
operating through the runtime pipeline, can make it happen -- and only
after the execution gate confirms the full trust chain. This separation
is the core security invariant of the system.

---

## Agent boundaries: definition vs execution authority

| Agent | Can define | Can execute | Can bypass gate |
|---|---|---|---|
| Skill ABI | Yes | No | No |
| SwarmRunner | No (reads definitions) | Yes (via pipeline/adapters) | No |
| Adaptive Orchestrator | No (delegates to runner) | Yes (via runner) | No |
| GRITS | No | Diagnostics only | N/A (read-only) |

**Definition authority** means the ability to create or modify swarm
artifacts (intents, behavior sequences, schedules, delivery configs).

**Execution authority** means the ability to invoke tools, write files,
or trigger side effects in the runtime environment.

No single agent holds both. This separation ensures that the entity
deciding *what* to do is never the same entity that *does* it, and that
the execution gate stands between intent and action at all times.
