import type { FallbackEntry } from '@acds/core-types';

export interface FallbackAttempt {
  executionId: string;
  entry: FallbackEntry;
  status: 'attempted' | 'succeeded' | 'failed';
  reason: string;
  timestamp: Date;
}

export class FallbackDecisionTracker {
  private readonly attempts: FallbackAttempt[] = [];

  recordAttempt(executionId: string, entry: FallbackEntry, reason: string): void {
    this.attempts.push({
      executionId, entry, status: 'attempted', reason, timestamp: new Date(),
    });
  }

  recordSuccess(executionId: string, entry: FallbackEntry): void {
    this.attempts.push({
      executionId, entry, status: 'succeeded', reason: 'Fallback succeeded', timestamp: new Date(),
    });
  }

  recordFailure(executionId: string, entry: FallbackEntry, reason: string): void {
    this.attempts.push({
      executionId, entry, status: 'failed', reason, timestamp: new Date(),
    });
  }

  getAttempts(executionId: string): FallbackAttempt[] {
    return this.attempts.filter((a) => a.executionId === executionId);
  }
}
