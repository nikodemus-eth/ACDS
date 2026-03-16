# Development Log

Tracking major development events for the Adaptive Cognitive Dispatch System.

---

## 2026-03-15 — Project Initialized

- Created local git repository
- Established project structure with Documentation folder
- Created tracking files: Development_log.md, Lessons_learned.md, First_person.md
- Broke system documentation into organized Documentation folder

## 2026-03-15 — Prompts 1–10: Foundation Layers

- Root monorepo scaffold: pnpm workspaces, tsconfig.base.json, .gitignore, .env.example
- 12 package scaffolds + 3 app scaffolds created
- core-types: enums (TaskType, LoadTier, DecisionPosture, CognitiveGrade, ProviderVendor, AuthType, AuditEventType), entities (Provider, ProviderSecret, ProviderHealth, ModelProfile, TacticProfile, ExecutionFamily, ExecutionRecord), contracts (RoutingRequest, RoutingDecision, DispatchRunRequest/Response, ExecutionRationale), Zod schemas
- security: envelope encryption (AES-256-GCM), key resolver abstraction, secret cipher store, secret rotation, redaction helpers
- audit-ledger: event writers, event builders, normalizer
- provider-adapters: base adapter contract, request/response normalizers, AdapterError

## 2026-03-15 — Prompts 11–20: Broker, Adapters, Policy, Routing Intake

- provider-broker: registry service, validation, record mapper, adapter resolver, connection tester, execution proxy, health service/repository/scheduler
- provider-adapters: Ollama, LM Studio, Gemini, OpenAI vendor implementations with mappers and tests
- policy-engine: global/application/process policies, instance normalizer/overlay, policy merge resolver, profile/tactic eligibility resolvers, validators, conflict detector
- routing-engine: intake (validator, normalizer)

## 2026-03-15 — Prompts 21–30: Routing, Execution, SDK, API

- routing-engine: eligibility services, deterministic profile/tactic selectors, fallback chain builder, decision resolver, rationale builder/formatter, DispatchResolver
- execution-orchestrator: DispatchRunService, ExecutionRecordService, ExecutionStatusTracker, FallbackExecutionService, FallbackDecisionTracker, result normalizers, event emitter/lifecycle logger
- SDK: ApiTransport, DispatchClientConfig, DispatchClient, builders (RoutingRequest, ExecutionFamily, ProcessContext), helpers, errors
- API: Fastify bootstrap (main, app, config, plugins, middleware, routes), auth/error/logging/security middleware, provider/health routes and controllers

## 2026-03-15 — Prompts 31–40: App Surfaces, Admin Web, Worker, DB

- API: dispatch/executions/audit routes, controllers, presenters
- admin-web: React + React Router + TanStack Query shell, layout components, providers/profiles/policies/audit/executions feature screens with hooks and API clients
- worker: bootstrap, provider health check job, stale execution cleanup job
- DB: 6 SQL migrations (providers, health, profiles, policies, executions, audit), README
- Seed files: model profiles, tactic profiles, global/app policies as JSON configs

## 2026-03-15 — Prompts 41–45: MVP Stabilization

- Architecture documentation: overview, component boundaries, routing model, execution flow
- Security documentation: secret storage, audit model
- Operator documentation: admin guide, provider setup, policy configuration, troubleshooting
- Integration tests: provider broker, routing engine, dispatch execution, fallback, API dispatch
- Scenario tests: Thingstead decision, Process Swarm generation, local-first routing, cloud escalation
- Compile-fix pass: root tsconfig.json with workspace paths, @types/node, vitest, JSX/DOM config, Fastify type augmentation, fixed unused imports and crypto overloads

## 2026-03-15 — Prompts 46–60: Adaptive Layer

- evaluation: 6 metrics (Acceptance, SchemaCompliance, CorrectionBurden, Latency, Cost, UnsupportedClaim), scoring (ExecutionScoreCalculator, ApplicationWeightResolver, ImprovementSignalBuilder), aggregation (ExecutionHistoryAggregator, FamilyPerformanceSummary)
- adaptive-optimizer: state (FamilySelectionState, CandidatePerformanceState, OptimizerStateRepository), ranking (CandidateRanker, ExplorationPolicy, ExploitationPolicy), selection (AdaptiveSelectionService with 4 modes), plateau detection (PlateauSignal, PlateauDetector), adaptation events (EventBuilder, LedgerWriter, RecommendationService)
- routing-engine adaptive: AdaptiveCandidatePortfolioBuilder, AdaptiveDispatchResolver
- execution-orchestrator feedback: ExecutionOutcomePublisher, ExecutionEvaluationBridge
- Worker adaptive jobs: execution scoring, family aggregation, plateau detection, recommendations
- API adaptive surface: adaptation routes/controller/presenters
- Admin UI adaptive: AdaptationPage, FamilyPerformancePage, CandidateRankingPanel, PlateauAlertsPanel
- Adaptive integration tests: scoring, selection, plateau, routing, API

