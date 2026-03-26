# Development Log

Tracking major development events for the Adaptive Cognitive Dispatch System.

---

## 2026-03-26 — MVP Release Hardening and Package Posture

- Added a strict workspace install contract around Node `>=20.0.0`, `pnpm >=9.0.0`, and Corepack-driven activation of `pnpm@9.15.0`
- Added root `bootstrap` and `verify:install` scripts plus `scripts/verify-install.mjs` to confirm `workspace:*` linking before runtime work begins
- Normalized release-critical package manifests with descriptions, explicit package-local `test` scripts, and package-level README entrypoints
- Added `typecheck`, `clean`, `build`, and `test` coverage to `@acds/db-tools` / `@acds/persistence-pg` where missing
- Clarified admin-web posture: `preview` is the canonical MVP operator path, `dev` is for development, and `dev:mock` is explicitly non-release
- Added runtime traceability documentation tying dispatch, routing, fallback, audit, and GRITS release evidence to persisted state
- Updated CI to name and enforce install verification, migration smoke, admin preview startup, worker startup, dispatch/audit capture, and the GRITS release gate artifact flow
- Retested the full ACDS workspace and Process Swarm smoke suite successfully before finalizing release posture

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

## 2026-03-15 — Admin UI Runtime, Mock Mode, and API Parity

### Frontend Runtime
- Added a real Vite runtime for `apps/admin-web` with package-local build, dev, preview, and mock-dev scripts
- Added `index.html`, `vite.config.ts`, env-aware API base handling, and a redesigned shared shell in `styles.css`
- Refined layout primitives, top bar, sidebar, page headers, status badges, and sortable data tables
- Removed previous browser-console noise from style warnings and router future-flag warnings

### Mock Mode and Demoability
- Added a built-in mock transport for providers, profiles, policies, adaptation, approvals, rollbacks, audit, and executions
- Added visible mock-mode UI status in the top bar
- Verified provider creation, approval decisions, rollback execution, and route walkthroughs entirely in browser automation without a live API or Postgres

### Admin/API Parity
- Added `/profiles` API routes, controller, presenter, and `ProfileCatalogService`
- Added `/policies` API routes, controller, presenter, and repository-backed CRUD wiring
- Extended provider detail to include health data and aligned provider action routes with the frontend client
- Extended execution list/detail responses to support admin filters and stable detail fields for the UI
- Added `tests/integration/adminApiControllers.test.ts` for new admin controller surfaces

### Documentation
- Added `docs/operator/ADMIN_UI_DEVELOPMENT.md`
- Updated `README.md`, `docs/operator/ADMIN_GUIDE.md`, and `docs/architecture/COMPONENT_BOUNDARIES.md` to reflect the live admin runtime and mock workflow

### Verification
- `pnpm --filter @acds/admin-web run build`
- `pnpm exec tsc -b`
- `pnpm exec vitest run ./tests/integration/adminApiControllers.test.ts`
- Browser walkthrough in mock mode across providers, profiles, policies, adaptation, audit, and executions

## 2026-03-15 — Admin API End-to-End Route Coverage

### Test Coverage
- Added `tests/integration/adminApiRoutes.test.ts`
- Booted the real Fastify app via `buildApp()` with stubbed container services instead of controller-only mocks
- Covered authenticated `/profiles`, `/policies`, `/providers`, and `/executions` routes through HTTP injection
- Verified auth enforcement, route prefixes, provider detail health payloads, provider `/test` alias wiring, policy CRUD flow shape, execution filtering, and stable detail response fields

### Verification
- `pnpm exec vitest run ./tests/integration/adminApiRoutes.test.ts`
- `pnpm exec tsc -b`

## 2026-03-15 — Red-Team Test Reconciliation After Hardening

### Context
Commit `98b2231` ("Harden dispatch execution and adaptive controls") fixed 29 vulnerabilities that were documented by ARGUS red-team tests. Those tests asserted vulnerable behavior (e.g., "accepts file:// URL", "leaks secret in array"). Since the vulnerabilities are now fixed, the 29 tests needed to be converted from "proves vulnerability exists" to "proves vulnerability is fixed."

