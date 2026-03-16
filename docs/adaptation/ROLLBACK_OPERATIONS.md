# Rollback Operations

The `AdaptationRollbackService` provides the ability to revert a family's candidate ranking to a prior state captured by a specific adaptation event. Rollback is a safety mechanism for undoing adaptive changes that produced unexpected results.

## Rollback Snapshots

Every adaptation event recorded in the ledger captures:
- **previousRanking** -- the candidate ordering before the event.
- **policyBoundsSnapshot** -- the policy constraints and exploration rate in effect.

When a rollback is requested, the service builds two `RankingSnapshot` objects:
- **currentSnapshot** -- the family's current candidate rankings and exploration rate, captured from the live optimizer state.
- **restoredSnapshot** -- the candidate rankings and exploration rate from the target adaptation event's `previousRanking`.

The `RankingSnapshot` contains:
- `familyKey` -- the execution family.
- `candidateRankings` -- an ordered list of `CandidateRankingEntry` objects (candidateId, rank, score).
- `explorationRate` -- the exploration rate at the time of capture.
- `capturedAt` -- ISO-8601 timestamp.

## Preview Before Execute

The `previewRollback(familyKey, targetEventId)` method returns a `RollbackPreview` without mutating any state:

```typescript
interface RollbackPreview {
  safe: boolean;
  preview: AdaptationRollbackRecord;
  warnings: string[];
}
```

The preview allows operators to inspect the current vs. restored state and review any safety warnings before committing.

## Safety Checks

The rollback service performs the following safety checks:

1. **Target event exists** -- the specified adaptation event must exist in the ledger.
2. **Family match** -- the target event must belong to the specified family.
3. **Family state exists** -- the family must have active optimizer state.
4. **Non-empty previous ranking** -- the target event must have a non-empty `previousRanking`. Rolling back to an empty ranking is flagged as unsafe.
5. **Staleness check** -- if the target event is older than 7 days, a warning is issued. Rolling back to a very old state may be risky because the provider landscape may have changed.

If any safety check produces a warning, the preview's `safe` field is `false`. The `executeRollback()` method will throw an error if warnings are present, preventing unsafe rollbacks.

## Executing a Rollback

`executeRollback(familyKey, targetEventId, actor, reason)` performs the rollback:

1. Runs the same safety checks as preview.
2. If warnings exist, throws an error (rollback is not executed).
3. Restores the top-ranked candidate and exploration rate in optimizer state.
4. Rehydrates candidate score state for the restored ranking.
5. Creates and persists an `AdaptationRollbackRecord` with previous and restored snapshots.
6. Emits a `rollback_executed` audit event via the `RollbackAuditEmitter`.
7. Returns the persisted rollback record.

## Audit Model

Two audit event types are emitted:

| Event Type | When Emitted |
|---|---|
| `rollback_previewed` | When an operator previews a rollback (optional, for traceability). |
| `rollback_executed` | When a rollback is committed. |

Each `RollbackAuditEvent` includes:
- `rollbackId` -- unique identifier for the rollback record.
- `familyKey` -- the affected family.
- `targetAdaptationEventId` -- the event being rolled back to.
- `actor` -- the human or system actor who initiated the rollback.
- `reason` -- free-text rationale.
- `timestamp` -- ISO-8601 timestamp.

The `AdaptationRollbackRecord` itself is persisted and provides a full before/after snapshot for post-incident review.

## When to Use Rollback

Rollback is appropriate when:

- An auto-applied or approved ranking change caused a measurable performance degradation.
- A candidate that was promoted to top rank is experiencing transient failures.
- An operator suspects the evaluation data that drove the ranking change was anomalous.
- A family needs to be returned to a known-good state while the operator investigates.

Rollback is NOT appropriate when:

- The family has never had an adaptation event (there is nothing to roll back to).
- The target event is very old and the provider landscape has changed significantly. In this case, consider manually adjusting the ranking instead.
- The issue is with the provider itself (outage, deprecation). In this case, disable the provider at the eligibility layer rather than rolling back.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/adaptation/rollbacks/:familyKey/preview` | Preview a rollback. Body: `{ targetEventId: string }` |
| `POST` | `/adaptation/rollbacks/:familyKey/execute` | Execute a rollback. Body: `{ targetEventId: string, reason: string }` |

## Hardening Notes

- Rollback execution now restores live optimizer state instead of stopping at record creation.
- `executeRollback()` now requires non-empty `actor` and `reason` values.
- Preview remains read-only and still does not emit a preview audit event. If preview traceability is required in production, add explicit `rollback_previewed` emission at the application boundary.