## 2026-03-15 — Prompts 61–70: Adaptive Control and Release

- Approval workflow: AdaptationApprovalState/Service/Repository, API routes/controller
- Low-risk auto-apply: AdaptiveModePolicy, LowRiskAutoApplyService, AutoApplyDecisionRecord, worker job
- Rollback tooling: RankingSnapshot, AdaptationRollbackRecord/Service, API routes/controller
- Staged escalation tuning: EscalationTuningState/Service, StagedEscalationDecision/PolicyBridge
- Adaptive operator documentation: 7 docs covering overview, modes, approval, auto-apply, rollback, escalation, operator playbook
- Admin UI: approval queue/detail/decision screens, rollback queue/detail/execution screens
- Control integration tests: approval workflow, auto-apply, rollback, escalation tuning, API
- Compile-fix pass: 0 errors across full monorepo
- Release readiness checklist published
- **All 70 prompts complete. TypeScript compiles clean.**

## 2026-03-15 — Post-Build Code Review & Repair

A comprehensive 4-agent code review identified 27 issues (5 critical, 10 high, 7 medium, 5 low). All have been repaired:

### Security Fixes
- Fixed AES-256-GCM IV length from 16 → 12 bytes (NIST compliance) in `cipherTypes.ts`
- Added recursive nested-object redaction to `SecretRedactor`
- Added Bearer token, URL-embedded credential, and JSON key-value patterns to `redactError.ts`
- Fixed Gemini adapter API key leak: separated base URL from key-containing URL, added key redaction in error messages

### Execution Orchestrator Fixes
- Added error logging to `FallbackExecutionService` for each failed attempt and exhaustion summary
- Added per-handler try-catch error isolation in `ExecutionEventEmitter` (matching `ExecutionOutcomePublisher` pattern)
- Fixed `ExecutionStatusTracker` silent ignore: now logs when execution record not found
- Replaced no-op `ExecutionLifecycleLogger` with real structured logging

### Type Safety Fixes
- Created typed domain errors (`NotFoundError`, `ConflictError`, `ValidationError`) in `core-types`
- `PolicyMergeResolver.merge()` now accepts `CognitiveGrade` and `LoadTier` enums, eliminating all `as any` casts
- `GlobalPolicy.maxLatencyMsByLoadTier` typed as `Partial<Record<LoadTier, number>>` instead of `Record<string, number>`
- `ProviderValidationService` uses `ProviderVendor` and `AuthType` enum values instead of hardcoded strings
- `AdaptationApprovalController` and `AdaptationRollbackController` use `instanceof` typed errors instead of string matching

### Adaptive Layer Fixes
- Added `parseCandidateId()` function to `CandidatePerformanceState.ts` with validation, exported from `adaptive-optimizer`
- `AdaptiveDispatchResolver` uses `parseCandidateId` instead of raw `split(':')`
- Added fallback logging when adaptive selection falls back to deterministic routing
- `DeterministicProfileSelector` now prefers cloud-capable profiles when `forceEscalation: true`

### Provider Adapter Fixes
- All 4 adapters (OpenAI, Ollama, LMStudio, Gemini) now differentiate timeout vs network vs execution errors
- Timeout: `DOMException` with `AbortError` → `TIMEOUT` code, not retryable
- Network: `TypeError` → `EXECUTION_FAILED`, not retryable
- Server: other errors → `EXECUTION_FAILED`, retryable

### Worker Handler Fixes
- All 6 worker handlers have real in-memory repository implementations (no stubs)
- Shared `InMemoryOptimizerStateRepository` singleton across plateau, recommendations, and auto-apply handlers
- Cross-handler data flow: plateau signals → recommendations → auto-apply via exported repository accessors
- `parseInt` NaN guards on all environment variable parsing
- Error propagation: handlers throw if all processing attempts fail
- `cleanupStaleExecutions` builds family key from `executionFamily` object (not nonexistent `familyKey` string)

### API Controller Fixes
- `ProvidersController.rotateSecret` uses `SecretRotationService` with proper encrypt-and-store
- `DispatchController.resolve` validates DI dependencies exist before use
- Added `@acds/adaptive-optimizer` to `execution-orchestrator` package.json dependencies