### Changes (5 test files, 29 assertion updates)

**tier1-providerSsrf.test.ts** (10 tests) — All assertions flipped from `expect(errors).toEqual([])` to `expect(errors.length).toBeGreaterThan(0)`. Covers: file://, AWS metadata, localhost, 127.0.0.1, IPv6 loopback, ftp://, hex-encoded localhost, embedded credentials, URL length, internal network ranges.

**tier1-secretRedaction.test.ts** (11 tests) — Array leak tests now expect `[REDACTED]`; false-positive isSensitiveKey tests (`author`, `authority`, `monkey`, `tokenizer`) now expect `false` due to token-based matching; redactObject tests expect redacted values; base64 credential test expects redaction.

**tier3-approvalWorkflowAbuse.test.ts** (5 tests) — maxAgeMs: 0 and -1 now reject; duplicate submissions now reject; expireStale(0) now correctly expires all; empty actor now rejects.

**tier3-autoApplyBypass.test.ts** (1 test) — rollingScoreThreshold: -1 now throws during construction.

**tier3-rollbackAbuse.test.ts** (2 tests) — Rollback now updates FamilySelectionState; empty actor/reason now rejects.

### No Source Code Changes
This is purely a test-assertion reconciliation. No production code was modified.

### Verification
- TypeScript: 0 errors
- Tests: 526 passing across 51 test files, 0 failures

---

## Post-Hardening Codebase Remediation

### Context
Re-evaluation of the codebase after the hardening pass, admin UI, and admin API test commits revealed 8 issues ranging from missing CRUD operations to code duplication and incomplete test coverage.

### Changes

**1. Profile Deletion (Critical Gap Closure)**
- `ProfileCatalogService`: Added `deleteModelProfile()` and `deleteTacticProfile()` methods
- `ProfilesController`: Added `deleteModelProfile()` and `deleteTacticProfile()` handlers returning 204/404
- `profilesRoutes.ts`: Registered `DELETE /model/:id` and `DELETE /tactic/:id` routes
- `profilesApi.ts` (admin-web): Added `deleteProfile()` API client function
- `useProfiles.ts` (admin-web): Added `useDeleteProfile()` React Query mutation hook
- `mockApi.ts` (admin-web): Added DELETE mock handlers for both profile types
- `ModelProfilesPanel.tsx` / `TacticProfilesPanel.tsx`: Added Delete action buttons

**2. ExecutionRecordPresenter Fallback Data**
- `toDetailView()` now synthesizes a `rationaleSummary` from ExecutionRecord fields (family, provider, profiles, posture, grade, fallback count) instead of returning an empty string
- `fallbackHistory` remains `[]` — structured fallback chain data requires a data model extension not in scope here

**3. Redaction Consolidation**
- Moved JSON field redaction pattern (`"key": "value"` → `"[FIELD]": "[REDACTED]"`) from `redactError.ts` into `sharedRedaction.ts`'s `redactInlineSecrets()`
- Simplified `redactError.ts` to a single call to `redactInlineSecrets()`, eliminating three duplicate regex patterns (URL credentials, `sk-` tokens, JSON fields)

**4. Profile Form Enhancement**
- Added Vendor dropdown (OpenAI, Anthropic, Google, Ollama) to `ProfileForm.tsx`
- Added Model ID text input with placeholder examples
- `localOnly`/`cloudAllowed` now derived from vendor selection instead of hardcoded

**5. Integration Test Expansion (6 new tests)**
- Profile CRUD lifecycle: create → retrieve → delete → confirm 404 (model and tactic)
- Profile deletion 404: DELETE on non-existent profile returns 404
- Global policy deletion rejection: DELETE on global policy returns 405
- Application policy deletion: DELETE removes policy and confirms absence from list
- Tactic profile validation: POST without executionMethod returns 400

### Verification
- TypeScript: 0 errors
- Tests: 532 passing across 51 test files, 0 failures (6 new tests added)

## 2026-03-15 — Apple Intelligence Provider Integration

