# Architecture Overview

The Adaptive Cognitive Dispatch System (ACDS) is organized as a layered monorepo. Each layer depends only on the layers below it, enforcing a strict dependency direction that keeps the system modular and testable.

## Layer Stack

```
Layer 10  apps/admin-web         Admin management UI (React)
Layer 9   apps/api               HTTP API server (Fastify)
          apps/worker            Background job processor
Layer 8   packages/sdk           Application-facing client SDK
Layer 7   packages/execution-orchestrator
                                 Run coordination, fallback, lifecycle
Layer 6   packages/routing-engine
                                 Route intake, eligibility, selection
Layer 5   packages/policy-engine Policy models and resolution
Layer 4   packages/provider-broker
                                 Provider registry, execution proxy, health
Layer 3   packages/provider-adapters
                                 Provider-specific adapters (Ollama, Apple Intelligence)
Layer 2   packages/audit-ledger  Audit event writing and normalization
Layer 1   packages/security      Crypto, secrets, redaction
Layer 0   packages/core-types    Canonical types, enums, contracts
          packages/shared-utils  Cross-cutting utilities
```

Supporting packages that sit outside the main dispatch path:

- `packages/evaluation` -- Metrics, scoring, aggregation
- `packages/adaptive-optimizer` -- Adaptive state, ranking, plateau detection, meta guidance, global budget allocation
- `packages/persistence-pg` -- PostgreSQL repository implementations (providers, policies, execution records, optimizer state, audit events, adaptation events, secrets, rollback records)
- `packages/observability` -- Abstract metrics and tracing interfaces (vendor-agnostic)
- `packages/grits` -- Shared types for runtime integrity verification (IntegritySnapshot, DriftReport, DefectReport, IntegrityChecker interface, read-only repository interfaces)

Additional worker applications:

- `apps/grits-worker` -- GRITS (Governed Runtime Integrity Tracking System): read-only runtime integrity verification. Monitors 8 system invariants via 7 checker modules across 3 cadences (fast/daily/release). Never modifies system state — reads through repository interfaces only. See `docs/grits/` for full documentation.

## External Integrations

- **Process Swarm Gen2** (`/ACDS - Process Swarm Integration/process-swarm-gen2/`) — Workflow execution engine that dispatches inference requests through ACDS. Per-step inference routes through the Inference Triage System (ITS) via `POST /triage/run`, with graceful fallback to legacy `POST /dispatch/run` if ITS is unavailable. The `SwarmRunner` creates ACDS execution records at run start, and individual tool adapters route LLM calls through `ACDSInferenceProvider.infer()` which builds `IntentEnvelope` contracts. Environment config: `INFERENCE_PROVIDER=acds`, `ACDS_BASE_URL`, `ACDS_AUTH_TOKEN`.

## Inference Triage System (ITS)

The ITS is a deterministic, policy-bound routing engine within `@acds/routing-engine/triage/`. It accepts an `IntentEnvelope` (task metadata describing what needs to be done) and produces a `TriageDecision` (which provider/model should handle it and why).

**Pipeline:** Validate → Sensitivity → Translate → Policy → Evaluate → Rank → Select → Emit

**Key concepts:**
- **Sensitivity classes** (public → internal → restricted → confidential → regulated) map to allowed **trust zones** (local, device, external)
- **Minimum sufficient intelligence**: always select the cheapest, lowest-latency provider that satisfies all constraints
- **Full candidate evaluation**: every model profile is evaluated with explicit rejection reasons (capability_mismatch, trust_zone_violation, policy_blocked, etc.)
- **Deterministic**: identical input always produces identical output

**Endpoints:** `POST /triage` (pure decision), `POST /triage/run` (decision + execution)

See `docs/architecture/inference-triage-system.md` for the full specification.

## Dependency Direction

Dependencies flow strictly downward. A package at layer N may import from any package at layer N-1 or below, but never from a package at the same layer or above. This rule is what makes each layer independently testable and replaceable.

## Dispatch Lifecycle

A dispatch request travels through the system in a single top-to-bottom pass:

```
1. SDK / API receives a RoutingRequest (cognitive intent)
        |
2. routing-engine validates and normalizes the request
        |
3. policy-engine resolves the effective policy (global + app + process cascade)
        |
4. routing-engine computes eligible profiles and tactics,
   performs deterministic selection, builds a fallback chain,
   and generates a rationale
        |
5. execution-orchestrator coordinates the run:
   - sends the request to provider-broker
   - handles fallback if the primary provider fails
   - normalizes the result
   - emits audit events via audit-ledger
        |
6. provider-broker resolves the adapter, executes via provider-adapters,
   and returns a normalized response
        |
7. The normalized result flows back up to the caller
```

## Routing vs Execution

ACDS separates two concerns that are often conflated:

**Routing** answers the question: "Given this cognitive intent and the current policy, which model profile, tactic profile, and provider should handle the request?" Routing is deterministic, auditable, and produces a rationale explaining why a particular route was chosen.

**Execution** answers the question: "Given a routing decision, how do we actually run the request, handle failures, and normalize the result?" Execution owns the fallback chain, lifecycle tracking, and audit emission.

This separation means routing logic can be tested and reasoned about without any provider being available, and execution logic can be tested independently of how routes are chosen.

## Artifact Pipeline

