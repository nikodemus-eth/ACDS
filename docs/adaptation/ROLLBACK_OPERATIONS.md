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
3. Creates an `AdaptationRollbackRecord` with previous and restored snapshots.
4. Persists the record via the `RollbackRecordWriter`.
5. Emits a `rollback_executed` audit event via the `RollbackAuditEmitter`.
6. Returns the persisted rollback record.

The caller is responsible for applying the restored snapshot to the optimizer state after receiving the record.

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

## Known Issues (ARGUS-9 Red Team Findings)

The following issues were identified during adversarial testing and should be addressed before production deployment:

1. **Rollback does NOT update `FamilySelectionState`.** `executeRollback()` persists an `AdaptationRollbackRecord` and emits an audit event, but does not restore the family's optimizer state. The documentation above states "The caller is responsible for applying the restored snapshot" — but no caller currently performs this step. The gap between record and state mutation means rollbacks are recorded but not actually applied.

2. **`rollback_previewed` audit event is never emitted.** The audit model documents this event type, and the `RollbackAuditEvent` type includes it, but `previewRollback()` does not emit any audit event. This means preview actions are untracked.

3. **No authorization on rollback actions.** `executeRollback()` and `previewRollback()` accept any string as `actor`, including empty strings. There is no identity verification at the domain layer.

4. **Multiple rollbacks to the same event are not prevented.** The same adaptation event can be rolled back to multiple times, creating duplicate rollback records with no idempotency check.

5. **`RankingSnapshot.candidateRankings` is passed by reference.** Mutations to the ranking array after snapshot creation alter the snapshot itself. Snapshots should be deep-copied or frozen to preserve integrity.

6. **Preview generates records with empty actor/reason.** `previewRollback()` creates a rollback record with empty strings for `actor` and `reason`, which could be confusing if the preview record is persisted or displayed.