Added Apple Intelligence as a fifth provider vendor in ACDS, backed by a Swift bridge service for on-device inference via Apple's Foundation Models framework.

### Changes

**1. Core Type Extensions**
- Added `APPLE = 'apple'` to `ProviderVendor` enum in `packages/core-types/src/enums/ProviderVendor.ts`
- Extended `InvariantId` type with 6 Apple-specific GRITS invariants (AI-001 through AI-006) in `packages/grits/src/types/InvariantId.ts`

**2. Provider Adapter (4 files)**
- Created `packages/provider-adapters/src/apple/AppleIntelligenceConfig.ts` — config interface with `localhost:11435` default
- Created `packages/provider-adapters/src/apple/AppleIntelligenceMapper.ts` — request/response mapping between ACDS and bridge formats
- Created `packages/provider-adapters/src/apple/AppleIntelligenceAdapter.ts` — implements `ProviderAdapter` with loopback-only validation
- Created `packages/provider-adapters/src/apple/AppleIntelligenceAdapter.test.ts` — 13 tests covering vendorName, validateConfig, testConnection, execute
- Exported from `packages/provider-adapters/src/index.ts`

**3. Provider Registration**
- Added `APPLE` to `LOCAL_VENDORS` in `packages/provider-broker/src/registry/ProviderValidationService.ts`
- Registered `AppleIntelligenceAdapter` in `apps/api/src/bootstrap/createDiContainer.ts` with `undefined` API key
- Added `'apple'` to `allowedVendors` in `infra/config/policies/globalPolicy.json`
- Added 3 Apple model profile seeds in `infra/config/profiles/modelProfiles.json` (fast, structured, reasoning_lite)

**4. GRITS Integrity Checker**
- Created `apps/grits-worker/src/checkers/AppleIntelligenceChecker.ts` — 6 invariants: localhost-only binding, capabilities staleness, loopback enforcement, macOS platform, token limits, health verification
- Created `apps/grits-worker/src/checkers/AppleIntelligenceChecker.test.ts` — 17 tests
- Registered in both fast and daily integrity check handlers
- Extended vitest config to include `apps/*/src/**/*.test.ts` pattern

**5. Swift Bridge Service (Scaffold)**
- Created `apps/apple-intelligence-bridge/` with Package.swift, BridgeServer, HealthEndpoint, CapabilitiesEndpoint, ExecuteEndpoint, FoundationModelsWrapper
- Binds to `127.0.0.1:11435` using Swift NIO
- Foundation Models calls stubbed pending macOS 26 availability

**6. Admin Web Integration**
- Added Apple provider mock data to `apps/admin-web/src/lib/mockApi.ts`
- Added "Apple Intelligence (local)" option to `ProfileForm.tsx` vendor dropdown

**7. Documentation**
- Created `docs/integrations/apple-intelligence.md` covering architecture, security model, GRITS invariants, and model profiles

## 2026-03-16 — Apple Intelligence Bridge UI Dashboard

### Admin Web Integration
- Created dedicated Apple Intelligence section in admin web UI under `features/apple-intelligence/`
- Three specialized panels: BridgeHealthPanel (bridge status and connectivity), CapabilitiesPanel (model capabilities display), TestExecutionPanel (live inference testing)
- Direct bridge communication via `localhost:11435`, bypassing the mock API layer for real-time bridge interaction
- Added sidebar navigation entry and client-side route at `/apple-intelligence`
- Mock API handlers added for development without the bridge running

### Foundation Models Integration (Swift Bridge)
- Rewrote `FoundationModelsWrapper.swift` to use real Foundation Models API (`LanguageModelSession`)
- Solved async-to-sync bridging with `DispatchSemaphore` + `Task` + `ResultBox` pattern for NIO compatibility
- Added CORS support to NIO server for cross-origin UI requests from the admin dashboard
- Verified real Apple Intelligence inference working: classification task returned "Positive" with 615ms latency

## 2026-03-16 — Stub Elimination Campaign

Systematic replacement of in-memory stubs and empty placeholder implementations with Postgres-backed repositories across the API, worker, and grits-worker applications.

