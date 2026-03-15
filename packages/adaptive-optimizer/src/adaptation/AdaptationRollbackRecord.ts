/**
 * AdaptationRollbackRecord - Captures the details of a rollback
 * operation that restores a family's ranking to a prior state.
 */

import type { RankingSnapshot } from './RankingSnapshot.js';

export interface AdaptationRollbackRecord {
  /** Unique identifier for this rollback. */
  id: string;

  /** The execution family that was rolled back. */
  familyKey: string;

  /** The adaptation event being rolled back to. */
  targetAdaptationEventId: string;

  /** The ranking state before the rollback was executed. */
  previousSnapshot: RankingSnapshot;

  /** The ranking state restored by the rollback. */
  restoredSnapshot: RankingSnapshot;

  /** The human or system actor who initiated the rollback. */
  actor: string;

  /** Free-text rationale for the rollback. */
  reason: string;

  /** ISO-8601 timestamp of when the rollback was executed. */
  rolledBackAt: string;
}
