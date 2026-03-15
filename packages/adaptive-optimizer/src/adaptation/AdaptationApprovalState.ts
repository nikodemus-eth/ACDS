/**
 * AdaptationApprovalState - Defines the lifecycle states and shape of an
 * adaptation approval record.
 *
 * Approvals gate adaptation recommendations that require human review
 * before the optimizer may apply them.
 */

/**
 * The possible states of an adaptation approval.
 *
 * - pending:     Awaiting human decision.
 * - approved:    Accepted by a human actor.
 * - rejected:    Declined by a human actor.
 * - expired:     Timed out without a decision.
 * - superseded:  Replaced by a newer recommendation for the same family.
 */
export type AdaptationApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'superseded';

export interface AdaptationApproval {
  /** Unique identifier for this approval record. */
  id: string;

  /** The execution family this approval pertains to. */
  familyKey: string;

  /** The recommendation this approval gates. */
  recommendationId: string;

  /** Current lifecycle status. */
  status: AdaptationApprovalStatus;

  /** ISO-8601 timestamp of when the approval was submitted for review. */
  submittedAt: string;

  /** ISO-8601 timestamp of when a decision was made (if any). */
  decidedAt?: string;

  /** The human or system actor who made the decision. */
  decidedBy?: string;

  /** Free-text rationale for the decision. */
  reason?: string;

  /** ISO-8601 timestamp after which the approval expires automatically. */
  expiresAt: string;
}