### DI Container Typing
- Properly typed `DiContainer` interface in `fastify.d.ts`, eliminating ~30 `as any` casts across 10 route files

### API and Worker Repository Replacements
- Replaced `EmptyAuditEventReader`, `EmptyFamilyPerformanceReader`, `EmptyRecommendationReader` in the DI container with Pg-backed repositories
- Created `PgAuditEventRepository`, `PgFamilyPerformanceRepository`, `PgAdaptationEventRepository`, `PgAdaptationRecommendationRepository`
- Replaced `InMemoryOptimizerStateRepository` singleton with `PgOptimizerStateRepository` in both worker and grits-worker
- Wired `runProviderHealthChecks` and `cleanupStaleExecutions` to use Pg repositories via `DATABASE_URL`
- Replaced `InMemoryAutoApplyDecisionWriter` with `PgAutoApplyDecisionWriter`
- Replaced `InMemoryRecentFailureCounter` with `PgRecentFailureCounter`

### GRITS Worker Repository Replacements
- Replaced all grits-worker shared InMemory repositories (optimizer, approval, ledger, provider, policy) with Pg versions
- Added `@acds/persistence-pg`, `@acds/audit-ledger`, `@acds/evaluation` as dependencies where needed

### Key Architectural Decisions
- Worker pipeline handlers (scoring, aggregation, plateau, recommendations) retain InMemory repos for pipeline-internal state — data flows within a single worker invocation making persistence unnecessary
- Only persistent state (optimizer state, decisions, execution records) was migrated to Pg
- `connectionTester` retains one `as any` cast because `EnvAwareConnectionTester` wrapper doesn't structurally match the concrete `ProviderConnectionTester` class (nominal typing of private fields)
- GRITS worker read repositories (`InMemoryExecutionRecordReadRepository`, etc.) keep dual exports: InMemory class for test use, Pg class for production — tests must not depend on database connectivity

### Type Compatibility Fixes
- Aligned `PgPolicyRepository` return types (`saveGlobalPolicy` → `Promise<GlobalPolicy>`, deletes → `Promise<boolean>`) to match the canonical `PolicyRepository` interface from `@acds/policy-engine`
- Added `getApplicationPolicy` and `getProcessPolicy` alias methods to `PgPolicyRepository` for compatibility with the canonical interface's method names

### Test Suite Verification
- All 568 tests pass across 54 test files (unit, integration, chaos, red-team, scenario tests)
- Zero regressions from the stub elimination campaign

---

## 2026-03-16 — DI Container Stub Elimination (Final Five)

### Remaining Stubs Replaced
- Replaced `InMemorySecretStore` with `PgSecretCipherStore` — encrypts provider API keys to `provider_secrets` table
- Replaced `InMemoryAdaptationLedger` by extending `PgAdaptationEventRepository` with `writeEvent()`, `listEvents()`, `getEvent()` (implements `AdaptationLedgerWriter`)
- Replaced `InMemoryRollbackRecordWriter` with `PgRollbackRecordWriter` — persists rollback snapshots to `adaptation_rollback_records`
- Replaced `NoopApprovalAuditEmitter` with `PgApprovalAuditEmitter` — writes approval audit events to `audit_events` table
- Replaced `NoopRollbackAuditEmitter` with `PgRollbackAuditEmitter` — writes rollback audit events to `audit_events` table

### Migration 008
- Created `infra/db/migrations/008_secret_store_and_rollback_snapshots.sql`
- Adds `provider_secrets` table (id, provider_id UNIQUE, envelope JSONB, created_at, rotated_at, expires_at)
- Adds `target_adaptation_event_id`, `previous_snapshot`, `restored_snapshot` JSONB columns to `adaptation_rollback_records`

