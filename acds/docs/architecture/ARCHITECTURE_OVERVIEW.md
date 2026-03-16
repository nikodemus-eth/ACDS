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
                                 Provider-specific adapters (Ollama, LM Studio, Gemini, OpenAI)
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

## Infrastructure

- `infra/db` -- Database migrations and seed data (PostgreSQL)
- `infra/docker` -- Container definitions for local and production deployments
- `infra/config` -- Profile and policy configuration files
- `infra/scripts` -- Operational scripts (backup, migration, health checks)
