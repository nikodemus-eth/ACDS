# GRITS Architecture Overview

## 1. Purpose

GRITS (Governed Runtime Integrity Tracking System) is a read-only runtime integrity verification system for the Adaptive Cognitive Dispatch platform. It continuously evaluates governance invariants and produces structured reports. GRITS never mutates system state. It only reads through repository interfaces, evaluates conditions, and emits defect signals.

## 2. Key Design Principle

GRITS never modifies operational state. Every dependency is a read-only repository interface or a shared type. GRITS imports only types and repository interfaces from other ACDS packages, never their internal logic. This preserves verification independence: the system that checks correctness must not share implementation with the system it checks.

## 3. Package Structure

GRITS is split into two packages following the monorepo convention.

```
packages/grits           (shared types and interfaces)
        |
        v
apps/grits-worker        (runtime: engines, checkers, repos, jobs)
```

### 3.1 packages/grits

Provides the shared contract that all GRITS components depend on.

**Types** (`src/types/`):

| Type | Purpose |
|------|---------|
| `InvariantId` | Union of invariant identifiers (`INV-001` through `INV-008`) |
| `Severity` | `critical`, `high`, `medium`, `low`, `info` |
| `Cadence` | `fast`, `daily`, `release` |
| `DefectReport` | Single integrity violation with evidence |
| `CheckerResult` | Aggregated result from one checker module |
| `InvariantCheckResult` | Result for a single invariant evaluation |
| `IntegritySnapshot` | Full system trust posture at a point in time |
| `DriftReport` | Comparison between two snapshots |

**Interface** (`src/checker/`):

| Interface | Purpose |
|-----------|---------|
| `IntegrityChecker` | Contract for all checker modules: `name`, `invariantIds`, `supportedCadences`, `check(cadence)` |

**Repository Interfaces** (`src/repositories/`):

| Interface | Purpose |
|-----------|---------|
| `IntegritySnapshotRepository` | Save and retrieve integrity snapshots |
| `ExecutionRecordReadRepository` | Read execution records |
| `RoutingDecisionReadRepository` | Read routing decisions |
| `AuditEventReadRepository` | Read audit events by time range |
| `AdaptationRollbackReadRepository` | Read adaptation rollback state |

All repository interfaces are read-only. They expose query methods only.

### 3.2 apps/grits-worker

Provides the runtime that executes integrity checks.

**Engine Modules** (`src/engine/`):

| Module | Purpose |
|--------|---------|
| `IntegrityEngine` | Orchestrates checker execution for a given cadence |
| `SnapshotBuilder` | Assembles `IntegritySnapshot` from checker results |
| `DriftAnalyzer` | Compares two snapshots and produces a `DriftReport` |

**Checkers** (`src/checkers/`):

| Checker | Invariants | Cadences |
|---------|-----------|----------|
| `ExecutionIntegrityChecker` | INV-001, INV-002 | fast, daily, release |
| `AdaptiveIntegrityChecker` | INV-003, INV-004 | fast, daily, release |
| `SecurityIntegrityChecker` | INV-005, INV-006 | daily, release |
| `AuditIntegrityChecker` | INV-007 | daily, release |
| `BoundaryIntegrityChecker` | INV-001 | daily, release |
| `PolicyIntegrityChecker` | INV-001 | daily, release |
| `OperationalIntegrityChecker` | INV-008 | daily, release |

**In-Memory Repositories** (`src/repositories/`):

| Repository | Implements |
|------------|-----------|
| `InMemoryIntegritySnapshotRepository` | `IntegritySnapshotRepository` |
| `InMemoryExecutionRecordReadRepository` | `ExecutionRecordReadRepository` |
| `InMemoryRoutingDecisionReadRepository` | `RoutingDecisionReadRepository` |
| `InMemoryAuditEventReadRepository` | `AuditEventReadRepository` |
| `InMemoryAdaptationRollbackReadRepository` | `AdaptationRollbackReadRepository` |

**Shared Repository Singletons** (`src/repositories/sharedRepositories.ts`):

Provides singleton accessors for cross-package repositories used by checkers (optimizer state, approval records, ledger, provider registry, policy repository). These are obtained once and shared across all checkers in a job run.

**Jobs** (`src/jobs/`):

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `fastIntegrityJob` | Hourly | Schedule fast-cadence checks |
| `dailyIntegrityJob` | Daily | Schedule full integrity sweep |
| `releaseIntegrityJob` | On deploy/migration | Schedule release verification |

**Handlers** (`src/handlers/`):

| Handler | Checkers Used |
|---------|--------------|
| `runFastIntegrityCheck` | ExecutionIntegrityChecker, AdaptiveIntegrityChecker |
| `runDailyIntegrityCheck` | All 7 checkers |
| `runReleaseIntegrityCheck` | All 7 checkers + DriftAnalyzer |

## 4. Read-Only Contract

GRITS enforces strict read-only access through two mechanisms.

**Import boundary.** GRITS packages import only:

- Types from `@acds/grits` (InvariantId, Severity, Cadence, etc.)
- Repository interfaces from `@acds/grits` (read-only query contracts)
- Type-only imports from sibling packages (`@acds/core-types`, `@acds/provider-broker`) for shared domain types

GRITS never imports service classes, engine internals, or write-capable repositories from other ACDS packages.

**Repository design.** All five repository interfaces expose only query methods (`find`, `findAll`, `findByTimeRange`, `findLatestByCadence`). No `save`, `update`, or `delete` methods exist on the interfaces GRITS consumes from the dispatch system. The only write operation GRITS performs is saving its own `IntegritySnapshot` through `IntegritySnapshotRepository`.

## 5. Constructor Injection

Every checker receives its dependencies through constructor parameters.

```
SecurityIntegrityChecker(auditRepo, providerRepo)
ExecutionIntegrityChecker(execRepo, routingRepo, providerRepo)
AdaptiveIntegrityChecker(optimizerRepo, approvalRepo, ledger, rollbackRepo, providerRepo)
AuditIntegrityChecker(auditRepo, execRepo, approvalRepo)
BoundaryIntegrityChecker(execRepo, providerRepo)
PolicyIntegrityChecker(policyRepo, providerRepo)
OperationalIntegrityChecker(execRepo)
```

This makes every checker independently testable. Substitute any repository with a test double. No hidden coupling exists through globals, singletons, or service locators inside checker logic.

## 6. Data Flow

```
                    +-----------------------+
                    |   Dispatch Platform   |
                    | (executions, routing, |
                    |  audit, policies,     |
                    |  adaptive state)      |
                    +-----------+-----------+
                                |
                          read-only queries
                                |
                    +-----------v-----------+
                    |  Repository Interfaces |
                    |  (packages/grits)      |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   Integrity Checkers   |
                    |   (7 checker classes)   |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   IntegrityEngine      |
                    |   SnapshotBuilder      |
                    +-----------+-----------+
                                |
              +-----------------+-----------------+
              |                                   |
   +----------v----------+            +-----------v----------+
   | IntegritySnapshot   |            | DriftReport          |
   | (saved per cadence) |            | (release cadence)    |
   +---------------------+            +----------------------+
```

## 7. Summary

GRITS is a verification-only subsystem. It reads platform state through narrow repository interfaces, evaluates 8 invariants across 7 checkers on 3 cadences, and produces structured snapshots and drift reports. It never repairs, never writes back to the dispatch system, and never imports operational logic. All dependencies are injected through constructors, making the entire system testable in isolation.
