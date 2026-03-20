# Component Boundaries

Every package in the ACDS monorepo has a defined responsibility and a set of forbidden imports. These boundaries are enforced by convention and should be validated in CI.

## packages/core-types

**Owns:** Canonical enums (`TaskType`, `LoadTier`, `DecisionPosture`, `CognitiveGrade`, `ProviderVendor`, `AuthType`, `AuditEventType`), entity interfaces (`Provider`, `ProviderSecret`, `ProviderHealth`, `ModelProfile`, `TacticProfile`, `ExecutionFamily`, `ExecutionRecord`), contract interfaces (`RoutingRequest`, `RoutingDecision`, `DispatchRunRequest`, `DispatchRunResponse`), event types (`ExecutionRationale`), Zod validation schemas.

**Must NOT import:** Any other `@acds/*` package. This is the foundation layer -- it has zero internal dependencies.

## packages/shared-utils

**Owns:** Cross-cutting utility functions (formatting, ID generation, date helpers, logging utilities).

**Must NOT import:** Any `@acds/*` package except `core-types`.

## packages/security

**Owns:** Envelope encryption (`encrypt`, `decrypt` using AES-256-GCM), key resolution (`FileKeyResolver`, `EnvironmentKeyResolver`), secret storage (`SecretCipherStore`), secret rotation (`SecretRotationService`), redaction (`SecretRedactor`, `redactObject`, `redactError`, `redactHeaders`).

**Must NOT import:** Any `@acds/*` package except `core-types` and `shared-utils`.

## packages/audit-ledger

**Owns:** Audit event structure (`AuditEvent`), audit writers (`AuditEventWriter`, `ProviderAuditWriter`, `RoutingAuditWriter`, `ExecutionAuditWriter`), event builders (`buildProviderEvent`, `buildRoutingEvent`, `buildExecutionEvent`), event normalization (`normalizeAuditEvent`).

**Must NOT import:** `provider-adapters`, `provider-broker`, `policy-engine`, `routing-engine`, `execution-orchestrator`, `sdk`, or any app package.

## packages/provider-adapters

**Owns:** Base adapter contract (`ProviderAdapter`), adapter types and errors, request/response normalization, and concrete adapters for each vendor: `OllamaAdapter`, `AppleIntelligenceAdapter`. Each adapter includes its own config type and request/response mapper.

**Must NOT import:** `provider-broker`, `policy-engine`, `routing-engine`, `execution-orchestrator`, `sdk`, or any app package.

## packages/provider-broker

**Owns:** Provider registry (`ProviderRepository`, `ProviderRegistryService`, `ProviderValidationService`), record mapping (`ProviderRecordMapper`), execution proxy (`AdapterResolver`, `ProviderConnectionTester`, `ProviderExecutionProxy`, `ProviderExecutionError`), health management (`ProviderHealthRepository`, `ProviderHealthService`, `ProviderHealthScheduler`).

**Must NOT import:** `policy-engine`, `routing-engine`, `execution-orchestrator`, `sdk`, or any app package.

## packages/policy-engine

**Owns:** Policy types (`GlobalPolicy`, `ApplicationPolicy`, `ProcessPolicy`), instance context normalization, instance policy overlay, policy merge resolution (`PolicyMergeResolver`), profile and tactic eligibility resolution (`ProfileEligibilityResolver`, `TacticEligibilityResolver`), policy validation and conflict detection.

**Must NOT import:** `routing-engine`, `execution-orchestrator`, `sdk`, `provider-adapters`, or any app package.

## packages/routing-engine

**Owns:** Request intake (validation, normalization), eligibility computation (`EligibleProfilesService`, `EligibleTacticsService`), deterministic selection (`DeterministicProfileSelector`, `DeterministicTacticSelector`), fallback chain construction (`FallbackChainBuilder`), routing decision resolution (`RoutingDecisionResolver`), rationale generation (`ExecutionRationaleBuilder`, `RationaleFormatter`), top-level dispatch resolution (`DispatchResolver`).

**Must NOT import:** `execution-orchestrator`, `sdk`, or any app package.

## packages/execution-orchestrator

**Owns:** Dispatch run coordination (`DispatchRunService`), execution record management (`ExecutionRecordService`), execution status tracking (`ExecutionStatusTracker`), fallback execution (`FallbackExecutionService`, `FallbackDecisionTracker`), result normalization (`normalizeExecutionResult`, `normalizeExecutionFailure`), execution events (`ExecutionEventEmitter`, `ExecutionLifecycleLogger`).

**Must NOT import:** `sdk` or any app package.

## packages/sdk

**Owns:** Client transport (`ApiTransport`), dispatch client (`DispatchClient`), request builders (`RoutingRequestBuilder`, `ExecutionFamilyBuilder`, `ProcessContextBuilder`), helper utilities (`classifyLoad`, `defaultPosture`, `structuredOutputRequired`), client errors.

**Must NOT import:** Any app package. The SDK depends on `core-types` and communicates with the API over HTTP.

## packages/evaluation

**Owns:** Metrics collection, scoring functions, aggregation pipelines.

**Must NOT import:** `execution-orchestrator`, `routing-engine`, `sdk`, or any app package.

## packages/adaptive-optimizer

**Owns:** Adaptive state management, provider ranking, plateau detection.

**Must NOT import:** `execution-orchestrator`, `routing-engine`, `sdk`, or any app package.

## apps/api

**Owns:** HTTP routes, controllers, presenters, middleware (auth, error handling, request logging, security headers), application bootstrap.

**May import:** Any `@acds/*` package.

## apps/admin-web

**Owns:** React-based admin UI with pages for providers, profiles, policies, adaptation, audit, and executions. Owns the frontend routing shell, page-level query hooks, and the mock transport used for UI development and demos.

**May import:** `@acds/core-types` for shared enums and view-model-compatible types.

**Must NOT import:** Domain service packages such as `provider-broker`, `policy-engine`, `routing-engine`, `execution-orchestrator`, or persistence packages. All runtime data access goes through the API client or the mock API transport.

## apps/worker

**Owns:** Background job definitions (provider health checks, stale execution cleanup), job handlers.

**May import:** Any `@acds/*` package.
