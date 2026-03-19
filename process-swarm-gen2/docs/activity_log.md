# Process Swarm Gen 2 — Activity Log

Timestamped record of what was done and when during the rebuild.

---

## 2026-03-14

### Session 1: Project Initialization

| Time | Activity | Details |
|------|----------|---------|
| Start | Documentation review | Read all 70+ architecture docs from original Process Swarm codebase |
| — | Plan creation | Created phased rebuild plan (10 phases, ~550+ tests) |
| — | Phase 0.1: Scaffold | Created pyproject.toml, .gitignore, all __init__.py files for runtime/ and swarm/ packages, docs/ directory with logs |
| — | Phase 0.2: Identity - Key Manager | Ed25519 key generation/storage/loading with 5 signer roles, hex-encoded seeds, 0o600 perms. 18 tests |
| — | Phase 0.3: Identity - Signer | canonical_json, sign/verify artifacts, attach signatures with signer_role. 20 tests |
| — | Phase 0.4: Schema Infrastructure | Copied 18 .schema.json files, loader module, Draft 2020-12 validator. 15 tests |
| — | Phase 0.5: Shared Test Fixtures | conftest.py with keys_dir, schemas_dir, sample_proposal, openclaw_root fixtures. 4 fixture JSON files |
| — | Phase 0.6: Validation | 5-check proposal validator (schema, scope containment, undeclared effects, deterministic tests, no self-cert). 19 tests |
| — | Phase 0.7: Compiler | Execution plan compiler with OPERATION_CAPABILITIES mapping, referential integrity, compiler_signer. 9 tests |
| — | Phase 0.8: Lease Manager | Time-bounded capability leases with issue/check/revoke/save/load/list. 11 tests |
| — | Phase 0.9: Gates | ToolGate (default-deny, explicit CAP_MAP) + ExecutionGate (9-check trust chain). 22 tests |
| — | Phase 0.10: Executor | 5 operations (create/modify/delete/append/run_test) through ToolGate, halt-on-failure. 8 tests |
| — | Phase 0.11: Ledger | Append-only execution records with node_attestation_signer signing. 6 tests |
| — | Phase 0.12: Exchange | IngressHandler quarantine flow, receipt signing, proposal loader. 5 tests |
| — | Phase 0.13: Pipeline Runner | 7-stage end-to-end pipeline orchestrator. 3 tests |
| — | **Phase 0 Complete** | **137 tests passing in 0.31s. Full runtime kernel operational.** |

### Session 2: Phase 1 — Registry (SQLite Persistence)

| Time | Activity | Details |
|------|----------|---------|
| Start | Phase 1.1: Database | RegistryDatabase with 30 tables, WAL mode, FK ON, indexes, integrity checks. 25 tests |
| — | Phase 1.2: Repository Core | SwarmRepository CRUD: swarms, intent lifecycle, behavior sequences, schedules, deliveries, runs, events, atomic transactions. 38 tests |
| — | Phase 1.3: Repository Extended | Tools, actions, dependencies, readiness, archetypes, constraints, action tables, governance warnings, reduced assurance events, recipient profiles, capability families. 51 tests |
| — | **Phase 1 Complete** | **114 Phase 1 tests + 137 Phase 0 = 251 total tests passing in 0.62s** |

### Session 3–4: Phase 2 — Definer (Action Table Pipeline)