### New Persistence Module Files
- `packages/persistence-pg/src/PgSecretCipherStore.ts` — implements `SecretCipherStore` from `@acds/security`
- `packages/persistence-pg/src/PgRollbackRecordWriter.ts` — implements `RollbackRecordWriter` from `@acds/adaptive-optimizer`
- `packages/persistence-pg/src/PgAuditEmitters.ts` — `PgApprovalAuditEmitter` and `PgRollbackAuditEmitter` with fire-and-forget writes
- Added `@acds/security` as workspace dependency of `@acds/persistence-pg`

### New Test Files (44 new tests)
- `tests/unit/persistence/pgSecretCipherStore.test.ts` — 10 tests covering store/retrieve/rotate/revoke/exists with mock pool
- `tests/unit/persistence/pgRollbackRecordWriter.test.ts` — 4 tests covering save, JSON serialization, conflict handling, error propagation
- `tests/unit/persistence/pgAuditEmitters.test.ts` — 12 tests covering both emitters: event types, actor handling, fire-and-forget error resilience
- `tests/unit/persistence/pgAdaptationEventRepository.test.ts` — 12 tests covering writeEvent, getEvent, listEvents with filter permutations
- `tests/unit/bootstrap/createDiContainer.test.ts` — 9 tests verifying DI wiring, pool config parsing, absence of stubs, SSL support

### Test Suite Final State
- 612 tests pass across 59 test files
- Zero `InMemory*` or `Noop*` stubs remain in the API DI container
- All three apps typecheck clean (api, admin-web, grits-worker)

---

## 2026-03-18 — ACDS Sovereign Runtime Implementation

### Overview
Built the ACDS sovereign execution engine with Apple Intelligence as a first-class method-level Provider, strict Provider/Capability/Session taxonomy, and GRITS runtime integrity validation. TypeScript/Node.js with Vitest. Zero mocks.

### Package Location
`packages/runtime/` — new shared library in the pnpm workspace

### Build Sequence (4 passes)
1. **Domain + Registry** — Discriminated unions for Provider/Capability/Session, typed errors with reason codes, registry with mixed-class rejection, default Apple + Ollama providers, 17 Apple methods registered with correct policy tiers
2. **Runtime Pipeline** — Intent resolver (10 intents), method resolver (deterministic Apple mapping), policy engine (tier enforcement, cross-class blocking, local_only), execution planner (same-class fallback only), response assembler, full orchestrator
3. **Apple Adapter** — ProviderRuntime interface, platform boundary interfaces, realistic fakes (not mocks), 8 method family handlers (foundation-models, writing-tools, speech, tts, vision, image, translation, sound), AppleRuntimeAdapter dispatching to subsystem handlers
4. **GRITS + Observability** — Schema/latency/drift validators, hooks (onExecution, onPolicyDecision, onFallback), execution/audit loggers with redaction, telemetry event types

### File Count
44 source files across 6 modules (domain, registry, runtime, providers, grits, telemetry)

### Test Suite
- 368 tests across 24 test files
- 100% code coverage (statements, branches, functions, lines)
- Zero mocks, zero stubs, zero monkeypatches
- Unit tests: domain (23), registry (26), intent resolver (10), method resolver (13), policy engine (11), execution planner (5), Apple methods (39), coverage completion (131)
- Integration tests: full pipeline (6), Apple pipeline (5)
- GRITS tests: registry integrity (5), routing integrity (6), policy integrity (6), provider integrity (5), Apple method integrity (9), fallback integrity (5), observability integrity (6), adversarial (7), drift (5)
- Red team tests: taxonomy attacks (5), silent escalation (5), cross-class fallback injection (4), input injection (5), telemetry integrity (4), determinism verification (3), resource exhaustion (3)

### Documentation
- Filed Apple Sovereign Runtime Integration explanatory document to `docs/apple_sovereign_runtime.md`

### Key Design Decisions
1. TypeScript discriminated unions enforce source class separation at compile time
2. Pure functions for resolver and planner logic — deterministic, testable
3. Apple platform boundary behind interfaces — fakes at OS layer, real architecture everywhere else
4. No cross-class fallback enforced in both planner AND policy engine (double enforcement)
5. Redaction layer on all telemetry — tokens, auth headers, secrets stripped before logging
6. 1000-run determinism test proves routing is truly deterministic