### Test Infrastructure
- Created `vitest.config.ts` with path aliases matching `tsconfig.json` for module resolution
- Fixed plateau detection test severity thresholds (mild requires 1-2 indicators, severe requires 3)
- Fixed plateau test data to produce correct indicator counts
- **Result: 210 tests passing across 23 test files, 0 compilation errors**

## 2026-03-15 — Design Alignment & Full Remediation (P0–P2)

Gap analysis identified 27 discrepancies between the original design spec and the 70-prompt build. Full remediation executed across 5 phases:

### Phase 1: Enum Alignment (5 atomic commits)
- **LoadTier**: SIMPLE→SINGLE_SHOT, MODERATE→BATCH, COMPLEX→HIGH_THROUGHPUT, added STREAMING (new)
- **CognitiveGrade**: UTILITY→BASIC, WORKING→STANDARD, STRONG→ENHANCED, FINAL→FRONTIER, EVIDENTIARY→SPECIALIZED
- **TaskType**: ANALYSIS→ANALYTICAL, added GENERATION/REASONING/CODING (13 total)
- **DecisionPosture**: Removed DRAFT/REVIEW/STRICT, added OPERATIONAL. Now: EXPLORATORY, ADVISORY, OPERATIONAL, FINAL, EVIDENTIARY
- **AuthType**: OAUTH→BEARER_TOKEN, LOCAL→CUSTOM
- `classifyLoad.ts` fully rewritten from complexity-based to throughput-based model (itemCount, streaming, concurrency)
- `defaultPosture.ts` rewritten with complete Record<TaskType, DecisionPosture> for 13 task types
- `LowRiskAutoApplyService.ts` hardcoded string literals converted to enum references (pre-step)
- ~120 files touched across all enum changes

### Phase 2: Entity & Contract Enrichment
- **ModelProfile**: Added vendor, modelId, contextWindow, maxTokens, costPer1kInput, costPer1kOutput
- **TacticProfile**: Added systemPromptTemplate, outputSchema, maxRetries, temperature, topP
- **RoutingRequest**: Added `input: string | Record<string, unknown>` field
- Corresponding Zod schemas, JSON configs, admin UI forms, and all test helpers updated

### Phase 3: PostgreSQL Repositories
- New package: `packages/persistence-pg/` with 7 repository implementations (Provider, ProviderHealth, ExecutionRecord, OptimizerState, AdaptationApproval, Policy)
- New migration: `infra/db/migrations/007_adaptation_state.sql` (6 tables)
- Shared pool factory with configurable connection settings

### Phase 4: P1 Features
- **3 new evaluation metrics**: ConfidenceAlignmentMetric, ArtifactQualityMetric, RetryFrequencyMetric
- **Confidence-driven escalation**: `ConfidenceEscalationResolver` with graduated thresholds (0.3/0.6/0.8) replacing binary forceEscalation
- **Lease mode**: `ExecutionLease` entity + `LeaseManager` for short-lived provider access tokens with TTL, usage limits, revocation
- **Staged execution**: `StagedExecutionPlan` + `StagedExecutionRunner` for multi-stage pipelines (extract→reason→critique→synthesize) with 3 aggregation strategies
- **Meta guidance**: `MetaGuidanceService` generates strategy recommendations from plateau signals (5 indicator types → 5 strategy types)
- **Global adaptation**: `GlobalBudgetAllocator` + `FamilyValueScore` for cross-family cognitive budget allocation

### Phase 5: P2 Infrastructure
- **Docker**: Dockerfiles for api, worker, admin-web + docker-compose.yml with PostgreSQL
- **CI/CD**: GitHub Actions workflow (install, typecheck, lint, test)
- **Observability**: Abstract `@acds/observability` package with Counter/Histogram interfaces, label types, no-op implementation
- **Chaos tests**: Provider failure injection, fallback chain exhaustion, adaptive state loss (13 tests)
- **Policy CRUD**: `PolicyService` + `PolicyRepository` interface
- **Seed wiring**: `runSeeds.ts` script for loading JSON configs into PostgreSQL
- **Integration examples**: Thingstead and Process Swarm client examples
- **Deployment topology documentation**

### Verification
- TypeScript: 0 errors (`tsc --noEmit`)
- Tests: 229 passing across 26 test files
- No `as any` casts introduced
- All enum string literals converted to enum references

## 2026-03-15 — ARGUS-9 Red Team Test Suite — Phase 1