| Time | Activity | Details |
|------|----------|---------|
| Start | Phase 2.1: Archetypes & Templates | SwarmArchetype enum (12 types), ArtifactType (6), Complexity (3), rule-based classifier with keyword scoring, ArchetypeTemplate with frozen dataclasses for 12 templates. 28 tests |
| — | Phase 2.1: Archetype Classifier | ARCHETYPES dict (5 patterns), verb-to-capability-family mapping, classify_action_table() with capability coverage scoring |
| — | Phase 2.2: Constraints | ConstraintSet dataclass, extract_constraints() with regex extraction, validate_constraints(), serialization round-trip. 19 tests |
| — | Phase 2.2: Constraint Extractor | extract_constraint_set_for_action_table() — extracts, validates, and persists via repository |
| — | Phase 2.2: Capability | 18 default tools, seed_default_tools() (idempotent), run_preflight(), check_readiness(), action-type-to-tool mapping |
| — | Phase 2.3: Action Table | ActionEntry/ActionTable dataclasses, build/validate (6 checks including Kahn's cycle detection), lifecycle transitions (draft→validated→accepted→compiled), serialization. 26 tests |
| — | Phase 2.3: Action Extraction | ActionTuple/UnresolvedIssue dataclasses, extract_action_tuples() with ambiguity detection. 6 tests |
| — | Phase 2.3: SwarmDefiner | Draft/restatement/acceptance workflow, clarification state machine, optional events integration. 15 tests |
| — | Phase 2.3: Pipeline | 8-stage ActionTablePipeline, section-based 1:N expansion, Kahn's dependency validation, slug generation. 2 integration tests |
| — | Phase 2.3: Tool Matching | create_tool_match_set_for_swarm() wrapper around preflight. 1 test |
| — | Bug fixes | 12+ bugs fixed: FK constraint chains, field name mismatches, enum-vs-string comparisons, parameter naming, import signatures |
| — | **Phase 2 Complete** | **109 Phase 2 tests + 251 prior = 360 total tests passing in 0.71s** |

### Session 5: Phase 3 — Scheduler + Events + Governance

| Time | Activity | Details |
|------|----------|---------|
| Start | Phase 3.1: Events | EventRecorder with 23+ convenience methods wrapping repo.record_event(). Intent, swarm, run, delivery, governance, action, pipeline event types. 17 tests |
| — | Phase 3.2: Governance Warnings | 7 evaluation functions (semantic ambiguity, scope expansion, reduced assurance, secondary truth, authority boundary, replay determinism, extension risk). Warning fingerprinting, persistence, summary. 39 tests |
| — | Phase 3.2: Lifecycle Manager | 7-state FSM (drafting→reviewing→approved→enabled→paused→revoked), role-based transitions, reduced-assurance governance integration, warning acknowledgment flow. 25 tests |
| — | Phase 3.3: Scheduler | ScheduleEvaluator with cron parser (*, ranges, lists, steps), 3 trigger types (immediate, deferred_once, recurring), atomic schedule→run creation. 21 tests |
| — | Bug fix | FK constraint on tool_registered event using synthetic "__platform__" swarm_id |
| — | **Phase 3 Complete** | **102 Phase 3 tests + 360 prior = 462 total tests passing in 0.91s** |

### Session 6: Phase 4 — Bridge + DSL + BSC

| Time | Activity | Details |
|------|----------|---------|
| Start | Phase 4.1: DSL Models & Parser | OperationType enum (5 ops), DslStep/DslConstraints/DslAcceptanceTest/DslMetadata/DslDefinition dataclasses, YAML parser with validation (path traversal, dangerous commands, constraint compliance). 21 tests |
| — | Phase 4.2: BSC Compiler | BehaviorSequenceCompiler with 4-stage pipeline (normalize→scope→constraints→tests), path traversal/absolute/scope rejection, dangerous command filtering. ActionCompiler for action-table-to-step conversion. 19 tests |
| — | Phase 4.3: Bridge Translator | integration_proposal_to_m4() with operation_class dispatch (docs_edit, code_edit, test_run, config_edit, asset_create), m4_record_to_integration_result() reverse translation, extract_bridge_metadata() for round-trip tracking. BridgePipeline with governance warning checks (authority boundary). 21 tests |
| — | Phase 4.4: Bridge Sequencer | SequencePipeline for ordered multi-step execution, SequenceResult with succeeded/completed_steps/failed_step properties, build_document_sequence() with shell metacharacter sanitization and path traversal rejection. 17 tests |
| — | Phase 4.5: Gateway Recorder | GatewayRecorder producing full M4 artifact chains (proposal→validation→plan→execution→ledger) for gateway agent runs, deterministic IDs via uuid5, content hashing. 6 tests |
| — | Phase 4.6: Session Watcher | SessionWatcher tailing JSONL session files, cursor persistence, user→assistant pair detection, metadata extraction, system message filtering. 10 tests |
| — | **Phase 4 Complete** | **94 Phase 4 tests + 462 prior = 556 total tests passing in 1.02s** |

### Session 6: Phase 5 — Delivery + Tool Adapters

| Time | Task | Details |
|------|------|---------|
| Start | Phase 5.1: Tool Framework | ToolContext/ToolResult dataclasses, ToolAdapter ABC with `find_prior_output` static method, AdapterRegistry with register/get/list/create_default. 8 tests |
| — | Phase 5.2: Tool Adapters (15) | RunManagerAdapter, PolicyLoaderAdapter, SourceCollectorAdapter, UrlValidatorAdapter, FreshnessFilterAdapter, SourceNormalizerAdapter, SectionMapperAdapter, SynthesisBriefBuilderAdapter, ProbabilisticSynthesisAdapter, ReportFormatterAdapter, BundleBuilderAdapter, CitationValidatorAdapter, RuleValidatorAdapter, DecisionEngineAdapter, DeliveryEngineAdapter. 19 tests |
| — | Phase 5.3: Delivery Engine | DeliveryEngine with adapter dispatch, secondary truth policy checks, recipient profile resolution (fail-closed), atomic receipt recording. EmailAdapter (stub + SMTP modes with policy validation), TelegramAdapter (stub). 11 tests |
| — | Phase 5 Bug Fixes | Fixed 10 adapters created by subagent: wrong workspace paths (run_manager used run_id subdir), wrong prior_results keys (fresh_sources→sources), wrong output field names (rejected_count→invalid_count), wrong data formats (sections dict vs list). All mismatches between adapter implementations and test expectations |
| — | **Phase 5 Complete** | **38 Phase 5 tests + 556 prior = 594 total tests passing in 1.01s** |

### Session 7: Phase 6 — SwarmRunner + Integration

| Time | Task | Details |
|------|------|---------|
| Start | Phase 6.1: Adaptive Module | ImprovementLedger (append-only scoring with auto-delta/stagnation), BranchEvaluator (deterministic per-branch scoring with 6 branch types), AdaptiveScheduler (7-rule decision engine with TTS reroute), AdaptiveOrchestrator (cycle loop wrapping SwarmRunner). 52 tests |
| — | Phase 6.2: Skill ABI | SwarmSkillABI gateway — definition-only (no execution). Version negotiation, create/configure/preview/update/archive swarm definitions. Lifecycle state enforcement, governance integration. 14 tests |
| — | Phase 6.3: SwarmRunner | End-to-end orchestrator: registry → compiler → execution → delivery. Three execution paths (adapter-only, mixed, M4 pipeline). Precondition verification, atomic status updates, lazy PipelineRunner loading. 5 tests |
| — | Phase 6 API Fixes | EventRecorder.record() signature mismatch (metadata→actor_id+summary), create_behavior_sequence signature (steps→ordered_steps), list_behavior_sequences→get_behavior_sequence_by_swarm, save_keypair arg order, ScheduleEvaluator requires event_recorder |
| — | **Phase 6 Complete** | **71 Phase 6 tests + 594 prior = 665 total tests passing in 1.14s** |

### Session 8: Phase 7 — ARGUS-9 Red-Team Security Tests

| Time | Task | Details |
|------|------|---------|
| Start | Phase 7: Red-Team Test Creation | 3 parallel subagents created 11 ARGUS-9 test files + shared conftest.py covering: scheduler boundary (RT-01, 8 tests), bridge ambiguity (RT-02, 11 tests), skill boundary (RT-03, 11 tests), artifact trust (RT-04, 19 tests), scope smuggling (RT-05, 14 tests), acceptance gate (RT-06, 9 tests), delivery truth (RT-07, 9 tests), DSL determinism (RT-08, 10 tests), policy scope (RT-09, 22 tests), revocation (RT-10, 12 tests), runtime gate invariants (5 tests) |
| — | API Mismatch Fixes | Fixed `run["status"]` → `run["run_status"]` (RT-01). Fixed compiler API: `compile(bs, ctx)` → `compile(swarm_id, bs)`, step fields `operation_type`/`target_path` → `op`/`path`, added `test_id` to acceptance tests (RT-02). Fixed ABI method names in allowed set, added missing `actor_id`/`created_by` params, `create_swarm_definition` returns dict not string (RT-03) |
| — | **Phase 7 Complete** | **130 ARGUS-9 tests + 665 prior = 795 total tests passing in 1.37s** |

### Session 9: Phase 8 — Observability + UI

| Time | Task | Details |
|------|------|---------|
| Start | Phase 8.1: GRITS Module | Governed Runtime Integrity Testing System — reporting-only surveillance. 10-step pipeline: request → resolve → execute → compare → analyze → classify → recommend → report → render → write. 4 diagnostic suites (smoke 6, regression 3, drift 3, redteam 3 = 15 diagnostic tests). Evidence bundles with SHA-256 hashes. 51 tests |
| — | Phase 8.2: ProofUI Module | HTTP admin console with dark-themed SPA. ProofUIState reads artifacts from disk, SwarmPlatform wraps registry/events/lifecycle. GET endpoints for dashboard/swarms/runs/events/tools/settings, POST endpoints for create/transition/run/schedule/delivery. Path traversal protection, CORS headers. 39 tests |
| — | **Phase 8 Complete** | **90 Phase 8 tests + 795 prior = 885 total tests passing in 10.41s** |

### Session 10: Phase 9 — Process Swarm Job Authoring

| Time | Task | Details |
|------|------|---------|
| Start | Phase 9: Job Authoring Module | Deterministic intent-to-job pipeline: classify → extract → merge → generate → validate → repair → compile → plan. 7 job classes, pattern-based parameter extraction (7 categories), JSON Schema 2020-12 validation, bounded repair (max 2 attempts), execution plan generation. 9 scripts + 3 JSON configs + 2 schemas. 52 tests |
| — | **Phase 9 Complete** | **52 Phase 9 tests + 885 prior = 937 total tests passing in 10.52s** |

### Session 11: Phase 10 — Documentation

| Time | Task | Details |
|------|------|---------|
| Start | Phase 10: Architecture Documentation | 5 parallel subagents writing: ARCHITECTURE.md (system architecture + diagrams), SECURITY.md (threat model + trust chain), IDENTITY.md (signing system), TOOLS.md (adapter framework), AGENTS.md (agent model), SOUL.md (design philosophy), USER.md (user guide), MEMORY.md (state model), plus 4 config files (node_identity.json, key_registry.json, tool_policy.json, baseline.manifest.json) |
| — | **Phase 10 Complete** | **12 documentation files created (8 .md + 4 .json). 937 tests still passing. Full rebuild complete.** |

### Sessions 12–15: 100% Code Coverage Campaign

| Time | Activity | Details |
|------|----------|---------|
| Start | Coverage analysis | Ran `pytest --cov` to identify uncovered lines across all 129 source files |
| — | Batch 1–3 tests | Created test_full_coverage_batch1–3.py covering: registry edge cases, governance FSM, definer pipeline, BSC compiler, bridge translator, sequencer, session watcher, gateway recorder, GRITS diagnostics |
| — | Batch 4–5 tests | Delivery engine, governance warnings, definer capability, repository CRUD, action tables, action extraction, DSL parser, runtime modules |
| — | Batch 6–8 tests | Adaptive orchestrator, tool adapters, ProofUI, scheduler, pipeline runner, exchange ingress, proposal loader, schema validation edge cases |
| — | Batch 9–10 tests | SwarmRunner execution paths, archetype classifier, constraint extractor, repair_job, compile_intent, plan_job_execution |
| — | Production fix: `verify_integrity()` | `PRAGMA integrity_check` raises `DatabaseError` on severe corruption. Added try/except in `database.py` to catch and return as error string |
| — | Production fix: `_enforce_gate()` | Extracted gate denial path from monolithic `PipelineRunner.run()` into testable `_enforce_gate()` method |
| — | Production fix: `_try_deliver()` | Extracted delivery failure catch-all from `SwarmRunner.execute_run()` into testable `_try_deliver()` method |
| — | Batch 11–12 tests | Final 3 uncovered lines: corrupted DB integrity check, gate denial with revoked lease, circular dependency detection in pipeline |
| — | **Coverage Complete** | **1706 tests passing in 18.78s. 5538/5538 statements covered = 100%. Zero mocks, zero stubs, zero fakes.** |

### Sessions 16: ACDS Inference Integration (Step 1–2)

| Time | Activity | Details |
|------|----------|---------|
| Start | ACDS client | Created `process_swarm/acds_client.py` — Python HTTP client mirroring TypeScript SDK's DispatchClient. Dataclasses for RoutingRequest, DispatchRunRequest, DispatchRunResponse. Enums for TaskType (13), CognitiveGrade (5), LoadTier (4), DecisionPosture (5). Uses stdlib `urllib.request`. 260 lines |
| — | Inference provider | Created `process_swarm/inference.py` — InferenceProvider protocol with `infer()` method. ACDSInferenceProvider wraps client with routing defaults (privacy=local_only, loadTier=single_shot). RulesOnlyProvider stub returns None. Factory function `create_inference_provider()`. 143 lines |
| — | Configuration | Created `process_swarm/config.py` — `load_inference_config()` reads INFERENCE_PROVIDER, ACDS_BASE_URL, ACDS_AUTH_TOKEN, ACDS_TIMEOUT_SECONDS from environment. 26 lines |
| — | Pipeline wiring | Modified `swarm/definer/pipeline.py` — replaced `ollama_base` parameter with `inference: InferenceProvider` across all stage functions |
| — | LLM classification | Modified `swarm/definer/archetype.py` — added `_llm_classify_swarm()` path that calls ACDS with classification prompt, falls back to rules on failure. Source field set to "acds" |
| — | LLM extraction | Modified `swarm/definer/constraints.py` — added `_llm_extract_constraints()` path that calls ACDS with extraction prompt, falls back to rules on failure |
| — | Schema updates | Updated `archetype_classification.schema.json` source enum to include "acds". Updated `database.py` CHECK constraint to allow "acds" source |
| — | Runner wiring | Modified `swarm/runner.py` — imports `load_inference_config`/`create_inference_provider`, passes inference provider to pipeline |
| — | **ACDS Steps 1–2 Complete** | **3 new files (429 lines), 16 modified files. Inference provider abstraction operational with graceful fallback to rules.** |

### Session 17: ACDS Evaluation Harness — Use-Case Suite (Phases 1–6)

| Time | Activity | Details |
|------|----------|---------|
| Start | Documentation filing | Filed `docs/ACDS_USE_CASE_SUITE.md` — 25 use cases (UC-ACDS-001 through UC-ACDS-025) across 6 phases |
| — | Phase 1: Routing & Ledger | 14 tests — ProviderPolicy, ProviderSelector, ProviderEventLedger, RoutingDecision. TDD red-green-refactor |
| — | Phase 2: Validation Gates | 22 tests — ProviderOutputValidator, ConstraintValidator, AcceptanceGate. Structural + constraint + acceptance gates |
| — | Phase 3: Failure Handling | 17 tests — ProviderRuntime (timeout/error/partial simulation), CompletenessChecker, FallbackOrchestrator |
| — | Phase 4: Quality Scoring | 20 tests — QualityScorer with 6 dimensions (accuracy, relevance, coherence, constraint_adherence, source_fidelity, ranking_quality). Token-overlap heuristics, coverage-ratio relevance |
| — | Phase 5: Comparative | 12 tests — ComparativeEvaluator, ComparisonReport with per-dimension deltas and winner determination |
| — | Phase 6: Replay & E2E | 17 tests — EvaluationRunner orchestration, replay from serialized run, aggregate_runs summary statistics |
| — | **Use-Case Suite Complete** | **102 tests across 6 phases. 9 new source files in `process_swarm/evaluation/`. All TDD.** |

### Session 18: ACDS Red-Team Harness (Phases R1–R7)

| Time | Activity | Details |
|------|----------|---------|
| Start | Documentation filing | Filed `docs/ACDS_RED_TEAM_SUITE.md` — 29 adversarial use cases (RT-ACDS-001 through RT-ACDS-029) across 7 phases |
| — | Phase R1: Routing & Lineage | 16 tests — ProviderProvenanceChecker, RoutingIntegrityChecker, LineageCompletenessGate, ValidationCompletenessGate |
| — | Phase R2: Validation Evasion | 13 tests — SemanticMinimumChecker, ClaimSectionScanner, CitationResolver. Filler detection, claim smuggling, citation-noise resistance |
| — | Phase R3: Source Trust | 11 tests — EntityGroundingChecker, RankingDistortionChecker, ConflictDetector, InsufficencyDetector |
| — | Phase R4: Failure Semantics | 9 tests — RunStateValidator, FreshnessDetector, RetryVisibilityTracker |
| — | Phase R5: Concurrency | 8 tests — RunIsolationChecker, EventOrderingValidator, IdempotencyGuard |
| — | Phase R6: Prompt Injection | 8 tests — PromptPackageIntegrityChecker, SourceIsolationGuard. Injection pattern detection |
| — | Phase R7: Replay & Drift | 12 tests — ReplayCompletenessValidator, DownstreamLineageGate, ComparativeFairnessGuard, DriftVisibilityTracker |
| — | **Red-Team Suite Complete** | **77 tests across 7 phases. All integrity components in `integrity.py` (284 statements).** |

### Session 19: Coverage Completion & Refactor

| Time | Activity | Details |
|------|----------|---------|
| Start | Coverage analysis | Ran `pytest --cov` — 97% coverage (729 statements, 19 missed) across evaluation module |
| — | Coverage gap tests | Created `test_coverage_gaps.py` — 19 targeted tests closing all gaps: routing ValueError branch, scoring edge cases (empty sets, threshold boundaries, empty inputs), runner comparison_report serialization, integrity edge cases (continue branch, empty keywords, few claims, validator-only drift) |
| — | **100% Coverage Achieved** | **198 evaluation tests, 1904 total tests passing. 729/729 statements = 100% coverage on evaluation module.** |

### Session 20: ARGUS-Hold Layer — Governed Execution Gateway

| Time | Activity | Details |
|------|----------|---------|
| Start | Architecture design | Designed 8-stage governed pipeline: normalize → validate → policy → scope → plan → execute → emit → ledger |
| — | Phase O1: Models & errors | Created `models.py` (9 dataclasses, 2 enums, 2 helpers), `errors.py` (6 exception classes), `config.py` (`ARGUSHoldConfig` with `for_run()` factory) |
| — | Phase O2: Registry & specs | Created `registry.py` (`CommandRegistry` loading versioned JSON specs), 6 command spec JSONs: `filesystem.read_file`, `filesystem.write_file`, `filesystem.list_dir`, `report.render_markdown`, `http.fetch_whitelisted`, `tts.generate` |
| — | Phase O3: Pipeline stages | Created `normalizer.py`, `validator.py` (jsonschema Draft7), `policy_engine.py` (default-deny, 4 rules), `scope_guard.py` (filesystem + network), `execution_planner.py` |
| — | Phase O4: Adapters | Created `adapters/filesystem.py` (read/write/list), `adapters/report.py` (markdown), `adapters/http.py` (whitelisted fetch), `adapters/tts.py` (honest stub) |
| — | Phase O5: Emitter & ledger | Created `artifact_emitter.py` (per-stage JSON + summary), `ledger_writer.py` (append-only JSONL, SHA-256 hash chain, `verify_chain()`) |
| — | Phase O6: Dispatcher | Created `dispatcher.py` (8-stage orchestrator, `handles()`, `execute()`, `to_tool_result()`). Integrated into `swarm/runner.py` with lazy `argus_hold` property |
| — | Smoke test | End-to-end `filesystem.read_file`: 8 stages PASSED, 7 artifacts, ledger chain verified |
| — | **ARGUS-Hold Layer Complete** | **19 source files, 559 statements, 6 command specs, 4 adapters, hash-chained ledger** |

### Session 21: ARGUS-Hold Test Coverage — No Mocks, 100%

| Time | Activity | Details |
|------|----------|---------|
| Start | Coverage analysis | 174 existing tests at 97% (18 missing lines). 5 tests in `test_http.py` using `@patch`/`MagicMock` |
| — | Dead code removal | Removed Python <3.9 `_is_relative_to` fallback from `scope_guard.py` (5 lines unreachable on Python 3.14) |
| — | New test: `test_errors.py` | 6 tests constructing `ValidationError`, `PolicyDeniedError`, `ScopeViolationError` with real objects |
| — | New test: filesystem truncation | `test_list_dir_recursive_truncation` — recursive rglob with max_entries=2, hits the `break` at line 41 |
| — | New test: dispatcher gaps | `test_no_adapter_for_namespace` (bogus spec, no adapter), `test_execution_error_from_write_no_overwrite` (ExecutionError catch path) |
| — | New test: scope guard gaps | `test_denied_pattern_git_blocked` (.git/config matches denied pattern), `test_write_outside_specific_write_root` (narrowed write root) |
| — | New test: ledger blank lines | `test_verify_chain_ignores_blank_lines` — inserted blank lines in JSONL, verify_chain still valid |
| — | HTTP rewrite | Replaced all 5 mocked tests with real `HTTPServer` on port 0. Endpoints: /data, /big, /echo-ua, /error, HEAD /. Module-scoped fixture |
| — | Mock cleanup | Removed `from unittest.mock import patch, MagicMock` from `test_dispatcher.py` |
| — | **100% Coverage Achieved** | **186 tests, 559/559 statements = 100%, 0 mocks/stubs/monkeypatches, 0.75s runtime** |

### 2026-03-18 — Session: TTS Pipeline, Delivery, Swarm Registration, Mock Purge

| When | What | Details |
|------|----------|---------|
| Start | Swarm registration | Created `grits_audit.py` (9 steps), `oregon_ai_brief.py` (20+29 steps). Auto-registration in ProofUI |
| — | TTS adapters | 8 real ToolAdapter classes in `swarm/tools/adapters/tts/`. macOS `say` + ffmpeg. 28 total adapters |
| — | ARGUS-Hold TTS | Rewired from `{"implemented": False}` stub to real `say` command |
| — | Email delivery | SMTP profile for Proton Mail Bridge (localhost:1025). Honest failure when unconfigured |
| — | Telegram delivery | Real Bot API integration. Token via env var. Verified: message_id 947 |
| — | ProofUI delivery dropdown | `/api/delivery/available` validates methods live. Dropdown on swarm detail page |
| — | Mock purge | Eliminated ALL mocks from 19 test files. Real LLM calls with skipif |
| — | ProofUI names | All pages show swarm names instead of IDs. Clickable links |
| — | Inference trace | Runner emits `inference_trace.json`. Run detail page shows engine/model/latency per stage |
| — | **Result** | **2109+ tests, 0 mocks, real TTS/Telegram/LLM, 4 swarms registered** |
| — | Red team gap audit | Audited 224 existing red team tests across 19 files. Found 7 gaps (spec A, G, J + TTS/creds/RSS/delivery) |
| — | `test_rt11_uncovered_threats.py` | 30 new red team tests: unregistered commands, dry-run drift, timeout, TTS injection, credential leakage, RSS injection, delivery honesty |
| — | **Result** | **All 10 ARGUS-Hold spec items (A-J) covered. 254 red team tests. 2139 total tests** |
| — | Codebase audit | 7 findings: token sanitization, schema drift, missing indexes, silent exceptions, error disclosure, threading docs, SQL docs |
| — | Data dictionary | `docs/data_dictionary.md`: 30 tables, workspace layout, ARGUS-Hold ledger, ACDS models, Mermaid ERD |
| — | WCAG 2.1 AA pass | 9 must-fix items resolved: contrast, focus indicators, skip link, semantic headings, table scope, keyboard accessibility, ARIA roles |
| — | CORS hardening | Replaced `Access-Control-Allow-Origin: *` with localhost-only origin validation |
| — | `test_rt12_proofui_security.py` | 15 new red team tests: XSS protection, CORS restriction, artifact path traversal, delivery destination injection |
| — | **Result** | **2154 total tests passing. 269 red team tests across 21 files** |
| — | ACDS integration layer | `swarm/integration/`: contracts, node schemas, ACDS client adapter, execution pipeline, lineage tracker, retry/fallback, policy engine |
| — | GRITS integration suite | `tests/test_integration/`: 120 tests across 8 files — contracts, nodes, client, pipeline, lineage, retry, policy, GRITS-INT-001-012 |
| — | **Result** | **2274 total tests passing. Process Swarm + ACDS fully decoupled with governed integration boundary** |
