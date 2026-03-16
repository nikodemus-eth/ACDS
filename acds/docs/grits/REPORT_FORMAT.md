# GRITS Report Format Schema

This document defines the output types produced by the GRITS (Generalized Runtime Integrity Testing System) engine. All snapshots, check results, defect reports, and drift reports conform to the schemas below.

---

## INTEGRITY_SNAPSHOT

The top-level output of a GRITS run. One snapshot is produced per cadence execution.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for this snapshot. |
| `cadence` | `'fast' \| 'daily' \| 'release'` | Which cadence produced this snapshot. |
| `startedAt` | `string` (ISO 8601) | Timestamp when the run began. |
| `completedAt` | `string` (ISO 8601) | Timestamp when the run finished. |
| `totalDurationMs` | `number` | Wall-clock duration of the entire run in milliseconds. |
| `results` | `InvariantCheckResult[]` | One entry per invariant that was evaluated. |
| `overallStatus` | `'green' \| 'yellow' \| 'red'` | Aggregate health indicator for the snapshot. |
| `defectCount` | `{ critical: number, high: number, medium: number, low: number, info: number }` | Defect totals broken down by severity. |

### OVERALL_STATUS Rules

- **green** -- All invariant checks returned `pass` or `skip`. Zero defects.
- **yellow** -- One or more invariant checks returned `warn`, but none returned `fail`.
- **red** -- One or more invariant checks returned `fail`.

### Example

```json
{
  "id": "snap_20260315_fast_a1b2c3",
  "cadence": "fast",
  "startedAt": "2026-03-15T10:00:00.000Z",
  "completedAt": "2026-03-15T10:00:04.217Z",
  "totalDurationMs": 4217,
  "results": [],
  "overallStatus": "green",
  "defectCount": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "info": 0
  }
}
```

---

## INVARIANT_CHECK_RESULT

The outcome of evaluating a single invariant during a snapshot run.

| Field | Type | Description |
|---|---|---|
| `invariantId` | `string` | Identifier of the invariant that was checked. |
| `status` | `'pass' \| 'fail' \| 'warn' \| 'skip'` | Result status for this check. |
| `checkedAt` | `string` (ISO 8601) | Timestamp when this individual check completed. |
| `durationMs` | `number` | How long this check took in milliseconds. |
| `sampleSize` | `number` | Number of resources or records sampled during the check. |
| `defects` | `DefectReport[]` | Defects discovered by this check (empty on `pass` or `skip`). |
| `summary` | `string` | Human-readable summary of the check outcome. |

### STATUS Semantics

- **pass** -- The invariant holds across all sampled resources.
- **fail** -- The invariant is violated. At least one defect with severity `high` or `critical` was found.
- **warn** -- The invariant is partially violated. Defects are present but limited to `medium`, `low`, or `info` severity.
- **skip** -- The invariant was not applicable (e.g., no matching resources, or the invariant is disabled for this cadence).

### Example

```json
{
  "invariantId": "INV_PROVIDER_RESPONSE_SCHEMA",
  "status": "fail",
  "checkedAt": "2026-03-15T10:00:02.810Z",
  "durationMs": 1340,
  "sampleSize": 250,
  "defects": [],
  "summary": "3 of 250 provider responses failed schema validation."
}
```

---

## DEFECT_REPORT

A single defect discovered during an invariant check.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for this defect instance. |
| `invariantId` | `string` | The invariant that was violated. |
| `severity` | `'critical' \| 'high' \| 'medium' \| 'low' \| 'info'` | How severe the defect is. |
| `title` | `string` | Short, descriptive title for the defect. |
| `description` | `string` | Detailed explanation of what went wrong and why it matters. |
| `evidence` | `Record<string, unknown>` | Arbitrary key-value evidence supporting the defect (e.g., expected vs. actual values, raw payloads). |
| `resourceType` | `string` | The type of resource affected (e.g., `'execution'`, `'provider_config'`, `'routing_rule'`). |
| `resourceId` | `string` | Identifier of the specific resource instance that is defective. |
| `detectedAt` | `string` (ISO 8601) | Timestamp when the defect was detected. |

