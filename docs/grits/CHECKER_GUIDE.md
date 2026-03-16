# GRITS Checker Implementation Guide

## Overview

This guide explains how to implement a new GRITS integrity checker. A checker is a class that evaluates one or more invariants against system state and returns structured results. All checkers implement the `IntegrityChecker` interface from `@acds/grits`.

## Step 1 — Choose Invariant IDs and Cadences

Determine which invariants your checker will verify. Reference the invariant catalog in `INVARIANT_CATALOG.md`.

Decide which cadences apply:

| Cadence | Frequency | When to use |
|---------|-----------|-------------|
| `fast` | Hourly | Invariants that detect immediate operational failures |
| `daily` | Once per day | Drift detection, anomaly scanning, full sweeps |
| `release` | On deploy/migration | Pre-release verification, regression checks |

A checker can support multiple cadences. The cadence parameter is passed to `check()` so the implementation can adjust sample size or time window accordingly.

## Step 2 — Create Checker Class

Create a new file in `apps/grits-worker/src/checkers/`. Follow the naming convention: `{Domain}IntegrityChecker.ts`.

The class must implement `IntegrityChecker` from `@acds/grits`:

```typescript
import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';

export class MyDomainIntegrityChecker implements IntegrityChecker {
  readonly name = 'MyDomainIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-001']; // your invariant(s)
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    // inject read-only repositories here
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    // implementation in Step 4
  }
}
```

## Step 3 — Inject Dependencies via Constructor

All data access must go through constructor-injected repository interfaces. Never import services or write-capable repositories.

Acceptable dependency types:

- Read-only repository interfaces from `@acds/grits` (e.g., `ExecutionRecordReadRepository`, `AuditEventReadRepository`)
- Read-only repository interfaces from sibling packages (e.g., `ProviderRepository` from `@acds/provider-broker`)
- Shared repository singletons from `apps/grits-worker/src/repositories/sharedRepositories.ts`

Example:

```typescript
import type { AuditEventReadRepository } from '@acds/grits';
import type { ProviderRepository } from '@acds/provider-broker';

export class MyDomainIntegrityChecker implements IntegrityChecker {
  // ...

  constructor(
    private readonly auditRepo: AuditEventReadRepository,
    private readonly providerRepo: ProviderRepository,
  ) {}
}
```

This makes the checker testable by substituting any repository with a test double.

## Step 4 — Implement check()

The `check()` method must return a `CheckerResult` containing an `InvariantCheckResult` for each invariant the checker evaluates.

### Template

```typescript
async check(cadence: Cadence): Promise<CheckerResult> {
  const results: InvariantCheckResult[] = [];

  results.push(await this.checkMyInvariant(cadence));

  return {
    checkerName: this.name,
    cadence,
    invariants: results,
  };
}

private async checkMyInvariant(cadence: Cadence): Promise<InvariantCheckResult> {
  const start = Date.now();
  const defects: DefectReport[] = [];

  // Adjust scope based on cadence
  const hoursBack = cadence === 'fast' ? 1 : cadence === 'daily' ? 24 : 168;
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const until = new Date().toISOString();

  // Query data through injected repositories
  const records = await this.someRepo.findByTimeRange(since, until);

  // Evaluate invariant conditions
  for (const record of records) {
    if (violatesInvariant(record)) {
      defects.push({
        id: generateDefectId(),
        invariantId: 'INV-001',
        severity: 'high',
        title: 'Short description of the violation',
        description: `Detailed explanation with record ID ${record.id}.`,
        evidence: {
          recordId: record.id,
          field: record.offendingField,
        },
        resourceType: 'execution',
        resourceId: record.id,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return {
    invariantId: 'INV-001',
    status: defects.length > 0 ? 'fail' : 'pass',
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    sampleSize: records.length,
    defects,
    summary: defects.length > 0
      ? `${defects.length} violation(s) found`
      : `${records.length} record(s) checked, no violations`,
  };
}
```

### CheckerResult Fields

| Field | Type | Description |
|-------|------|-------------|
| `checkerName` | `string` | Must match the checker's `name` property |
| `cadence` | `Cadence` | The cadence passed to `check()` |
| `invariants` | `InvariantCheckResult[]` | One entry per invariant ID the checker evaluates |

### InvariantCheckResult Fields

| Field | Type | Description |
|-------|------|-------------|
| `invariantId` | `InvariantId` | Which invariant was checked |
| `status` | `'pass' \| 'fail' \| 'warn' \| 'skip'` | Outcome of the check |
| `checkedAt` | `string` | ISO-8601 timestamp |
| `durationMs` | `number` | Wall-clock time for this check |
| `sampleSize` | `number` | Number of records examined |
| `defects` | `DefectReport[]` | Empty when status is `pass` |
| `summary` | `string` | Human-readable outcome |

### DefectReport Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique defect identifier (e.g., `GRITS-SEC-042`) |
| `invariantId` | `InvariantId` | Which invariant was violated |
| `severity` | `Severity` | See severity guide below |
| `title` | `string` | Short description |
| `description` | `string` | Detailed explanation with specifics |
| `evidence` | `Record<string, unknown>` | Structured data supporting the finding |
| `resourceType` | `string` | Type of affected resource |
| `resourceId` | `string` | Identifier of the affected resource |
| `detectedAt` | `string` | ISO-8601 timestamp |

## Step 5 — Register in Handlers

Add your checker to the appropriate handler(s) in `apps/grits-worker/src/handlers/`.

### For fast cadence

Edit `runFastIntegrityCheck.ts`:

```typescript
import { MyDomainIntegrityChecker } from '../checkers/MyDomainIntegrityChecker.js';

export async function runFastIntegrityCheck(): Promise<void> {
  const checkers = [
    // ... existing checkers ...
    new MyDomainIntegrityChecker(getRequiredRepo()),
  ];

  const snapshot = await runIntegrityChecks(checkers, 'fast');
  // ...
}
```

### For daily cadence

Edit `runDailyIntegrityCheck.ts` and add your checker to the `checkers` array.

### For release cadence

Edit `runReleaseIntegrityCheck.ts` and add your checker to the `checkers` array.

Register in all handlers whose cadences match your checker's `supportedCadences`.

## Severity Guide

Use the following guidelines when assigning severity to defect reports.

| Severity | When to use | Examples |
|----------|-------------|---------|
| `critical` | A governance or security guarantee is broken. Requires immediate attention. | Secret in audit log, ineligible candidate executed, policy completely bypassed |
| `high` | A major correctness risk exists. The system may produce wrong results. | Fallback escapes policy, missing audit trail for mutations, unsafe provider endpoint |
| `medium` | Integrity is degraded but no immediate security or correctness breach. | Invalid client metadata values, stale scoring data |
| `low` | Minor inconsistency with no immediate operational impact. | Redundant audit entries, minor timing anomalies |
| `info` | Informational finding. No action required but worth recording. | Unusual but valid routing pattern |

When a single invariant can produce defects at multiple severity levels, choose severity based on the specific condition detected. For example, `INV-006` produces `critical` for non-HTTP/HTTPS schemes but `high` for plain HTTP.

## Checklist

1. Checker class implements `IntegrityChecker` from `@acds/grits`.
2. All dependencies injected via constructor.
3. No imports from service internals or write-capable repositories.
4. `check()` returns a `CheckerResult` with one `InvariantCheckResult` per invariant.
5. Defects include structured evidence, not just descriptions.
6. Checker registered in all matching cadence handlers.
7. Tests substitute repositories with test doubles.
