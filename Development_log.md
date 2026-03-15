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