Adversarial testing initiative (ARGUS-9) targeting real vulnerabilities across 8 threat classes. Phase 1 covers Tier 1 attack surfaces:

### Shared Fixtures (`tests/red-team/_fixtures.ts`)
- 14 factory functions with Partial<T> override pattern for adversarial input construction
- 5 in-memory repository implementations (OptimizerStateRepository, AdaptationLedger, ApprovalRepository, RollbackRecordWriter)
- 4 mock provider classes for LowRiskAutoApplyService dependencies
- 2 collecting audit emitters (approval + rollback)

### Test Files Completed
- **tier1-secretRedaction.test.ts** (14 tests) — SecretRedactor array bypass, regex overmatch, redactObject exact-key whitelist gaps, redactError pattern gaps
- **tier1-providerSsrf.test.ts** (10 tests) — ProviderValidationService accepts file://, AWS metadata, loopback, RFC 1918, hex-encoded IPs, embedded credentials, non-HTTP schemes
- **tier1-policyBypass.test.ts** (12 tests) — PolicyMergeResolver ignores localPreferredTaskTypes, accepts nonexistent profile references, no vendor deduplication; PolicyConflictDetector misses self-contradictions
- **tier1-scoringBoundsCorruption.test.ts** (12 tests) — calculateExecutionScore accepts unbounded scores/weights (>1, <0, NaN, Infinity); CandidateRanker corrupted by inflated rollingScore/successRate/future dates; parseCandidateId injection via colons

### Key Vulnerabilities Confirmed
1. **Secret arrays bypass**: Both `SecretRedactor.redactRecord` and `redactObject` skip array values entirely
2. **No SSRF protection**: `ProviderValidationService` only validates URL syntax, not scheme/host safety
3. **No score bounds**: Evaluation and ranking accept arbitrary numeric values, enabling score inflation
4. **Policy field gaps**: `localPreferredTaskTypes` collected but unused; no cross-validation of profile references

### Verification
- TypeScript: 0 errors
- Tests: 277 passing across 30 test files (229 original + 48 red team)

## 2026-03-15 — ARGUS-9 Red Team Test Suite — Phase 2

Phase 2 covers exploration policy abuse, routing corruption, execution corruption, and audit ledger gaps.

### Test Files Completed
- **tier1-explorationManipulation.test.ts** (8 tests) — `computeExplorationRate` multiplier compounding, config abuse (minimumRate=1.0, maximumRate=0.0, negative baseRate), `shouldExplore` non-determinism, single-candidate exploration
- **tier2-routingCorruption.test.ts** (10 tests) — `RoutingRequestNormalizer` case aliasing (TestApp→testapp), empty/long/special-char inputs; `DeterministicProfileSelector` array-order dependence, escalation fallthrough; `FallbackChainBuilder` silent profile skipping, tactic reuse, empty chains
- **tier2-executionCorruption.test.ts** (9 tests) — `ExecutionOutcomePublisher` console-only error logging, duplicate handlers, no unsubscribe; `ExecutionEvaluationBridge` fallback_success=success scoring, only 2/9 metrics computed, negative latency acceptance
- **tier2-auditLedgerGaps.test.ts** (8 tests) — `buildAdaptationEvent` accepts empty rankings and unredacted secrets in evidenceSummary; approval service never emits superseded; rollback_previewed type defined but never emitted; no hash chain on audit events

### Key Vulnerabilities Confirmed
5. **Exploration rate manipulation**: Config boundaries not enforced — minimumRate ≥ maximumRate forces permanent or zero exploration
6. **Identity aliasing via normalization**: Case-insensitive normalization creates aliasing between distinct apps
7. **Incomplete evaluation bridge**: Only 2 of 9 metrics computed — 7 metrics are dead code in the evaluation pipeline
8. **Audit event integrity**: No hash chain, no signatures — events are plain mutable objects
9. **Missing audit events**: `superseded` and `rollback_previewed` types exist in the type system but are never emitted

### Verification
- TypeScript: 0 errors
- Tests: 312 passing across 34 test files (229 original + 83 red team)

## 2026-03-15 — ARGUS-9 Red Team Test Suite — Phase 3

Phase 3 covers governance layer abuse: approval workflow, rollback operations, auto-apply bypass, and adaptive selection corruption.