### Example

```json
{
  "id": "def_a8f3e901",
  "invariantId": "INV_PROVIDER_RESPONSE_SCHEMA",
  "severity": "high",
  "title": "Provider response missing required 'completionTokens' field",
  "description": "The response from provider 'acme-llm-v2' for execution 'exec_7712' did not include the required 'completionTokens' field in the usage object. Downstream cost calculation will produce incorrect results.",
  "evidence": {
    "executionId": "exec_7712",
    "providerId": "acme-llm-v2",
    "expectedField": "usage.completionTokens",
    "actualUsageObject": { "promptTokens": 142 }
  },
  "resourceType": "execution",
  "resourceId": "exec_7712",
  "detectedAt": "2026-03-15T10:00:02.750Z"
}
```

---

## DRIFT_REPORT

Compares two consecutive snapshots to surface changes in integrity posture over time.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for this drift report. |
| `previousSnapshotId` | `string` | The `id` of the earlier snapshot being compared. |
| `currentSnapshotId` | `string` | The `id` of the later snapshot being compared. |
| `generatedAt` | `string` (ISO 8601) | Timestamp when this drift report was generated. |
| `drifts` | `InvariantDrift[]` | Per-invariant drift details. |
| `netDirection` | `'improved' \| 'degraded' \| 'unchanged'` | Overall direction of change across all invariants. |

### NET_DIRECTION Rules

- **improved** -- More invariants moved toward `pass` than moved away from it, with no new `critical` or `high` defects.
- **degraded** -- At least one invariant moved from `pass` to `fail` or `warn`, or new `critical`/`high` defects appeared.
- **unchanged** -- All invariants maintained the same status between snapshots.

### Example

```json
{
  "id": "drift_20260315_fast_x9y8z7",
  "previousSnapshotId": "snap_20260315_fast_a1b2c3",
  "currentSnapshotId": "snap_20260315_fast_d4e5f6",
  "generatedAt": "2026-03-15T11:00:05.000Z",
  "drifts": [],
  "netDirection": "unchanged"
}
```

---

## INVARIANT_DRIFT

Drift detail for a single invariant between two snapshots.

| Field | Type | Description |
|---|---|---|
| `invariantId` | `string` | The invariant being compared. |
| `previousStatus` | `'pass' \| 'fail' \| 'warn' \| 'skip'` | Status in the previous snapshot. |
| `currentStatus` | `'pass' \| 'fail' \| 'warn' \| 'skip'` | Status in the current snapshot. |
| `direction` | `'improved' \| 'degraded' \| 'unchanged'` | Direction of change for this specific invariant. |
| `newDefects` | `DefectReport[]` | Defects present in the current snapshot but absent in the previous. |
| `resolvedDefects` | `DefectReport[]` | Defects present in the previous snapshot but absent in the current. |

### Example

```json
{
  "invariantId": "INV_PROVIDER_RESPONSE_SCHEMA",
  "previousStatus": "fail",
  "currentStatus": "warn",
  "direction": "improved",
  "newDefects": [],
  "resolvedDefects": [
    {
      "id": "def_a8f3e901",
      "invariantId": "INV_PROVIDER_RESPONSE_SCHEMA",
      "severity": "high",
      "title": "Provider response missing required 'completionTokens' field",
      "description": "The response from provider 'acme-llm-v2' for execution 'exec_7712' did not include the required 'completionTokens' field in the usage object. Downstream cost calculation will produce incorrect results.",
      "evidence": {
        "executionId": "exec_7712",
        "providerId": "acme-llm-v2",
        "expectedField": "usage.completionTokens",
        "actualUsageObject": { "promptTokens": 142 }
      },
      "resourceType": "execution",
      "resourceId": "exec_7712",
      "detectedAt": "2026-03-15T10:00:02.750Z"
    }
  ]
}
```
