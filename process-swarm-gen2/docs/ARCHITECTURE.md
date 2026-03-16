# Process Swarm Gen 2 -- Architecture Document

**Python 3.9+ / Ed25519 / SQLite WAL / JSON Schema**
**213 Python files, 937 tests, 18 JSON schemas**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Two-Layer Architecture](#two-layer-architecture)
3. [Runtime Kernel (`runtime/`)](#runtime-kernel)
4. [Swarm Platform (`swarm/`)](#swarm-platform)
5. [Job Authoring (`process_swarm/`)](#job-authoring)
6. [GRITS Observability (`grits/`)](#grits-observability)
7. [ProofUI Admin Console (`proof_ui/`)](#proofui-admin-console)
8. [Core Invariant](#core-invariant)
9. [7-Stage Runtime Pipeline](#7-stage-runtime-pipeline)
10. [DSL-to-BSC-to-Bridge Translation Chain](#dsl-to-bsc-to-bridge-translation-chain)
11. [8-Stage Definer Pipeline](#8-stage-definer-pipeline)
12. [Trust Boundaries](#trust-boundaries)
13. [Security Model](#security-model)
14. [Data Flow](#data-flow)
15. [Module Dependencies](#module-dependencies)
16. [Schemas](#schemas)
17. [Signer Roles](#signer-roles)
18. [Governance Lifecycle FSM](#governance-lifecycle-fsm)

---

## System Overview

Process Swarm Gen 2 is a sovereign process automation system built on
cryptographic trust chains. Every mutation to the filesystem or external
system must pass through a signed execution pipeline. The system is split
into two principal layers -- a **Runtime Kernel** that holds execution
authority, and a **Swarm Platform** that manages process definitions,
scheduling, and delivery -- plus three auxiliary subsystems for job
authoring, observability, and administration.

```
+--------------------------------------------------------------------+
|                        Process Swarm Gen 2                          |
|                                                                    |
|  +-----------------------+     +-----------------------------+     |
|  |   Swarm Platform      |     |    Runtime Kernel            |     |
|  |   (process automation)|---->|    (execution authority)     |     |
|  +-----------------------+     +-----------------------------+     |
|         |         |                    |            |               |
|  +------+--+ +---+----+        +------+----+ +-----+------+       |
|  |process_  | | grits/ |        | proof_ui/ | | schemas/   |       |
|  |swarm/    | |        |        |           | |            |       |
|  +----------+ +--------+        +-----------+ +------------+       |
+--------------------------------------------------------------------+
```

---

## Two-Layer Architecture

### Layer 1: Runtime Kernel (`runtime/`)

The Runtime Kernel is the **sole execution authority**. It owns
cryptographic identity, validates proposals, compiles plans, issues
capability leases, enforces the ExecutionGate trust chain, executes
operations under ToolGate mediation, and records everything in an
append-only ledger.

### Layer 2: Swarm Platform (`swarm/`)

The Swarm Platform manages **process definitions and lifecycle**. It
handles YAML behavior DSL parsing, behavior sequence compilation,
30-table SQLite registry, cron scheduling, delivery dispatch, governance
state machines, action table generation, tool adapter dispatch, and the
Skill ABI gateway. The platform can request execution only by submitting
proposals to the runtime; it cannot bypass the trust chain.

---

## Runtime Kernel

```
runtime/
  identity/        Ed25519 key management and signing
    key_manager.py   generate_keypair, save_keypair, load_signing_key,
                     load_verify_key, SIGNER_ROLES
    signer.py        canonical_json, sign_artifact, verify_signature,
                     sign_and_attach, verify_attached_signature
  schemas/         JSON Schema validation
    loader.py        Schema file loading
    schema_validator.py  validate_artifact -> ValidationResult
  validation/      Proposal verification (5 checks)
    validator.py     validate_proposal -> signed validation_result
  compiler/        Plan compilation with capability mapping
    compiler.py      compile_plan -> signed execution_plan
  lease/           Capability leasing (time-bounded authority grants)
    lease_manager.py issue_lease, check_lease_validity, revoke_lease,
                     build_capabilities_from_plan
  gate/            Dual-gate trust enforcement
    execution_gate.py  ExecutionGate (9-check trust chain)
    toolgate.py        ToolGate (deny-by-default capability mediator)
  executor/        Filesystem operations through ToolGate
    executor.py      Executor.execute -> per-step ToolGate authorization
  ledger/          Append-only execution records
    ledger_writer.py record_execution, append_to_log (immutable)
  exchange/        Proposal ingress from external nodes
    ingress.py       IngressHandler (quarantine -> validate -> accept/reject)
    receipt.py       create_receipt, save_receipt
  proposal/        Proposal loading and storage
    proposal_loader.py  load_proposal, store_proposal
  pipeline/        7-stage PipelineRunner orchestrator
    runner.py        PipelineRunner.run(proposal_path) -> execution_record
  bridge/          Bidirectional schema translation
    translator.py    integration_proposal_to_m4, m4_record_to_integration_result,
                     BridgePipeline (governance-checked deposit for ingress)
    sequencer.py     SequencePipeline (ordered multi-step proposal execution),
                     build_document_sequence
```

### Identity and Signing

All signing uses **Ed25519 via PyNaCl (libsodium)**. Private keys are
stored as hex-encoded 32-byte seeds with `0o600` permissions. Public keys
are hex-encoded 32-byte verify keys.

Canonical JSON serialization ensures signature stability:
- Keys sorted alphabetically
- No whitespace separators `(",",":")``
- ASCII-safe encoding
- UTF-8 byte output

Five standard signer roles:
1. `validator_signer` -- signs validation results
2. `compiler_signer` -- signs execution plans
3. `approval_signer` -- signs approvals
4. `node_attestation_signer` -- signs execution records
5. `lease_issuer_signer` -- signs capability leases

### Validation (5 Checks)

The validator certifies **admissibility**, not execution authority:
1. **Schema conformance** -- JSON Schema validation
2. **Scope containment** -- modifications within allowed paths, path
   traversal rejection (`..` blocked)
3. **No undeclared side effects** -- all modification paths in
   `target_paths` or `declared_side_effects`
4. **Deterministic tests** -- acceptance test commands screened against
   43 non-deterministic/dangerous patterns (curl, wget, bash -c, eval,
   shell chaining, etc.)
5. **No self-certification** -- reject self-certifying language
   ("this proposal is approved", "bypass validation", etc.)

### ExecutionGate (9-Check Trust Chain)

The ExecutionGate is the primary safety boundary. All checks must pass:

```
Check 1:  Plan signature valid
Check 2:  Validation result signature valid
Check 3:  Referential integrity -- proposal_id matches
Check 4:  Referential integrity -- validation_id matches
Check 5:  Lease validity (not expired, not revoked, status = "active")
Check 6:  Lease plan binding (lease.execution_plan_id == plan.plan_id)
Check 7:  Capability coverage (all required capabilities granted)
Check 8:  Scope alignment (plan paths covered by lease paths)
Check 9:  Lease signature valid
Check 10: Validation status == "passed"
```

Any single failure produces a `GateDecision(allowed=False)` with
specific failure reasons.

### ToolGate (Deny-by-Default)

ToolGate is the runtime's **capability mediator**. All capabilities are
denied unless a valid, active, time-bounded lease is bound.

Capability types:
- `FILESYSTEM_READ` / `FILESYSTEM_WRITE` -- mapped to lease key `filesystem`
- `TEST_EXECUTION` -- mapped to `test_execution`
- `ARTIFACT_GENERATION` -- mapped to `artifact_generation`
- `REPOSITORY_MODIFICATION` -- mapped to `repository_modification`

Authorization flow:
1. Check lease is bound (else deny)
2. Check lease time bounds (auto-unbind if expired)
3. Check explicit denial list
4. Check capability is granted
5. For filesystem ops: require target path + path-in-scope check

### Executor

Operations are executed under ToolGate enforcement. Supported operations:
`create`, `modify`, `delete`, `append`, `run_test`.

Security measures:
- Path resolution before authorization check (resolve, then verify
  containment within workspace)
- Shell injection pattern blocking for test commands (`;`, `&&`, `||`,
  `|`, backticks, `$(`, `${`, newlines, process substitution)
- Timeout enforcement on test execution (default 30s)
- Halt-on-failure: first failed step halts remaining operations

### Ingress (Inter-Node Exchange)

The IngressHandler manages artifact intake from external nodes (M2)
through a quarantine pipeline:

```
M2 exports/ --> scan --> quarantine/ --> validate --> accepted/ | rejected/
```

Allowed artifact types from M2: `behavior_proposal`, `research_brief`,
`analysis_note`, `source_map`, `post_pack`, `publication_summary`,
`link_bundle`.

**Forbidden** artifact types from M2 (security boundary): `execution_plan`,
`capability_lease`, `execution_record`, `node_identity`, `key_registry`.
These are detected by field marker analysis, not just filename.

---

## Swarm Platform

```
swarm/
  dsl/             YAML behavior definitions
    models.py        DslDefinition, DslStep, DslConstraints, DslAcceptanceTest,
                     DslMetadata, OperationType (create/modify/append/delete/run_test)
    parser.py        YAML parsing and validation
  compiler/        Behavior Sequence Compiler (BSC)
    compiler.py      BehaviorSequenceCompiler -- 4-stage compilation:
                     Normalize -> Scope -> Constraints -> AcceptanceTests
    action_compiler.py  Action-level compilation
  registry/        30-table SQLite with WAL mode
    database.py      RegistryDatabase -- migration, PRAGMA WAL, foreign keys
    repository.py    SwarmRepository -- CRUD for all 30 tables
  scheduler/       Cron evaluation
    evaluator.py     ScheduleEvaluator -- immediate/deferred_once/recurring
                     Full 5-field cron parser (minute hour dom month dow)
  delivery/        Email/Telegram adapters
    adapters.py      EmailAdapter, TelegramAdapter (DeliveryAdapter ABC)
    engine.py        DeliveryEngine -- recipient profile resolution, secondary
                     truth policy checks, delivery receipt recording
    validation.py    Delivery input validation
  events/          23+ event type recorder
    recorder.py      EventRecorder -- intent lifecycle, swarm lifecycle,
                     run lifecycle, delivery, governance, pipeline events
  runner.py        SwarmRunner orchestrator
                     Registry -> Compiler -> Runtime Pipeline -> Delivery -> Audit
                     Execution path classification: pure adapter / mixed / M4 pipeline
  governance/      7-state lifecycle FSM
    lifecycle.py     LifecycleManager -- state transitions with role enforcement,
                     governance warning evaluation, reduced-assurance tracking
    warnings.py      Governance warning policies, reduced-assurance detection
  definer/         8-stage action table pipeline
    pipeline.py      _run_planning_pipeline (stages 2-7), PipelineResult
    definer.py       High-level definer orchestration
    archetype.py     SwarmArchetypeClassification, classify_swarm_archetype
    archetype_classifier.py  classify_action_table (capability pattern matching)
    constraint_extractor.py  extract_constraint_set_for_action_table
    constraints.py   ConstraintSet dataclass, extraction, validation
    templates.py     TemplateAction, archetype-to-template mapping
    action_table.py  Action table management
    action_extraction.py  action_summary_from_tuples
    capability.py    run_preflight, check_readiness
    tool_matching.py Tool matching logic
  tools/           15 adapters with ToolAdapter ABC
    base.py          ToolAdapter (ABC), ToolContext, ToolResult
    registry.py      AdapterRegistry.create_default()
    adapters/        15 built-in adapters:
                       RunManager, PolicyLoader, SourceCollector, UrlValidator,
                       FreshnessFilter, SourceNormalizer, SectionMapper,
                       SynthesisBriefBuilder, ProbabilisticSynthesis,
                       ReportFormatter, BundleBuilder, CitationValidator,
                       RuleValidator, DecisionEngine, DeliveryEngine
  abi/             Skill ABI (definition-only gateway)
    api.py           SwarmSkillABI -- create/update/configure swarm definitions,
                     preview execution, version negotiation (v0.1)
                     CANNOT: execute tools, bypass governance, inject unsigned
                     plans, modify ledger
  adaptive/        Improvement-driven orchestration
    orchestrator.py  AdaptiveOrchestrator -- multi-branch cycle loop with
                     ImprovementLedger, BranchEvaluator, AdaptiveScheduler
    improvement_ledger.py  Per-branch score tracking, stagnation detection
    branch_evaluator.py    Branch quality scoring
    adaptive_scheduler.py  Convergence decisions (continue/terminate/reroute)
  bridge/          Bidirectional schema translation (platform side)
    gateway_recorder.py  GatewayRecorder -- records gateway agent runs as
                         M4 artifact chains (proposal -> validation -> plan ->
                         execution -> ledger) for ProofUI visibility
    session_watcher.py   Session monitoring
```

### SwarmRunner

The SwarmRunner is the top-level orchestrator connecting the Swarm
Platform to the Runtime Kernel. It manages the full lifecycle:

```
Registry -> Precondition Check -> Classify Execution Path ->
  -> Execute (adapters and/or M4 pipeline) -> Update Run ->
  -> Deliver Results -> Audit
```

Execution path classification:
- **Pure adapter path**: all steps are `invoke_capability` -- dispatched
  directly to tool adapters
- **Pure M4 pipeline path**: all steps are filesystem operations -- routed
  through the full runtime pipeline
- **Mixed mode**: adapter steps run first; if successful, filesystem steps
  follow through the M4 pipeline

The database is explicitly a **coordination store, not a trust anchor**.
All critical state is recomputed from scratch before execution.

### Tool Adapter Framework

Each adapter implements the `ToolAdapter` ABC:
- `tool_name` property -- matches registry entry
- `execute(ctx: ToolContext) -> ToolResult`
- `validate_inputs(ctx) -> list[str]` (optional)
- `find_prior_output(ctx, key)` -- search upstream step results

ToolContext carries: `run_id`, `swarm_id`, `action`, `workspace_root`,
`repo`, `prior_results`, `config`.

ToolResult returns: `success`, `output_data`, `artifacts`, `error`,
`metadata`, `warnings`.

---

## Job Authoring

```
process_swarm/
  scripts/
    classify_intent.py          Keyword-scored intent routing
    extract_job_parameters.py   Parameter extraction from natural language
    merge_job_configuration.py  Configuration merging
    generate_job_from_intent.py Job generation from classified intent
    validate_job.py             Job validation
    repair_job.py               Job repair for failed validations
    compile_job.py              Job compilation
    plan_job_execution.py       Execution planning
    compile_intent.py           Intent compilation
  classes/                      Job class definitions
  extraction/                   Parameter extraction utilities
  planner/                      Execution planning
```

The job authoring layer provides a **deterministic intent-to-job
pipeline**. Intent classification uses keyword scoring: single-word
keywords score +1 (token match), multi-word phrases score +2 (substring
match). Falls back to `generic_job` if score is 0.

---

## GRITS Observability

```
grits/
  runner.py              GritsRunner -- 10-step surveillance pipeline
  run_request.py         Step 1: Build run request
  suite_resolver.py      Step 2: Resolve suites to test descriptors
  executor.py            Step 3: Execute diagnostics
  baseline.py            Step 4: Load baseline and compare
  drift_analyzer.py      Step 5: Analyze drift
  finding_classifier.py  Step 6: Classify findings
  recommender.py         Step 7: Generate recommendations
  report_compiler.py     Steps 8-9: Compile report, render Markdown
  artifact_writer.py     Step 10: Write evidence bundle
  diagnostics/
    smoke.py             Smoke test suite
    regression.py        Regression test suite
    drift.py             Drift detection suite
    redteam.py           Red team adversarial suite
```

### 10-Step GRITS Pipeline

```
1. Build Request     ──> run_request with target_id, suite_ids, baseline_ref
2. Resolve Suites    ──> test descriptors for each suite_id
3. Execute           ──> run diagnostics against openclaw_root
4. Compare           ──> load baseline, diff against current results
5. Analyze Drift     ──> extract drift signals from comparison
6. Classify          ──> categorize findings by severity
7. Recommend         ──> generate remediation recommendations
8. Compile Report    ──> structured maintenance_report dict
9. Render Markdown   ──> human-readable report
10. Write Bundle     ──> persist all artifacts to artifacts/grits/{run_id}/
```

Output artifact set: `run_request`, `diagnostics`, `baseline_comparison`,
`findings`, `remediation`, `maintenance_report`, `maintenance_report_md`.

---

## ProofUI Admin Console

```
proof_ui/
  __main__.py   Entry point
  server.py     HTTP server, SPA, REST API
```

ProofUI is a **read-only HTTP SPA** (single-page application) serving a
self-contained admin console on port 18790. It reads:
- Runtime artifacts from disk (`artifacts/executions/`, `artifacts/plans/`,
  `artifacts/validation/`, `artifacts/leases/`, `artifacts/proposals/`)
- The append-only execution ledger (`ledger/execution_ledger.log`)
- The swarm registry SQLite database (`platform.db`)

API endpoints:
- `GET /api/dashboard` -- aggregate stats (executions, pass rate, leases,
  plans, proposals, validations)
- `GET /api/swarms`, `GET /api/swarm/{id}` -- swarm definitions + events
- `GET /api/runs`, `GET /api/run/{id}` -- execution runs
- `GET /api/events` -- platform events (23+ types)
- `GET /api/tools` -- registered tool adapters
- `POST /api/swarm/create` -- create swarm via Skill ABI
- `POST /api/swarm/transition` -- lifecycle state transitions
- `POST /api/swarm/run` -- trigger manual run

Security: path traversal protection on file serving, CORS headers,
content-type enforcement.

---

## Core Invariant

> **No signed plan, no execution.**

Every execution requires:
1. A **signed validation result** (validator_signer)
2. A **signed execution plan** (compiler_signer)
3. A **signed capability lease** (lease_issuer_signer)
4. All 9 ExecutionGate checks passing
5. Per-operation ToolGate authorization
6. A **signed execution record** (node_attestation_signer)

The signing chain is: Proposal -> Validation (signed) -> Plan (signed)
-> Lease (signed) -> Gate (verifies all signatures) -> Execute ->
Record (signed). At no point can an unsigned artifact advance through
the pipeline.

---

## 7-Stage Runtime Pipeline

```
                    PipelineRunner.run(proposal_path)
                    ================================

  +--------+    +-----------+    +---------+    +-------+
  | 1.LOAD |    | 2.VALIDATE|    | 3.COMPILE|   | 4.LEASE|
  | load   |--->| 5 checks  |--->| map caps |--->| issue |
  | store  |    | sign      |    | sign     |    | sign  |
  +--------+    +-----------+    +---------+    +-------+
                                                    |
       +----------+    +---------+    +--------+    |
       | 7.LEDGER |<---| 6.EXEC  |<---| 5.GATE |<--+
       | record   |    | ToolGate|    | 9-check|
       | sign     |    | enforce |    | chain  |
       | append   |    | halt-on |    |        |
       +----------+    | -fail   |    +--------+
                       +---------+

  Stage 1 - Load:     load_proposal(path, schemas_dir) + store to artifacts/
  Stage 2 - Validate: 5 checks -> signed validation_result (validator_signer)
  Stage 3 - Compile:  map operations to capabilities -> signed plan (compiler_signer)
  Stage 4 - Lease:    build_capabilities_from_plan -> signed lease (lease_issuer_signer)
                      Default denied: network_access, dependency_installation
  Stage 5 - Gate:     ExecutionGate.check() -> GateDecision(allowed=True/False)
  Stage 6 - Execute:  ToolGate.bind_lease -> Executor.execute(plan, lease)
                      Path resolution, containment, shell injection blocking
  Stage 7 - Ledger:   record_execution -> sign (node_attestation_signer) ->
                      save to artifacts/executions/ + append to ledger log
```

---

## DSL-to-BSC-to-Bridge Translation Chain

The translation chain converts YAML behavior definitions into M4
proposals with defense-in-depth at each stage.

```
  YAML Behavior Definition
         |
         v
  +------------------+
  | DSL Parser       |  Parse YAML -> DslDefinition(steps, metadata,
  | (swarm/dsl/)     |  constraints, acceptance_tests)
  +------------------+
         |
         v
  +------------------+
  | BSC Compiler     |  4-stage compilation:
  | (swarm/compiler/)|  1. Normalize steps (skip run_test, validate ops)
  |                  |  2. Enforce scope (reject .., absolute, out-of-scope)
  |                  |  3. Inject constraints (max_files_modified)
  |                  |  4. Bind acceptance tests (reject dangerous patterns)
  +------------------+
         |
         v
  +------------------+
  | Bridge Translator|  integration_proposal_to_m4():
  | (runtime/bridge/)|  - Map operation_class to M4 operation
  |                  |  - Map side_effect_flags to capabilities
  |                  |  - Governance warning enforcement (network, pkg install)
  +------------------+
         |
         v
  M4 Behavior Proposal -> Runtime Pipeline
```

Bridge governance checks block proposals requesting:
- Network access across the bridge boundary
- Package installation across the bridge boundary
- External API access across the bridge boundary

The SequencePipeline extends this for multi-step proposals (e.g.,
composing a document from title, byline, and body), enforcing strict
ordering and chain integrity.

---

## 8-Stage Definer Pipeline

The definer pipeline converts natural language task descriptions into
explicit, ordered, tool-mapped action tables.

```
  +-----------+   +------------+   +------------+   +----------+
  | 1. INTENT |   | 2. ARCHETYPE|  | 3. CONSTR- |   | 4. TEMPL-|
  | raw text  |-->| classify   |-->| AINTS      |-->| ATE      |
  | draft_id  |   | confidence |   | extract    |   | expand   |
  +-----------+   | threshold  |   | validate   |   | skeleton |
                  +------------+   +------------+   +----------+
                                                        |
  +-----------+   +------------+   +------------+       |
  | 8. REVIEW |   | 7. TOOL    |   | 6. DEPEND- |   +--+-------+
  | human     |<--| MATCHING   |<--| ENCIES     |<--| 5. SPEC- |
  | accept/   |   | preflight  |   | assign     |   | IALIZE   |
  | revise    |   | readiness  |   | cycle      |   | actions  |
  +-----------+   +------------+   | detection  |   +----------+
                                   +------------+

  Stage 1 - Intent:          Raw natural language + draft registration
  Stage 2 - Archetype:       Classify to archetype (scheduled_reporting_pipeline,
                             data_pipeline, file_generation, notification, monitoring)
                             Confidence threshold check; raise ClarificationNeeded if low
  Stage 3 - Constraints:     Extract ConstraintSet (sections, recipients, schedule,
                             format, scope) from intent text + archetype context
  Stage 4 - Template:        Load archetype template -> list of TemplateAction skeletons
  Stage 5 - Specialization:  Expand templates with constraints (e.g., per-section actions
                             for source_collection, section_mapping, probabilistic_synthesis)
                             Register as swarm_actions in registry
  Stage 6 - Dependencies:    Assign inter-action dependencies (from canonical action table
                             or default linear chain). Cycle detection via Kahn's algorithm
  Stage 7 - Tool Matching:   run_preflight + check_readiness for each action
                             Categorize: supported / supported_with_constraints /
                             unsupported / requires_new_tool / pending
  Stage 8 - Review:          Human review, edit, accept/reject action table
```

All database writes in stages 2-6 are wrapped in `repo.atomic()` for
all-or-nothing semantics. Stage 7 runs outside the transaction (has its
own atomicity).

---

## Trust Boundaries

```
  +==================================================================+
  |                    TRUST BOUNDARY: SIGNING                        |
  |  Nothing executes without Ed25519 signatures from authorized      |
  |  signer roles. Signatures are verified at every boundary.         |
  +==================================================================+
       |                          |                         |
  +----+------+            +-----+-------+           +-----+------+
  | External  |            | Swarm       |           | Runtime    |
  | Nodes     |            | Platform    |           | Kernel     |
  | (M2)      |            |             |           |            |
  +-----------+            +-------------+           +------------+
       |                         |                        |
       | Ingress:                | BSC/Bridge:            | Execution:
       | quarantine ->           | translate ->           | ToolGate ->
       | forbidden type          | governance checks ->   | path containment ->
       | detection ->            | scope enforcement ->   | shell injection
       | schema validation       | dangerous pattern      | blocking
       |                         | rejection              |
  +----+------+            +-----+-------+           +-----+------+
  | BOUNDARY: |            | BOUNDARY:   |           | BOUNDARY:  |
  | INGRESS   |            | COMPILATION |           | EXECUTION  |
  +===========+            +=============+           +============+
```

### Boundary: Ingress

External artifacts enter through quarantine. The ingress handler:
- Blocks forbidden artifact types by field marker detection (not just
  filename) -- prevents execution_plan, capability_lease, execution_record,
  node_identity, key_registry injection
- Validates schemas for behavior_proposals
- Moves accepted artifacts to `validated/`, rejected to `rejected/`

### Boundary: Compilation

The BSC and Bridge enforce:
- No path traversal (`..` rejected)
- No absolute paths
- All paths within declared scope
- Dangerous command patterns blocked in acceptance tests (curl, wget, nc,
  python -c, eval, exec, shell chaining)
- Bridge governance checks block network/package/API requests

### Boundary: Execution

The runtime enforces:
- 9-check ExecutionGate trust chain
- Deny-by-default ToolGate capability mediation
- Path resolution before authorization (resolve then containment check)
- Shell metacharacter injection blocking in test commands
- Time-bounded leases (auto-expire)
- Halt-on-failure execution semantics

---

## Security Model

### Cryptographic Chain

```
  Proposal
    |
    v
  Validation ─── signed by validator_signer ─── Ed25519
    |
    v
  Execution Plan ─── signed by compiler_signer ─── Ed25519
    |
    v
  Capability Lease ─── signed by lease_issuer_signer ─── Ed25519
    |
    v
  ExecutionGate ─── verifies ALL three signatures + referential integrity
    |
    v
  Execution ─── ToolGate enforces lease scope per operation
    |
    v
  Execution Record ─── signed by node_attestation_signer ─── Ed25519
    |
    v
  Append-Only Ledger ─── immutable text log
```

### Default-Deny Posture

- ToolGate denies all capabilities without a bound lease
- Leases always deny `network_access` and `dependency_installation`
- Filesystem operations require both capability grant AND path-in-scope
- Expired leases auto-unbind, returning to default-deny

### Defense-in-Depth

Multiple layers independently enforce safety:
1. Validation rejects dangerous commands before compilation
2. BSC rejects path traversal and scope violations before runtime
3. Bridge governance blocks cross-boundary capability requests
4. ExecutionGate verifies full trust chain before any execution
5. ToolGate mediates every individual operation
6. Executor resolves paths and checks containment before writes
7. Ingress quarantine blocks forbidden artifact types from external nodes

### Governance Warnings

The governance system tracks **reduced-assurance conditions** -- situations
where the normal separation of governance roles is not maintained. When
the same actor performs multiple governance roles (e.g., author and
reviewer), the system:
1. Detects the overlap via `evaluate_reduced_assurance_governance()`
2. Records a governance warning artifact
3. Requires explicit acknowledgment before the transition proceeds
4. Persists the acknowledgment with reason category and justification
5. Records a `reduced_assurance_governance_event` for audit

---

## Data Flow

### End-to-End: Natural Language Intent to Execution

```
  User Intent (natural language)
       |
       v
  [process_swarm] classify_intent -> extract_parameters -> generate_job
       |
       v
  [swarm/definer] 8-stage pipeline: archetype -> constraints ->
                  template -> specialize -> dependencies -> tool match
       |
       v
  [swarm/compiler] BSC: normalize -> scope -> constraints -> tests
       |
       v
  [swarm/runner] SwarmRunner: preconditions -> classify path -> execute
       |
       +---> [adapter path] tool adapters (ToolContext -> ToolResult)
       |
       +---> [pipeline path] runtime pipeline (7 stages)
             |
             v
  [runtime/pipeline] Load -> Validate -> Compile -> Lease ->
                     Gate -> Execute -> Ledger
       |
       v
  [swarm/delivery] DeliveryEngine: recipient resolution -> adapter ->
                   receipt recording
       |
       v
  [proof_ui] ProofUI: read artifacts + registry -> dashboard
```

### Gateway Agent Flow

```
  External Channel (webchat/telegram/cli)
       |
       v
  Gateway Agent -> response generation
       |
       v
  [swarm/bridge] GatewayRecorder:
    proposal.json -> validation.json -> plan.json -> execution.json
       |
       v
  Append to ledger/execution_ledger.log
       |
       v
  Visible in ProofUI dashboard (structurally identical to pipeline artifacts)
```

---

## Module Dependencies

```
  runtime/identity ─────────────────────────────────────────────+
       |                                                        |
  runtime/schemas                                               |
       |                                                        |
  runtime/validation ──> identity, schemas                      |
       |                                                        |
  runtime/compiler ──> identity, validation                     |
       |                                                        |
  runtime/lease ──> identity                                    |
       |                                                        |
  runtime/gate ──> identity, lease                              |
       |                                                        |
  runtime/executor ──> gate (ToolGate)                          |
       |                                                        |
  runtime/ledger ──> identity                                   |
       |                                                        |
  runtime/exchange ──> schemas                                  |
       |                                                        |
  runtime/pipeline ──> ALL runtime modules                      |
       |                                                        |
  runtime/bridge ──> pipeline                                   |
                                                                |
  swarm/registry ─────────────────────────────────────────+     |
       |                                                  |     |
  swarm/events ──> registry                               |     |
       |                                                  |     |
  swarm/governance ──> registry, events                   |     |
       |                                                  |     |
  swarm/dsl (standalone)                                  |     |
       |                                                  |     |
  swarm/compiler ──> (standalone, uses json/datetime)     |     |
       |                                                  |     |
  swarm/definer ──> registry, events                      |     |
       |                                                  |     |
  swarm/tools ──> registry (ToolAdapter ABC)              |     |
       |                                                  |     |
  swarm/delivery ──> registry, events, governance         |     |
       |                                                  |     |
  swarm/scheduler ──> registry, events                    |     |
       |                                                  |     |
  swarm/abi ──> registry, events, governance              |     |
       |                                                  |     |
  swarm/adaptive ──> runner (via dependency injection)    |     |
       |                                                  |     |
  swarm/bridge ──> (standalone, writes to disk)           |     |
       |                                                  |     |
  swarm/runner ──> registry, events, compiler, delivery,  |     |
                   scheduler, tools, runtime/pipeline     +-----+
                   (lazy-loaded)
                                                          |
  process_swarm ──> (standalone scripts)                  |
                                                          |
  grits ──> (standalone, reads openclaw_root)             |
                                                          |
  proof_ui ──> registry, events, governance, abi          |
               reads runtime artifacts from disk          +
```

The Runtime Kernel has **no dependency on the Swarm Platform**. The Swarm
Platform depends on the Runtime Kernel only through `PipelineRunner`,
which is lazy-loaded to avoid circular imports.

---

## Schemas

18 JSON Schema files in `schemas/`:

| Schema | Purpose |
|--------|---------|
| `behavior_proposal` | Proposal structure and required fields |
| `behavior_validation_result` | Validation output with check details |
| `execution_plan` | Compiled plan with steps and capabilities |
| `capability_lease` | Time-bounded authority grant |
| `execution_record` | Post-execution result with action log |
| `exchange_receipt` | Inter-node exchange acknowledgment |
| `node_identity` | Node identification and role |
| `key_registry` | Active key inventory |
| `ledger_checkpoint` | Ledger consistency checkpoint |
| `action_table` | Definer pipeline action table |
| `archetype_classification` | Archetype assignment record |
| `constraint_set` | Extracted constraints |
| `governance_warning_record` | Governance warning artifact |
| `reduced_assurance_governance_event` | Reduced-assurance tracking |
| `grits_run_request` | GRITS evaluation request |
| `grits_diagnostic_result` | GRITS diagnostic output |
| `grits_finding` | GRITS classified finding |
| `grits_maintenance_report` | GRITS maintenance report |

---

## Signer Roles

| Role | Signs | Verified By |
|------|-------|-------------|
| `validator_signer` | Validation results | ExecutionGate check 2 |
| `compiler_signer` | Execution plans | ExecutionGate check 1 |
| `approval_signer` | Approvals | Governance layer |
| `lease_issuer_signer` | Capability leases | ExecutionGate check 9 |
| `node_attestation_signer` | Execution records | Audit / ProofUI |

Keys stored as:
- Private: `{role}.key` (hex seed, `0o600`)
- Public: `{role}.pub` (hex verify key)
- Fingerprint: first 32 hex chars of `SHA-256(public_key_bytes)`

---

## Governance Lifecycle FSM

7 states, role-gated transitions:

```
                    author
  [drafting] ──────────────> [reviewing]
      ^  |                    |    |    \
      |  | publisher          |    |     \ reviewer
      |  +-------> [revoked]  |    |      v
      |            (terminal) |    |   [rejected]
      |                       |    |      |
      |            reviewer   |    |      | author
      +<----------------------+    |      +------+
                                   |             |
                         reviewer  |             v
                                   v          [drafting]
                              [approved]
                                   |
                        publisher  |
                                   v
                              [enabled] <--------+
                               |    |    publisher|
                    publisher  |    |             |
                               v    v             |
                          [paused] [revoked]      |
                               |   (terminal)     |
                    publisher  |                  |
                               +------------------+
```

Required roles per transition:
- `author`: drafting->reviewing, rejected->drafting
- `reviewer`: reviewing->approved, reviewing->rejected, reviewing->drafting
- `publisher`: approved->enabled, enabled->paused, enabled->revoked,
  paused->enabled, paused->revoked, drafting->revoked, approved->revoked

`revoked` is a **terminal state** -- no transitions out.

All transitions produce governance events recorded in `swarm_events`
for complete auditability.