The sovereign-runtime package includes an artifact pipeline that provides a higher-level abstraction over the capability fabric. Where `CapabilityOrchestrator` routes by capability ID (e.g., `text.rewrite`), the artifact pipeline routes by artifact type (e.g., `ACDS.TextAssist.Rewrite.Short`) — a stable contract that encodes family, action, variant, provider disposition, and quality expectations.

```
Artifact Request (ACDS.TextAssist.Rewrite.Short)
       |
  1. Intake — resolve from ArtifactRegistry, normalize input
  2. Policy Gate — disposition check, local-only enforcement
  3. Planning — score providers, apply disposition, select winner
  4. Execution — delegate to CapabilityOrchestrator.request()
  5. Post-Processing — family-specific output normalization
  6. Provenance — record route, timing, normalizations
  7. Delivery — assemble canonical ArtifactEnvelope
       |
  ArtifactEnvelope (7-layer: Identity, Contract, Input Summary,
                    Payload, Provenance, Policy, Limitations)
```

Six artifact families are registered: TextAssist, TextModel, Image, Expression, Vision, and Action. Each family has its own normalizer handling input validation, output mapping, and quality dimensions. Provider disposition rules (apple-only, apple-preferred, apple-optional) control which providers may fulfill each artifact type.

The pipeline never throws — every request produces a valid envelope (succeeded, failed, or blocked) for auditability. See `docs/architecture/artifact-pipeline-portfolio.md` for the full specification.

The artifact registry is exposed through the API server at `/artifacts` (list, stats, families, detail by type) and the admin-web UI under the "Artifacts" nav item, providing a read-only catalog view with family filtering, disposition badges, and a 7-stage pipeline visualization.

## Execution Persistence

The dispatch lifecycle persists all state to PostgreSQL through two wrapper classes:

- `PersistingExecutionStatusTracker` extends the in-memory `ExecutionStatusTracker` and writes every status transition (pending → running → succeeded/failed) to the `execution_records` table via `PgExecutionRecordRepository`. It also emits audit events (`execution.started`, `execution.completed`, `execution.failed`) through `ExecutionAuditWriter`.
- `PersistingFallbackDecisionTracker` extends the in-memory `FallbackDecisionTracker` and writes each fallback attempt to the `fallback_attempts` table with attempt number, provider, status, and error details.

Both are injected via `createDiContainer.ts` — the `DispatchRunService` constructor accepts an optional `FallbackDecisionTracker` for DI.

## Audit Event Pipeline

Audit events are written to the `audit_events` table through a layered architecture:

1. **`AuditEventWriter` interface** (audit-ledger) — defines `write()` and `writeBatch()` contracts.
2. **`PgAuditEventWriter`** (persistence-pg) — production PostgreSQL implementation.
3. **Domain-specific writers** (audit-ledger) — `ExecutionAuditWriter`, `RoutingAuditWriter`, `ProviderAuditWriter` construct typed events and delegate to `AuditEventWriter`.
4. **Integration points** — `PersistingExecutionStatusTracker` emits execution events on lifecycle transitions; the routing lambda in `createDiContainer.ts` emits `routing.resolved` events on every dispatch.

All audit writes are fire-and-forget with error logging — audit failures never block the dispatch path.

## Capability Test Console

The Capability Test Console is a full-stack testing surface that lets operators exercise every provider capability through the admin web UI.

**Backend flow**: `CapabilityTestController` → `CapabilityTestService` → `ProviderCapabilityManifestBuilder` + `ProviderExecutionProxy`

- `ProviderCapabilityManifestBuilder` maps vendor-specific capabilities to a unified `CapabilityManifestEntry[]`. Standard providers (Ollama, OpenAI, LM Studio, Gemini) expose a single `text.generate` capability. Apple Intelligence exposes methods across 7 subsystems (foundation_models, writing_tools, speech, tts, vision, translation, sound). The `image_creator` subsystem is disabled due to Apple's `backgroundCreationForbidden` restriction.
- `CapabilityTestService.testCapability()` resolves the provider, builds an `AdapterRequest` (with `targetLanguage`, `sourceLanguage`, `voice`, `rate` fields for subsystem-specific parameters), and executes through the same `ProviderExecutionProxy` used by the dispatch pipeline.
- Routes: `GET /providers/:id/capabilities` (manifest), `POST /providers/:id/capabilities/:capabilityId/test` (execution), `GET /providers/translation/languages` (installed language packs).

**Frontend flow**: `CapabilityTestConsolePage` → `CapabilityTabs` (sidebar) → `InputRenderer` / `OutputRenderer` / `ExecutionMetadata` / `RawResponseViewer`

- `InputRenderer` switches on `InputMode` to render appropriate input controls (text prompt, TTS text, audio upload with Record/Upload, translation with From/To language dropdowns, JSON editor).
- `OutputRenderer` switches on `OutputMode` to display results (formatted text, audio player, JSON tree, error panel).
- Translation input fetches installed language packs from the Apple Intelligence bridge via `GET /providers/translation/languages` and populates From/To dropdowns with auto-detect support.

## Infrastructure

- `infra/db` -- Database migrations and seed data (PostgreSQL). Migrations 001–016 cover all tables. Migrations are append-only — never modify an applied migration; create a new ALTER migration instead.
- `infra/docker` -- Container definitions for local and production deployments
- `infra/config` -- Profile and policy configuration files
- `infra/scripts` -- Operational scripts (backup, migration, health checks)