### Test Files Completed
- **tier3-approvalWorkflowAbuse.test.ts** (10 tests) — `AdaptationApprovalService` state machine: maxAgeMs=0/−1 creates instantly/born-expired approvals, no submission deduplication, any/empty string as actor (no authorization), `expireStale(0)` truthiness bug (0 is falsy → uses expiresAt instead), superseded status unreachable, approved recommendations not auto-applied
- **tier3-rollbackAbuse.test.ts** (8 tests) — `AdaptationRollbackService`: rollback does NOT update `FamilySelectionState` (record persisted but state unmutated), any string as actor, multiple rollbacks to same event permitted, `rollback_previewed` audit event never emitted, preview generates record with empty actor/reason
- **tier3-autoApplyBypass.test.ts** (12 tests) — `LowRiskAutoApplyService` and `isAutoApplyPermitted`: medium risk permitted in `fully_applied` mode, all three providers (risk, posture, failure counter) trusted blindly with no independent verification, `rollingScoreThreshold: -1` bypasses score check, auto-apply creates DecisionRecord but does NOT mutate FamilySelectionState
- **tier3-adaptiveSelectionCorruption.test.ts** (8 tests) — `AdaptiveSelectionService.select`: `observe_only` retains worst-ranked candidate, `rankCandidates` returns mutable references (mutation propagates), no minimum quality gate, `generateRecommendation` recommends status quo (recommendedRanking references same snapshot)

### Key Vulnerabilities Confirmed
10. **JavaScript truthiness bug in expireStale**: `maxAge ? ... : ...` treats 0 as falsy, so `expireStale(0)` falls through to 24h expiry instead of immediate expiry
11. **Governance layer gaps**: Approval, rollback, and auto-apply all create records but none mutate `FamilySelectionState` — the gap between decision and application is systemic
12. **No authorization on governance actions**: approve, reject, and rollback all accept any string as actor with no identity verification
13. **Provider trust is blind**: `LowRiskAutoApplyService` trusts risk, posture, and failure providers without cross-validation against actual family data
14. **Mutable ranking references**: `CandidateRanker.rankCandidates` returns mutable objects — mutation after ranking corrupts the ranking itself

### Verification
- TypeScript: 0 errors
- Tests: 350 passing across 38 test files (229 original + 121 red team)

## 2026-03-15 — ARGUS-9 Red Team Test Suite — Phase 4 (Final)

Phase 4 covers plateau detection manipulation, candidate ID injection, advanced policy merge edge cases, evaluation metric manipulation, and operational resilience failures.

### Test Files Completed
- **tier3-plateauManipulation.test.ts** (8 tests) — `PlateauDetector.detect` config abuse: `mildThreshold: 0` forces permanent plateau, reversed severity thresholds, `flatQualityVarianceThreshold: 1.0` false positives, no bounds on summary inputs, negative thresholds accepted
- **tier4-candidateIdInjection.test.ts** (8 tests) — `buildCandidateId`/`parseCandidateId`: colons in components break round-trip, empty strings create degenerate IDs, special characters and unlimited lengths accepted
- **tier4-policyMergeEdgeCases.test.ts** (11 tests) — `PolicyMergeResolver`: all-vendors-blocked ambiguity, restricted escalation paths, non-deduplication of blocked entities, silent instance overrides
- **tier4-evaluationManipulation.test.ts** (11 tests) — `evaluateAcceptance`/`evaluateLatency`/`calculateExecutionScore`: silent fallthrough for unknowns, negative latency accepted, weight manipulation (NaN/Infinity/negative), unclamped scores
- **tier4-operationalResilience.test.ts** (13 tests) — No quality floor in selection, empty/single candidate edge cases, fallback chain gaps, handler error isolation, duplicate registration, stress tests

## 2026-03-15 — Post-Review Hardening, Refactor, and Documentation Pass

- Refactored secret redaction into shared helpers so inline credential scrubbing logic is defined once and reused across object, record, and error redaction
- Hardened provider registration validation: rejected unsafe schemes, embedded credentials, overlong URLs, and cloud endpoints targeting loopback/link-local/private-network hosts
- Execution path now resolves provider-native `modelId` values from model profiles before adapter execution
- Dispatch run path now invokes fallback execution when the primary provider fails instead of terminating immediately
- Adaptive controls now mutate optimizer state: low-risk auto-apply updates `FamilySelectionState`, and rollback restores live family state plus candidate snapshots
- Approval workflow now validates positive TTLs, rejects duplicate pending approvals for the same recommendation, and requires non-empty actor identity
- API bootstrap now fails fast when the DI container is incomplete; route modules no longer fall back to empty placeholder dependencies
- Documentation updated across README, provider setup, troubleshooting, low-risk auto-apply, and rollback operations
- Verification rerun: `pnpm exec tsc -b` and targeted integration suite for fallback, auto-apply, rollback, and approval workflow all passing

