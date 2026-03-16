// ---------------------------------------------------------------------------
// AdaptationApprovalPresenter - formats approval records for API responses
// ---------------------------------------------------------------------------

import type { AdaptationApproval } from '@acds/adaptive-optimizer';

/**
 * Public shape returned to API clients for adaptation approvals.
 */
export interface AdaptationApprovalView {
  id: string;
  familyKey: string;
  recommendationId: string;
  status: string;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  expiresAt: string;
}

export class AdaptationApprovalPresenter {
  /**
   * Formats a single AdaptationApproval for the API response.
   */
  static toView(approval: AdaptationApproval): AdaptationApprovalView {
    return {
      id: approval.id,
      familyKey: approval.familyKey,
      recommendationId: approval.recommendationId,
      status: approval.status,
      submittedAt: approval.submittedAt,
      decidedAt: approval.decidedAt ?? null,
      decidedBy: approval.decidedBy ?? null,
      reason: approval.reason ?? null,
      expiresAt: approval.expiresAt,
    };
  }

  /**
   * Formats a list of approval records.
   */
  static toViewList(approvals: AdaptationApproval[]): AdaptationApprovalView[] {
    return approvals.map(AdaptationApprovalPresenter.toView);
  }
}
