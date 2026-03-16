/**
 * AdaptationApprovalRepository - Abstract persistence interface for
 * adaptation approval records.
 *
 * Implementations may back this with a database, event store, or
 * in-memory store.
 */

import type { AdaptationApproval, AdaptationApprovalStatus } from './AdaptationApprovalState.js';

export interface AdaptationApprovalRepository {
  /** Persists an approval record (insert or replace). */
  save(approval: AdaptationApproval): Promise<void>;

  /** Retrieves a single approval by id. Returns undefined if not found. */
  findById(id: string): Promise<AdaptationApproval | undefined>;

  /** Lists all approvals currently in the 'pending' status. */
  findPending(): Promise<AdaptationApproval[]>;

  /** Lists all approvals for a given family key. */
  findByFamily(familyKey: string): Promise<AdaptationApproval[]>;

  /** Updates the status (and associated decision fields) of an existing approval. */
  updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void>;
}
