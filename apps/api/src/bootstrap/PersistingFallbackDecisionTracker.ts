import type { Pool } from 'pg';
import type { FallbackEntry } from '@acds/core-types';
import { FallbackDecisionTracker } from '@acds/execution-orchestrator';

/**
 * Wraps the in-memory FallbackDecisionTracker with database persistence.
 * Each fallback attempt is written to the `fallback_attempts` table in addition
 * to being tracked in memory for the duration of the current execution.
 */
export class PersistingFallbackDecisionTracker extends FallbackDecisionTracker {
  private readonly attemptCounters = new Map<string, number>();

  constructor(private readonly pool: Pool) {
    super();
  }

  override recordAttempt(executionId: string, entry: FallbackEntry, reason: string): void {
    super.recordAttempt(executionId, entry, reason);
    const attemptNumber = this.nextAttemptNumber(executionId);
    this.persistAttempt(executionId, attemptNumber, entry.providerId, 'attempted', reason);
  }

  override recordSuccess(executionId: string, entry: FallbackEntry): void {
    super.recordSuccess(executionId, entry);
    const attemptNumber = this.nextAttemptNumber(executionId);
    this.persistAttempt(executionId, attemptNumber, entry.providerId, 'succeeded', null);
  }

  override recordFailure(executionId: string, entry: FallbackEntry, reason: string): void {
    super.recordFailure(executionId, entry, reason);
    const attemptNumber = this.nextAttemptNumber(executionId);
    this.persistAttempt(executionId, attemptNumber, entry.providerId, 'failed', reason);
  }

  private nextAttemptNumber(executionId: string): number {
    const current = this.attemptCounters.get(executionId) ?? 0;
    const next = current + 1;
    this.attemptCounters.set(executionId, next);
    return next;
  }

  private persistAttempt(
    executionId: string,
    attemptNumber: number,
    providerId: string,
    status: string,
    errorReason: string | null,
  ): void {
    this.pool.query(
      `INSERT INTO fallback_attempts (execution_id, attempt_number, provider_id, status, error_details, attempted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        executionId,
        attemptNumber,
        providerId,
        status,
        errorReason ? JSON.stringify({ message: errorReason }) : null,
      ],
    ).catch((err) => {
      console.error(`[persisting-fallback] Failed to persist fallback attempt for ${executionId}:`, err);
    });
  }
}
