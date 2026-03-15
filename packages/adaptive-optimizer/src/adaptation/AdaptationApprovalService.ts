/**
 * AdaptationApprovalService - Manages the lifecycle of adaptation approvals.
 *
 * Provides submit, approve, reject, and expire operations with audit
 * event emission at each state transition.
 */

import { randomUUID } from 'node:crypto';
import type { AdaptationRecommendation } from './AdaptationRecommendationService.js';
import type { AdaptationApproval } from './AdaptationApprovalState.js';
import type { AdaptationApprovalRepository } from './AdaptationApprovalRepository.js';

// ── Audit event types ──────────────────────────────────────────────────────

export type ApprovalAuditEventType =
  | 'approval_submitted'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired';

export interface ApprovalAuditEvent {
  type: ApprovalAuditEventType;
  approvalId: string;
  familyKey: string;
  actor?: string;
  reason?: string;
  timestamp: string;
}

export interface ApprovalAuditEmitter {
  emit(event: ApprovalAuditEvent): void;
}

// ── Default expiry ─────────────────────────────────────────────────────────

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Service ────────────────────────────────────────────────────────────────

export class AdaptationApprovalService {
  constructor(
    private readonly repository: AdaptationApprovalRepository,
    private readonly auditEmitter: ApprovalAuditEmitter,
  ) {}

  /**
   * Creates a new approval record for a recommendation and persists it.
   *
   * @param recommendation - The recommendation requiring approval.
   * @param maxAgeMs - How long (in ms) before the approval expires. Defaults to 24 h.
   * @returns The newly created AdaptationApproval.
   */
  async submitForApproval(
    recommendation: AdaptationRecommendation,
    maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  ): Promise<AdaptationApproval> {
    const now = new Date();

    const approval: AdaptationApproval = {
      id: randomUUID(),
      familyKey: recommendation.familyKey,
      recommendationId: recommendation.id,
      status: 'pending',
      submittedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
    };

    await this.repository.save(approval);

    this.auditEmitter.emit({
      type: 'approval_submitted',
      approvalId: approval.id,
      familyKey: approval.familyKey,
      timestamp: approval.submittedAt,
    });

    return approval;
  }

  /**
   * Approves a pending approval record.
   *
   * @throws If the approval is not found or is not in 'pending' status.
   */
  async approve(id: string, actor: string, reason?: string): Promise<AdaptationApproval> {
    const approval = await this.requirePending(id);
    const now = new Date().toISOString();

    await this.repository.updateStatus(id, 'approved', {
      decidedAt: now,
      decidedBy: actor,
      reason,
    });

    const updated: AdaptationApproval = {
      ...approval,
      status: 'approved',
      decidedAt: now,
      decidedBy: actor,
      reason,
    };

    this.auditEmitter.emit({
      type: 'approval_approved',
      approvalId: id,
      familyKey: approval.familyKey,
      actor,
      reason,
      timestamp: now,
    });

    return updated;
  }

  /**
   * Rejects a pending approval record.
   *
   * @throws If the approval is not found or is not in 'pending' status.
   */
  async reject(id: string, actor: string, reason?: string): Promise<AdaptationApproval> {
    const approval = await this.requirePending(id);
    const now = new Date().toISOString();

    await this.repository.updateStatus(id, 'rejected', {
      decidedAt: now,
      decidedBy: actor,
      reason,
    });

    const updated: AdaptationApproval = {
      ...approval,
      status: 'rejected',
      decidedAt: now,
      decidedBy: actor,
      reason,
    };

    this.auditEmitter.emit({
      type: 'approval_rejected',
      approvalId: id,
      familyKey: approval.familyKey,
      actor,
      reason,
      timestamp: now,
    });

    return updated;
  }

  /**
   * Expires all pending approvals whose expiresAt has passed.
   *
   * @param maxAge - If provided, expire approvals older than this duration (ms).
   *                 Otherwise uses the expiresAt field on each record.
   * @returns The number of approvals expired.
   */
  async expireStale(maxAge?: number): Promise<number> {
    const pending = await this.repository.findPending();
    const now = Date.now();
    let expiredCount = 0;

    for (const approval of pending) {
      const cutoff = maxAge
        ? new Date(approval.submittedAt).getTime() + maxAge
        : new Date(approval.expiresAt).getTime();

      if (now >= cutoff) {
        const timestamp = new Date().toISOString();
        await this.repository.updateStatus(approval.id, 'expired', {
          decidedAt: timestamp,
        });

        this.auditEmitter.emit({
          type: 'approval_expired',
          approvalId: approval.id,
          familyKey: approval.familyKey,
          timestamp,
        });

        expiredCount++;
      }
    }

    return expiredCount;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async requirePending(id: string): Promise<AdaptationApproval> {
    const approval = await this.repository.findById(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }
    if (approval.status !== 'pending') {
      throw new Error(
        `Approval ${id} is in '${approval.status}' status and cannot be modified.`,
      );
    }
    return approval;
  }
}