### Key Vulnerabilities Confirmed
15. **Plateau config is a first-class attack surface**: mildThreshold=0 detects plateau in healthy families; reversed thresholds cause wrong severity
16. **Candidate ID injection via colons**: round-trip integrity broken by components containing the separator character
17. **Policy merge restricted escalation paths**: applications cannot force escalation, override latency, or restrict tactics
18. **Evaluation accepts adversarial numerics**: scores > 1.0, negative weights, NaN/Infinity pass unchecked
19. **No minimum quality floor**: system selects 0-score candidates when no alternatives exist

### Final Verification
- TypeScript: 0 errors
- Tests: 401 passing across 43 test files (229 original + 172 red team)

### ARGUS-9 Complete Suite Summary

| Phase | Files | Tests | Cumulative |
|-------|-------|-------|------------|
| 1 | 5 | 56 | 56 |
| 2 | 4 | 35 | 91 |
| 3 | 4 | 38 | 121 |
| 4 | 5 | 51 | 172 |
| **Total** | **18** | **172** | **229 + 172 = 401** |

## 2026-03-15 — ARGUS-9 Red Team Test Suite — Phase 5 (Extended Coverage)

Three additional test files targeting previously uncovered vulnerability surfaces discovered during codebase exploration.

### Test Files Completed
- **tier4-confidenceEscalationAbuse.test.ts** (16 tests) — `ConfidenceEscalationResolver`: negative/NaN confidence bypasses, reversed threshold ordering, all-zero/all-one thresholds, unknown CognitiveGrade always escalates (indexOf -1); `evaluateAndTune`: forcedEscalation ignores all summary data, minConfidenceThreshold > 1.0 forces normal, negative threshold disables fallback, failure count > execution count accepted
- **tier4-budgetAllocationCorruption.test.ts** (13 tests) — `FamilyValueScorer`: acceptanceRate > 1.0 and < 0 accepted, cost floor at 0.001, NaN/Infinity propagation; `GlobalBudgetAllocator`: negative totalBudget, empty families, NaN propagation through allocations, Infinity creates NaN allocation percentages, negative values trigger equal allocation fallback
- **tier4-improvementSignalManipulation.test.ts** (13 tests) — `buildImprovementSignal`: NaN/Infinity composite scores, scores outside [0,1] manipulate trend, IEEE 754 precision at SLOPE_THRESHOLD boundary, single NaN corrupts entire regression, confidence capping at 30 samples

### Key Vulnerabilities Confirmed
20. **Unknown CognitiveGrade always triggers escalation**: `indexOf()` returns -1 for unknown grades, which is always < any valid index, so `shouldEscalate` always returns true
21. **minConfidenceThreshold > 1.0 makes tuning results > 1.0 confidence**: The threshold value is assigned directly to confidence, producing confidence values outside [0,1]
22. **NaN propagation through budget allocation**: A single family with NaN executionVolume causes the totalValue guard to trigger, giving all families equal allocation regardless of actual value
23. **IEEE 754 float precision at slope threshold**: Mathematical slope of exactly 0.02 can be classified as "improving" due to floating point arithmetic (0.020000000000000004 > 0.02)

### Final Verification
- TypeScript: 0 errors
- Tests: 440 passing across 46 test files (229 original + 211 red team)

## 2026-03-15 — GRITS: Governed Runtime Integrity Tracking System

Implemented GRITS — a read-only runtime integrity verification system that monitors system invariants without modifying state. Deployed as a separate worker app (`apps/grits-worker`) with shared types in `packages/grits`.

### packages/grits (Shared Types Package)
- 7 type definitions: InvariantId (INV-001 through INV-008), Severity, Cadence, DefectReport, CheckerResult/InvariantCheckResult, IntegritySnapshot, DriftReport
- IntegrityChecker interface: `{ name, invariantIds, supportedCadences, check(cadence) }`
- 5 read-only repository interfaces: IntegritySnapshotRepository, ExecutionRecordReadRepository, RoutingDecisionReadRepository, AuditEventReadRepository, AdaptationRollbackReadRepository
- Barrel exports via index.ts, path aliases in root tsconfig.json and vitest.config.ts

