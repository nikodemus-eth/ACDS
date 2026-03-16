// ---------------------------------------------------------------------------
// AdaptationRollbackPresenter - formats rollback records for API responses
// ---------------------------------------------------------------------------

import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';

/**
 * Public shape returned to API clients for rollback records.
 */
export interface AdaptationRollbackView {
  id: string;
  familyKey: string;
  targetAdaptationEventId: string;
  previousSnapshot: {
    candidateCount: number;
    explorationRate: number;
    capturedAt: string;
  };
  restoredSnapshot: {
    candidateCount: number;
    explorationRate: number;
    capturedAt: string;
  };
  actor: string;
  reason: string;
  rolledBackAt: string;
}

export class AdaptationRollbackPresenter {
  /**
   * Formats a single AdaptationRollbackRecord for the API response.
   */
  static toView(record: AdaptationRollbackRecord): AdaptationRollbackView {
    return {
      id: record.id,
      familyKey: record.familyKey,
      targetAdaptationEventId: record.targetAdaptationEventId,
      previousSnapshot: {
        candidateCount: record.previousSnapshot.candidateRankings.length,
        explorationRate: record.previousSnapshot.explorationRate,
        capturedAt: record.previousSnapshot.capturedAt,
      },
      restoredSnapshot: {
        candidateCount: record.restoredSnapshot.candidateRankings.length,
        explorationRate: record.restoredSnapshot.explorationRate,
        capturedAt: record.restoredSnapshot.capturedAt,
      },
      actor: record.actor,
      reason: record.reason,
      rolledBackAt: record.rolledBackAt,
    };
  }

  /**
   * Formats a list of rollback records.
   */
  static toViewList(records: AdaptationRollbackRecord[]): AdaptationRollbackView[] {
    return records.map(AdaptationRollbackPresenter.toView);
  }
}
