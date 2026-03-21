# Execution Flow

This document traces a dispatch request from route resolution through to final audit emission.

## Overview

```
RoutingRequest
    |
    v
[1] Route Resolution (routing-engine)
    |
    v
RoutingDecision
    |
    v
[2] Dispatch Run (execution-orchestrator)
    |
    v
[3] Provider Broker Execution (provider-broker -> provider-adapters)
    |
    v   (failure?)
[4] Fallback Handling (execution-orchestrator)
    |
    v
[5] Result Normalization (execution-orchestrator)
    |
    v
[6] Audit Emission (audit-ledger)
    |
    v
DispatchRunResponse
```

## Step 1: Route Resolution

The `DispatchResolver` in `routing-engine` orchestrates the full routing pipeline:

1. **Validate** the incoming `RoutingRequest` via `RoutingRequestValidator`.
2. **Normalize** defaults and constraints via `RoutingRequestNormalizer`.
3. **Resolve effective policy** by cascading global, application, and process policies through `PolicyMergeResolver`.
4. **Compute eligible profiles** via `EligibleProfilesService`.
5. **Compute eligible tactics** via `EligibleTacticsService`.
6. **Select** the primary model profile, tactic profile, and provider via the deterministic selectors.
7. **Build the fallback chain** via `FallbackChainBuilder`.
8. **Generate the rationale** via `ExecutionRationaleBuilder`.
9. **Produce** a `RoutingDecision`.

## Step 2: Dispatch Run

The `DispatchRunService` in `execution-orchestrator` takes the `RoutingDecision` and begins execution:

1. Creates an `ExecutionRecord` via `ExecutionRecordService` with status `pending`.
2. Starts lifecycle tracking via `ExecutionStatusTracker`.
3. Emits an `execution_started` event via `ExecutionEventEmitter`.
4. Passes the request to the provider broker for execution.

## Step 3: Provider Broker Execution

The `ProviderExecutionProxy` in `provider-broker`:

1. Resolves the correct adapter via `AdapterResolver` (matching the provider's vendor to the appropriate adapter: Ollama or Apple Intelligence).
2. Normalizes the request into the adapter's expected format.
3. Executes the request through the adapter.
4. Returns the raw response.

Each adapter (`OllamaAdapter`, `AppleIntelligenceAdapter`, `OpenAIAdapter`, `GeminiAdapter`, `LMStudioAdapter`) handles vendor-specific protocol details, including request mapping via its `Mapper`, and response parsing.

## Step 4: Fallback Handling

If the primary provider fails (connection error, timeout, or provider error), the `FallbackExecutionService` takes over:

1. The `FallbackDecisionTracker` records the failure as a `FallbackAttempt`.
2. The next entry in the `fallbackChain` is selected.
3. The provider broker is invoked again with the fallback provider and profile.
4. This repeats until either a provider succeeds or the fallback chain is exhausted.

If all fallbacks fail, the execution is marked as `failed` with a normalized failure containing all attempted providers and their error details.

## Step 5: Result Normalization

Regardless of which provider ultimately handled the request:

- **On success:** `normalizeExecutionResult` produces a `NormalizedExecutionResult` with a consistent structure across all providers.
- **On failure:** `normalizeExecutionFailure` produces a `NormalizedExecutionFailure` with structured error information.

The `ExecutionRecord` is updated with the final status (`completed` or `failed`), timing information, and the provider that actually handled the request.

## Step 6: Audit Emission

After execution completes, the system emits audit events:

1. **Routing audit:** `RoutingAuditWriter` records the routing decision, including the rationale and fallback chain, via `buildRoutingEvent`.
2. **Execution audit:** `ExecutionAuditWriter` records the execution outcome (success/failure, provider used, latency, fallback attempts) via `buildExecutionEvent`.
3. **Provider audit:** `ProviderAuditWriter` records provider-level events (connection success/failure, response time) via `buildProviderEvent`.

All audit events are normalized through `normalizeAuditEvent` before being persisted. Events are append-only and include correlation IDs that link routing decisions to their executions.

## Final Response

The `DispatchRunResponse` returned to the caller contains:

- The execution result (or failure details)
- The routing decision ID (for traceability)
- Timing information
- The rationale summary
- The provider that handled the request (which may differ from the primary if fallback occurred)

## Alternative Entry Point: Inference Triage System (ITS)

In addition to the standard dispatch flow, requests can enter through the **Inference Triage System** — a deterministic, policy-bound routing engine that maps task characteristics to minimum sufficient inference capability.

```
IntentEnvelope
    |
    v
[1] Validate (schema compliance)
    |
    v
[2] Sensitivity Policy (trust zone resolution)
    |
    v
[3] Translate (IntentEnvelope → RoutingRequest)
    |
    v
[4] Policy Evaluation (effective policy resolution)
    |
    v
[5] Candidate Evaluation (all profiles, explicit rejections)
    |
    v
[6] Ranking (minimum sufficient intelligence)
    |
    v
[7] Selection + Fallback Chain
    |
    v
TriageDecision
    |
    v (POST /triage/run only)
[8] Execution via DispatchRunService (same as Step 2 above)
```

**Endpoints:**
- `POST /triage` — Pure decision, no execution. Returns `TriageDecision` with classification, candidate evaluations, and selected provider.
- `POST /triage/run` — Decision + execution. Returns `{ triageDecision, executionResult }`.

Process Swarm uses `POST /triage/run` as the primary inference route, with automatic fallback to `POST /dispatch/run` if the triage endpoint returns 404.

## Auto-Reaper for Stale Executions

The `PgExecutionRecordRepository` provides a `reapStaleExecutions(thresholdMs)` method that marks stale `pending` or `running` execution records older than the threshold as `auto_reaped`. This prevents ghost executions from accumulating when providers fail to respond and the timeout mechanism doesn't fire (e.g., due to process restart).

The auto-reaper runs on a configurable schedule via the worker's stale execution cleanup job.