### apps/grits-worker (Runtime Application)
- **Engine layer**: IntegrityEngine (cadence filtering, error isolation), SnapshotBuilder (overallStatus derivation, defect count rollup), DriftAnalyzer (per-invariant direction comparison, new/resolved defect detection)
- **7 checker modules**:
  - ExecutionIntegrityChecker (INV-001, INV-002) — routing decision existence, fallback chain eligibility
  - AdaptiveIntegrityChecker (INV-003, INV-004) — candidate-provider linkage, approval state machine validation
  - SecurityIntegrityChecker (INV-005, INV-006) — secret pattern scanning in audit events, provider endpoint safety
  - AuditIntegrityChecker (INV-007) — audit trail completeness for executions and approvals
  - BoundaryIntegrityChecker (INV-001 deep) — full provider eligibility sweep
  - PolicyIntegrityChecker — vendor conflict detection, empty eligibility sets
  - OperationalIntegrityChecker (INV-008) — DecisionPosture enum validation
- **5 in-memory repositories**: IntegritySnapshot, ExecutionRecord, RoutingDecision, AuditEvent, AdaptationRollback
- **Shared repository singletons**: OptimizerState, ApprovalRepository, LedgerWriter, ProviderRepository, PolicyRepository
- **3 jobs + 3 handlers**: fast (hourly), daily (24h), release (on-demand with drift analysis)
- **Job/handler pattern**: matches apps/worker (JobDefinition: name, intervalMs, handler)

### Key Design Decisions
- Read-only contract: GRITS never calls mutation methods, only reads through repository interfaces
- Constructor injection for all checker dependencies (testable, no hidden coupling)
- Error isolation: checker failure → skip status, not system crash
- OverallStatus derivation: green (all pass/skip), yellow (warns only), red (any fail)
- DriftAnalyzer compares STATUS_RANK (pass=3, warn=2, skip=1, fail=0) for direction computation

### Tests (63 new tests)
- **Engine unit tests** (20): SnapshotBuilder status/rollup, DriftAnalyzer direction/defects, IntegrityEngine filtering/isolation
- **Checker unit tests** (29): All 7 checkers with in-memory stubs for repository dependencies
- **Integration tests** (14): Full cadence flows, drift detection, security scanning, error isolation

### Documentation
- `docs/grits/GRITS_EXPLANATION.md` — Purpose and philosophy
- `docs/grits/GRITS_IMPLEMENTATION_SPEC.md` — Modules, invariants, cadences, schemas
- `docs/grits/GRITS_ARCHITECTURE.md` — Dependency diagram, read-only contract
- `docs/grits/INVARIANT_CATALOG.md` — 8 invariants with checker mapping
- `docs/grits/CHECKER_GUIDE.md` — How to implement a new checker
- `docs/grits/REPORT_FORMAT.md` — Schema docs with JSON examples
- `docs/grits/OPERATIONS_RUNBOOK.md` — How to run, configure, interpret output

### Verification
- TypeScript: 0 errors
- Tests: 503 passing across 49 test files (440 previous + 63 GRITS)

## 2026-03-15 — GRITS Gap Analysis and Closure

Performed comprehensive gap analysis comparing the GRITS Explanation Document specification against the delivered implementation. Identified 6 gaps and closed all of them.

### Gap Analysis Summary
1. **Gap 1 (HIGH)**: No independent eligibility recomputation — spec required GRITS to independently verify routing decisions against stored policy, not just check structural completeness
2. **Gap 2 (MEDIUM)**: Boundary integrity only checked provider eligibility, not architectural layer separation
3. **Gap 3 (MEDIUM)**: Operational integrity reduced to DecisionPosture enum validation only
4. **Gap 4 (MEDIUM)**: Secret scanning limited to audit event details only
5. **Gap 5 (LOW)**: Audit trail verification only checked existence of ≥1 event
6. **Gap 6 (LOW)**: Rollback state validity not verified — only checked event reference

### Gap Closures Implemented

**Gap 1 — Independent Eligibility Recomputation** (ExecutionIntegrityChecker)
- Added PolicyRepository dependency (optional 4th constructor parameter)
- New `recomputeEligibility()` method performs 3 independent policy checks:
  - Provider vendor vs. global policy allowedVendors/blockedVendors
  - Selected model profile vs. application policy blockedModelProfileIds
  - Selected tactic profile vs. process policy allowedTacticProfileIds
- Graceful degradation: policy lookups use `.catch(() => null)` for missing policies

**Gap 2 — Audit Event Coherence** (BoundaryIntegrityChecker)
- Added optional AuditEventReadRepository dependency
- New `checkAuditCoherence()` method validates action-to-resource-type mappings
- Maps action prefixes (routing, execution, provider, approval, etc.) to expected resource types
- Detects potential layer collapse when audit events reference resources outside their domain

