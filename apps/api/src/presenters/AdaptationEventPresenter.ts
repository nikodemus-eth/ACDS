// ---------------------------------------------------------------------------
// AdaptationEventPresenter - formats adaptation events for API responses
// ---------------------------------------------------------------------------

import type { AdaptationEvent } from '@acds/adaptive-optimizer';

/**
 * Public shape returned to API clients for adaptation events.
 */
export interface AdaptationEventView {
  id: string;
  familyKey: string;
  trigger: string;
  mode: string;
  previousRankingCount: number;
  newRankingCount: number;
  evidenceSummary: string;
  createdAt: string;
}

export class AdaptationEventPresenter {
  /**
   * Formats a single AdaptationEvent for the API response.
   */
  static toView(event: AdaptationEvent): AdaptationEventView {
    return {
      id: event.id,
      familyKey: event.familyKey,
      trigger: event.trigger,
      mode: event.mode,
      previousRankingCount: event.previousRanking.length,
      newRankingCount: event.newRanking.length,
      evidenceSummary: event.evidenceSummary,
      createdAt: event.createdAt,
    };
  }

  /**
   * Formats a list of AdaptationEvent entities.
   */
  static toViewList(events: AdaptationEvent[]): AdaptationEventView[] {
    return events.map(AdaptationEventPresenter.toView);
  }
}