**Gap 3 — Operational Health Expansion** (OperationalIntegrityChecker)
- Added CognitiveGrade enum validation alongside existing DecisionPosture validation
- Negative latency detection (HIGH severity)
- Anomalously high latency >5min threshold (MEDIUM severity)
- Completed-but-missing-completedAt detection (HIGH severity)
- Stale execution detection — pending/running >1hr (MEDIUM severity)
- Execution gap detection — >4hr gap between consecutive executions (LOW severity)

**Gap 4 — Expanded Secret Scanning** (SecurityIntegrityChecker)
- Added optional ExecutionRecordReadRepository and RoutingDecisionReadRepository dependencies
- Scans execution `errorMessage` and `normalizedOutput` fields for secret patterns
- Scans routing decision `rationaleSummary` for secret patterns
- All existing SECRET_PATTERNS applied consistently across all data sources

**Gap 5 — Deeper Audit Trail Verification** (AuditIntegrityChecker)
- Terminal approval state verification: approved/rejected/expired statuses require corresponding audit events
- Actor field presence verification: all audit events must have non-empty, non-"unknown" actors
- Fallback execution audit verification: executions with fallback_succeeded/fallback_failed must have a fallback-related audit event

**Gap 6 — Rollback State Validation** (AdaptiveIntegrityChecker)
- Added restored snapshot candidate validation in INV-004
- Parses each candidateId from the restored snapshot's candidateRankings
- Verifies all restored candidates reference currently-enabled providers
- Uses existing `parseCandidateId()` utility with graceful error handling

### Handler Updates
- `runDailyIntegrityCheck.ts`: SecurityIntegrityChecker now receives execRepo + routingRepo; BoundaryIntegrityChecker receives auditRepo
- `runReleaseIntegrityCheck.ts`: Same handler updates as daily
- `runFastIntegrityCheck.ts`: Already updated for Gap 1 (policyRepo)

### Tests (15 new tests, 518 total)
- **OperationalIntegrityChecker**: CognitiveGrade validation, negative latency, high latency, missing completedAt, stale execution, execution gap
- **BoundaryIntegrityChecker**: Audit coherence violation detection, coherent event passing
- **SecurityIntegrityChecker**: Secret in errorMessage, normalizedOutput, rationaleSummary
- **AuditIntegrityChecker**: Missing actor, unknown actor, terminal approval without audit event, fallback execution without fallback audit

### Verification
- TypeScript: 0 errors
- Tests: 518 passing across 49 test files (503 previous + 15 gap closure)

## 2026-03-15 — Standalone API Bootstrap Closure

### Build Boundary Fix
- Restored `apps/api` to package-local TypeScript compilation instead of inheriting workspace path aliases during emit
- Updated the API build script to compile workspace dependencies first, then emit the API package itself
- Cleaned up accidental generated `.js` and `.d.ts` artifacts that had been emitted into package `src` directories during the broken build path

### Standalone Startup Wiring
- Added `apps/api/src/bootstrap/createDiContainer.ts` to build a real Fastify DI container for standalone startup
- Bootstraps seeded model and tactic profiles from `infra/config/profiles`
- Wires Postgres-backed provider, execution, optimizer, approval, and policy repositories
- Resolves cloud API keys from environment for OpenAI and Gemini providers
- Reuses `DispatchRunService.resolveRoute()` for `/dispatch/resolve` so routing and execution share the same dependency path

### Verification
- `pnpm exec tsc -b`
- `pnpm --filter @acds/api run build`
- Standalone startup smoke against `dist/main.js` with required env vars injected

## 2026-03-15 — Standalone API Runtime Cleanup

### Refactor
- Added explicit `"type": "module"` metadata to the API app and emitted workspace packages that compile to ES module syntax
- Kept the standalone bootstrap flow package-local while preserving dependency-first builds for `apps/api`

### Errors Addressed
- Removed Node `MODULE_TYPELESS_PACKAGE_JSON` warnings during standalone API startup
- Verified the compiled `dist/main.js` path starts cleanly without reparsing warnings from `@acds/*` runtime dependencies

### Verification
- `pnpm --filter @acds/api run build`
- `pnpm exec tsc -b`
- `pnpm exec vitest run ./tests/integration/apiDispatch.test.ts ./tests/integration/fallbackExecution.test.ts ./tests/integration/lowRiskAutoApply.test.ts ./tests/integration/adaptationRollback.test.ts ./tests/integration/adaptationApprovalWorkflow.test.ts`
- Standalone startup smoke against `node apps/api/dist/main.js` on port `3211`
